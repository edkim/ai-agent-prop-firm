# Data Quality Investigation - Gap Calculation Issues
**Date:** 2025-11-17

---

## 🚨 Critical Issues Found

Your colleague's QA was **100% correct**. Our scanner signals had materially incorrect gap calculations.

### Validated Examples

| Ticker | Date | Our Gap | Polygon Gap | Status |
|--------|------|---------|-------------|--------|
| **AAPL** | 2025-10-31 | -3.0% ❌ | **+2.06% ↑** | Wrong direction! |
| **AMAT** | 2025-11-07 | -1.36% ❌ | **-0.54%** | Wrong magnitude |

---

## 🔍 Root Cause Analysis

### Problem 1: Extended Hours Data Pollution
Our database contains pre-market and post-market bars mixed with RTH:
- Pre-market starts at 08:00 UTC (4:00 AM ET)
- Post-market ends at 23:55 UTC (7:55 PM ET)
- **Scanner was using first/last bar of calendar day, not RTH open/close**

**Example (AAPL 2025-10-30):**
```
All bars: 192 total (including extended hours)
  First: 08:00 UTC - $271.05 (pre-market)
  Last:  23:55 UTC - $277.75 (post-market)

RTH bars: 79 only
  First: 13:30 UTC - $271.99 (9:30 AM EDT open) ✅
  Last:  20:00 UTC - $271.57 (4:00 PM EDT close) ✅
```

**Gap calculation was:**
- ❌ OLD: $278.12 (next day 08:00 pre-market) vs $277.75 (prev day 23:55 post-market) = +0.13%
- ✅ NEW: $276.99 (RTH open) vs $271.57 (RTH close) = **+2.00%**
- ✅ Polygon: $276.99 vs $271.40 = **+2.06%** (matches!)

### Problem 2: Timezone Confusion
- Database `time_of_day` field is in **UTC**, not ET
- RTH hours change with DST:
  - **EDT** (Mar 9 - Nov 2, 2025): 9:30-16:00 ET = **13:30-20:00 UTC**
  - **EST** (Nov 2 - Mar 9): 9:30-16:00 ET = **14:30-21:00 UTC**
- Scanner was using fixed UTC hours 14-21, which is wrong for EDT period

### Problem 3: No RTH Validation
- Database doesn't flag which bars are RTH vs extended hours
- No validation against external data source before backtesting

---

## ✅ Solution Implemented

### Fixed Scanner (`tmp/gap-down-scanner-fixed.ts`)

**Key Changes:**
1. **DST-aware RTH filtering:**
   ```typescript
   function isEDT(date: string): boolean {
     const d = new Date(date + 'T12:00:00Z');
     return d >= new Date('2025-03-09') && d < new Date('2025-11-02');
   }

   function getRTHBoundaries(date: string) {
     if (isEDT(date)) {
       return { startHour: 13, endHour: 20 }; // EDT
     } else {
       return { startHour: 14, endHour: 21 }; // EST
     }
   }
   ```

2. **RTH-only gap calculation:**
   ```typescript
   const prevClose = getRTHClose(ticker, prevDate); // Last RTH bar
   const openPrice = getRTHOpen(ticker, date);       // First RTH bar
   const gapPercent = ((openPrice - prevClose) / prevClose) * 100;
   ```

3. **Proper bar filtering:**
   - Only bars between 13:30-20:00 UTC (EDT) or 14:30-21:00 UTC (EST)
   - Excludes all pre-market and post-market data

---

## 📊 Validation Results

**RTH Filtering Test (AAPL):**
```
2025-10-30 (EDT): RTH = 13:30-20:00 UTC
  All bars: 192
  RTH bars: 79 ✅
  RTH Open:  $271.99 (13:30 UTC = 9:30 AM EDT)
  RTH Close: $271.57 (20:00 UTC = 4:00 PM EDT)

2025-10-31 (EDT): RTH = 13:30-20:00 UTC
  RTH bars: 79 ✅
  RTH Open:  $276.99 ← Polygon confirmed!
  Calculated Gap: +2.00% ← Close to Polygon +2.06%!
```

---

## 🎯 Next Steps

### 1. Re-run Scanner with Fixed Logic
- Use `tmp/gap-down-scanner-fixed.ts`
- Validate output against Polygon for sample signals
- Ensure all gaps are correctly calculated

### 2. Update Production Scanner
- Replace `src/templates/scanners/gap-down-vwap-reclaim.ts` with fixed version
- Add inline comments explaining RTH filtering
- Add validation warnings if gap direction seems wrong

### 3. Re-run Full Backtest
- Scanner will now find DIFFERENT signals (correct ones)
- Previous backtest results are **invalid** and should be discarded
- Expect fewer signals (only true gap-downs, not false pre-market gaps)

### 4. Add Data Quality Checks
- **Preflight validation:** Sample 5-10 random signals, validate against Polygon before backtest
- **Entry price validation:** Ensure entry price is within bar high/low
- **Gap direction sanity check:** Warn if >50% of signals are small gaps (<1%)

### 5. Consider Database Enhancement
```sql
ALTER TABLE ohlcv_data ADD COLUMN is_rth BOOLEAN DEFAULT 0;

UPDATE ohlcv_data
SET is_rth = 1
WHERE
  (strftime('%H', datetime(timestamp/1000, 'unixepoch')) BETWEEN '13' AND '20' AND date < '2025-11-02')
  OR
  (strftime('%H', datetime(timestamp/1000, 'unixepoch')) BETWEEN '14' AND '21' AND date >= '2025-11-02');

CREATE INDEX idx_ohlcv_rth ON ohlcv_data(ticker, timeframe, is_rth, timestamp);
```

---

## 📝 Files Created

- `tmp/validate-signal-data.ts` - Polygon validation script
- `tmp/gap-down-scanner-fixed.ts` - Fixed scanner with RTH filtering
- `tmp/test-rth-filter.ts` - RTH filtering test/validation
- `ai-convo-history/2025-11-17-data-quality-investigation.md` - This document

---

## ⚠️ Impact Assessment

**All previous results are INVALID:**
- ❌ 145 signals from original scan
- ❌ 33% win rate backtest
- ❌ -8.65% total P&L
- ❌ Parameter optimization attempts

**Must redo from scratch:**
1. ✅ Fix scanner RTH filtering
2. ⏳ Re-run scanner with correct gaps
3. ⏳ Validate sample against Polygon
4. ⏳ Re-run backtest
5. ⏳ Analyze new results
6. ⏳ Then (and only then) consider parameter optimization

---

## 💡 Lessons Learned

1. **Always validate against ground truth** - Polygon, Bloomberg, etc.
2. **Extended hours data is dangerous** - Must explicitly filter for RTH
3. **Timezone handling is critical** - DST changes affect intraday strategies
4. **QA early and often** - Caught this before live trading (could have been $$$)
5. **Add automated validation** - Don't rely on manual spot-checks

---

## 🚦 Ready to Proceed?

The fix is ready. Shall I:
1. Run the fixed scanner on the full 50-ticker universe?
2. Validate a sample of signals against Polygon?
3. Re-run the backtest with correct data?
