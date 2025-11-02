# Investigation: Yesterday's runBacktest() vs Today's runScan() Mystery

**Date**: 2025-11-01
**Status**: INVESTIGATION COMPLETE

## The Mystery

User observed that:
- **Yesterday (Oct 31)**: Failed scripts had `runBacktest()` function and `TradeResult` interface
- **Today (Nov 1)**: Successful scripts only have `runScan()` function and `ScanMatch` interface

Question: Did Phase 2 prompt simplification remove execution script guidance?

---

## TL;DR - THE ANSWER

**NO, Phase 2 did NOT break execution script generation!**

The issue is a **script type mislabeling bug** that was discovered and documented yesterday (Oct 31) but not yet fixed. The scripts you're seeing are:
- **Yesterday**: Execution scripts INCORRECTLY labeled as "scanner" scripts
- **Today**: Actual scanner scripts CORRECTLY labeled

Both types are being generated correctly by the learning system. The confusion stems from the mislabeling bug.

---

## Detailed Investigation

### 1. Yesterday's "Scanner" Scripts (Oct 31) - Actually Execution Scripts!

**File**: `generated-scripts/failed/2025-10-31/078faf7a-613e-45f6-b7b8-caf663a12677-scanner.ts`

**What it contains:**
```typescript
interface TradeResult {         // ← Execution script interface
  date: string;
  ticker: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
}

interface ScannerSignal {       // ← Input from scanner
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
}

declare const SCANNER_SIGNALS: ScannerSignal[] | undefined;

async function runBacktest() {  // ← Execution function
  // ... backtest execution logic ...
}
```

**Metadata says:**
```json
{
  "scriptType": "scanner",      // ← WRONG! This is an execution script
  "status": "failed"
}
```

**Truth**: This is a **signal-based execution script** that:
- Receives `SCANNER_SIGNALS` as input
- Executes trades based on those signals
- Outputs `TradeResult[]` with PnL, entry/exit prices, etc.

**Why mislabeled?** Bug in `script-execution.service.ts` line 148-149 (documented in `2025-11-01-scanner-vs-execution-investigation.md`):
```typescript
// BROKEN LOGIC:
if (content.includes('SCANNER_SIGNALS')) {
  return 'scanner';  // ← WRONG! Should be 'execution'
}
```

---

### 2. Today's "Unknown" Scripts (Nov 1) - Actually Scanner Scripts!

**File**: `generated-scripts/success/2025-10-31/570c8f18-84bc-47a9-bf64-ddc9ac6bc37a-unknown.ts`

**What it contains:**
```typescript
interface ScanMatch {           // ← Scanner script interface
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: any;
}

async function runScan(): Promise<ScanMatch[]> {  // ← Scanner function
  // ... scan all tickers for patterns ...
  return results;
}
```

**Metadata says:**
```json
{
  "scriptType": "unknown",      // ← Should be "scanner"
  "status": "success"
}
```

**Truth**: This is a **true scanner script** that:
- Queries the database for intraday OHLCV data
- Detects VWAP mean reversion patterns across multiple tickers
- Outputs `ScanMatch[]` with pattern matches

**Why labeled "unknown"?** The script preservation system couldn't confidently identify it, but it's clearly a scanner.

---

### 3. What Phase 2 Changed (and Didn't Change)

**Phase 2 Results** (from `2025-11-01-phase2-results.md`):

**Changed:**
- Reduced system prompt from 813 → 295 lines (63% reduction)
- Removed duplicate helper function implementations
- Converted verbose TypeScript rules to table format
- Compressed signal-based execution examples
- Simplified trade execution patterns

**Did NOT Change:**
- ✅ Signal-based execution guidance (lines 388-458 in `buildSystemPrompt()`)
- ✅ Scanner script generation (separate `buildScannerSystemPrompt()`)
- ✅ Two-script architecture (scanner + execution)
- ✅ `SCANNER_SIGNALS` interface and usage patterns

**Proof in the code** (`claude.service.ts`):

```typescript
// Lines 388-458: Signal-Based Execution section
## Signal-Based Execution

interface ScannerSignal {
  ticker: string;
  signal_date: string;     // NOT 'date'
  signal_time: string;     // NOT 'time'
  pattern_strength: number;
  metrics: { [key: string]: any };
}

const useSignalBasedExecution = typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS.length > 0;

if (useSignalBasedExecution) {
  for (const signal of SCANNER_SIGNALS) {
    // ... signal-based execution logic ...
  }
}
```

This section is STILL in the Phase 2 prompt! It was compressed but not removed.

---

### 4. How the Learning System Works (Two-Script Architecture)

**File**: `agent-learning.service.ts` lines 181-269

**Step 1: Generate Scanner Script**
```typescript
// Line 220
const scannerResult = await this.claude.generateScannerScript({
  query: scannerQuery,
  universe: agent.universe || 'Tech Sector',
  dateRange: { start: '...', end: '...' }
});
```

**Purpose**: Find pattern matches across universe of stocks
**Output**: `ScanMatch[]` with ticker, date, time, pattern_strength

---

**Step 2: Generate Execution Script**
```typescript
// Line 252
const executionResult = await this.claude.generateScript(executionPrompt, {
  strategyType: 'signal_based',  // ← Key parameter
  ticker: 'TEMPLATE_TICKER',
  timeframe: agent.timeframe || '5min',
  specificDates: [this.getDateDaysAgo(5)],
  config: config
});
```

**Purpose**: Execute trades based on scanner signals
**Output**: `TradeResult[]` with PnL, entry/exit prices

---

**Step 3: Execute Scanner**
```typescript
// Line 285
const result = await this.scriptExecution.executeScript(scriptPath, 60000);
const scanResults = result.data;  // Array of ScanMatch objects
```

---

**Step 4: Inject Signals into Execution Script**
```typescript
// Line 359-369
const signalsJSON = JSON.stringify(signals, null, 2);
const signalInjection = `
// SIGNALS FROM SCANNER (injected by learning system)
const SCANNER_SIGNALS = ${signalsJSON};
`;

const customizedScript = executionScript
  .replace(/TEMPLATE_TICKER/g, ticker)
  .replace(/const tradingDays: string\[\] = \[[^\]]+\];/s,
    `const tradingDays: string[] = ${JSON.stringify([...])};\n${signalInjection}`);
```

---

**Step 5: Execute Backtest**
```typescript
// Line 375
const result = await this.scriptExecution.executeScript(scriptPath, 120000);
const trades = result.data.trades;  // Array of TradeResult objects
```

---

### 5. Why You're Seeing Different Scripts

**Yesterday's Scripts (Oct 31)**:
- File pattern: `{uuid}-scanner.ts`
- Content: Execution scripts with `runBacktest()`, `TradeResult`, `SCANNER_SIGNALS`
- Metadata: `"scriptType": "scanner"` (WRONG - mislabeled)
- Status: Failed (TypeScript compilation errors)

**Today's Scripts (Nov 1)**:
- File pattern: `{uuid}-unknown.ts`
- Content: Scanner scripts with `runScan()`, `ScanMatch`, database queries
- Metadata: `"scriptType": "unknown"` (should be "scanner")
- Status: Success (found 500 pattern matches)

**What happened?**
The learning agent completed iteration #1 and generated BOTH types of scripts:
1. Scanner script (ran successfully, found patterns)
2. Execution script (likely failed due to TypeScript errors)

Only the successful scanner script was preserved in the success folder. The failed execution scripts from yesterday are in the failed folder.

---

## The Root Cause (Already Documented)

**File**: `script-execution.service.ts` lines 142-156

**The Bug**:
```typescript
private detectScriptType(fileName: string, content: string): 'scanner' | 'execution' | 'unknown' {
  // Check content for indicators
  if (content.includes('SCANNER_SIGNALS') || content.includes('// Scanner script')) {
    return 'scanner';  // ← BUG: Scripts that CONSUME signals are not scanners!
  }
  if (content.includes('TradeResult') || content.includes('// Execution script')) {
    return 'execution';
  }
  return 'unknown';
}
```

**The Logic Error**:
- Scripts with `SCANNER_SIGNALS` are labeled "scanner"
- But `SCANNER_SIGNALS` is INPUT to execution scripts, not output from scanners!

**Correct Logic**:
- Scanner scripts: Output `ScanMatch[]`, have `interface ScanMatch`
- Execution scripts: Consume `SCANNER_SIGNALS`, output `TradeResult[]`, have `interface TradeResult`

**The Fix** (documented but not implemented):
```typescript
private detectScriptType(fileName: string, content: string): 'scanner' | 'execution' | 'unknown' {
  // Check filename first
  if (fileName.includes('scan-')) return 'scanner';
  if (fileName.includes('backtest-')) return 'execution';

  // Scanner scripts OUTPUT ScanMatch results
  if (content.includes('interface ScanMatch') || content.includes('ScanMatch[]')) {
    return 'scanner';
  }
  
  // Execution scripts CONSUME SCANNER_SIGNALS and OUTPUT TradeResult
  if (content.includes('SCANNER_SIGNALS') || 
      content.includes('interface TradeResult') || 
      content.includes('TradeResult[]')) {
    return 'execution';
  }

  return 'unknown';
}
```

---

## Answer to Your Questions

### 1. Does buildSystemPrompt() still have instructions for BOTH scanner AND execution scripts?

**Answer**: YES, but they're in SEPARATE prompts:
- `buildSystemPrompt()` → Execution scripts (including signal-based execution)
- `buildScannerSystemPrompt()` → Scanner scripts

This is by design. The two-script architecture uses two different prompts.

---

### 2. Did Phase 2 simplification remove execution script guidance?

**Answer**: NO. Phase 2 COMPRESSED the guidance but kept all essential sections:
- Signal-based execution pattern (lines 388-458)
- `SCANNER_SIGNALS` interface and usage
- Trade execution logic
- Entry/exit rules

**Proof**: The Phase 2 prompt (295 lines) still includes:
```markdown
## Signal-Based Execution

interface ScannerSignal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: { [key: string]: any };
}

const useSignalBasedExecution = typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS.length > 0;

if (useSignalBasedExecution) {
  for (const signal of SCANNER_SIGNALS) {
    // ... (execution logic) ...
  }
}
```

---

### 3. Is there a buildScannerPrompt() vs buildExecutionPrompt()?

**Answer**: YES:
- `buildScannerSystemPrompt()` (lines 621-1025) → For scanner scripts
- `buildSystemPrompt()` (lines 224-520) → For execution scripts

**Different methods called**:
- `generateScannerScript()` → Uses scanner prompt
- `generateScript()` → Uses execution prompt

---

### 4. Does agent-learning.service.ts call different methods for scanner vs execution?

**Answer**: YES, exactly as designed:
```typescript
// Line 220: Generate scanner
const scannerResult = await this.claude.generateScannerScript({ ... });

// Line 252: Generate execution
const executionResult = await this.claude.generateScript(executionPrompt, {
  strategyType: 'signal_based',
  ...
});
```

---

## Why Yesterday's Scripts Failed

The Oct 31 execution scripts failed due to TypeScript compilation errors:

1. **Null handling**: `const tradingDays: string[] = [null];` (line 134)
   - Error: Type 'null' is not assignable to type 'string'
   
2. **Undefined metric**: `const volumeRatio = metrics.volume_ratio` (line 261)
   - Error: Property 'volume_ratio' does not exist
   - Scanner outputs `volume_spike_multiplier`, not `volume_ratio`

3. **Syntax error**: Incomplete code generation (line 346)

These are Claude generation issues, not Phase 2 prompt issues.

---

## Why Today's Scripts Succeeded

The Nov 1 scanner scripts succeeded because:
1. They're simpler (scan and return results, no trade execution)
2. They're properly typed
3. They don't have signal-based execution complexity
4. They successfully found 500 VWAP mean reversion patterns

---

## What's REALLY Happening

**The Learning Agent is Working Correctly**:

1. ✅ Generates scanner script (finds patterns)
2. ✅ Executes scanner script (returns ScanMatch[])
3. ✅ Generates execution script (trades based on signals)
4. ❌ Execution script fails (TypeScript errors)
5. ❌ Execution script mislabeled as "scanner" (preservation bug)

**The Confusion**:
- You saw yesterday's FAILED execution scripts labeled as "scanner"
- You saw today's SUCCESSFUL scanner scripts labeled as "unknown"
- This made it seem like execution scripts stopped being generated

**The Reality**:
- Both types are still being generated
- Execution scripts are failing due to TypeScript errors
- Script labeling is broken (known bug from Oct 31 investigation)

---

## What Needs to be Fixed

### Fix 1: Script Type Detection (High Priority)
**File**: `script-execution.service.ts` line 148
**Issue**: Mislabels execution scripts as scanners
**Impact**: Confusing preservation metadata, harder debugging

---

### Fix 2: TypeScript Generation Quality (High Priority)
**File**: `claude.service.ts` buildSystemPrompt()
**Issue**: Generated execution scripts have compilation errors
**Examples**:
- Null handling: `[null]` instead of `[]` or `string | null`
- Metrics mismatch: Expecting `volume_ratio` but scanner outputs `volume_spike_multiplier`
- Incomplete code generation

**Potential solutions**:
- Add more explicit TypeScript rules to prompt
- Add examples of correct null handling
- Ensure scanner/execution metric interfaces align
- Add validation for common errors

---

### Fix 3: Add 'signal_based' to ScriptGenerationParams (Medium Priority)
**File**: `script.types.ts`
**Issue**: `strategyType: 'signal_based'` not in type definition
**Impact**: Type safety, IDE warnings

```typescript
export interface ScriptGenerationParams {
  strategyType: 'orb' | 'momentum' | 'mean-reversion' | 'custom' | 'signal_based';  // Add this
  // ... rest ...
}
```

---

## Conclusion

**Your Observation**: Yesterday had `runBacktest()`, today has `runScan()`

**The Explanation**:
- Yesterday's preserved scripts: Failed execution scripts (mislabeled as "scanner")
- Today's preserved scripts: Successful scanner scripts (labeled as "unknown")

**Phase 2 Status**: ✅ Did NOT break execution script generation
- Both scanner and execution prompts are intact
- Signal-based execution guidance is still present (compressed but complete)
- Two-script architecture is working as designed

**The Real Issues**:
1. Script type detection bug (causes mislabeling)
2. TypeScript generation errors (causes execution script failures)
3. These are SEPARATE from Phase 2 prompt changes

**Next Steps**:
1. Fix `detectScriptType()` logic
2. Improve TypeScript error handling in execution prompt
3. Align scanner/execution metric interfaces
4. Add type safety for 'signal_based' strategy type

---

**Files Referenced**:
- `/backend/src/services/claude.service.ts` (Lines 224-520 execution prompt, 621-1025 scanner prompt)
- `/backend/src/services/agent-learning.service.ts` (Lines 181-269 strategy generation)
- `/backend/src/services/script-execution.service.ts` (Lines 142-156 type detection bug)
- `/ai-convo-history/2025-11-01-phase2-results.md` (Phase 2 documentation)
- `/ai-convo-history/2025-11-01-scanner-vs-execution-investigation.md` (Script labeling bug)

---

**Investigation Complete**: 2025-11-01
