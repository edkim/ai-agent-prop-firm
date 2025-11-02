# Truncation Solutions: Tier 2 Implementation Plan

**Date**: 2025-10-31
**Status**: Planning Phase
**Goal**: Eliminate code truncation by reducing token requirements

---

## Executive Summary

Current situation:
- **max_tokens**: 20,000 (SDK limit without streaming)
- **System prompt size**: ~1,500 lines (~2,000-3,000 tokens)
- **Generated code needs**: ~15,000-20,000 tokens
- **Result**: Scripts still truncate at ~365 lines

**Three solution approaches:**
1. **Streaming Implementation** - Allow unlimited output tokens (complex)
2. **Prompt Simplification** - Reduce input tokens by 50-70% (medium effort)
3. **Helper Function Extraction** - Reduce output needs by 50-70% (high impact)

**Recommended Strategy**: Implement #2 and #3 together (skip streaming for now)

---

## Solution 1: Implement Streaming Support

### Overview

Enable Anthropic SDK streaming mode to bypass 10-minute timeout limits, allowing max_tokens > 20,000.

### Complexity: HIGH ⚠️

**Why it's complex:**
- Requires complete refactoring of API response handling
- Must handle partial responses and buffering
- Error handling becomes significantly more complex
- Testing is more difficult (mocking streams)
- Adds latency monitoring requirements

### Implementation Plan

#### Phase 1.1: Update Anthropic SDK Integration (4-6 hours)

**File**: `backend/src/services/claude.service.ts`

**Current (non-streaming):**
```typescript
const response = await client.messages.create({
  model: this.model,
  max_tokens: this.maxTokens,
  temperature: this.temperature,
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
});

const textContent = response.content.find(c => c.type === 'text');
return this.parseClaudeResponse(textContent.text);
```

**New (streaming):**
```typescript
async generateScriptStreaming(
  userPrompt: string,
  params: ScriptGenerationParams
): Promise<ClaudeScriptGenerationResponse> {
  const systemPrompt = this.buildSystemPrompt();
  const userMessage = this.buildUserMessage(userPrompt, params);

  console.log('📤 Sending to Claude (streaming mode)...');

  let fullResponse = '';
  let stopReason = '';

  try {
    const client = this.getClient();

    const stream = await client.messages.create({
      model: this.model,
      max_tokens: 32000, // Can now use higher values
      temperature: this.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      stream: true, // Enable streaming
    });

    // Handle stream events
    for await (const messageStreamEvent of stream) {
      if (messageStreamEvent.type === 'content_block_delta') {
        const delta = messageStreamEvent.delta;
        if (delta.type === 'text_delta') {
          fullResponse += delta.text;

          // Optional: Progress indicator
          if (fullResponse.length % 1000 === 0) {
            console.log(`   Received ${fullResponse.length} characters...`);
          }
        }
      } else if (messageStreamEvent.type === 'message_stop') {
        stopReason = messageStreamEvent.message?.stop_reason || 'unknown';
      }
    }

    // Check for truncation
    if (stopReason === 'max_tokens') {
      console.warn('⚠️  Script generation truncated due to token limit!');
    }

    console.log(`✅ Stream complete: ${fullResponse.length} characters`);

    // Parse the complete response
    return this.parseClaudeResponse(fullResponse);

  } catch (error: any) {
    console.error('Error in streaming API call:', error);
    throw new Error(`Claude streaming API error: ${error.message}`);
  }
}
```

#### Phase 1.2: Handle Stream Errors and Timeouts

```typescript
private async executeStreamWithTimeout(
  streamFn: () => Promise<any>,
  timeoutMs: number = 900000 // 15 minutes
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Stream timeout after 15 minutes'));
    }, timeoutMs);

    let response = '';

    streamFn()
      .then(stream => {
        for await (const event of stream) {
          // Process events...
          response += extractText(event);
        }
        clearTimeout(timeout);
        resolve(response);
      })
      .catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}
```

#### Phase 1.3: Testing Strategy

**Unit Tests:**
```typescript
describe('Streaming API', () => {
  it('should handle complete stream', async () => {
    // Mock stream with multiple chunks
    const mockStream = createMockStream([
      { type: 'text_delta', text: 'import { ' },
      { type: 'text_delta', text: 'something } from ' },
      { type: 'text_delta', text: '"somewhere";' }
    ]);

    const result = await service.generateScriptStreaming(prompt, params);
    expect(result.code).toContain('import { something } from "somewhere"');
  });

  it('should handle stream interruption', async () => {
    // Test error handling
  });
});
```

### Pros and Cons

**Pros:**
- ✅ Allows max_tokens > 20,000 (up to 100K+)
- ✅ No truncation issues for large scripts
- ✅ Can handle arbitrarily complex code generation

**Cons:**
- ❌ High implementation complexity
- ❌ Difficult to test and debug
- ❌ Increased latency (progressive response)
- ❌ More API costs (longer requests)
- ❌ Doesn't address root cause (verbose prompts)

### Estimated Effort: 8-12 hours

### Recommendation: ⚠️ SKIP FOR NOW

**Reason**: Streaming solves the symptom (truncation) but not the root cause (inefficient token usage). Implementing solutions #2 and #3 will likely eliminate truncation without the complexity of streaming.

**When to reconsider**: Only if solutions #2 and #3 don't fully solve truncation.

---

## Solution 2: Simplify System Prompts by 50%

### Overview

Reduce system prompt from ~1,500 lines to ~700 lines, freeing up ~1,000-1,500 tokens for output.

### Complexity: MEDIUM 📊

**Current system prompt analysis:**
- `buildSystemPrompt()`: 1,023 lines (execution scripts)
- `buildScannerSystemPrompt()`: 1,528 lines (scanner scripts)
- Total: ~2,500 lines of guidance across both

**Token breakdown (estimated):**
- Interface definitions: ~200 lines → 300 tokens
- Examples: ~600 lines → 900 tokens
- TypeScript rules: ~400 lines → 600 tokens
- Instructions: ~300 lines → 450 tokens

### Implementation Plan

#### Phase 2.1: Audit Current Prompts (2 hours)

**Task**: Categorize every section of the prompt by:
1. **Essential** - Cannot be removed without breaking functionality
2. **Important** - Improves quality significantly
3. **Nice-to-have** - Marginal improvement
4. **Redundant** - Duplicates information elsewhere

**Tool**: Create analysis script

```typescript
// scripts/analyze-prompt-size.ts
import { ClaudeService } from '../src/services/claude.service';

function analyzePrompt() {
  const service = new (ClaudeService as any)();
  const executionPrompt = service.buildSystemPrompt();
  const scannerPrompt = service.buildScannerSystemPrompt();

  console.log('📊 Execution Script Prompt Analysis:');
  console.log(`   Total lines: ${executionPrompt.split('\n').length}`);
  console.log(`   Estimated tokens: ${Math.round(executionPrompt.length / 4)}`);

  console.log('\n📊 Scanner Script Prompt Analysis:');
  console.log(`   Total lines: ${scannerPrompt.split('\n').length}`);
  console.log(`   Estimated tokens: ${Math.round(scannerPrompt.length / 4)}`);

  // Break down by section
  const sections = extractSections(executionPrompt);
  console.log('\n📋 Execution Prompt Sections:');
  sections.forEach(s => {
    console.log(`   ${s.name}: ${s.lines} lines (${s.estimatedTokens} tokens)`);
  });
}
```

#### Phase 2.2: Create Condensed Prompt (4-6 hours)

**Strategy**: Use table format and concise technical language

**Example - Before (verbose):**
```typescript
/**
 * CRITICAL TypeScript Strict Mode Rule #7:
 *
 * Array Initialization - ⚠️ CRITICAL: NEVER EVER Use null in Typed Arrays:
 *
 * ❌❌❌ THIS IS WRONG - TYPESCRIPT WILL REJECT IT ❌❌❌
 * const tradingDays: string[] = [null];  // ← COMPILATION ERROR!
 *
 * ✅ CORRECT OPTIONS:
 *
 * Option A: Use empty array (PREFERRED for signal-based execution)
 * const tradingDays: string[] = [];
 *
 * Option B: Extract dates from SCANNER_SIGNALS
 * const tradingDays: string[] = ["2025-10-30", "2025-10-29"];
 *
 * Option C: If you truly need nullable values (rare), use union type
 * const tradingDays: (string | null)[] = [null];
 *
 * ⚠️ FOR SIGNAL-BASED EXECUTION: You do NOT need tradingDays array at all!
 * Just process SCANNER_SIGNALS directly - each signal already has signal_date.
 */
```

**After (condensed - 75% shorter):**
```typescript
/**
 * TypeScript Strict Mode Rules:
 *
 * | Rule | Wrong | Correct |
 * |------|-------|---------|
 * | No null in typed arrays | `const arr: string[] = [null]` | `const arr: string[] = []` or `(string\|null)[]` |
 * | No undefined metrics | `metrics.volume_spike` | `metrics.volume_spike_multiplier >= 1.5` |
 * | Required TradeResult fields | `{date, side}` | `{date, ticker, side}` |
 * | Complete code | Truncated script | Must end with `.catch(console.error)` |
 *
 * CRITICAL: Signal-based execution doesn't need tradingDays array - process SCANNER_SIGNALS directly.
 */
```

#### Phase 2.3: Move Examples to External Documentation (2 hours)

**Current**: Examples inline in system prompt
**New**: Reference external examples, include only critical ones

**Example sections to externalize:**
- Full interface definitions → Provide only `TradeResult` and `ScannerSignal`
- Helper function examples → Extract to shared module (see Solution #3)
- Multiple date format examples → Keep one canonical example
- Verbose explanations → Use terse technical language

**Before**: 100 lines of VWAP calculation examples
**After**:
```typescript
// VWAP formula: Σ(Price × Volume) / Σ(Volume)
// Calculate per-bar: cumulative from market open
```

#### Phase 2.4: Consolidate TypeScript Rules (2 hours)

**Current**: 10 rules with extensive examples (400+ lines)
**Target**: 10 rules in table format (100 lines)

```typescript
/**
 * TypeScript Compilation Rules (CRITICAL):
 *
 * 1. Imports: Use exact paths `'./src/database/db'`
 * 2. Interfaces: Define TradeResult, Bar before use
 * 3. Types: Explicit types for all variables
 * 4. Null safety: Use `|| []`, never `[null]` in typed arrays
 * 5. Map access: `barsByDate[date]` or `barsByDate.get(date)` with safety check
 * 6. Metrics: Only access actual properties (volume_spike_multiplier, NOT volume_spike)
 * 7. TradeResult: MUST include {date, ticker} always
 * 8. Completeness: Script MUST end with `runBacktest().catch(console.error);`
 * 9. SCANNER_SIGNALS: Check `typeof SCANNER_SIGNALS !== 'undefined'` before use
 * 10. Date formats: Use 'YYYY-MM-DD' consistently
 */
```

#### Phase 2.5: A/B Testing (1 week)

**Methodology**:
1. Deploy condensed prompt alongside original
2. Route 50% of requests to each version
3. Compare:
   - Compilation success rate
   - Error types and frequency
   - Script quality (manual review of 20 samples)
   - Token usage (prompt + response)

**Acceptance criteria**:
- Compilation success rate ≥ current (67% → 2 errors)
- No new error types introduced
- Token savings ≥ 30%

### Pros and Cons

**Pros:**
- ✅ Immediate token savings (1,000-1,500 tokens)
- ✅ Faster API calls (less input to process)
- ✅ Lower costs (fewer input tokens)
- ✅ Easier to maintain (less text to update)
- ✅ Addresses root cause (verbose prompts)

**Cons:**
- ⚠️ Risk of reduced code quality
- ⚠️ Requires careful testing
- ⚠️ May need iteration to find optimal balance

### Estimated Effort: 12-16 hours (including testing)

### Recommendation: ✅ HIGH PRIORITY

**Reason**: High impact, medium effort, addresses root cause. Can be combined with Solution #3 for maximum effect.

---

## Solution 3: Extract Helper Functions to Shared Module

### Overview

Move commonly generated code (VWAP, SMA, RSI, ATR calculations) to a shared TypeScript module that scripts import instead of regenerating.

### Complexity: MEDIUM-HIGH 📊

**Impact**: Reduces generated code by 50-70% (500-1,000 lines → 100-200 lines)

### Current Situation

**Every execution script includes (~200 lines):**
```typescript
// Regenerated in EVERY script:
function calculateVWAP(bars: Bar[]): number { /* 15 lines */ }
function calculateSMA(bars: Bar[], period: number): number { /* 8 lines */ }
function calculateATR(bars: Bar[], period: number): number { /* 20 lines */ }
function calculateRSI(bars: Bar[], period: number): number { /* 30 lines */ }
// ... more helper functions
```

**Token cost:**
- Input: ~100 tokens (asking Claude to generate these)
- Output: ~300-500 tokens (Claude generating the implementations)
- **Total waste: ~400-600 tokens per script**

### Implementation Plan

#### Phase 3.1: Create Shared Helpers Module (4 hours)

**File**: `backend/src/utils/backtest-helpers.ts`

```typescript
/**
 * Shared backtest helper functions
 * Import in generated scripts to avoid regenerating common calculations
 */

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay?: string;
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(bars: Bar[]): number {
  let totalPV = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    totalPV += typicalPrice * bar.volume;
    totalVolume += bar.volume;
  }

  return totalVolume > 0 ? totalPV / totalVolume : 0;
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(bars: Bar[], period: number): number {
  if (bars.length < period) return 0;
  const recentBars = bars.slice(-period);
  const sum = recentBars.reduce((acc, bar) => acc + bar.close, 0);
  return sum / period;
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(bars: Bar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(bars: Bar[], period: number = 14): number {
  if (bars.length < period + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    changes.push(bars[i].close - bars[i - 1].close);
  }

  const recentChanges = changes.slice(-period);
  let gains = 0;
  let losses = 0;

  for (const change of recentChanges) {
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(bars: Bar[], period: number): number {
  if (bars.length < period) return 0;

  const multiplier = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((sum, bar) => sum + bar.close, 0) / period;

  for (let i = period; i < bars.length; i++) {
    ema = (bars[i].close - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(bars: Bar[], period: number = 20, stdDev: number = 2): {
  upper: number;
  middle: number;
  lower: number;
} {
  const sma = calculateSMA(bars, period);
  const recentBars = bars.slice(-period);

  // Calculate standard deviation
  const variance = recentBars.reduce((sum, bar) => {
    return sum + Math.pow(bar.close - sma, 2);
  }, 0) / period;

  const std = Math.sqrt(variance);

  return {
    upper: sma + (std * stdDev),
    middle: sma,
    lower: sma - (std * stdDev)
  };
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(bars: Bar[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
  macd: number;
  signal: number;
  histogram: number;
} {
  const fastEMA = calculateEMA(bars, fastPeriod);
  const slowEMA = calculateEMA(bars, slowPeriod);
  const macdLine = fastEMA - slowEMA;

  // For signal line, would need EMA of MACD values (simplified here)
  const signalLine = 0; // Would need historical MACD values
  const histogram = macdLine - signalLine;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram
  };
}

/**
 * Check if bars form higher highs pattern
 */
export function isHigherHighs(bars: Bar[], lookback: number = 3): boolean {
  if (bars.length < lookback + 1) return false;
  const recentBars = bars.slice(-lookback - 1);

  for (let i = 1; i < recentBars.length; i++) {
    if (recentBars[i].high <= recentBars[i - 1].high) {
      return false;
    }
  }
  return true;
}

/**
 * Check if bars form lower lows pattern
 */
export function isLowerLows(bars: Bar[], lookback: number = 3): boolean {
  if (bars.length < lookback + 1) return false;
  const recentBars = bars.slice(-lookback - 1);

  for (let i = 1; i < recentBars.length; i++) {
    if (recentBars[i].low >= recentBars[i - 1].low) {
      return false;
    }
  }
  return true;
}

/**
 * Find support level (lowest low in period)
 */
export function findSupport(bars: Bar[], lookback: number = 20): number {
  if (bars.length < lookback) return 0;
  const recentBars = bars.slice(-lookback);
  return Math.min(...recentBars.map(b => b.low));
}

/**
 * Find resistance level (highest high in period)
 */
export function findResistance(bars: Bar[], lookback: number = 20): number {
  if (bars.length < lookback) return 0;
  const recentBars = bars.slice(-lookback);
  return Math.max(...recentBars.map(b => b.high));
}
```

**Compile and test:**
```bash
cd backend
npx tsc src/utils/backtest-helpers.ts --outDir dist/utils
npm run test src/utils/__tests__/backtest-helpers.test.ts
```

#### Phase 3.2: Update System Prompts (2 hours)

**Add to system prompt:**
```typescript
/**
 * AVAILABLE HELPER FUNCTIONS
 *
 * Import from './src/utils/backtest-helpers' instead of regenerating:
 *
 * - calculateVWAP(bars: Bar[]): number
 * - calculateSMA(bars: Bar[], period: number): number
 * - calculateATR(bars: Bar[], period: number): number
 * - calculateRSI(bars: Bar[], period: number): number
 * - calculateEMA(bars: Bar[], period: number): number
 * - calculateBollingerBands(bars: Bar[], period: number, stdDev: number)
 * - calculateMACD(bars: Bar[], fast: number, slow: number, signal: number)
 * - isHigherHighs(bars: Bar[], lookback: number): boolean
 * - isLowerLows(bars: Bar[], lookback: number): boolean
 * - findSupport(bars: Bar[], lookback: number): number
 * - findResistance(bars: Bar[], lookback: number): number
 *
 * ALWAYS import these instead of defining them yourself:
 * import { calculateVWAP, calculateSMA, calculateATR } from './src/utils/backtest-helpers';
 */
```

**Remove from system prompt:**
- All helper function implementation examples
- Technical calculation explanations
- Formula derivations

**Token savings**: ~500-800 tokens per script

#### Phase 3.3: Update Script Execution (1 hour)

Ensure script executor can access the helpers module:

**File**: `backend/src/services/script-execution.service.ts`

```typescript
// No changes needed - scripts already have access to ./src/utils/
// Just verify import resolution works correctly
```

#### Phase 3.4: Create Unit Tests (2 hours)

**File**: `backend/src/utils/__tests__/backtest-helpers.test.ts`

```typescript
import {
  calculateVWAP,
  calculateSMA,
  calculateATR,
  calculateRSI,
  Bar
} from '../backtest-helpers';

describe('Backtest Helpers', () => {
  const mockBars: Bar[] = [
    { timestamp: 1, open: 100, high: 105, low: 98, close: 102, volume: 1000 },
    { timestamp: 2, open: 102, high: 107, low: 100, close: 105, volume: 1500 },
    { timestamp: 3, open: 105, high: 108, low: 103, close: 106, volume: 1200 },
  ];

  describe('calculateVWAP', () => {
    it('should calculate correct VWAP', () => {
      const vwap = calculateVWAP(mockBars);
      expect(vwap).toBeGreaterThan(0);
      expect(vwap).toBeLessThan(110);
    });

    it('should return 0 for empty bars', () => {
      expect(calculateVWAP([])).toBe(0);
    });
  });

  describe('calculateSMA', () => {
    it('should calculate correct SMA', () => {
      const sma = calculateSMA(mockBars, 2);
      expect(sma).toBeCloseTo((105 + 106) / 2, 2);
    });

    it('should return 0 if insufficient bars', () => {
      expect(calculateSMA(mockBars, 10)).toBe(0);
    });
  });

  // ... more tests
});
```

#### Phase 3.5: Gradual Rollout (1 week)

**Week 1**: Deploy helpers module, update prompts, monitor
- Day 1-2: A/B test (50% old, 50% new)
- Day 3-4: Analyze results, adjust if needed
- Day 5-7: Roll out to 100% if successful

**Success metrics:**
- Scripts successfully import and use helpers
- No increase in compilation errors
- Token usage decreases by 40-60%
- Generated code is cleaner and shorter

### Pros and Cons

**Pros:**
- ✅ Massive token savings (500-800 tokens per script)
- ✅ Cleaner generated code
- ✅ Consistent implementations (no variations)
- ✅ Easier to maintain (one canonical implementation)
- ✅ Better testability (helpers are unit tested)
- ✅ Faster generation (less code to write)

**Cons:**
- ⚠️ Initial setup effort
- ⚠️ Scripts depend on helpers module (coupling)
- ⚠️ Need to keep helpers in sync with needs

### Estimated Effort: 10-12 hours

### Recommendation: ✅ HIGH PRIORITY

**Reason**: Highest impact per effort. Combines well with Solution #2 for maximum token savings.

---

## Combined Implementation Strategy

### Recommended Approach: Solutions #2 + #3 Together

**Why combine them:**
1. **Complementary effects**: #2 reduces input tokens, #3 reduces output tokens
2. **Shared testing**: Can A/B test both changes together
3. **Maximum impact**: Combined savings of 1,500-2,300 tokens total

**Implementation order:**
1. **Week 1**: Implement Solution #3 (helper functions)
   - Create backtest-helpers.ts
   - Write unit tests
   - Deploy to 10% of traffic

2. **Week 2**: Implement Solution #2 (simplified prompts)
   - Audit current prompts
   - Create condensed versions
   - Deploy to 10% of traffic

3. **Week 3**: Combined rollout
   - Deploy both to 50% of traffic
   - Monitor metrics
   - Adjust based on results

4. **Week 4**: Full deployment
   - Roll out to 100%
   - Document results
   - Iterate on improvements

### Expected Results

**Token Usage (Estimated):**

| Metric | Current | After #2+#3 | Improvement |
|--------|---------|-------------|-------------|
| Input tokens (prompt) | 2,000-3,000 | 1,000-1,500 | -50% to -67% |
| Output tokens (script) | 15,000-20,000 | 8,000-12,000 | -40% to -47% |
| Max tokens needed | 20,000+ | 12,000-15,000 | Well under limit ✅ |
| Truncation rate | ~30% | <5% | -83% ⚠️ |

**Quality Metrics:**

| Metric | Current | Target |
|--------|---------|--------|
| Compilation success | 67% (2 errors) | 85%+ (0-1 errors) |
| Script length | 350-400 lines | 150-250 lines |
| Generation time | 15-25 seconds | 10-18 seconds |
| API cost per script | ~$0.15-0.20 | ~$0.08-0.12 |

---

## Risk Assessment

### Solution #2 Risks (Prompt Simplification)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Code quality decreases | Medium | High | A/B testing, gradual rollout |
| New error types emerge | Medium | Medium | Comprehensive testing phase |
| Loss of important context | Low | High | Careful audit before removing |

### Solution #3 Risks (Helper Functions)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Import resolution fails | Low | High | Test in staging environment |
| Helper bugs affect all scripts | Low | Critical | Extensive unit testing |
| Scripts miss helper availability | Medium | Low | Clear prompt guidance |

### Combined Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Too many changes at once | Low | Medium | Phased rollout, monitoring |
| Difficult to isolate issues | Medium | Medium | Separate A/B tests initially |

---

## Success Metrics

### Primary KPIs (Must achieve)
- [ ] Truncation rate < 10% (currently ~30%)
- [ ] Compilation success ≥ 75% (currently 67%)
- [ ] Token usage reduction ≥ 30%

### Secondary KPIs (Nice to have)
- [ ] Generation time reduced by 20%
- [ ] API costs reduced by 30%
- [ ] Code quality maintained (manual review)

### Testing Checklist
- [ ] Unit tests for all helper functions
- [ ] Integration tests for import resolution
- [ ] A/B testing shows no quality regression
- [ ] 100 sample scripts reviewed for quality
- [ ] Performance benchmarks meet targets

---

## Rollback Plan

### If Solution #2 Causes Issues
1. Revert `buildSystemPrompt()` to original version
2. Deploy revert to 100% within 1 hour
3. Analyze failure patterns
4. Iterate on condensed version

### If Solution #3 Causes Issues
1. Update prompts to stop using helpers
2. Scripts will regenerate functions (fallback works automatically)
3. Debug helper module issues
4. Re-deploy when fixed

### Both Can Be Rolled Back Independently
- No data loss risk
- Scripts continue to work (just less efficiently)
- Gradual rollout minimizes impact

---

## Next Steps

1. **Review this plan** with team
2. **Choose approach**:
   - Option A: Solutions #2 + #3 (recommended)
   - Option B: Solution #3 only (lower risk)
   - Option C: Solution #2 only (faster)
   - Option D: Solution #1 (only if #2+#3 fail)
3. **Create implementation tasks** in project management
4. **Schedule development** (2-3 weeks recommended)
5. **Set up monitoring** for A/B testing

---

## Appendix: Quick Reference

### Token Math

**Current situation:**
```
Input (prompt):     2,500 tokens
Output (script):   18,000 tokens
Total needed:      20,500 tokens ⚠️ OVER LIMIT
```

**After #2+#3:**
```
Input (prompt):     1,200 tokens (-52%)
Output (script):   10,000 tokens (-44%)
Total needed:      11,200 tokens ✅ WELL UNDER LIMIT
```

### File Changes Summary

**Solution #2:**
- `backend/src/services/claude.service.ts` (modify buildSystemPrompt)

**Solution #3:**
- `backend/src/utils/backtest-helpers.ts` (new file)
- `backend/src/utils/__tests__/backtest-helpers.test.ts` (new file)
- `backend/src/services/claude.service.ts` (update prompts to reference helpers)

**Total new code:** ~500 lines (helpers + tests)
**Total modified code:** ~1,500 lines (condensed prompts)
**Net change:** Scripts become 40-50% shorter ✅

---

**Document Version**: 1.0
**Author**: Claude Code
**Status**: Ready for Implementation
**Estimated Total Effort**: 22-28 hours over 3-4 weeks
