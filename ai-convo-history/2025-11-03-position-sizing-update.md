# Position Sizing Update - November 3, 2025

## Objective
Update all remaining execution templates to use $10,000 position sizing with proper quantity calculation.

## High-Level Steps

1. Read all four execution template files to understand their current implementation
2. Update each file to replace simple PnL calculations with position-sized calculations
3. Add quantity field to results object for each template
4. Verify all changes were applied correctly

## Files Updated

All files located in `/Users/edwardkim/Code/ai-backtest/backend/src/templates/execution/`:

1. **conservative.ts** - Conservative Scalping Template
2. **aggressive.ts** - Aggressive Swing Template
3. **time-based.ts** - Time-Based Intraday Template
4. **volatility-adaptive.ts** - Volatility-Adaptive (ATR-based) Template

## Changes Made

### Previous Implementation
```typescript
const pnl = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
results.push({
  ...
  pnl,
  pnlPercent: (pnl / position.entry) * 100,
  ...
});
```

### New Implementation
```typescript
// Position sizing: $10,000 trade size
const TRADE_SIZE = 10000;
const quantity = Math.floor(TRADE_SIZE / position.entry);
const pnlPerShare = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
const pnl = pnlPerShare * quantity;
const pnlPercent = (pnlPerShare / position.entry) * 100;

results.push({
  ...
  quantity,
  pnl,
  pnlPercent,
  ...
});
```

## Key Improvements

1. **Consistent Position Sizing**: All execution templates now use a standardized $10,000 trade size
2. **Realistic PnL**: PnL is calculated based on actual share quantity that can be purchased
3. **Quantity Tracking**: The `quantity` field is now included in all trade results
4. **Accurate Metrics**: PnL percentage remains based on per-share performance, while dollar PnL reflects actual position size

## Verification

All four templates were verified to contain the updated position sizing logic with the following components:
- TRADE_SIZE constant set to 10000
- quantity calculation using Math.floor
- pnlPerShare calculation for directional accuracy
- pnl calculation using quantity * pnlPerShare
- quantity field added to results object

## Status
✅ Complete - All execution templates updated with $10,000 position sizing
