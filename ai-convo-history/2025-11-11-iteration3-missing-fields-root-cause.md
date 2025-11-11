# Iteration 3 Missing Trade Fields - Root Cause Analysis

**Date:** 2025-11-11
**Severity:** High - Breaks Trade results display in UI
**Status:** Root cause identified, fix ready

## Problem Summary

Iteration 3's trade results are missing critical execution fields:
- No `entry_time`, `entry_price`
- No `exit_time`, `exit_price`
- No `exit_reason`, `highest_price`, `lowest_price`
- No `pnl_percent`

The Trade results table shows incomplete information - only ticker, date, side, and pnl.

## Root Cause

**Location:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/script-execution.service.ts:370-385`

The script execution service converts parsed trade objects with a **field name mismatch**:

### The Mapping Bug (Lines 374-382)

```typescript
trades: trades.map(t => ({
  date: t.date,
  ticker: t.ticker,
  side: t.side,
  entry_time: t.entryTime,      // BUG: Looking for camelCase 'entryTime'
  entry_price: t.entryPrice,    // BUG: Looking for 'entryPrice'
  exit_time: t.exitTime,         // BUG: Looking for 'exitTime'
  exit_price: t.exitPrice,       // BUG: Looking for 'exitPrice'
  pnl: t.pnl,
  pnl_percent: t.pnlPercent,    // BUG: Looking for 'pnlPercent'
  exit_reason: t.exitReason,     // BUG: Looking for 'exitReason'
  highest_price: t.highestPrice, // BUG: Looking for 'highestPrice'
  lowest_price: t.lowestPrice,   // BUG: Looking for 'lowestPrice'
  noTrade: t.noTrade,
  noTradeReason: t.noTradeReason,
})),
```

### What the Custom Execution Script Actually Returns

The script at `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-11-11/84f6a55f-9216-4a13-a2f8-e81cd8c439ec-custom-execution.ts` (lines 272-286) returns:

```typescript
return {
  date: signal.signal_date,
  ticker: signal.ticker,
  side,
  entry_time: entryBar.timeOfDay,        // <- snake_case
  entry_price: entryPrice,               // <- snake_case ✓
  exit_time: exitTime,                   // <- snake_case ✓
  exit_price: exitPrice,                 // <- snake_case ✓
  pnl: totalPnl,
  pnl_percent: totalPnlPercent,          // <- snake_case ✓
  exit_reason: exitReason,               // <- snake_case ✓
  highest_price: highestPrice,           // <- snake_case ✓
  lowest_price: lowestPrice,             // <- snake_case ✓
  partial_exits: partialExits.length > 0 ? partialExits : undefined
};
```

### Example: What Actually Gets Stored

**Iteration 3 Trade** (stored in database):
```json
{
    "date": "2025-10-31",
    "ticker": "ALKT",
    "side": "SHORT",
    "entry_time": undefined,
    "entry_price": undefined,
    "exit_time": undefined,
    "exit_price": undefined,
    "pnl": 0.21500000000000163,
    "pnl_percent": undefined,
    "exit_reason": undefined,
    "highest_price": undefined,
    "lowest_price": undefined
}
```

JSON.stringify() removes undefined values, resulting in:
```json
{
    "date": "2025-10-31",
    "ticker": "ALKT",
    "side": "SHORT",
    "pnl": 0.21500000000000163
}
```

## Evidence

### Iteration 3 Script Output (Raw)
The custom execution script returns the complete data:
```
$ npx ts-node 84f6a55f-9216-4a13-a2f8-e81cd8c439ec-custom-execution.ts
[
  {
    "date": "2025-10-31",
    "ticker": "ALKT",
    "side": "SHORT",
    "entry_time": "11:25",          <- PRESENT
    "entry_price": 20.17,           <- PRESENT
    "exit_time": "12:30",           <- PRESENT
    "exit_price": 20.08,            <- PRESENT
    "pnl": 0.21500000000000163,
    "pnl_percent": 1.065939514129904, <- PRESENT
    "exit_reason": "trailing_stop",    <- PRESENT
    "highest_price": 20.37,         <- PRESENT
    "lowest_price": 19.77,          <- PRESENT
    "partial_exits": [...]
  }
]
```

### Iteration 3 Database Storage (After Mapping Bug)
Only 4 fields survive the undefined filtering:
```json
{
    "date": "2025-10-31",
    "ticker": "ALKT",
    "side": "SHORT",
    "pnl": 0.21500000000000163
}
```

### Iteration 2 Template Execution (Works Correctly)
Iteration 2 uses template-based execution which returns **camelCase** fields:
```json
{
    "date": "2025-11-10",
    "ticker": "BE",
    "side": "SHORT",
    "entryTime": "10:35",        <- camelCase from template
    "entryPrice": 142.97,
    "exitTime": "10:40",
    "exitPrice": 144.42514285714284,
    "pnl": -100.40485714285637,
    "pnlPercent": -1.0177959412064392,
    "exitReason": "Stop loss (ATR)",
    "highestPrice": 147.29,
    "lowestPrice": 142
}
```

The mapping matches this camelCase format ✓

## Fix Required

Update the field mapping in `script-execution.service.ts:370-385` to handle **snake_case** fields from custom execution scripts:

```typescript
trades: trades.map(t => ({
  date: t.date,
  ticker: t.ticker,
  side: t.side,
  entry_time: t.entry_time || t.entryTime,      // Handle both formats
  entry_price: t.entry_price || t.entryPrice,
  exit_time: t.exit_time || t.exitTime,
  exit_price: t.exit_price || t.exitPrice,
  pnl: t.pnl,
  pnl_percent: t.pnl_percent || t.pnlPercent,   // Handle both formats
  exit_reason: t.exit_reason || t.exitReason,
  highest_price: t.highest_price || t.highestPrice,
  lowest_price: t.lowest_price || t.lowestPrice,
  noTrade: t.noTrade,
  noTradeReason: t.noTradeReason,
})),
```

## Impact

- **Iteration 3:** Trade results table will display complete trade information
- **Iteration 2:** Unchanged (still works correctly)
- **Future Iterations:** Will work correctly with custom execution scripts
- **UI:** Trade results table will show entry/exit prices, reasons, P&L percentages

## Files Involved

1. **Bug Source:** 
   - `/Users/edwardkim/Code/ai-backtest/backend/src/services/script-execution.service.ts:370-385`

2. **Scripts Affected:**
   - Iteration 3: `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-11-11/84f6a55f-9216-4a13-a2f8-e81cd8c439ec-custom-execution.ts`
   - Any custom execution scripts (which use snake_case)

3. **Database:**
   - `agent_iterations.backtest_results` for iteration 3

## Notes

- This explains why Iteration 2 (template-based) showed complete trade info
- Custom execution scripts intentionally use snake_case to match database schema
- Templates happen to use camelCase by coincidence
- The fix should handle both formats for backward compatibility
