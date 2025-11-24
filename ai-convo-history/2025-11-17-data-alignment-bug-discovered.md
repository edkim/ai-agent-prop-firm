# CRITICAL: Data Alignment Bug Discovered in ORB Strategy

**Date:** 2025-11-17
**Status:** 🔴 BLOCKER - Strategy invalidated
**Impact:** Opening Range Breakout appeared +56.89% profitable but is actually -13.78% unprofitable

## Executive Summary

Colleague QA'd the Opening Range Breakout (ORB) backtest results and discovered entry prices didn't match actual bar data. Investigation revealed a critical execution bug where trades were filled at historical prices from hours earlier, creating unrealistic P&L. **The strategy is actually unprofitable.**

## The Bug

### What We Claimed

```
MU 2025-10-23:
- Entry: $199.58 at 11:45 ET
- Polygon 11:45 bar: $203.82-204.88
- Error: Entry price $4.24 below bar low!
```

### Root Cause

The execution script used the Opening Range high ($199.58 from 09:30) as the entry price, even though the signal fired at 11:40 and entry occurred at 11:45 when price was already $203.82.

```typescript
// BUGGY CODE (tmp/orb-execution.ts:100)
const entryPrice = or_high;  // Uses 09:30 price (199.58)

// Entry bar is actually 11:45
const entryBar = bars[signalBarIndex + 1];  // 203.82-204.88

// Impossible contradiction
highestPrice: entryBar.high,  // 204.88
lowestPrice: entryBar.low,    // 203.75
entry: or_high               // 199.58 ❌ Below the "lowest" price!
```

### Why This Happened

The ORB scanner has a volume filter requiring 20 bars of history and volume >= average. For MU 2025-10-23:

1. **09:30**: Opening range established (195.20-199.58)
2. **09:35**: Price breaks above OR high (202.21)
3. **09:35-11:35**: All bars fail volume filter (too low vs average)
4. **11:40**: First bar with volume >= average (1.08x) ← Signal fires
5. **11:45**: Entry executes at market

By the time we can enter, price has moved $4.24 above the OR high. Using the OR high as entry price is equivalent to time-traveling 2 hours back.

## Investigation Process

### 1. Colleague's Initial Report

> "MU 2025-10-23 (reported entry 199.58 at 11:45): Polygon 5m bar at 11:45 ET is 193.41–194.71. The entry price is not within the bar."

Initially confusing because the Polygon range seemed wrong.

### 2. Validation Against Polygon API

Directly queried Polygon API and confirmed **our database is correct**:

```
MU 2025-10-23 11:45 ET:
- Polygon API: O=203.82 H=204.88 L=203.75 C=204.63 ✓
- Our database: O=203.82 H=204.88 L=203.75 C=204.63 ✓
- Backtest claimed entry: 199.58 ❌
```

Colleague's "193.41-194.71" was likely from wrong query/date. **Our data is valid.**

### 3. Found Execution Logic Bug

Traced through execution code and found it uses `or_high` as entry price instead of realistic fill price.

### 4. Fixed Execution

Created corrected version using `entryBar.open` as entry price (realistic market order fill).

## Results Comparison

| Metric | Original (Buggy) | Fixed (Realistic) | Difference |
|--------|------------------|-------------------|------------|
| **Total Trades** | 165 | 165 | - |
| **Winners** | 90 (54.5%) | 65 (39.4%) | -15.1% WR |
| **Losers** | 68 (41.2%) | 93 (56.4%) | +15.2% |
| **Avg Win** | +0.63% | +0.52% | -0.11% |
| **Avg Loss** | -0.56% | -0.51% | +0.05% |
| **Avg P&L** | **+0.34%** | **-0.08%** | **-0.42%** |
| **Total P&L** | **+56.89%** | **-13.78%** | **-70.67%** |
| **Profit Factor** | **3.27** | **0.71** | **-2.56** |
| **Status** | ✅ Appeared profitable | ❌ Actually unprofitable | 🔴 **FATAL** |

### Exit Reason Breakdown (Fixed)

| Exit Reason | Count | Avg P&L |
|------------|-------|---------|
| Market close | 81 (49%) | +0.04% |
| Stop loss | 43 (26%) | -0.68% |
| Target | 25 (15%) | +0.50% |
| Stop loss (entry bar) | 16 (10%) | -0.02% |

## Sample Trade: MU 2025-10-23

### Original (Buggy)
```
Entry: $199.58 at 11:45 (OR high from 09:30)
Exit: $208.34 at 15:55
Lowest: $203.75 ← Impossible! Higher than entry!
P&L: +4.39%
```

### Fixed (Realistic)
```
Entry: $203.82 at 11:45 (actual bar open)
Exit: $206.67 at 15:55
Lowest: $203.75 ✓ Makes sense now
P&L: +1.40%
```

**Entry price difference: $4.24 per share**

## Technical Details

### Scanner Logic

The scanner correctly identifies breakouts with volume confirmation:

```typescript
// Find first bar where:
1. bar.high > orHigh (price breaks OR)
2. volumeRatio >= 1.0 (volume >= 20-bar average)
```

For MU 2025-10-23:
- Bars 0-19: No volume average (insufficient history)
- Bars 20-39: Volume too low (0.34-0.58x average)
- Bar 40 (11:40): First qualifying bar (1.08x average) ✓

### Execution Logic Flaw

```typescript
// Signal fires at bar 40 (11:40)
const signalBarIndex = 40;

// Enter on next bar
const entryBar = bars[signalBarIndex + 1];  // Bar 41 (11:45)

// BUG: Use historical OR high
const entryPrice = or_high;  // 199.58 from bar 0 (09:30)

// SHOULD: Use realistic fill price
const entryPrice = entryBar.open;  // 203.82 actual market price
```

## Fix Applied

Created `tmp/orb-execution-fixed.ts` with correct entry logic:

```typescript
// Entry on next bar at market (open price) - REALISTIC FILL
const entryBar = bars[signalBarIndex + 1];
const entryPrice = entryBar.open;  // FIX: Use actual market price
const orRange = or_high - or_low;

// Stop and target still use OR levels
const stopLoss = or_low;
const target = entryPrice + (orRange * 2);  // Measured from ACTUAL entry
```

## Implications

1. **Strategy is unprofitable** with realistic execution
2. **Cannot paper trade** this strategy as-is
3. **Original documentation invalidated** (ai-convo-history/2025-11-17-opening-range-breakout-success.md)
4. **PR #5 needs update** with corrected results
5. **All gap strategies also unprofitable** (gap-down reclaim, gap-up fade, gap-and-go)

## Lessons Learned

### What Went Right

1. ✅ **Database is accurate** - Matches Polygon API exactly
2. ✅ **Scanner logic correct** - Properly finds volume-confirmed breakouts
3. ✅ **RTH filtering correct** - No extended hours pollution
4. ✅ **Colleague QA caught it** - Data validation is critical

### What Went Wrong

1. ❌ **Unrealistic fill assumption** - Can't fill at historical prices
2. ❌ **Insufficient validation** - Should have checked entry prices vs bar ranges
3. ❌ **Over-optimistic results** - $70 P&L swing from one bug

### Best Practices Going Forward

1. **Always validate fills are within bar range:**
   ```python
   assert entry_price >= bar.low and entry_price <= bar.high
   ```

2. **Use realistic execution:**
   - Market orders: Use bar open
   - Limit orders: Check if price traded through limit
   - Stop orders: Use realistic slippage

3. **Sample trade validation:**
   - Manually verify 5-10 trades against source data
   - Check entry/exit prices are within bar ranges
   - Verify timestamps align

4. **Document execution assumptions:**
   - How are fills simulated?
   - What slippage is assumed?
   - Are fills realistic at scale?

## Next Steps

1. ✅ Fix execution bug (completed)
2. ✅ Rerun backtest with realistic fills (completed)
3. ✅ Document findings (this file)
4. ⏭️ Update PR #5 with corrected results
5. ⏭️ Archive original results as "buggy-unrealistic"
6. ⏭️ Research alternative strategies (ORB is not viable)

## Files

### Buggy Version
- `tmp/orb-execution.ts` - Uses `or_high` as entry (unrealistic)
- `tmp/orb-results.json` - Shows +56.89% P&L (fabricated)
- `tmp/analyze-orb.py` - Analysis of buggy results

### Fixed Version
- `tmp/orb-execution-fixed.ts` - Uses `entryBar.open` as entry (realistic)
- `tmp/orb-results-fixed.json` - Shows -13.78% P&L (accurate)
- `tmp/analyze-orb-fixed.py` - Analysis of corrected results

### Investigation
- `tmp/validate-mu-polygon.ts` - Validates DB against Polygon API
- `tmp/check-mu-volume.ts` - Traces volume filter logic

## Conclusion

The colleague's skepticism was well-founded. What appeared to be a highly profitable strategy (+56.89% P&L, 3.27 PF) was actually an unprofitable strategy (-13.78% P&L, 0.71 PF) with a critical execution bug.

**The ORB strategy should not be paper traded.** The execution flaw created $4+ per share of fabricated edge by filling at impossible prices.

This highlights the critical importance of:
1. External validation of backtest results
2. Checking entry/exit prices are within bar ranges
3. Using realistic fill assumptions
4. Sample trade validation against source data

**Status: Investigation complete. Strategy invalidated. Ready to explore alternative approaches.**
