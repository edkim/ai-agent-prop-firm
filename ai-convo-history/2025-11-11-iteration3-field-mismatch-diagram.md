# Iteration 3 Field Mismatch - Visual Breakdown

## Data Flow and Where It Gets Lost

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Custom Execution Script Executes                            │
│ File: 84f6a55f-9216-4a13-a2f8-e81cd8c439ec-custom-execution.ts      │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
                        [Script Output]
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ COMPLETE DATA (All fields present in JSON):                         │
│                                                                     │
│ {                                                                   │
│   "date": "2025-10-31",                                            │
│   "ticker": "ALKT",                                                │
│   "side": "SHORT",                                                 │
│   "entry_time": "11:25",          ← snake_case ✓                  │
│   "entry_price": 20.17,           ← snake_case ✓                  │
│   "exit_time": "12:30",           ← snake_case ✓                  │
│   "exit_price": 20.08,            ← snake_case ✓                  │
│   "pnl": 0.215,                                                    │
│   "pnl_percent": 1.066,           ← snake_case ✓                  │
│   "exit_reason": "trailing_stop", ← snake_case ✓                  │
│   "highest_price": 20.37,         ← snake_case ✓                  │
│   "lowest_price": 19.77,          ← snake_case ✓                  │
│   "partial_exits": [...]                                           │
│ }                                                                   │
│                                                                     │
│ STATUS: ALL FIELDS PRESENT ✓                                       │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Script Execution Service Parses & Maps                      │
│ File: script-execution.service.ts, Lines 370-385 (BUGGY CODE)       │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
                    [Field Mapping]
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ MAPPING ATTEMPTS (Looking for camelCase, finding snake_case):       │
│                                                                     │
│  entry_time: t.entryTime           ← Looking for 'entryTime'      │
│              ↓ NOT FOUND (has 'entry_time' instead)               │
│              → undefined ✗                                         │
│                                                                     │
│  entry_price: t.entryPrice         ← Looking for 'entryPrice'     │
│               ↓ NOT FOUND (has 'entry_price' instead)             │
│               → undefined ✗                                        │
│                                                                     │
│  exit_time: t.exitTime             ← Looking for 'exitTime'       │
│             ↓ NOT FOUND (has 'exit_time' instead)                 │
│             → undefined ✗                                          │
│                                                                     │
│  exit_price: t.exitPrice           ← Looking for 'exitPrice'      │
│              ↓ NOT FOUND (has 'exit_price' instead)               │
│              → undefined ✗                                         │
│                                                                     │
│  pnl_percent: t.pnlPercent         ← Looking for 'pnlPercent'     │
│               ↓ NOT FOUND (has 'pnl_percent' instead)             │
│               → undefined ✗                                        │
│                                                                     │
│  exit_reason: t.exitReason         ← Looking for 'exitReason'     │
│               ↓ NOT FOUND (has 'exit_reason' instead)             │
│               → undefined ✗                                        │
│                                                                     │
│  highest_price: t.highestPrice     ← Looking for 'highestPrice'   │
│                 ↓ NOT FOUND (has 'highest_price' instead)         │
│                 → undefined ✗                                      │
│                                                                     │
│  lowest_price: t.lowestPrice       ← Looking for 'lowestPrice'    │
│                ↓ NOT FOUND (has 'lowest_price' instead)           │
│                → undefined ✗                                       │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ AFTER MAPPING (Undefined values assigned):                          │
│                                                                     │
│ {                                                                   │
│   "date": "2025-10-31",                                            │
│   "ticker": "ALKT",                                                │
│   "side": "SHORT",                                                 │
│   "entry_time": undefined,        ← LOST ✗                        │
│   "entry_price": undefined,       ← LOST ✗                        │
│   "exit_time": undefined,         ← LOST ✗                        │
│   "exit_price": undefined,        ← LOST ✗                        │
│   "pnl": 0.215,                                                    │
│   "pnl_percent": undefined,       ← LOST ✗                        │
│   "exit_reason": undefined,       ← LOST ✗                        │
│   "highest_price": undefined,     ← LOST ✗                        │
│   "lowest_price": undefined,      ← LOST ✗                        │
│   "partial_exits": undefined                                       │
│ }                                                                   │
│                                                                     │
│ STATUS: 8 FIELDS LOST ✗                                           │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: JSON.stringify() - Removes undefined values                 │
│ (Silent data loss - no error thrown!)                               │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FINAL STORED DATA (In database):                                    │
│                                                                     │
│ {                                                                   │
│   "date": "2025-10-31",                                            │
│   "ticker": "ALKT",                                                │
│   "side": "SHORT",                                                 │
│   "pnl": 0.21500000000000163                                       │
│ }                                                                   │
│                                                                     │
│ STATUS: ONLY 4 FIELDS REMAIN ✗                                     │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: Frontend Displays Trade Table                               │
│                                                                     │
│ Trade results showing:                                             │
│ - Date: 2025-10-31 ✓                                              │
│ - Ticker: ALKT ✓                                                  │
│ - Side: SHORT ✓                                                   │
│ - PnL: 0.215 ✓                                                    │
│ - Entry Price: [empty] ✗                                          │
│ - Exit Price: [empty] ✗                                           │
│ - Exit Reason: [empty] ✗                                          │
│ - Highest/Lowest: [empty] ✗                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Comparison: Why Iteration 2 Works

```
┌──────────────────────────────────────────────────────────────────────┐
│ Iteration 2: Template-based Execution                                │
│ (Uses camelCase fields - happens to match the mapping!)              │
└──────────────────────────────────────────────────────────────────────┘

[Template Returns camelCase]
    ↓
{
  "entryTime": "10:35",        ← camelCase
  "entryPrice": 142.97,        ← camelCase
  "exitTime": "10:40",         ← camelCase
  "exitPrice": 144.42514...,   ← camelCase
  "pnlPercent": -1.017...,     ← camelCase
  "exitReason": "Stop loss",   ← camelCase
  ...
}
    ↓
[Mapping Code]
    entry_time: t.entryTime    ← FINDS 'entryTime' ✓
    entry_price: t.entryPrice  ← FINDS 'entryPrice' ✓
    exit_time: t.exitTime      ← FINDS 'exitTime' ✓
    exit_price: t.exitPrice    ← FINDS 'exitPrice' ✓
    pnl_percent: t.pnlPercent  ← FINDS 'pnlPercent' ✓
    ...
    ↓
[All Fields Preserved]
    ↓
[Complete Trade Data Stored & Displayed] ✓
```

## The Fix

```
┌──────────────────────────────────────────────────────────────────────┐
│ UPDATED MAPPING CODE (Handles both formats):                         │
│                                                                      │
│ trades: trades.map(t => ({                                           │
│   date: t.date,                                                      │
│   ticker: t.ticker,                                                  │
│   side: t.side,                                                      │
│   entry_time: t.entry_time || t.entryTime,    ← Try snake_case first│
│   entry_price: t.entry_price || t.entryPrice, │ then camelCase      │
│   exit_time: t.exit_time || t.exitTime,       │ (backward compat)   │
│   exit_price: t.exit_price || t.exitPrice,    │                     │
│   pnl: t.pnl,                                  │                     │
│   pnl_percent: t.pnl_percent || t.pnlPercent, │                     │
│   exit_reason: t.exit_reason || t.exitReason, │                     │
│   highest_price: t.highest_price || t.highestPrice,                  │
│   lowest_price: t.lowest_price || t.lowestPrice,                     │
│   noTrade: t.noTrade,                                                │
│   noTradeReason: t.noTradeReason,                                    │
│ })),                                                                 │
└──────────────────────────────────────────────────────────────────────┘

[Now Works for BOTH:]
  ✓ Custom execution scripts (snake_case)
  ✓ Template-based execution (camelCase)
  ✓ All future iterations
  ✓ Backward compatible
```

## Key Takeaway

The issue is a **silent field mapping failure** caused by a **naming convention mismatch**:
- Custom execution scripts use **snake_case** (industry standard for databases/APIs)
- Template execution uses **camelCase** (JavaScript convention)
- The parser was hardcoded to expect only **camelCase**
- Result: undefined fields → removed by JSON.stringify() → lost data

The fix is simple: try both naming conventions using the `||` operator.
