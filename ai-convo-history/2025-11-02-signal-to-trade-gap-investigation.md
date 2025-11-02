# Signal-to-Trade Gap Investigation Plan

**Date**: 2025-11-02
**Status**: Planning
**Priority**: High

---

## Problem Statement

Scanner script successfully generated 6 trade signals, but execution scripts produced 0 trades. Expected behavior: Each scanner signal should trigger at least one trade attempt (successful trade or documented no-trade reason).

### Observed Behavior

**Scanner Output** (Session #4):
- Signals found: 6
- Signal details:
  - TXN: 2025-10-22 11:30 (FADE_UP, strength: 100)
  - MCHP: 2025-10-22 15:05 (FADE_DOWN, strength: 84)
  - 4 additional signals (truncated in metadata)
- Script: `311b63c8-c958-4902-8c9d-e412e75c0062-scanner.ts`

**Execution Output** (Session #4):
- 4 execution scripts ran
- All returned: `[]` (empty array)
- No trades, no noTrade entries
- Scripts:
  - `edc36ae6-be13-4a8a-bd74-116e9c6e81bf-execution.ts`
  - `ab803cd8-427d-4f53-a3b4-c88ad8043064-execution.ts`
  - `1c2b7fb7-005f-4d61-b68b-4def3014643f-execution.ts`
  - `ad518324-f238-47e3-bd20-c53671946e6a-execution.ts`

---

## Investigation Steps

### Phase 1: Signal Injection Verification

**Objective**: Confirm scanner signals are properly injected into execution scripts

1. **Read execution script source code**
   - Check for `SCANNER_SIGNALS` constant declaration
   - Verify signal injection format matches expected structure
   - Expected pattern:
     ```typescript
     const SCANNER_SIGNALS = [
       {
         "ticker": "TXN",
         "signal_date": "2025-10-22",
         "signal_time": "11:30",
         "pattern_strength": 100,
         "metrics": { ... }
       },
       ...
     ];
     ```

2. **Trace signal flow in agent-learning.service.ts**
   - Review `runBacktests()` method (lines ~320-380)
   - Verify signal data structure transformation
   - Check if signals are properly embedded in script template

3. **Compare signal format**
   - Scanner output format
   - Execution script injection format
   - Interface definitions in execution script

**Files to Review**:
- `backend/generated-scripts/success/2025-11-02/edc36ae6-be13-4a8a-bd74-116e9c6e81bf-execution.ts`
- `backend/src/services/agent-learning.service.ts` (lines 320-380)
- `backend/src/services/script-execution.service.ts` (signal injection logic)

---

### Phase 2: Execution Logic Analysis

**Objective**: Understand why injected signals didn't produce trades

1. **Analyze signal-based execution branch**
   - Check `useSignalBasedExecution` condition evaluation
   - Verify `SCANNER_SIGNALS` array is defined and has length > 0
   - Trace through signal processing loop

2. **Review exit conditions**
   - Check for early `continue` statements
   - Identify validation filters that might reject signals
   - Common rejection reasons:
     - No data available for ticker/date
     - Signal timing issues (too late in session)
     - Outside trading window
     - Insufficient volume confirmation
     - Pattern strength too low
     - Position not closed before EOD

3. **Data availability check**
   - Verify database has 5-minute bars for:
     - Ticker: TXN, MCHP
     - Date: 2025-10-22
     - Timeframe: '5min' or '5m'
   - SQL query:
     ```sql
     SELECT COUNT(*) as bar_count, ticker, date(timestamp/1000, 'unixepoch') as date
     FROM ohlcv_data
     WHERE ticker IN ('TXN', 'MCHP')
       AND date(timestamp/1000, 'unixepoch') = '2025-10-22'
       AND timeframe IN ('5min', '5m')
     GROUP BY ticker, date;
     ```

**Files to Review**:
- `backend/generated-scripts/success/2025-11-02/edc36ae6-be13-4a8a-bd74-116e9c6e81bf-execution.ts` (full script)
- Database: `/Users/edwardkim/Code/ai-backtest/backtesting.db`

---

### Phase 3: Timeframe Mismatch Investigation

**Objective**: Identify potential timeframe string inconsistencies

1. **Check timeframe string variations**
   - Scanner uses: `timeframe='5min'` (database query)
   - Execution might use: `timeframe='5m'` (variable on line 51)
   - Database actual values: Could be '5min', '5m', or '5MIN'

2. **Verify timeframe standardization**
   - Scanner script line: `WHERE ... AND timeframe = '5min'`
   - Execution script line 51: `const timeframe = '5m';`
   - Database query line 75: `WHERE ... AND timeframe = ?` (uses variable)
   - **POTENTIAL MISMATCH**: Scanner queries '5min', execution queries '5m'

3. **Hypothesis**:
   - Scanner finds signals using `timeframe='5min'`
   - Execution tries to load bars using `timeframe='5m'`
   - No bars found → `bars.length === 0` → noTrade reason: 'No data available'
   - But execution script returns `[]` instead of noTrade entries
   - **Question**: Why doesn't noTrade get pushed to results?

**Expected Fix**:
- Ensure scanner and execution use same timeframe string
- Add timeframe parameter to signal metadata
- Or standardize timeframe in database

---

### Phase 4: Results Array Population

**Objective**: Understand why empty array `[]` is returned instead of noTrade entries

1. **Trace results array population**
   - Check if results.push() calls are being executed
   - Verify console.log(JSON.stringify(results)) outputs correctly
   - Possible issue: Early return or process exit

2. **Review signal loop execution**
   - Add logging to understand which branch executes
   - Check if `SCANNER_SIGNALS` loop actually runs
   - Verify `useSignalBasedExecution` evaluates to true

3. **Compare with previous truncated scripts**
   - Previous scripts (2025-11-02 failed) had similar structure
   - Did they populate noTrade entries correctly?
   - What changed between failed and success versions?

---

### Phase 5: Signal Grouping Logic

**Objective**: Understand how 6 signals map to 4 execution scripts

From console output:
```
Grouped into 4 ticker(s)
```

1. **Review signal grouping in agent-learning.service.ts**
   - How are signals grouped by ticker?
   - Are some signals being dropped?
   - Expected: 6 signals across 4 tickers = ~1-2 signals per ticker

2. **Verify all signals processed**
   - Check if signal filtering/deduplication removes some
   - Console shows:
     - "After quality filter (>=0): 6"
     - "After diversification: 6"
     - "Final set to backtest: 5" ← **Lost 1 signal here**
   - Investigation: Why did diversification filter reduce 6→5?

---

## Hypotheses (Ranked by Likelihood)

### 1. Timeframe Mismatch (90% confidence)
- Scanner: `timeframe='5min'`
- Execution: `timeframe='5m'`
- Result: No bars found, early exit with empty results

### 2. Signal Injection Failed (60% confidence)
- SCANNER_SIGNALS constant not properly injected
- `useSignalBasedExecution` evaluates to false
- Falls through to tradingDays loop (which is empty array)

### 3. Data Availability Issue (40% confidence)
- Database doesn't have bars for TXN/MCHP on 2025-10-22
- Early continue with noTrade reason
- But results array not being output correctly

### 4. Logic Error in Signal Processing (30% confidence)
- Signal loop runs but exits early for all signals
- Multiple validation filters reject all signals
- Results array populated but not logged

---

## Success Criteria

Investigation complete when we can answer:

1. ✅ Are signals properly injected into execution scripts?
2. ✅ Does `useSignalBasedExecution` evaluate to true?
3. ✅ Do database bars exist for signal tickers/dates/timeframe?
4. ✅ Which validation filter(s) reject the signals?
5. ✅ Why does execution return `[]` instead of noTrade entries?
6. ✅ What is the correct fix to ensure signals → trades?

---

## Expected Outcomes

### Scenario A: Timeframe Mismatch
**Fix**: Standardize timeframe to '5min' in both scanner and execution
**Implementation**: Update execution script prompt template
**Expected result**: Bars found, trades executed

### Scenario B: Signal Injection Issue
**Fix**: Debug signal injection in agent-learning.service.ts
**Implementation**: Fix script template or signal embedding
**Expected result**: Signals properly available in execution

### Scenario C: Database Missing Data
**Fix**: Verify data ingestion for required dates/tickers
**Implementation**: Check data download scripts, re-ingest if needed
**Expected result**: Historical bars available for backtesting

### Scenario D: Overly Strict Validation
**Fix**: Relax validation filters or improve signal quality
**Implementation**: Adjust execution script logic or scanner criteria
**Expected result**: More signals pass validation, trades generated

---

## Next Steps

1. **Immediate**: Read full execution script source code
2. **Debug**: Add console.error() logging to trace execution path
3. **Verify**: Check database for TXN/MCHP bars on 2025-10-22
4. **Fix**: Apply most likely fix (timeframe standardization)
5. **Test**: Run new iteration and verify signals → trades

---

## Files to Preserve for Analysis

- ✅ `backend/generated-scripts/success/2025-11-02/311b63c8-c958-4902-8c9d-e412e75c0062-scanner.ts`
- ✅ `backend/generated-scripts/success/2025-11-02/311b63c8-c958-4902-8c9d-e412e75c0062-metadata.json`
- ✅ `backend/generated-scripts/success/2025-11-02/edc36ae6-be13-4a8a-bd74-116e9c6e81bf-execution.ts`
- ✅ `backend/generated-scripts/success/2025-11-02/edc36ae6-be13-4a8a-bd74-116e9c6e81bf-metadata.json`
- ✅ All 4 execution script files and metadata

---

**Investigation Owner**: AI Assistant
**Expected Duration**: 30-60 minutes
**Session**: 2025-11-03 or next available
