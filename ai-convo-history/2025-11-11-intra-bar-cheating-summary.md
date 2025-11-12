# Quick Summary: Intra-Bar Entry/Exit "Cheating"

## The Core Issue

With only 5-minute OHLC bar data, the backtest system allows:
1. Entry at bar.open (e.g., 1.07)
2. Exit at bar.close or intra-bar target (e.g., 1.101)
3. **Both in the same 5-minute bar**

## Data Flow Timeline (Real Time)

```
10:25:00 ==================== BAR 1 ====================
         Signal generated at bar open

10:30:00 ==================== BAR 2 (ENTRY BAR) ====================
10:30:00 - Price opens at 1.07
10:30:XX - Price runs to high of 1.11 (UNKNOWN to backtest at open time)
10:30:XX - Price falls to low of 1.065 (UNKNOWN to backtest at open time)
10:35:00 - Price closes at 1.101 (or exits at calculated target)
         - Backtest detects entry (1.07) and exit (1.101) on same bar
```

## Where The Code Does This

### 1. Main Backtest Engine

**File:** `backend/src/services/backtest.service.ts`

```typescript
// Line 114-146: Single bar iteration
for (let i = 0; i < bars.length; i++) {
  state.currentBar = bars[i];
  
  // Line 431: Uses bar.low (intra-bar data)
  if (position.trailingStop && state.currentBar.low <= position.trailingStop) {
    shouldExit = true;  // ← Exits based on intra-bar low
  }
  
  // Line 437, 443: Uses bar.close for checks
  if (position.stopLoss && state.currentBar.close <= position.stopLoss) {
    shouldExit = true;
  }
  if (position.takeProfit && state.currentBar.close >= position.takeProfit) {
    shouldExit = true;
  }
  
  // Line 562: But always exits at bar.close
  const exitPrice = bar.close;  // ← Even if triggered by bar.low
}
```

### 2. Custom Execution Script

**File:** `backend/generated-scripts/success/2025-11-11/84f6a55f...custom-execution.ts`

```typescript
// Lines 145-236: Exit detection loop
for (let i = entryBarIndex + 1; i < bars.length; i++) {
  const bar = bars[i];
  
  // Line 153: Uses bar.high
  if (bar.high >= stopLoss) {
    exitPrice = stopLoss;
    break;
  }
  
  // Lines 161, 182: Uses bar.low
  if (bar.low <= target1) {
    exitPrice = target1;  // ← Uses target, not actual low
    break;
  }
}
```

## The Problem Visualized

```
Realistic Trading (with 1-minute data):
  10:30:00 - Entry at 1.070
  10:30:01 - Price goes to 1.075
  10:30:02 - Price goes to 1.080
  10:30:03 - Price goes to 1.100
  10:30:04 - Price goes to 1.101 ← Exit here
  ✓ FAIR: Used data in chronological order

Backtest Cheating (with 5-minute data):
  10:30:00 - Entry at 1.070
  [TIME PASSES - Unknown to algorithm at entry time]
  10:35:00 - Bar completes: O=1.07, H=1.11, L=1.065, C=1.101
  Backtest retroactively says:
    "Check entire bar - high went to 1.11, low to 1.065"
    "At entry time (1.07), we knew exits would happen"
  ✗ UNFAIR: Used future data from same bar
```

## Why This Matters

### Comparison: Same Trade, Different Data

```
Entry: 1.070
Bar High: 1.11
Bar Low: 1.065  
Bar Close: 1.101

Scenario A - Fair (1-min bars):
  Can't know about 1.11 high or 1.065 low until they happen
  Exit at next available price: ~1.101 (on next bar)
  BUT: Only if signal still valid then

Scenario B - Cheating (5-min bars):
  Knows about 1.11 high and 1.065 low immediately
  Exits at 1.101 on SAME bar where entered at 1.07
  Impact: +4.4% instantly (1.101/1.070)

Cumulative Impact Across Trades:
  If 20% of trades exit same bar vs. next bar:
  Extra 0.5-2% per trade = 1-4% total overstatement
```

## Which Code Paths Are Problematic

### HIGH RISK - Direct Intra-Bar Use:
- Trailing stop check using `bar.low` (Line 431)
- Custom script using `bar.low <= target` (Line 161)
- Custom script using `bar.high >= stopLoss` (Line 153)

### MODERATE RISK - Same-Bar Processing:
- Exit check on same bar as entry check (Line 137-141)
- Both happen in single iteration
- Both use same `currentBar` data

### LOW RISK - Reasonable:
- Entry at `bar.open` ✓
- Entry at `bar.close` ✓
- Exit at `bar.close` ✓
- (If not same bar and not using high/low data)

## What Iteration 3 Trade Likely Looked Like

```
Signals: ALKT, ACA, AEVA
Success: 1 trade, 100% win rate

Likely Trade:
  Entry:  10:30 at 1.070 (bar.open)
  Exit:   10:30 at 1.101 (bar.close OR calculated target)
  
  On Same 5-min Bar:
    High = 1.11
    Low = 1.065
    Close = 1.101
  
  System saw:
    ✓ Entry condition met at open
    ✓ Target of 1.101 reached by close (or intra-bar low touched trailing stop)
    ✓ Exit at favorable price
    ✓ +4.4% gain instantly

  In Reality:
    Entry would be at open 1.070
    Exit would be next bar (10:35) at open ~1.101
    But only if signal still validates
    More likely exit at higher price or different bar
```

## The Fix (Simple)

### Option 1: One-Bar Minimum Hold
```typescript
// Don't exit on same bar as entry
if (currentBarIndex === position.entryBarIndex) {
  continue;  // Skip exit checks
}
```

### Option 2: No Same-Bar Lookback
```typescript
// Use only close price, no high/low
if (position.stopLoss && bar.close <= position.stopLoss) {
  exitPrice = bar.close;  // ← Already does this
  // But remove the bar.low check
}
// Remove: if (position.trailingStop && state.currentBar.low <= ...)
```

### Option 3: Proper 5-min Bar Semantics
```typescript
// Earliest exit is next bar after entry
const minExitBarIndex = entryBarIndex + 1;
if (currentBarIndex < minExitBarIndex) {
  continue;  // Skip exit checks
}
```

## Bottom Line

YES, the system is "cheating" by:

1. Using intra-bar high/low data unknown at the moment of entry
2. Allowing same-bar entry/exit with only 5-minute bars
3. Optimistically filling stops and targets at exact prices

This inflates backtest results by an estimated **0.5-2% per trade**, or **1-4% total** across a trading day.

To see REALISTIC results, implement a one-bar minimum hold and use only close prices for exit logic.

---

**File:** `/Users/edwardkim/Code/ai-backtest/2025-11-11-intra-bar-entry-exit-investigation.md`

For detailed analysis with code references and line numbers, see the main investigation document.
