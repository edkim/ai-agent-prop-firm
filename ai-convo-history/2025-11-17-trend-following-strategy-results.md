# Gap Trading Strategy Testing - Trend Following Results
**Date:** November 17, 2025
**Test Period:** October 14 - November 12, 2025 (23 trading days)
**Tickers Tested:** 50-ticker sample universe (AAPL, GOOGL, MSFT, NVDA, etc.)

## Executive Summary

Completed testing of three gap trading strategies using clean RTH-only data:
1. **Gap-Down VWAP Reclaim (LONG Mean Reversion)**
2. **Gap-Up Fade (SHORT Mean Reversion)**
3. **Gap-And-Go (LONG Trend Following)** ← Today's work

**Result:** All three strategies are **UNPROFITABLE** with negative expectancy.

---

## Strategy 3: Gap-And-Go (LONG Trend Following)

### Hypothesis
**Buy strength, not weakness.** When stock gaps up at open and price HOLDS above VWAP, it signals strong momentum that should continue. Enter LONG and ride the trend.

### Scanner Logic
File: `backend/tmp/gap-and-go-scanner.ts`

```typescript
// Entry Criteria:
1. Gap UP at open (min 1.0%)
2. Price must HOLD above VWAP for 3+ consecutive bars
3. Volume above 0.5x average
4. Signal time before 16:00 (no late entries)

// Pattern Detection:
let consecutiveBarsAboveVWAP = 0;
for (let i = 0; i < dayBars.length; i++) {
  const vwap = calculateVWAP(dayBars, i);
  const isAboveVWAP = dayBars[i].close > vwap;

  if (isAboveVWAP) {
    consecutiveBarsAboveVWAP++;
    if (consecutiveBarsAboveVWAP >= MIN_BARS_ABOVE_VWAP) {
      // ENTRY SIGNAL
    }
  } else {
    consecutiveBarsAboveVWAP = 0; // Reset
  }
}
```

### Execution Logic
File: `backend/tmp/gap-and-go-backtest.ts`

```typescript
// Entry: Next bar open after signal
// Position Size: $10,000 / entry_price

// Exit Rules (in priority order):
1. VWAP breakdown (price < VWAP - 0.3%) → STOP LOSS
2. Trailing stop (activate at +1% profit, lock 50% of gains)
3. Market close (15:55 ET)
```

### Results

**Signals Found:** 22 signals
**Trades Executed:** 21 (1 signal too late)

```
Total Trades: 21
Win Rate: 28.6% (6 winners, 15 losers)

Avg Win: +0.34%
Avg Loss: -0.39%
Avg P&L: -0.18%
Total P&L: -3.80%
Profit Factor: 0.35
```

**Exit Breakdown:**
- VWAP breakdown: 14 trades (66.7%), avg -0.36%
- Market close: 6 trades (28.6%), avg +0.06%
- Trailing stop: 1 trade (4.8%), avg +0.91%

**Top Winners:**
1. MDB 2025-11-03: +0.91% (Trailing stop - 7.01% gap)
2. TXN 2025-11-10: +0.55% (Market close)
3. CAT 2025-11-11: +0.24% (Market close)

**Top Losers:**
1. ORCL 2025-10-27: -0.63% (VWAP breakdown)
2. BMY 2025-11-07: -0.54% (VWAP breakdown)
3. NVDA 2025-11-12: -0.52% (VWAP breakdown)

### Analysis

**Why It Failed:**
- **VWAP whipsaw:** Price crosses above VWAP (entry signal), then immediately reverses back below (stop loss)
- **67% stop-out rate:** Most trades exited via VWAP breakdown within 5-10 bars
- **Insufficient follow-through:** Even with 3+ bars confirmation, momentum doesn't sustain

**Best Trade (MDB):**
- Only trade that hit trailing stop
- Large 7.01% gap created strong momentum
- Suggests strategy might work with LARGER gap filter (>3%?)

---

## Comprehensive Strategy Comparison

```
================================================================================
Strategy                          | Trades | WR%   | Expectancy | Profit Factor
================================================================================
Gap-Down VWAP Reclaim (LONG MR)  |    3   | 33.3% |  -0.31%    |    0.01
Gap-Up Fade (SHORT MR)           |   15   | 20.0% |  -0.33%    |    0.11
Gap-And-Go (LONG TF)             |   21   | 28.6% |  -0.18%    |    0.35
================================================================================

🔴 ALL THREE STRATEGIES ARE UNPROFITABLE
```

### Common Failure Pattern

**VWAP Whipsaw:**
1. Price makes first cross through VWAP (entry signal)
2. Trade entered on next bar
3. Price immediately reverses back through VWAP (stop triggered)
4. First cross is a **fakeout** 67-80% of the time

**Key Insight:** VWAP alone is not a strong enough signal for entries. First cross is often noise, not a regime change.

---

## Possible Reasons for Failure

### Market Conditions
- **Oct-Nov 2025 period** may be inherently choppy/range-bound
- Gap trading might require trending market regimes
- Need to test on different time periods (2024, Q1 2025, etc.)

### Sample Size
- 50-ticker sample across 23 days = limited data
- Only 3-22 signals per strategy
- May need broader ticker universe (Russell 2000, all S&P 500)

### Signal Quality
- **VWAP alone insufficient** - need additional confirmation:
  - Volume surge (2x+ average)
  - Market regime filter (SPY/QQQ trend)
  - Time of day (avoid late-day chop)
  - Gap size (only trade large gaps >2-3%)
  - Relative strength (stock vs sector)

### Position Management
- Fixed stop at VWAP may be too tight
- Could try wider stops (ATR-based, swing lows)
- Or accept more heat to avoid whipsaws

---

## Lessons Learned

### Data Quality Success ✅
- Fixed critical extended hours data pollution issue
- Validated all signals against Polygon API
- Created repeatable RTH-only data pipeline
- Scanner accuracy: 100% (vs 2.1% before fix)

### Strategy Testing Success ✅
- Tested both mean reversion AND trend following
- Tested both LONG and SHORT bias
- Systematic approach: scan → backtest → analyze
- Fast iteration cycle (20 minutes per strategy)

### Technical Implementation ✅
- Clean scanner/execution separation
- Proper VWAP calculation (cumulative)
- Realistic execution (entry on next bar open)
- Comprehensive result analysis

---

## Next Steps - Decision Point

We've systematically tested:
- ✗ Mean reversion (gap down, buy the dip)
- ✗ Mean reversion (gap up, fade the move)
- ✗ Trend following (gap up, ride the strength)

**All strategies failed with similar expectancy around -0.30% per trade.**

### Options:

**A. Improve Existing Patterns**
- Add filters (volume surge >2x, gap size >2%, time restrictions)
- Test wider stops (ATR-based, swing lows instead of VWAP)
- Require multiple confirmations before entry

**B. Different Patterns**
- Opening range breakout (first 5/15/30 min range)
- VWAP pullback (wait for pullback TO VWAP, not cross)
- Pivot point reversals
- Volume spike + momentum

**C. Different Market Conditions**
- Test on 2024 data (different regime?)
- Test on Russell 2000 (more volatile)
- Test during earnings season only
- Filter by market trend (SPY/QQQ >50 SMA)

**D. Accept Reality**
- Gap trading may not be profitable in current market
- Intraday mean reversion is dead (algorithms too fast)
- Move to different timeframes (swing, daily)
- Move to different asset classes (futures, forex)

---

## Files Created

**Scanners:**
- `backend/tmp/gap-and-go-scanner.ts`

**Execution:**
- `backend/tmp/gap-and-go-backtest.ts`

**Results:**
- `backend/tmp/gap-and-go-signals.json` (22 signals)
- `backend/tmp/gap-and-go-results.json` (21 trades)

**Analysis:**
- `backend/tmp/analyze-gap-and-go.py`
- `backend/tmp/compare-all-strategies.py`

---

## Conclusion

The trend-following Gap-and-Go strategy performed slightly better than mean reversion (-0.18% vs -0.32% expectancy) but is still unprofitable. The core issue across all strategies is **VWAP whipsaw** - the first cross through VWAP is often a fakeout that triggers stops.

**Key Takeaway:** VWAP alone is insufficient as an entry/exit signal. Need additional filters or different pattern recognition approach entirely.

---

*Document created: November 17, 2025*
*Testing completed: 12:30 PM ET*
