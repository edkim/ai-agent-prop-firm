# Iteration 5 vs 6 Scanner Analysis

## Summary

**Iteration 5:** 0 signals found ❌
**Iteration 6:** 500 signals found ✅

## Root Cause: Ticker Selection Query

### Iteration 5 (0 signals)

```sql
SELECT DISTINCT o.ticker
FROM ohlcv_data o
WHERE o.timeframe = '5min'
  AND date(o.timestamp/1000, 'unixepoch') BETWEEN '2025-10-17' AND '2025-11-05'
  AND EXISTS (
    SELECT 1 FROM ohlcv_data o2
    WHERE o2.ticker = o.ticker
      AND o2.timeframe = '1d'
      AND o2.close BETWEEN 10 AND 100
      AND date(o2.timestamp/1000, 'unixepoch') = date(o.timestamp/1000, 'unixepoch')  ← PROBLEM!
  )
LIMIT 100
```

**Problem:** The condition `date(o2.timestamp) = date(o.timestamp)` requires that for EVERY 5-minute bar, there must be a matching daily bar on the EXACT SAME DATE. This is overly restrictive because:
- Daily bars might be stored with different timestamps
- The join condition is applied per 5-minute bar instead of per ticker
- If ANY 5-minute bar doesn't have a matching daily bar, the entire ticker is excluded

**Result:** Query returned 0 tickers → 0 signals

### Iteration 6 (500 signals)

```sql
SELECT DISTINCT o.ticker
FROM ohlcv_data o
WHERE o.timeframe = '5min'
  AND date(o.timestamp/1000, 'unixepoch') BETWEEN '2025-10-17' AND '2025-11-05'
  AND EXISTS (
    SELECT 1 FROM daily_metrics d
    WHERE d.ticker = o.ticker
      AND d.close BETWEEN 10 AND 100
      AND d.date BETWEEN '2025-10-17' AND '2025-11-05'  ← FIXED!
  )
ORDER BY o.ticker
```

**Fixed:**
1. Changed from `ohlcv_data` with `timeframe='1d'` to `daily_metrics` table
2. Changed date condition from exact match to range: `d.date BETWEEN ? AND ?`
3. This checks if the ticker has ANY daily price data in the $10-$100 range during the period
4. Removed the restrictive `LIMIT 100`

**Result:** Query returned multiple tickers → 500 signals found

## Other Differences

### Pattern Strength Calculation

**Iteration 5:**
- Inline calculation with base score of 50
- Adds points for various conditions (deviation, volume, rejection)
- No minimum strength filter - accepts ALL patterns

**Iteration 6:**
- Separate `calculatePatternStrength()` function
- More sophisticated scoring algorithm
- **Added minimum filter:** `if (patternStrength < 50) continue;`
- Better structured and maintainable

### Rejection Detection

**Iteration 6 improvements:**
- Added zero-range check: `if (totalRange === 0) return {...}`
- Detects both "hammer" and "engulfing" patterns
- More precise reversal strength calculation
- Better handling of edge cases

## Conclusion

The **critical bug** in iteration 5 was the ticker selection query using:
```sql
date(o2.timestamp) = date(o.timestamp)
```

This created an impossible JOIN condition that excluded all tickers, resulting in 0 signals.

Iteration 6 fixed this by:
1. Using `daily_metrics` table instead of `ohlcv_data`
2. Using a date range check instead of exact date match
3. Properly scoping the EXISTS clause to check per-ticker rather than per-bar

## Lesson Learned

When Claude generates scanner scripts, the ticker selection query is critical. The system should:
1. Validate that ticker queries return results before running full scans
2. Test ticker selection logic independently
3. Watch for overly restrictive JOIN conditions
4. Prefer range checks over exact matches for date filtering
