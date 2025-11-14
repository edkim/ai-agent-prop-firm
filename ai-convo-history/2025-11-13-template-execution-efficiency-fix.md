# Template Execution Efficiency Fix & Debug Logging

**Date**: 2025-11-13
**Focus**: Fixed critical performance issue with template execution that was preventing trade execution

## Problem Discovered

Discovery mode iterations were showing 0 trades despite generating hundreds of signals:
- Iterations 5-9: 180-272 signals → **0 trades executed**
- System slowed to a crawl during backtest execution
- Investigation revealed empty stdout/stderr from all script executions

## Root Cause Analysis

### Investigation Process
1. Verified scanner output was generating valid signals with correct `signal_time` values
2. Manually tested generated template scripts - they worked perfectly when run individually
3. Added comprehensive debug logging to trace execution flow
4. Discovered 130+ script files were being generated and executed in parallel

### Core Issue
**Template execution was creating 1 script file per ticker and executing all in parallel:**
- For 200 signals across 130 tickers → 130 separate TypeScript files
- Each file spawned a separate `npx ts-node` process
- All 130 processes started simultaneously via `Promise.all`
- System resource exhaustion → processes killed → empty stdout/stderr → 0 trades

## Solution Implemented

### Efficiency Improvements

**Before (inefficient):**
```typescript
// Generate 130+ separate script files
const backtestPromises = Object.entries(signalsByTicker).map(async ([ticker, signals]) => {
  const scriptPath = `.../${ticker}.ts`;
  const script = this.templateRenderer.renderScript(template, signals, ticker);
  fs.writeFileSync(scriptPath, script);
  const result = await this.scriptExecution.executeScript(scriptPath);
  // ...
});
const results = await Promise.all(backtestPromises); // Execute all 130+ in parallel
```

**After (efficient):**
```typescript
// Generate 1 unified script with ALL signals
const allSignals = filteredResults;
const script = this.templateRenderer.renderScript(template, allSignals, 'all');
fs.writeFileSync(scriptPath, script);
const result = await this.scriptExecution.executeScript(scriptPath); // Execute once
```

### Template Renderer Multi-Ticker Support

Updated `template-renderer.service.ts` to handle `ticker='all'`:

```typescript
const multiTickerCode = isMultiTicker ? `
  // Process each unique ticker from signals
  const allSignals = SCANNER_SIGNALS;
  const uniqueTickers = [...new Set(allSignals.map(s => s.ticker))];

  for (const ticker of uniqueTickers) {
    // Filter SCANNER_SIGNALS to only this ticker to avoid duplicates
    const SCANNER_SIGNALS = allSignals.filter(s => s.ticker === ticker);
    const timeframe = '5min';

    ${executionCode}  // Template execution code runs once per ticker
  }
` : `
  const ticker = '${ticker}';
  const timeframe = '5min';
  ${executionCode}
`;
```

### Debug Logging Added

Added comprehensive logging throughout execution flow:
- Post-filter signal counts
- Signal structure validation
- Ticker grouping details
- Script rendering progress
- Execution status for each step
- Trade count aggregation

Located in:
- `backend/src/services/learning-iteration.service.ts` (lines 594-737)

## Bug Fix: Duplicate Trades

### Initial Issue
First attempt at multi-ticker execution created **26,000 trades from 263 signals** (130x duplication).

### Cause
Multi-ticker loop filtered signals but didn't shadow the `SCANNER_SIGNALS` constant that template code referenced:

```typescript
// WRONG - template code sees all signals for every ticker
for (const ticker of uniqueTickers) {
  const tickerSignals = SCANNER_SIGNALS.filter(s => s.ticker === ticker);
  ${executionCode}  // Still references global SCANNER_SIGNALS
}
```

### Fix
Shadow `SCANNER_SIGNALS` in loop scope:

```typescript
// CORRECT - each iteration sees only its ticker's signals
for (const ticker of uniqueTickers) {
  const SCANNER_SIGNALS = allSignals.filter(s => s.ticker === ticker);
  ${executionCode}  // References filtered SCANNER_SIGNALS
}
```

## Results

### Performance Comparison

| Metric | Before | After |
|--------|--------|-------|
| Script files generated | 130+ | 1 |
| Processes spawned | 130+ | 1 |
| Execution time | Timeout | ~30 seconds |
| System impact | Laptop froze | Responsive |
| Trade execution rate | 0% | 100% |

### Iteration Results

**Iteration 10 (initial fix with duplicates):**
- 263 signals → 26,000 trades (duplicated)
- $353,848 return (inflated)

**Iteration 11 (fully fixed):**
- 272 signals → **200 trades** ✅
- 47% win rate
- -$1,442 total return
- No duplicates verified

### Validation
```bash
# Verify no duplicates
sqlite3 backtesting.db "..." | jq 'group_by(.ticker + .date + .entryTime) | max_by(.count)'
# Result: All trades have count: 1 ✅
```

## Files Modified

1. **backend/src/services/learning-iteration.service.ts**
   - Replaced per-ticker script generation with unified approach
   - Added debug logging throughout execution flow
   - Removed batch processing logic (no longer needed)

2. **backend/src/services/template-renderer.service.ts**
   - Added multi-ticker support (`ticker='all'`)
   - Generates loop that processes tickers sequentially
   - Properly scopes `SCANNER_SIGNALS` to avoid duplicates

## Key Learnings

1. **Parallelism isn't always better**: 130 parallel process spawns crashed the system
2. **Sequential can be faster**: 1 process looping through tickers completed in 30s vs timeout with parallel
3. **Scope matters**: Variable shadowing crucial for avoiding duplicates in loops
4. **Debug logging pays off**: Comprehensive logging made root cause obvious

## Discovery Mode Status

✅ **Now fully operational:**
- Template execution works efficiently
- No system resource issues
- Accurate trade results
- Ready for finding edge through rapid iteration

## Next Steps

- Discovery mode can now be used for rapid strategy testing
- Consider adding execution concurrency limits if needed in future
- Monitor system performance with larger signal sets (500+)
