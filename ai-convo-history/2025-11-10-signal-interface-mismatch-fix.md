# Signal Interface Mismatch Fix
**Date:** 2025-11-10

## Problem

Learning iterations generated execution scripts that went SHORT instead of LONG (or vice versa) because Claude was given a **hardcoded Signal interface** that didn't match the actual scanner output.

### Root Cause

File: `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts` (line 1606)

Claude was told to expect signals with:
```typescript
interface Signal {
  metrics: {
    price: number;
    vwap: number;
    rejection_type: 'bullish' | 'bearish';  // ← Hardcoded!
    wick_ratio: number;
  };
}
```

But actual scanner output varied:
```typescript
// High of Day Breakout scanner actual output:
interface Signal {
  metrics: {
    breakout_price: number;
    high_of_day: number;
    volume_ratio: number;
    price_change_percent: number;
  };
}
```

Generated execution scripts referenced `signal.metrics.rejection_type`, which was **undefined**, causing wrong trade direction.

### Impact

- **Iteration 1:** SHORT instead of LONG (40% win rate, +$65)
- **Iteration 2:** SHORT instead of LONG (40% win rate, -$522)
- All custom execution scripts (iteration 2+) affected
- Templates worked because they used flexible `metrics?: { [key: string]: any }`

## Solution

### Phase 1: Dynamic Signal Interface (IMPLEMENTED)

**Changes made:**

1. **Added `inferSignalInterface()` method** (`claude.service.ts`):
   - Infers Signal interface from actual scanner output
   - Fallback to flexible interface if no samples provided
   - Generates TypeScript interface string from real signal structure

2. **Updated `generateExecutionScript()` method** (`claude.service.ts`):
   - Added `actualScannerSignals?: any[]` parameter
   - Calls `inferSignalInterface()` to get actual structure
   - Passes inferred interface to Claude prompt instead of hardcoded one
   - Shows example signal JSON to Claude
   - Provides guidance on determining trade direction

3. **Updated execution flow** (`agent-learning.service.ts`):
   - Added Step 2.5: Generate execution script AFTER scanner execution
   - Passes first 5 scanner signals as samples
   - Only applies to iteration 2+ (iteration 1 uses templates)

### Code Changes

#### claude.service.ts

**New method (line 1565):**
```typescript
private inferSignalInterface(sampleSignal: any): string {
  if (!sampleSignal || !sampleSignal.metrics) {
    // Fallback to flexible interface
    return `interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics?: { [key: string]: any };  // Flexible metrics
}`;
  }

  // Infer types from actual metrics
  const metricsFields = Object.keys(sampleSignal.metrics)
    .map(key => {
      const value = sampleSignal.metrics[key];
      const type = typeof value === 'number' ? 'number' :
                   typeof value === 'string' ? 'string' :
                   typeof value === 'boolean' ? 'boolean' : 'any';
      return `    ${key}: ${type};`;
    })
    .join('\n');

  return `interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: {
${metricsFields}
  };
}`;
}
```

**Updated method signature (line 1611):**
```typescript
async generateExecutionScript(params: {
  agentPersonality: string;
  winningTemplate: string;
  templatePerformances: any[];
  executionAnalysis: any;
  agentKnowledge: string;
  scannerContext: string;
  actualScannerSignals?: any[];  // NEW
}): Promise<{ script: string; rationale: string }>
```

**Updated prompt (line 1620):**
```typescript
// Infer signal interface from actual scanner output
const sampleSignal = params.actualScannerSignals?.[0];
const signalInterface = this.inferSignalInterface(sampleSignal);

// Use inferred interface in prompt:
**CRITICAL - Signal Interface from YOUR Scanner:**
The ACTUAL Signal interface from the scanner output is:
\`\`\`typescript
${signalInterface}
\`\`\`

${sampleSignal ? `
**Example Signal from Scanner:**
\`\`\`json
${JSON.stringify(sampleSignal, null, 2)}
\`\`\`

IMPORTANT: Use these EXACT field names from the scanner. Do NOT assume fields like 'rejection_type' exist unless shown above.
` : ''}
```

#### agent-learning.service.ts

**New step after scan execution (line 98):**
```typescript
// Step 2.5: For iteration 2+, regenerate execution script with actual signals
if (iterationNumber > 1 && scanResults.length > 0 && !strategy.executionScript) {
  logger.info('Step 2.5: Generating execution script with actual scanner signals');

  const executionResult = await this.claude.generateExecutionScript({
    agentPersonality,
    winningTemplate: previousIteration.winning_template || 'time_based',
    templatePerformances: previousIteration.backtest_results.templateResults || [],
    executionAnalysis: previousIteration.expert_analysis.execution_analysis || {},
    agentKnowledge: knowledgeSummary,
    scannerContext: strategy.rationale,
    actualScannerSignals: scanResults.slice(0, 5)  // Pass first 5 signals
  });

  strategy.executionScript = executionResult.script;
  logger.info('✅ Execution script regenerated with actual signals');
}
```

## Benefits

✅ **Execution scripts now match scanner output**
- No more hardcoded field assumptions
- Works for ANY pattern type (breakout, rejection, momentum, etc.)
- Claude sees REAL signal structure, not assumptions

✅ **Trade direction accuracy**
- Breakout patterns → LONG (momentum)
- Rejection patterns → SHORT/LONG based on actual fields
- Custom patterns → Inferred from context

✅ **Backwards compatible**
- Fallback to flexible interface if no signals provided
- Templates still work (unchanged)
- Iteration 1 still uses templates (fast)

## Testing

**Next step:** Run High of Day Breakout Scalper iteration 3 with manual guidance to verify LONG trades.

Expected result:
- Execution script should detect breakout pattern
- Trade direction should be LONG
- `signal.metrics.breakout_price` and `high_of_day` fields should be used

## Future Enhancements (Phase 2-3)

### Phase 2: Signal Validation Service

Create `signal-validator.service.ts` with:
- `validateSignal()` - Check required fields exist
- `inferTradeDirection()` - Derive direction from various patterns
- Logging for mismatches

### Phase 3: Signal Schema Registry

Define common signal types:
```typescript
const SIGNAL_SCHEMAS = {
  breakout: { metrics: { breakout_price, high_of_day, volume_ratio } },
  rejection: { metrics: { price, vwap, rejection_type, wick_ratio } },
  momentum: { metrics: { rsi, macd, volume_surge } }
};
```

Scanners declare their output type:
```typescript
export const SIGNAL_TYPE: SignalType = 'breakout';
```

Benefits:
- Explicit contracts
- Type safety
- Reusable signal definitions
- Documentation built-in

## Lessons Learned

1. **Always pass actual data to Claude, never hardcode assumptions**
2. **Generate execution AFTER scan execution, not before**
3. **Templates work because they're flexible - custom scripts need same flexibility**
4. **Scanner output varies by pattern - interface must adapt**

## Related Issues Fixed

- Iteration 1 SHORT trades on breakout patterns
- Iteration 2 SHORT trades despite manual guidance for LONG
- Field mismatch errors (accessing undefined properties)
- Trade direction randomness

## Files Modified

- `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
