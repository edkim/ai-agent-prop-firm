# Gap-Down VWAP Reclaim Strategy - Backtest Results
**Date:** 2025-11-17
**Test Period:** Sep 1 - Nov 15, 2025
**Universe:** 50 liquid stocks

---

## 📊 Performance Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Total Trades** | 145 | - | ✅ |
| **Win Rate** | 33.8% (49/145) | 60% | ❌ |
| **Profit Factor** | 0.75 | >1.5 | ❌ |
| **Avg Win** | +0.54% | - | - |
| **Avg Loss** | -0.37% | - | - |
| **Avg P&L** | -0.06% | - | ❌ |
| **Total P&L** | -8.65% | - | ❌ |

**⚠️ Strategy is currently UNPROFITABLE**

---

## 🔍 Exit Reason Analysis

| Exit Reason | Count | % of Trades | Avg P&L |
|-------------|-------|-------------|---------|
| VWAP breakdown | 82 | 56.6% | -0.07% |
| Market close (scaled) | 30 | 20.7% | -0.08% |
| Market close | 28 | 19.3% | +0.11% |
| VWAP breakdown (scaled) | 3 | 2.1% | -0.75% |
| Hard stop loss | 1 | 0.7% | -2.50% |
| Trailing stop (scaled) | 1 | 0.7% | +0.79% |

**Key Finding:** 56.6% of trades exit via VWAP breakdown - the thesis is failing most of the time.

---

## 🏆 Top 10 Winners

1. **AMT** (2025-10-28): +2.51% - Market close
2. **INTC** (2025-10-24): +2.09% - VWAP breakdown (!)
3. **AMAT** (2025-11-04): +1.49% - Market close (scaled)
4. **META** (2025-10-31): +1.31% - VWAP breakdown (!)
5. **NET** (2025-10-17): +1.24% - Market close (scaled)
6. **NET** (2025-10-14): +1.15% - Market close
7. **AA** (2025-10-21): +1.14% - VWAP breakdown (!)
8. **AMZN** (2025-10-14): +1.02% - Market close
9. **TSLA** (2025-10-24): +1.00% - VWAP breakdown (!)
10. **TSLA** (2025-10-30): +0.94% - VWAP breakdown (!)

**Observation:** Winners tend to hold until market close OR quickly reverse back down (VWAP breakdown with profit).

---

## 📉 Top 10 Losers

1. **AMAT** (2025-11-07): -2.50% - Hard stop loss
2. **INTC** (2025-10-14): -1.90% - VWAP breakdown
3. **CAT** (2025-11-07): -1.85% - VWAP breakdown
4. **AMAT** (2025-11-14): -1.26% - Market close (scaled)
5. **MU** (2025-10-14): -1.26% - VWAP breakdown (scaled)
6. **ORCL** (2025-10-14): -1.18% - VWAP breakdown
7. **AVGO** (2025-11-13): -1.13% - VWAP breakdown
8. **AMZN** (2025-11-07): -0.96% - VWAP breakdown
9. **NET** (2025-11-04): -0.90% - VWAP breakdown
10. **AMD** (2025-11-14): -0.89% - VWAP breakdown (scaled)

**Pattern:** Most losers break back below VWAP after entry, invalidating the reversal thesis.

---

## 🔧 Current Strategy Parameters

**Scanner:**
- MIN_GAP_PERCENT: 1.0%
- MIN_VOLUME_RATIO: 0.5x
- MIN_VWAP_CROSSES: 1

**Execution:**
- Primary target: 90% gap fill (70% position)
- Secondary target: 50% gap fill (30% position)
- VWAP stop buffer: 0.3% below VWAP
- Hard stop: -2.5%
- Trailing stop: Lock 50% of gains at +1.5%
- Time exit: 15:55 ET

---

## 💡 Hypothesis: Why Is This Failing?

### 1. **False VWAP Breakouts (56% of trades)**
   - Price crosses above VWAP briefly, then fails
   - Single VWAP cross may not be strong enough confirmation
   - Entry timing might be too aggressive

### 2. **Scanner Parameters Too Loose**
   - 1.0% minimum gap is very small
   - 0.5x volume ratio is below average volume
   - These may be catching weak, low-conviction setups

### 3. **Stop Loss Issues**
   - 0.3% below VWAP might be too tight
   - Small whipsaws trigger stops on otherwise valid setups
   - OR: Stops are correct and thesis is genuinely failing

---

## 🎯 Recommended Next Steps

### Option 1: Tighten Scanner Filters (Find Stronger Setups)
- Increase MIN_GAP_PERCENT: 1.0% → 2.0% (bigger gaps)
- Increase MIN_VOLUME_RATIO: 0.5x → 1.5x (higher volume = more conviction)
- Increase MIN_VWAP_CROSSES: 1 → 2 (multiple VWAP retests = stronger pattern)
- **Goal:** Fewer signals, but higher quality (target 50-70 signals vs current 145)

### Option 2: Adjust Execution Logic
- Widen VWAP stop buffer: 0.3% → 0.5% or 0.7% (allow more breathing room)
- Add confirmation: Wait for 2nd bar above VWAP before entry
- Add time filter: Only enter in first 2 hours after open (avoid late-day failures)

### Option 3: Walk-Forward Analysis (Before Optimizing)
- Split data: Sep-Oct for training, Nov for validation
- Check if strategy works in one period but not another
- If consistently fails across all periods → abandon strategy

### Option 4: Investigate Specific Dates
- **Oct 14, 2025** appears multiple times in losers (INTC, MU, ORCL)
- Check if this was a market-wide selloff day
- Consider adding market regime filter (VIX, SPY trend, etc.)

---

## 📝 Data Files

- Scanner signals: `backend/tmp/gap-down-signals.json` (145 signals)
- Backtest results: `backend/tmp/gap-fill-results.json` (145 trades)
- Backtest script: `backend/tmp/gap-fill-backtest.ts`

---

## 🚦 Decision Point

**Current strategy is LOSING money with:**
- 33% win rate (need 60%+)
- 0.75 profit factor (need 1.5+)
- -8.65% total return

**Recommendation:** Try Option 1 (tighten scanner filters) first. If that fails, consider abandoning this strategy pattern and testing a different edge.
