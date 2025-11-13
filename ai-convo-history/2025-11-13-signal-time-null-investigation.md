# Signal Time Null Investigation - 2025-11-13

## Problem Statement

Discovery mode iterations were finding 500 signals but only executing 3 trades (~2% execution rate). The root cause was that most scanner signals had `signal_time: null`, causing templates to skip them with "Signal too late in session" error.

## Investigation Summary

### What We Found

1. **Database Issue (ROOT CAUSE)**: 94% of 5-minute bars had NULL `time_of_day` field
   - Total 5-min records: 2,508,114
   - Records with NULL time_of_day: 2,361,149 (94%)
   - Records with valid time_of_day: 146,965 (6%)

2. **Date Range Problem**:
   - time_of_day populated: Aug 13 - Nov 12, 2025
   - time_of_day NULL: Oct 14 - Nov 13, 2025
   - Scanner date range: Oct 24 - Nov 12, 2025 (overlaps NULL range)

3. **How The Bug Manifested**:
   ```typescript
   // In generated scanner scripts (backend/agent-scan-*.ts):
   const timeUTC = current.time_of_day;  // Gets null from database
   results.push({
     ticker,
     signal_date: date,
     signal_time: timeUTC,  // ← null propagated here
     // ...
   });
   ```

4. **Template Rejection Logic** (backend/src/templates/execution/conservative.ts:60):
   ```typescript
   const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signal_time);

   if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
     results.push({
       date: signal_date,
       ticker: sigTicker,
       noTrade: true,
       noTradeReason: 'Signal too late in session'  // ← This message
     });
     continue;
   }
   ```

   When `signal_time` is null, `findIndex` returns -1, triggering the skip.

### Secondary Bug Found

**Field Name Mismatch** in signal diversification logic:

**File**: `backend/src/services/learning-iteration.service.ts:1257`

**Issue**: Code used `signal.date` but scanners generate `signal.signal_date`

```typescript
// Before (WRONG):
const key = `${signal.ticker}:${signal.date}`;  // signal.date is undefined

// After (FIXED):
const key = `${signal.ticker}:${signal.signal_date || signal.date}`;
```

This caused incorrect signal grouping but didn't directly cause null signal_time.

## Solutions Implemented

### 1. Fixed Database - Populated Missing time_of_day Values

Created and executed SQL script: `backend/fix-time-of-day.sql`

```sql
UPDATE ohlcv_data
SET time_of_day = strftime('%H:%M:%S', timestamp/1000, 'unixepoch')
WHERE time_of_day IS NULL
  AND timeframe = '5min';
```

**Result**: All 2,508,114 records now have valid time_of_day

**Before**: `2508114|146965|2361149` (total|with_time|null)
**After**: `2508114|2508114|0` (all populated)

### 2. Fixed Signal Field Name Bug

**File**: `backend/src/services/learning-iteration.service.ts:1258`

Changed signal grouping to use correct field name:
```typescript
const key = `${signal.ticker}:${signal.signal_date || signal.date}`;
```

Fallback to `signal.date` maintains backward compatibility if needed.

## Expected Impact

### Before Fix
- Scanner finds 500 signals
- 143 filtered signals
- 82 unique tickers
- **3 trades executed (2% execution rate)**
- Reason: 97% of signals had null signal_time

### After Fix
- Scanner finds 500 signals
- 143 filtered signals
- 82 unique tickers
- **~50-100 trades executed (35-70% execution rate)** ← Expected
- All signals now have valid signal_time from database

Not all signals will execute because:
1. Entry timing filters (must have bars after signal)
2. Market close proximity (no time to execute)
3. Data availability issues

But the majority that were failing due to null signal_time will now execute properly.

## Technical Details

### Time Format
- **Database timestamp**: milliseconds since epoch (e.g., 1761724800000)
- **time_of_day**: HH:MM:SS in UTC (e.g., "14:30:00")
- **Market hours**: 09:30-16:00 ET = 13:30-20:00 UTC

### Signal Flow
1. Scanner queries `ohlcv_data` table for 5-minute bars
2. Scanner reads `bar.time_of_day` from database
3. Scanner outputs `signal_time: bar.time_of_day` in JSON
4. Template receives signals via `SCANNER_SIGNALS` array
5. Template uses `signal_time` to find entry bar: `bars.findIndex(b => b.timeOfDay >= signal_time)`

### Why time_of_day Was NULL

The `time_of_day` field was added to the schema but not populated for historical data. Recent data ingestion likely didn't include time calculation, or the field was added after data was loaded.

The fix calculates time_of_day from the existing timestamp field using SQLite's `strftime` function.

## Files Modified

1. **Backend fix script**: `backend/fix-time-of-day.sql` (new)
2. **Signal diversification**: `backend/src/services/learning-iteration.service.ts:1258`

## Testing Recommendations

1. **Re-run last iteration** of Discovery Test agent:
   ```bash
   # Agent ID: a70686a5-6981-4b4a-b121-f9a0bf87660a
   # Should see ~50-100 trades instead of 3
   ```

2. **Verify signal_time populated**:
   ```sql
   SELECT signal_date, signal_time, ticker, pattern_strength
   FROM agent_iterations
   WHERE id = 'LATEST_ITERATION_ID'
   LIMIT 10;
   ```

3. **Check execution rate**:
   - Should see 35-70% execution rate (50-100 trades out of 143 filtered signals)
   - Most common noTrade reasons should be timing-related, not "Signal too late"

## Git Commit Message

```
Fix signal_time null issue causing low trade execution

ROOT CAUSE: 94% of 5-minute bars had NULL time_of_day in database,
causing scanners to output signal_time: null. Templates rejected
these signals with "Signal too late in session" error.

FIXES:
1. Populated missing time_of_day values for all 2.5M records
   - Calculated from timestamp using strftime
   - Script: backend/fix-time-of-day.sql

2. Fixed signal field name bug in diversification logic
   - Changed signal.date → signal.signal_date
   - File: learning-iteration.service.ts:1258

IMPACT:
- Before: 3/500 signals executed (2%)
- After: 50-100/500 expected (35-70%)
- Resolves issue from 2025-11-13-discovery-mode-and-template-execution.md

Related: Discovery mode, template execution, learning iterations
```

## Branch

`investigate-signal-time-null`

Ready to merge after testing confirms improved execution rates.
