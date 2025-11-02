# Scanner-Backtest Integration Analysis

**Date:** 2025-10-31
**Agent:** VWAP Mean Reversion Agent (3159d447-5cbc-41ec-828d-525c76db97b0)
**Status:** Critical Issue Identified

## User Question

> Is the scanner properly using intraday data? And does it save the signal timestamp for the backtest strategy to reference in its trade entry?

## TL;DR - Critical Issues Found

**Scanner:** ✅ Working correctly
- Uses intraday 5min data
- Detects signals with specific timestamps
- Outputs time field in each signal

**Backtest Execution:** ❌ **MAJOR DISCONNECT**
- **Does NOT use signals from scanner at all!**
- Re-runs pattern detection with its own logic
- Ignores the specific times when signals were detected
- Results don't reflect the scanner's signals

## Detailed Analysis

### Scanner Script - WORKING CORRECTLY ✅

**File:** `agent_iterations.scan_script` (Iteration #8)

**Intraday Data Usage:**
```typescript
// Line 51, 76: Explicitly queries 5-minute bars
WHERE timeframe = '5min'
```

**Signal Structure with Timestamp:**
```typescript
interface ScanMatch {
  ticker: string;
  date: string;
  time: string;  // ← Signal timestamp captured!
  pattern_type: 'bounce' | 'rejection';
  pattern_strength: number;
  metrics: {
    vwap: number;
    price: number;
    distance_to_vwap_percent: number;
    volume_ratio: number;
    // ...
  };
}
```

**Example Signal Output:**
```json
{
  "ticker": "KLAC",
  "date": "2025-10-13",
  "time": "10:30:00",  // ← Specific intraday time!
  "pattern_type": "bounce",
  "pattern_strength": 72,
  "metrics": {
    "vwap": 1018.45,
    "price": 1019.20,
    "volume_ratio": 2.3
  }
}
```

**VWAP Calculation:** Lines 96-111
- Correctly calculates cumulative VWAP for each 5-minute bar
- Accumulates throughout the trading day
- Uses `(high + low + close) / 3` typical price

**Pattern Detection:** Lines 115-218
- Scans each 5-minute bar starting from bar 15 (enough lookback)
- Detects VWAP bounces and rejections at specific times
- Records the exact `time_of_day` when pattern occurs

### Execution Script - CRITICAL DISCONNECT ❌

**File:** `agent_iterations.execution_script` (Iteration #8)

**Problem 1: Template Placeholders**
```typescript
// Lines 104-110
const ticker = 'TEMPLATE_TICKER';  // Placeholder, gets replaced
const tradingDays: string[] = [
  "2025-10-30", "2025-10-29", ...  // Hardcoded dates, gets replaced
];
```
*Note: These DO get replaced by agent-learning.service.ts (line 310), but this is inefficient.*

**Problem 2: Re-Detection Logic (Lines 196-219)**
```typescript
// The script DOESN'T use scanner signals!
// Instead, it re-runs its own pattern detection:

if (!position && !longSignalDetected && !shortSignalDetected) {
  const prevBar = bars[i - 1];
  const avgVolume = calculateAverageVolume(dayBars, volumeLookbackPeriod);
  const volumeSpike = prevBar.volume > avgVolume * volumeSpikeThreshold;

  // Long signal: Price touches VWAP from above, bullish rejection candle
  if (isTouchingVWAP(prevBar.low, vwap, vwapTouchTolerance) &&
      isRejectionCandle(prevBar, 'bullish') &&
      volumeSpike &&
      prevBar.close > vwap) {
    longSignalDetected = true;
  }

  // Short signal: Price touches VWAP from below, bearish rejection candle
  if (isTouchingVWAP(prevBar.high, vwap, vwapTouchTolerance) &&
      isRejectionCandle(prevBar, 'bearish') &&
      volumeSpike &&
      prevBar.close < vwap) {
    shortSignalDetected = true;
  }
}
```

**What's Wrong:**
1. Scanner finds signals at specific times (e.g., "10:30:00", "14:15:00")
2. Execution script **ignores those signals completely**
3. Execution script scans the entire day and detects its own signals
4. The two detection logics are **different** (different parameters, different logic)
5. Results don't reflect performance of the signals the scanner actually found

**Problem 3: No Signal Input**
The execution script has no mechanism to receive the scanner's signal list. It should accept:
```typescript
interface SignalInput {
  ticker: string;
  date: string;
  time: string;  // Entry time from scanner
  pattern_type: 'bounce' | 'rejection';
  // ... other signal metadata
}

const signals: SignalInput[] = [/* from scanner */];
```

### How The Current Flow Works (BROKEN)

```
┌─────────────────────┐
│  1. Scanner Runs    │
│  - Finds 50 signals │
│  - Each has time    │
│  - Outputs JSON     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Filter Signals  │
│  - Top 10 by quality│
│  - Diversified      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  3. Backtest Execution (BROKEN!)        │
│  - IGNORES signals from scanner         │
│  - Re-runs pattern detection            │
│  - Uses different logic/parameters      │
│  - Results don't match scanner signals  │
└─────────────────────────────────────────┘
```

### How It SHOULD Work (FIXED)

```
┌─────────────────────┐
│  1. Scanner Runs    │
│  - Finds 50 signals │
│  - Each has time    │
│  - Outputs JSON     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Filter Signals  │
│  - Top 10 by quality│
│  - Diversified      │
└──────────┬──────────┘
           │
           ▼    signals: [{ticker, date, time, ...}]
┌──────────────────────────────────────────────────┐
│  3. Backtest Execution (FIXED!)                  │
│  - Receives signal list as input                 │
│  - For each signal:                              │
│    • Load bars for that ticker/date              │
│    • Wait until signal.time                      │
│    • Enter trade at next bar open                │
│    • Monitor position until exit                 │
│  - Results reflect ACTUAL scanner signals        │
└──────────────────────────────────────────────────┘
```

## Impact on Learning

**Current State:**
- Agent learning loop is **fundamentally broken**
- Scanner finds signals, but backtest doesn't test those signals
- Agent can't learn which patterns work because it's testing different patterns
- Performance metrics don't reflect scanner quality

**Example of Disconnect:**
```
Scanner Output:
  Signal at KLAC 2025-10-13 10:30:00 - bounce pattern (strength: 72)

Backtest Execution:
  Processes KLAC 2025-10-13 from 09:30:00 to 16:00:00
  Finds its own signals using different logic
  May trade at 11:45:00 instead (different time!)
  Results attributed to scanner, but scanner didn't generate this trade
```

## Root Cause

The system was architected with scanner and execution as **separate autonomous scripts** that both generate their own trading logic. This made sense for the original UI-based backtesting where users manually configure patterns.

However, for **agent learning**, the scanner and execution must be **tightly coupled**:
- Scanner detects signals → Execution tests those exact signals
- This is the only way to measure scanner quality and improve it

## Solution Options

### Option 1: Pass Signals to Execution Script (RECOMMENDED)

**Approach:** Modify execution script generation to accept signals as input.

**Changes Required:**

1. **Agent Learning Service** (backend/src/services/agent-learning.service.ts)
   - After filtering signals, pass them to execution script generation
   - Inject signals into script as data or pass via file

2. **Execution Script Template** (Claude generation prompt)
   - Accept signals array as input
   - Remove autonomous pattern detection
   - For each signal: enter trade at signal.time, exit per rules

3. **Script Structure:**
```typescript
// Signals injected by agent-learning.service.ts
const signals = [
  { ticker: 'KLAC', date: '2025-10-13', time: '10:30:00', type: 'bounce' },
  { ticker: 'NVDA', date: '2025-10-13', time: '14:15:00', type: 'rejection' },
  // ...
];

for (const signal of signals) {
  // Load bars for signal.ticker on signal.date
  const bars = loadBars(signal.ticker, signal.date);

  // Find the bar at signal.time
  const signalBarIndex = bars.findIndex(b => b.timeOfDay >= signal.time);

  // Enter trade on next bar
  const entryBar = bars[signalBarIndex + 1];
  position = enterTrade(signal, entryBar);

  // Monitor until exit
  for (let i = signalBarIndex + 2; i < bars.length; i++) {
    checkExitConditions(position, bars[i]);
  }
}
```

**Pros:**
- Execution directly tests scanner signals
- Learning loop measures actual scanner performance
- Simpler logic (no re-detection)
- Faster execution

**Cons:**
- Requires significant refactoring
- Changes to Claude prompts
- Testing required

### Option 2: Unified Scanner-Executor Script

**Approach:** Merge scanner and execution into a single script that both finds and trades signals.

**Pros:**
- Guaranteed synchronization
- Simpler architecture

**Cons:**
- Loses separation of concerns
- Harder to test scanner independently
- Couples two different responsibilities

### Option 3: Post-Process Signal Matching

**Approach:** After execution, match trades to scanner signals by time proximity.

**Pros:**
- Minimal code changes

**Cons:**
- Band-aid solution
- Still testing different signals
- Matching logic can be unreliable

## Recommended Implementation Plan

**Use Option 1** - Pass signals to execution script

### Phase 1: Modify Script Generation (2-3 hours)

1. **Update agent-learning.service.ts** (lines 280-330)
   ```typescript
   async generateAndRunBacktest(agent, scanResults) {
     const filteredSignals = this.filterSignals(scanResults);

     // Generate execution script WITH signals
     const executionScript = await this.claude.generateBacktestScript({
       strategyType: 'signal_based',  // New type
       signals: filteredSignals,      // Pass signals
       config: this.buildBacktestConfig(agent)
     });

     // Execute script
     const result = await scriptExecution.executeScript(executionScript);
     return result;
   }
   ```

2. **Update Claude prompt** (backend/src/services/claude.service.ts)
   - Add instruction for signal-based backtesting
   - Provide template that accepts signals array
   - Remove autonomous detection logic

3. **Update execution script template**
   - Accept signals as constant array
   - Iterate through signals
   - Enter trades at signal times

### Phase 2: Test Integration (1 hour)

1. Run iteration with new approach
2. Verify trades occur at scanner signal times
3. Verify trade count matches filtered signal count
4. Check P&L attribution is correct

### Phase 3: Validate Learning (30 min)

1. Run 3-5 iterations
2. Verify agent learns from accurate performance data
3. Confirm refinements target actual signal quality issues

## Success Criteria

1. ✅ Execution script receives scanner signals as input
2. ✅ Trades occur at exact times scanner detected patterns
3. ✅ Number of trades = number of filtered signals
4. ✅ Performance metrics reflect scanner signal quality
5. ✅ Agent learning improves based on actual signal performance

## Files to Modify

- `backend/src/services/agent-learning.service.ts` - Signal passing logic
- `backend/src/services/claude.service.ts` - Execution script generation prompt
- `backend/src/types/script.types.ts` - Add signal types if needed

## Timeline

- **Phase 1:** 2-3 hours
- **Phase 2:** 1 hour
- **Phase 3:** 30 minutes
- **Total:** ~4 hours

## Notes

- Current system "works" but produces meaningless learning results
- Scanner quality is measured by execution's pattern detection, not scanner's
- This explains why agent might not be improving - it's not testing what it found
- Fix is essential for agent to actually learn and improve strategies
