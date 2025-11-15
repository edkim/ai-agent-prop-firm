# Real-Time Scanner Debugging Plan
**Date:** 2025-11-14

## Problem Statement
Running VWAP cross agent on 20 tickers × 10 days = 200 ticker-days with **ZERO signals** found. This is statistically suspicious and suggests a systemic issue.

## What We've Tested So Far
1. **test-vwap-cross.ts** - Standalone VWAP calculation and cross detection
2. **test-simple-vwap-scanner.ts** - Isolated scanner with VWAP cross logic
3. **test-scanner-manually.ts** - Synthetic data with guaranteed VWAP cross

## Hypotheses (What Could Be Wrong)

### H1: Scanner Logic Issue
- VWAP calculation is incorrect
- Cross detection logic has bug
- Signal formatting is wrong

### H2: Real-Time Infrastructure Issue
- Bar-by-bar simulation not providing correct bars
- Warmup bars insufficient for VWAP calculation
- Scanner script context/state not preserved between bars

### H3: Data Quality Issue
- No data exists for the date range (10 days ago to yesterday)
- Volume is zero (breaks VWAP calculation)
- Tickers don't have 5min data

### H4: Signal Filtering Issue
- Signals are found but filtered out
- Pattern strength threshold too high
- Diversification limits too strict

## Proposed Testing Strategy

### Phase 1: Verify Test Infrastructure ✓
**Goal:** Confirm standalone tests work
```bash
# Test 1: Manual VWAP cross detection
npx ts-node backend/test-vwap-cross.ts

# Test 2: Simple scanner on synthetic data
npx ts-node backend/test-scanner-manually.ts
```
**Expected:** Should find VWAP crosses in synthetic data

### Phase 2: Create "Always Signal" Agent
**Goal:** Test if infrastructure can detect ANY signal
```typescript
// Scanner that signals on EVERY bar after warmup
// If this produces 0 signals, the infrastructure is broken
// If this produces signals, the VWAP logic is the issue
```

### Phase 3: Verify Data Availability
**Goal:** Check if data exists for the scan period
```sql
-- Check if we have data for last 10 days
SELECT
  date(timestamp/1000, 'unixepoch') as date,
  COUNT(DISTINCT ticker) as ticker_count,
  COUNT(*) as bar_count
FROM ohlcv_data
WHERE timeframe = '5min'
  AND date(timestamp/1000, 'unixepoch') >= date('now', '-11 days')
GROUP BY date
ORDER BY date DESC;
```

### Phase 4: Instrument Real-Time Scanner
**Goal:** Add detailed logging to see what's happening
- Log how many bars are processed
- Log VWAP calculations at each step
- Log when cross conditions are evaluated
- Log why signals are/aren't triggered

### Phase 5: Check Signal Filtering
**Goal:** Verify signals aren't being filtered out
- Log pre-filter vs post-filter signal counts
- Check pattern_strength values
- Review diversification limits

## Recommended Next Steps

1. **Run existing tests** to baseline functionality
2. **Create "always signal" test agent** to isolate infrastructure
3. **Query database** to verify data availability
4. **Add instrumentation** to real-time scanner
5. **Review logs** from recent iterations

## Success Criteria
- Understand exactly where signals are lost
- Fix the root cause
- Verify VWAP cross agent finds signals on historical data
