# Signal-Based Execution Implementation

**Date:** 2025-10-31
**Branch:** agent-backtest-improvements
**Status:** Implemented - Ready for Testing

## Summary

Implemented signal-based execution for agent learning iterations. The execution script now receives pre-detected signals from the scanner and enters trades at those specific times, instead of re-running pattern detection.

## Problem Fixed

**Before:**
- Scanner finds signals at specific times (e.g., "10:30:00")
- Execution script ignores scanner signals completely
- Execution script re-detects patterns using different logic
- Results don't reflect scanner's signal quality
- Agent can't learn because it's testing different signals

**After:**
- Scanner finds signals with timestamps
- Signals are injected into execution script as `SCANNER_SIGNALS` constant
- Execution script processes each signal at its exact time
- Results accurately reflect scanner signal quality
- Agent can now learn from real performance

## Changes Made

### 1. Agent Learning Service (`backend/src/services/agent-learning.service.ts`)

**Lines 280-370 - Modified `runBacktests()` method:**

- Groups signals by ticker (more efficient batching)
- Injects `SCANNER_SIGNALS` constant into each execution script:
```typescript
const SCANNER_SIGNALS = [
  {
    ticker: 'KLAC',
    date: '2025-10-13',
    time: '10:30:00',
    pattern_type: 'bounce',
    pattern_strength: 75,
    metrics: { vwap: 1018.45, price: 1019.20, ... }
  },
  // ... more signals
];
```

**Lines 196-225 - Enhanced execution prompts:**

- Added explicit instructions for signal-based execution
- Emphasized use of `SCANNER_SIGNALS` when available
- Specified exact exit rules (stop loss, take profit, market close)

### 2. Claude Service (`backend/src/services/claude.service.ts`)

**Lines 513-671 - Added Signal-Based Execution section to system prompt:**

Comprehensive instructions for Claude on how to generate signal-based execution scripts:

1. Check if `SCANNER_SIGNALS` exists
2. If yes, use signal-based execution:
   - Process each signal independently
   - Find bar at or after signal time
   - Enter on NEXT bar (realistic execution)
   - Use signal's pattern_type for direction (bounce = LONG, rejection = SHORT)
   - Apply exit rules until position closed
3. If no, fall back to autonomous pattern detection

**Example signal-based execution pattern:**
```typescript
const useSignalBasedExecution = typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS.length > 0;

if (useSignalBasedExecution) {
  for (const signal of SCANNER_SIGNALS) {
    const { ticker, date, time: signalTime, pattern_type } = signal;

    // Load bars
    const bars = db.prepare(query).all(ticker, timeframe, dateStart, dateEnd);

    // Find signal bar
    const signalBarIndex = bars.findIndex(b => b.timeOfDay >= signalTime);

    // Enter on next bar
    const entryBar = bars[signalBarIndex + 1];
    const side = pattern_type === 'bounce' ? 'LONG' : 'SHORT';

    // Monitor until exit
    for (let i = signalBarIndex + 2; i < bars.length; i++) {
      // Apply stop loss, take profit, market close exit logic
    }
  }
}
```

## Benefits

1. **Accurate Learning** - Agent measures actual scanner performance
2. **Faster Execution** - No redundant pattern detection
3. **Cleaner Architecture** - Scanner and execution are properly decoupled
4. **Better Debugging** - Can trace trades back to specific scanner signals
5. **Reproducible Results** - Same signals always produce same trades

## Testing Status

**Initial Testing:**
- ✅ Code changes completed
- ✅ Signal injection implemented
- ✅ Claude prompt enhanced with signal-based instructions
- ✅ Scanner output buffer overflow FIXED
- ⏳ End-to-end iteration test pending

**Scanner Output Buffer Overflow Issue - FIXED:**
The scanner was finding 206,589 patterns and trying to output ALL of them as JSON. This exceeded the Node.js stdout maxBuffer limit (100MB) and caused "maxBuffer length exceeded" errors.

**Fix Applied:**
Added critical "Output Size Limits" section to scanner system prompt (claude.service.ts:1169-1203) that:
1. Instructs Claude to ALWAYS limit scanner output to top 500-1000 patterns
2. Shows required pattern: sort by pattern_strength, slice(0, 500), then output
3. Updated both example scanners to demonstrate the limiting pattern
4. Added clear warning about buffer overflow consequences

## Next Steps

1. **Run complete iteration** - Verify both fixes work end-to-end
2. **Verify scanner output** - Confirm scanner now outputs limited patterns (500 max)
3. **Verify signal injection** - Confirm execution script receives SCANNER_SIGNALS
4. **Verify trade times** - Confirm trades occur at signal times (not elsewhere)
5. **Check trade count** - Ensure # trades = # filtered signals (one-to-one mapping)
6. **Validate metrics** - Confirm P&L reflects scanner signal quality

## Files Modified

### Signal-Based Execution
- `backend/src/services/agent-learning.service.ts` (lines 196-225, 280-370)
- `backend/src/services/claude.service.ts` (lines 513-671)

### Scanner Output Limiting
- `backend/src/services/claude.service.ts` (lines 1169-1203, 1078-1091, 1141-1154)

## Verification Checklist

Once scanner parsing is fixed:

- [ ] Execution script receives `SCANNER_SIGNALS` constant
- [ ] Script uses signal-based execution path (not autonomous detection)
- [ ] Trades occur at exact signal times (next bar after signal)
- [ ] Trade direction matches signal pattern_type
- [ ] Number of trades equals number of filtered signals
- [ ] Performance metrics accurately reflect scanner quality
- [ ] Agent learning improves based on real signal performance

## Known Issues

~~1. **Scanner result parsing** - Scanner outputs patterns but they're not being captured by `executeScan()`. This needs investigation independent of signal-based execution changes.~~

**UPDATE:** This was actually a buffer overflow issue, not a parsing issue. Scanner was outputting 206K+ patterns which exceeded the 100MB maxBuffer limit. Fixed by adding output limiting instructions to scanner prompt.

## Example Usage

**Scanner Output:**
```json
[
  {
    "ticker": "KLAC",
    "date": "2025-10-13",
    "time": "10:30:00",
    "pattern_type": "bounce",
    "pattern_strength": 75,
    "metrics": {
      "vwap": 1018.45,
      "price": 1019.20,
      "distance_to_vwap_percent": 0.07,
      "volume_ratio": 2.3
    }
  }
]
```

**Injected into Execution Script:**
```typescript
const SCANNER_SIGNALS = [/* scanner output */];

// Script checks for signals and processes them
if (typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS.length > 0) {
  console.log(`Using signal-based execution with ${SCANNER_SIGNALS.length} signals`);

  for (const signal of SCANNER_SIGNALS) {
    // Enter at signal.time + 1 bar
    // Exit based on rules
    // Record trade
  }
}
```

**Expected Trade Output:**
```json
{
  "date": "2025-10-13",
  "ticker": "KLAC",
  "side": "LONG",
  "entryTime": "10:35:00",  // Next bar after 10:30:00 signal
  "entryPrice": 1019.50,
  "exitTime": "11:15:00",
  "exitPrice": 1021.20,
  "pnl": 1.70,
  "pnlPercent": 0.17,
  "exitReason": "Take profit"
}
```

## Architecture Improvement

**Old Flow:**
```
Scanner finds patterns → Filter → Execute ignores signals → Autonomous detection → Results don't match scanner
```

**New Flow:**
```
Scanner finds patterns → Filter → Inject signals into script → Execute at signal times → Results match scanner
```

This enables true learning because the agent can now:
1. Generate signals (scanner)
2. Test those exact signals (execution)
3. Measure signal quality (metrics)
4. Refine signal generation (learning loop)
