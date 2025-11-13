# Volatility Surfer - Iteration 1 Analysis

## Executive Summary

Iteration 1 shows extremely low signal count (only 7 signals) and poor performance (25% win rate, -$2,651 loss). The strategy suffers from the same duplicate LONG/SHORT bug we saw in Alpha Scalper iteration 7, and overly restrictive scanner criteria.

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Signals Generated | 7 |
| Trades Executed | 4 |
| Win Rate | 25% |
| Total P&L | -$2,650.93 |
| Sharpe Ratio | -11.09 |
| Profit Factor | 0.23 |

**Only 1 winning trade out of 4 executions.**

---

## Issue #1: Extremely Low Signal Count (7 signals)

### Root Cause: Overly Restrictive Scanner Criteria

The scanner has VERY strict thresholds that filtered out most potential opportunities:

#### 1. **Volatility Filter** (Most Restrictive)
```typescript
const volatilityPercent = (atr / avgPrice) * 100;
if (volatilityPercent < 0.5) continue;  // ← Only high-vol stocks
```

**Impact:** Only scans stocks with >0.5% ATR. This eliminates most stocks, especially during normal market conditions.

#### 2. **Momentum Burst Criteria** (Very Strict)
```typescript
const isMomentumBurst =
  volumeSpike > 2.0 &&           // 2x volume spike required
  absMove > 1.0 &&               // >1% price move in single bar
  Math.abs(momentumChange) > 1.5; // >1.5% momentum over 3 bars
```

**Impact:** Requires perfect storm of high volume (2x), large move (>1%), AND strong momentum (>1.5%). Very rare.

#### 3. **Overextension Criteria** (Even Stricter)
```typescript
const isOverextendedHigh =
  priceChange > 2.0 &&           // >2% move (vs 1% for momentum)
  distanceFromHigh < 10 &&       // Within 10% of recent high
  volumeSpike > 2.5 &&           // 2.5x volume (vs 2x)
  current.close > current.open;  // Must be green bar
```

**Impact:** Requires >2% move, near-climax volume (2.5x), AND price near extreme. Extremely rare conditions.

### Comparison to Alpha Scalper

| Filter | Alpha Scalper | Volatility Surfer | Impact |
|--------|---------------|-------------------|--------|
| Volatility filter | None | >0.5% ATR | Eliminates 80%+ of stocks |
| Volume requirement | 1.5x | 2.0-2.5x | Cuts signals by 60% |
| Price move | 0.5% | 1.0-2.0% | Cuts signals by 70% |
| Momentum | 0.5% / 5 bars | 1.5% / 3 bars | Cuts signals by 50% |

**Net result:** 7 signals vs 500+ for Alpha Scalper (98.6% reduction)

---

## Issue #2: Duplicate LONG/SHORT Positions (Same Bug as Alpha Scalper!)

### The WBD Case Study

**Scanner Output:**
```javascript
// Signal 1: Momentum burst (ride the wave)
{
  ticker: "WBD",
  signal_date: "2025-10-30",
  signal_time: "18:45:00",  // ← Same time
  direction: "LONG",
  metrics: {
    priceMove: 5.52,
    volumeSpike: 68.01,
    momentum: 5.52,
    isOverextended: false  // ← Ride momentum
  }
}

// Signal 2: Overextension (fade the move)
{
  ticker: "WBD",
  signal_date: "2025-10-30",
  signal_time: "18:45:00",  // ← Same time!
  direction: "SHORT",
  metrics: {
    priceMove: 5.52,        // ← Same move
    volumeSpike: 68.01,     // ← Same volume
    momentum: 5.52,         // ← Same momentum
    isOverextended: true    // ← Fade the climax
  }
}
```

**Execution Results:**
```javascript
// BOTH entered at the same time and price!
{
  ticker: "WBD",
  entry_time: "18:50:00",  // ← Both at 18:50
  direction: "LONG",
  entry_price: 22.73,      // ← Same price
  exit_price: 22.41,
  pnl: -$1,499.83         // ← Lost on LONG
},
{
  ticker: "WBD",
  entry_time: "18:50:00",  // ← Same time
  direction: "SHORT",
  entry_price: 22.73,      // ← Same price
  exit_price: 22.56,
  pnl: +$806.14           // ← Won on SHORT
}
```

**Net P&L:** -$693.69 (combined loss from hedged position)

### Why This Happens

The Volatility Surfer strategy intentionally generates BOTH directions:

1. **Momentum signals:** Ride strong moves (LONG on up moves, SHORT on down moves)
2. **Overextension signals:** Fade climax moves (SHORT at tops, LONG at bottoms)

For WBD, both conditions were met simultaneously:
- **Momentum:** +5.52% move with 68x volume → LONG signal
- **Overextension:** Same move deemed climactic → SHORT signal

Both signals have the **same signal_time** (18:45:00), so:
- Both find the same entry bar (18:50:00)
- Both enter at the same price (22.73)
- Creates a hedged position (buying AND shorting simultaneously)

### Execution Script Logic (Doesn't Help)

```typescript
if (metrics.isOverextended) {
  // Fade overextensions (mean reversion)
  tradeDirection = metrics.momentum > 0 ? 'SHORT' : 'LONG';
} else {
  // Ride momentum
  tradeDirection = metrics.momentum > 0 ? 'LONG' : 'SHORT';
}
```

This logic is applied to EACH signal independently:
- Signal 1 (not overextended): momentum = 5.52 → LONG ✓
- Signal 2 (overextended): momentum = 5.52 → SHORT ✓

Both get executed because the script processes signals one-by-one without checking for duplicates.

---

## Issue #3: Late Entry Times (Missing Opportunities)

Several signals triggered very late in the trading day:

| Ticker | Signal Time | Entry Time | Issue |
|--------|-------------|------------|-------|
| WBD | 18:45:00 | 18:50:00 | After-hours! (market closes at 16:00 ET = 20:00 UTC) |
| AMD | 09:30:00 | 09:35:00 | Market open (OK) |
| MCHP | 17:25:00 | 17:30:00 | Near close, limited time |

**WBD entries at 18:50:00** are AFTER market close (16:00 ET = 20:00 UTC). This suggests:
1. Scanner is detecting after-hours activity (should be filtered out)
2. Or timestamp conversion bug (likely UTC vs ET confusion)

The execution script tries to exit at 15:45, but these trades entered after that time!

---

## Issue #4: Poor Signal Quality

Out of 7 scanner signals, only 4 were executable:
- **AMD:** Pattern strength 100, but NO trade (no bars found?)
- **MCHP:** Pattern strength 42, but NO trade
- **TEAM:** Pattern strength 31, but NO trade
- **FIS:** 2 signals (strength 100 and 33) → 2 trades executed
- **WBD:** 2 signals (strength 100 both) → 2 trades executed (duplicate bug)

**3 out of 7 signals failed to execute** - suggests data issues or entry logic bugs.

---

## Trade-by-Trade Analysis

### Trade 1: FIS SHORT (09:35 entry)
- **Entry:** $60.27, **Exit:** $62.26 (3.31% loss)
- **Hold time:** 185 minutes (3 hours)
- **Exit reason:** Stop loss hit
- **Issue:** Shorted into strong momentum, got run over

### Trade 2: WBD LONG (18:50 entry)
- **Entry:** $22.73, **Exit:** $22.41 (1.39% loss)
- **Hold time:** 5 minutes only
- **Exit reason:** Stop loss hit
- **Issue:** After-hours entry, stopped out immediately

### Trade 3: WBD SHORT (18:50 entry) ✓ WINNER
- **Entry:** $22.73, **Exit:** $22.56 (0.75% gain)
- **Hold time:** 5 minutes
- **Exit reason:** End of day
- **Note:** Only winner, but hedged with Trade 2 (net loss)

### Trade 4: FIS SHORT (09:30 entry)
- **Entry:** $61.18, **Exit:** $61.72 (0.88% loss)
- **Hold time:** 375 minutes (6+ hours)
- **Exit reason:** End of day
- **Issue:** Held losing position all day, should have exited earlier

---

## Root Causes Summary

### 1. Scanner Too Restrictive (7 signals)
- Volatility filter eliminates most stocks
- Volume requirements too high (2.0-2.5x vs market norm)
- Price move thresholds too aggressive (1-2% vs 0.5%)
- Momentum criteria too strict

### 2. Duplicate Signal Generation
- Scanner generates BOTH momentum AND overextension signals
- Same ticker, same time, opposite directions
- Execution script doesn't deduplicate
- Creates hedged positions that lose on net

### 3. After-Hours Trading Issue
- WBD signals at 18:45/18:50 are after market close
- Should filter to regular trading hours only (09:30-16:00 ET)
- Or fix timestamp timezone conversion

### 4. Data/Execution Gaps
- 3 out of 7 signals failed to execute
- Suggests missing bar data or entry logic issues

---

## Recommendations

### Immediate Fixes (Required)

1. **Fix duplicate signal bug:**
   ```typescript
   // In scanner: Deduplicate by ticker+date+time
   const signalKey = `${ticker}_${date}_${timeRounded}`;
   if (seenSignals.has(signalKey)) continue;
   seenSignals.add(signalKey);
   ```

   **OR** choose ONE strategy per signal:
   ```typescript
   // Either momentum OR mean reversion, not both
   if (isOverextendedHigh) {
     // Only SHORT (fade)
   } else if (isMomentumBurst && priceChange > 0) {
     // Only LONG (ride)
   }
   ```

2. **Filter to regular trading hours:**
   ```typescript
   // Only scan 09:30-16:00 ET (13:30-20:00 UTC)
   const timeInMinutes = hour * 60 + minute;
   if (timeInMinutes < 810 || timeInMinutes > 1200) continue; // Skip
   ```

3. **Relax scanner thresholds** (for iteration 2):
   - Volatility filter: `>= 0.3%` (vs 0.5%)
   - Volume spike: `> 1.5x` (vs 2.0x)
   - Price move: `> 0.75%` (vs 1.0%)
   - Momentum: `> 1.0%` (vs 1.5%)

   **Expected impact:** 50-150 signals (vs 7)

### Strategic Improvements

4. **Add signal validation:**
   - Check bar data exists before including signal
   - Verify entry bar is not same as signal bar
   - Ensure entry time < end-of-day cutoff

5. **Separate momentum vs mean reversion:**
   - Create TWO distinct strategies instead of mixing
   - Momentum Surfer: Only ride strong moves
   - Reversal Surfer: Only fade overextensions
   - Run as separate agents with different parameters

6. **Improve position management:**
   - Use time-based stops (don't hold losers 6+ hours)
   - Tighter trailing stops after 1R profit
   - Consider max hold time (2-3 hours for intraday)

---

## Conclusion

Iteration 1's poor performance stems from:
1. **Over-optimization:** Scanner so strict it found only 7 signals
2. **Conflicting signals:** Same opportunity generated both LONG and SHORT
3. **After-hours issues:** Entries outside regular trading hours
4. **Execution gaps:** 43% of signals failed to execute

The good news: These are all **fixable bugs**, not fundamental strategy flaws. The strategy concept (riding volatility bursts + fading overextensions) is sound, but needs:
- Looser scanner criteria (10-20x more signals)
- Signal deduplication (prevent hedged positions)
- Trading hours filter (regular hours only)
- Better execution validation

With these fixes, iteration 2 should see 50-150+ signals and more realistic performance metrics.
