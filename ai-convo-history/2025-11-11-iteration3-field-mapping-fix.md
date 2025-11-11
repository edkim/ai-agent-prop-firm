# Iteration 3 Missing Trade Fields - Root Cause and Fix

**Date:** 2025-11-11
**Issue:** Iteration 3 of Gap and Go v2 agent showed incomplete trade data (missing entry/exit prices, times, P&L%, etc.)
**Status:** ✅ Fixed

## The Problem

Iteration 3's trade results were missing 8 critical fields in the database:
- `entry_time`
- `entry_price`
- `exit_time`
- `exit_price`
- `pnl_percent`
- `exit_reason`
- `highest_price`
- `lowest_price`

Only 4 fields were stored: `date`, `ticker`, `side`, `pnl`

## Root Cause: Naming Convention Mismatch

### What the Script Generated (snake_case)

The custom execution script correctly generated all fields using snake_case naming:

```json
{
  "date": "2025-10-31",
  "ticker": "ALKT",
  "side": "SHORT",
  "entry_time": "11:25",
  "entry_price": 20.17,
  "exit_time": "12:30",
  "exit_price": 20.08,
  "pnl": 0.21500000000000163,
  "pnl_percent": 1.065939514129904,
  "exit_reason": "trailing_stop",
  "highest_price": 20.37,
  "lowest_price": 19.77
}
```

**Source:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-11-11/84f6a55f-9216-4a13-a2f8-e81cd8c439ec-metadata.json` line 9 (stdout)

### What the Parser Expected (camelCase)

The parser in `script-execution.service.ts:370-385` was looking for camelCase field names:

```typescript
// BEFORE FIX - Only checked camelCase
trades: trades.map(t => ({
  entry_time: t.entryTime,      // undefined! (script returned t.entry_time)
  entry_price: t.entryPrice,    // undefined!
  exit_time: t.exitTime,        // undefined!
  exit_price: t.exitPrice,      // undefined!
  pnl_percent: t.pnlPercent,    // undefined!
  exit_reason: t.exitReason,    // undefined!
  // ... etc
})),
```

### Result

All property lookups returned `undefined`, which `JSON.stringify()` silently removed before storing to the database.

## The Fix

**File:** `backend/src/services/script-execution.service.ts`
**Lines:** 370-385
**Change:** Added fallback to check both naming conventions

```typescript
// AFTER FIX - Checks snake_case first, then camelCase
trades: trades.map(t => ({
  date: t.date,
  ticker: t.ticker,
  side: t.side,
  entry_time: t.entry_time || t.entryTime,
  entry_price: t.entry_price || t.entryPrice,
  exit_time: t.exit_time || t.exitTime,
  exit_price: t.exit_price || t.exitPrice,
  pnl: t.pnl,
  pnl_percent: t.pnl_percent || t.pnlPercent,
  exit_reason: t.exit_reason || t.exitReason,
  highest_price: t.highest_price || t.highestPrice,
  lowest_price: t.lowest_price || t.lowestPrice,
  noTrade: t.noTrade,
  noTradeReason: t.noTradeReason,
})),
```

## Why Iteration 2 Worked

Iteration 2 used template-based execution which happened to return camelCase fields, matching the parser's expectations by coincidence.

## Verification

**Evidence File:** `backend/generated-scripts/success/2025-11-11/84f6a55f-9216-4a13-a2f8-e81cd8c439ec-metadata.json`

The script's actual output (stdout) shows all fields were generated correctly:
- entry_time: "11:25"
- entry_price: 20.17
- exit_time: "12:30"
- exit_price: 20.08
- pnl_percent: 1.065939514129904
- exit_reason: "trailing_stop"
- highest_price: 20.37
- lowest_price: 19.77

**Database Query Results (BEFORE fix):**
```sql
SELECT backtest_results FROM agent_iterations WHERE id = '60e36b58-b00c-4a8a-8e4d-111b433feeeb'
```

Only showed: `{"date":"2025-10-31","ticker":"ALKT","side":"SHORT","pnl":0.215...}`

## Impact

✅ Future iterations will now correctly capture all trade fields regardless of naming convention
✅ Parser handles both snake_case (from custom execution) and camelCase (from template execution)
✅ No data loss when storing backtest results

## Related Issues

- **Iteration 1 Bug:** Field name issue with `signal.date`/`signal.time` vs `signal.signal_date`/`signal.signal_time` (documented in commit 31f5682)
- **This Fix:** Field name mapping issue in result parser

## Files Modified

- ✅ `backend/src/services/script-execution.service.ts` (lines 370-385)

## Next Steps

- Monitor future iterations to ensure all fields are captured correctly
- Consider standardizing on snake_case for all generated scripts
- Consider adding validation to warn when fields are undefined during parsing
