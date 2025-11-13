# Alpha Scalper - Iteration 7 Analysis

## Executive Summary
Iteration 7 shows a dramatic decline in performance and signal count compared to previous iterations. From 500 signals in iterations 1-6 to only **28 signals** in iteration 7, with performance dropping from +$2,238 (53% win rate) in iteration 5 to **-$1,240 (33% win rate)** in iteration 7.

## Key Issues Identified

### 1. Signal Drop: 500+ → 28 signals

**Root Cause: Scanner became too restrictive**

Comparing iteration 6 vs 7 scan scripts:

**Iteration 6 (500 signals):**
- Pattern strength threshold: **60-65** (more permissive)
- Volume surge requirement: **1.5x average** for most patterns
- Momentum threshold: **0.5% move** in 5 bars
- Multiple pattern types: momentum burst, breakout, reversal

**Iteration 7 (28 signals):**
- Pattern strength threshold: **100** (perfect score required)
- Volume surge requirement: **2.0x average** (much stricter)
- Tight consolidation required: **< 2% range** for breakouts
- Opening range breakout time window: only 14:00-15:00 UTC
- VWAP touch distance: **< 0.2%** (extremely precise)

**Impact:** The scanner became so selective that it filtered out 95% of viable signals. Only "perfect" setups qualified, which is unrealistic for real-world trading.

---

### 2. Partial Exits Not Supported by Frontend

**Issue:** The execution script implements sophisticated partial exit strategy:
- Takes **50% profit at 1.5:1** risk/reward (target1)
- Lets remaining **50% run to 2.5:1** with trailing stop (target2)
- Activates trailing stop after target1 hit

**Code Evidence:**
```typescript
if (target1Hit) {
  // Exit 50% at target1
  const sharesToExit = Math.floor(position.sharesRemaining * 0.5);
  const partialPnL = tradeDirection === 'LONG'
    ? (target1 - position.entry) * sharesToExit
    : (position.entry - target1) * sharesToExit;
  totalPnL += partialPnL;
  position.sharesRemaining -= sharesToExit;
  position.target1Hit = true;
```

**Problem:** Frontend only displays:
- Single entry price
- Single exit price
- Single PnL
- Single exit reason

The frontend cannot show:
- Multiple exit prices (target1 = 50%, target2 = 50%)
- Aggregated PnL from partial exits
- Progressive exit reasons

**Recommendation:** Either:
1. Simplify execution script to single exit only, OR
2. Enhance frontend to support partial exit display with breakdown

---

### 3. MCHP Double Entry Bug (LONG + SHORT at same time)

**Scanner Signals:**
```javascript
{
  ticker: "MCHP",
  signal_date: "2025-11-06",
  signal_time: "15:15:00",  // ← Signal at 3:15 PM
  direction: "LONG",
  entry_price: 60.145
},
{
  ticker: "MCHP",
  signal_date: "2025-11-06",
  signal_time: "15:25:00",  // ← Signal at 3:25 PM (10 min later)
  direction: "SHORT",
  entry_price: 59.9
}
```

**Actual Execution Results:**
```javascript
{
  ticker: "MCHP",
  entry_time: "07:50:00",  // ← BOTH entered at 7:50 AM?!
  direction: "LONG",
  entry_price: 60.76
},
{
  ticker: "MCHP",
  entry_time: "07:50:00",  // ← Same time!
  direction: "SHORT",
  entry_price: 60.76       // ← Same price!
}
```

**Root Cause:** Execution script bug in finding the correct signal bar:

```typescript
const signalBarIndex = bars.findIndex(b => b.timeOfDay >= signal_time);
const entryBarIndex = signalBarIndex + 1;
const entryBar = bars[entryBarIndex];
```

**Problem:**
1. Scanner signals at 15:15 and 15:25 (afternoon)
2. Execution script searches for first bar >= signal_time
3. If bar data starts at 07:50, it matches the FIRST bar (morning) instead of the correct afternoon bar
4. Both signals end up matching the same 07:50 bar

**Why Both LONG and SHORT?**
- Both positions entered simultaneously because they both found the same (wrong) entry bar
- This creates a hedged position that makes no sense - buying and shorting the same stock at the same time
- The scanner correctly identified different directions 10 minutes apart (price moved from $60.145 to $59.9)
- But execution collapsed them to the same moment

**Fix Required:**
```typescript
// Need to find bars that match the DATE + TIME
const signalBarIndex = bars.findIndex(b =>
  b.date === signal_date && b.timeOfDay >= signal_time
);
```

Or ensure bars are filtered to only the signal_date before searching for the signal_time.

---

## Performance Impact

| Metric | Iteration 5 | Iteration 6 | Iteration 7 |
|--------|-------------|-------------|-------------|
| Signals | 500 | 500 | **28** ↓ |
| Win Rate | 52.8% | 0% | 33.3% |
| Total PnL | +$2,238 | $0 | **-$1,240** ↓ |
| Sharpe Ratio | 1.12 | 0 | **-3.69** ↓ |

**Iteration 7 Results Breakdown:**
- 6 trades total (from only 3 unique tickers)
- 2 wins, 4 losses (33% win rate)
- Profit factor: 0.61 (losing $0.39 for every $1 risked)
- Average hold time: ~98 minutes

**Exit Reasons:**
- STOP_LOSS: 3 trades (-$2,217 total)
- EOD exits: 2 trades (+$780)
- MAX_HOLD_TIME: 1 trade (+$978)

---

## Recommendations

### Immediate Fixes

1. **Revert scanner to iteration 5/6 thresholds:**
   - Pattern strength: 60-65 (not 100)
   - Volume surge: 1.5x (not 2.0x)
   - Remove overly restrictive consolidation/VWAP constraints

2. **Fix execution script date/time matching:**
   - Filter bars by signal_date BEFORE searching for signal_time
   - Add validation that entry_time > signal_time (prevent lookahead)

3. **Simplify partial exits for now:**
   - Remove 50/50 split logic until frontend supports it
   - Use single exit at 2.0:1 risk/reward or trailing stop

### Strategic Improvements

4. **Add signal deduplication:**
   - Don't allow same ticker + same direction within 30 minutes
   - Prevents the MCHP dual-entry scenario

5. **Backtest execution script in isolation:**
   - Test with known good signals from iteration 5
   - Verify entry times match signal times correctly
   - Validate no duplicate entries occur

6. **Scanner validation:**
   - Log sample of signals with pattern_strength distribution
   - Ensure reasonable spread (60-100), not all 100
   - Verify signals distributed across time (not all morning/EOD)

---

## Conclusion

Iteration 7's poor performance is primarily due to:
1. **Over-optimization of scanner** → Too few signals
2. **Execution script bug** → Wrong entry times, duplicate entries
3. **Partial exit complexity** → Not visible to user

The good news: These are fixable issues, not fundamental strategy flaws. Iteration 5 showed the strategy CAN work (53% win rate, +$2,238). We need to return to those proven parameters and fix the execution bugs.
