# Look-Ahead Bias Crisis & Solution Plan

**Date:** 2025-11-13
**Status:** 🚨 CRITICAL - All agents have invalid backtest results
**Impact:** Cannot graduate ANY agents to paper/live trading until fixed

---

## The Problem

### What We Found

While comparing Parabolic Fader iterations 11 vs 12, we discovered that **Claude generates scanner code with massive look-ahead bias**. The scanners loop through entire trading days and find the HIGH/LOW of the day BEFORE generating entry signals.

### Example: Parabolic Fader (Both Iterations 11 & 12)

```typescript
// Gets ALL bars for the entire day
const allBars = barsStmt.all(ticker, '2025-10-25', '2025-11-13');

// Loops through ENTIRE day to find the peak
for (let i = 0; i < barsWithVWAP.length; i++) {
  const gainPercent = ((bar.high - openPrice) / openPrice) * 100;
  if (gainPercent > maxGainPercent) {
    maxGainPercent = gainPercent;  // ← Finds HIGH OF DAY
    peakBar = bar;
    peakIndex = i;
  }
}

// Then looks for exhaustion AFTER the peak
const postPeakBars = barsWithVWAP.slice(peakIndex + 1);
```

**At 10:30 AM, this code already knows the stock will peak at 2:15 PM!**

### Example: Gap Fader (Latest Iteration)

```typescript
// Gets all morning bars at once (09:35-11:30 ET)
const morningBars = currentDayBars.filter(b => {
  return time >= '13:35:00' && time <= '15:30:00';
});

// Loops through ALL morning bars
for (let j = 5; j < morningBars.length; j++) {
  const current = morningBars[j];
  // ← At 9:35 AM, already knows what happens at 11:30!
}
```

### Why This is Devastating

1. **Backtest results are completely unreliable** - They show performance based on perfect future knowledge
2. **Live trading will fail spectacularly** - You can't know future peaks in real-time
3. **All 8 agents are likely affected** - Same prompting system generated all scanners
4. **40 iterations of work may be invalidated** - Need to audit and potentially rerun all

---

## Root Cause Analysis

### Why Did Claude Generate This?

The scanner generation prompts likely say things like:
- "Find stocks that spike 10-20% intraday"
- "Identify parabolic exhaustion patterns"
- "Look for gap-ups that fade"

Claude interprets this as:
1. Load all bars for the day
2. Find the pattern (spike, gap, etc.) by scanning the whole day
3. Generate entry signals based on that pattern

**Claude doesn't understand that real-time trading requires sequential bar-by-bar processing.**

### The Fundamental Issue

Our backtest system provides **entire days of data** to the scanner, and Claude assumes it can use all of it. We never explicitly told it:

> ⚠️ "You can only use data UP TO the current bar, never future bars"

---

## Solution Plan

### Phase 1: Immediate Audit (Today)

**Goal:** Understand the full scope of the problem

- [x] Check Parabolic Fader for look-ahead bias ✓ CONFIRMED
- [x] Check Gap Fader for look-ahead bias ✓ CONFIRMED
- [ ] Audit remaining 6 agents' latest scanners
- [ ] Document which agents are affected
- [ ] Estimate impact on iteration results

**Tools needed:**
- Grep scanner code for patterns like:
  - `for (let i = 0; i < allBars.length`
  - `for (let i = 0; i < dayBars.length`
  - `Math.max(...bars.map(b => b.high))`
  - Any loop that processes entire day/session at once

### Phase 2: Fix Scanner Generation (This Week)

**Goal:** Prevent future look-ahead bias

#### A. Update Scanner Generation Prompt

Add explicit anti-cheating instructions:

```
CRITICAL REAL-TIME CONSTRAINTS:

Your scanner will run in REAL-TIME, processing bars SEQUENTIALLY.
You MUST NEVER use future data. Follow these rules:

1. PROCESS BARS SEQUENTIALLY: Loop through bars one at a time
   ✓ GOOD: for (let i = 20; i < bars.length; i++) {
            const current = bars[i];
            const lookback = bars.slice(i-20, i); // Only past data!
   ✗ BAD:  Find peak by looping through ALL bars first

2. NEVER FIND "HIGH OF DAY" OR "LOW OF DAY" FIRST
   ✓ GOOD: Check if recent bars show a local peak forming
   ✗ BAD:  Find the high, then work backwards from it

3. USE ONLY PAST DATA for each bar you process
   ✓ GOOD: bars.slice(i-50, i)  // 50 bars BEFORE current
   ✗ BAD:  bars.slice(0, bars.length)  // Entire day

4. THINK: "At this exact moment (current bar), what do I KNOW?"
   - You know the past (previous bars)
   - You know the current bar (just closed)
   - You DO NOT know future bars

5. PATTERN DETECTION MUST BE CAUSAL
   ✓ GOOD: "Recent 10 bars show declining highs, might be topping"
   ✗ BAD:  "Find the top, then look for exhaustion after it"

Example of CORRECT real-time logic:
```typescript
// Scan each ticker day by day
for (const [date, dayBars] of Object.entries(barsByDay)) {

  // Process bars sequentially (bar-by-bar, like real trading)
  for (let i = 30; i < dayBars.length; i++) {
    const current = dayBars[i];
    const lookback20 = dayBars.slice(i - 20, i);
    const lookback50 = dayBars.slice(i - 50, i);

    // ✓ We can calculate stats on PAST bars
    const recentHigh = Math.max(...lookback20.map(b => b.high));
    const spikePercent = ((recentHigh - dayBars[0].open) / dayBars[0].open) * 100;

    // ✓ Check if pattern is forming NOW (at bar i)
    if (spikePercent > 10) {
      // Recent spike detected, check for exhaustion
      const volumeDeclining = /* check last 5 vs last 10 bars */
      const lowerHighsForming = /* check last 3-5 bars */

      if (volumeDeclining && lowerHighsForming) {
        // Signal! This could be topping RIGHT NOW
        results.push({
          ticker,
          signal_date: date,
          signal_time: current.time_of_day,
          // ...
        });
      }
    }
  }
}
```
```

#### B. Create Look-Ahead Bias Validator

Build a static analysis tool that scans generated code for red flags:

```typescript
// backend/src/utils/validate-scanner.ts

export function detectLookAheadBias(scannerCode: string): {
  hasLookAheadBias: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Red flag patterns
  const redFlags = [
    {
      pattern: /for\s*\([^)]*i\s*<\s*(\w+\.length|\w+Bars\.length)[^)]*\)[^{]*{[^}]*for\s*\([^)]*j\s*<\s*i/g,
      message: 'Nested loop processes all bars before analyzing - likely look-ahead bias'
    },
    {
      pattern: /Math\.max\([^)]*\.map\(b\s*=>\s*b\.(high|low)\)\)/g,
      message: 'Finding max/min of entire array - may be using future data'
    },
    {
      pattern: /peakBar[^=]*=.*for.*length/g,
      message: 'Finding peak bar by looping through all data - look-ahead bias'
    },
    {
      pattern: /slice\(0,.*\.length\)/g,
      message: 'Slicing entire array - may include future bars'
    }
  ];

  for (const { pattern, message } of redFlags) {
    if (pattern.test(scannerCode)) {
      violations.push(message);
    }
  }

  return {
    hasLookAheadBias: violations.length > 0,
    violations
  };
}
```

Integrate this into the learning iteration pipeline:
- Run validation after Claude generates scanner code
- If violations detected, ask Claude to regenerate
- Log warnings to help Claude learn

### Phase 3: Implement Real-Time Simulation Mode (Next Week)

**Goal:** Make backtesting truly simulate real-time bar-by-bar execution

Currently, our backtest probably:
1. Loads all bars for a day
2. Passes them to scanner
3. Scanner processes however it wants (future peeking!)

**New approach - Sequential Bar Processing:**

```typescript
// backend/src/backtesting/real-time-backtest.ts

export async function runRealtimeBacktest(
  scannerScript: string,
  startDate: string,
  endDate: string
): Promise<BacktestResult> {

  const signals: Signal[] = [];

  // Load all tickers and dates
  const dates = getDateRange(startDate, endDate);
  const tickers = getAllTickers();

  // Process each ticker+date combination
  for (const ticker of tickers) {
    for (const date of dates) {
      const allBarsForDay = loadBars(ticker, date);

      // CRITICAL: Feed bars sequentially, never entire day at once
      for (let currentBarIndex = 30; currentBarIndex < allBarsForDay.length; currentBarIndex++) {

        // Only provide bars UP TO current bar (no future!)
        const availableBars = allBarsForDay.slice(0, currentBarIndex + 1);

        // Call scanner with limited data
        const signal = await runScannerAtBar(
          scannerScript,
          ticker,
          date,
          availableBars,  // ← Only past + current bar
          currentBarIndex
        );

        if (signal) {
          signals.push(signal);
        }
      }
    }
  }

  return backtest(signals);
}
```

**This approach:**
- ✓ Simulates real-time bar arrival
- ✓ Prevents future peeking by construction
- ✓ Makes scanner results realistic
- ✗ Slower (runs scanner many times per day)

### Phase 4: Fix Existing Agents (Next 1-2 Weeks)

**Goal:** Correct scanners and regenerate valid backtest results

For each affected agent:

1. **Manually fix the scanner logic**
   - Rewrite peak detection to be sequential
   - Ensure only past data is used
   - Add comments explaining real-time constraints

2. **Re-run iterations with fixed scanner**
   - Keep same strategy concepts
   - Use corrected, non-cheating implementation
   - Compare results (will likely be worse, but honest!)

3. **Update knowledge base**
   - Document what changed
   - Note expected performance degradation
   - Teach agent about look-ahead bias

**Example Fix: Parabolic Fader**

```typescript
// OLD (CHEATING): Find peak first, then exhaustion
for (let i = 0; i < barsWithVWAP.length; i++) {
  if (gainPercent > maxGainPercent) {
    peakBar = bar; peakIndex = i;
  }
}
const postPeakBars = barsWithVWAP.slice(peakIndex + 1);

// NEW (HONEST): Sequential processing, detect exhaustion in real-time
for (let i = 30; i < barsWithVWAP.length; i++) {
  const current = barsWithVWAP[i];
  const lookback30 = barsWithVWAP.slice(i - 30, i);

  // Check if recent bars show a spike (10%+ from open)
  const recentHigh = Math.max(...lookback30.map(b => b.high));
  const spikePercent = ((recentHigh - openPrice) / openPrice) * 100;

  if (spikePercent < 10) continue; // No spike yet

  // Find where the high was (in past 30 bars only)
  const highIndex = lookback30.findIndex(b => b.high === recentHigh);
  const barsFromHigh = lookback30.length - highIndex;

  if (barsFromHigh < 5) continue; // High too recent

  // Check for exhaustion NOW (at current bar)
  const last5Bars = lookback30.slice(-5);
  const volumeDeclining = /* check volume */
  const lowerHighsForming = /* check highs */
  const belowVWAP = current.close < current.vwap;

  if (volumeDeclining && lowerHighsForming && belowVWAP) {
    // Signal: Exhaustion detected NOW
    results.push({ ticker, signal_time: current.time_of_day, ... });
  }
}
```

---

## Expected Impact

### Performance Will Drop (But That's OK!)

Current (inflated) results:
- Parabolic Fader Iter 12: +$1,105 (46% WR)
- Gap Fader Iter 8: Unknown but likely positive

Expected results after fix:
- **Win rates may drop 5-10%** (can't perfectly time entries)
- **Returns may drop 30-50%** (no perfect peak knowledge)
- **Some strategies may become unprofitable** (only worked with cheating)

### Why This is Actually Good

1. **Honest performance data** - Know what to expect in live trading
2. **Better strategy development** - Focus on edges that actually exist
3. **Risk management** - Won't over-allocate to overfitted strategies
4. **Trust in system** - Can confidently graduate agents to paper trading

---

## Decision Points

### Option A: Fix Everything, Start Over
- Audit all 8 agents
- Fix all scanners
- Re-run all 40 iterations
- **Time:** 2-3 weeks
- **Pro:** Clean slate, honest results
- **Con:** Lose all current iteration work

### Option B: Fix Going Forward Only
- Leave existing iterations as-is (mark as invalid)
- Fix prompts and validation
- Start new iterations with corrected approach
- **Time:** 3-5 days
- **Pro:** Faster, learn from mistakes
- **Con:** Can't use any current agents

### Option C: Hybrid Approach (RECOMMENDED)
- Fix prompts and add validation (Phase 2)
- Pick top 2-3 most promising agents
- Manually fix their scanners
- Re-run just those agents (5-10 iterations each)
- Start new agents with corrected system
- **Time:** 1 week
- **Pro:** Balance speed and recovery
- **Con:** Some manual work required

---

## Next Steps (Immediate)

1. **Complete audit** (2-3 hours)
   - Check all 8 agents for look-ahead bias
   - Document severity of each case
   - Prioritize which to fix first

2. **Update scanner prompt** (1 hour)
   - Add anti-cheating instructions
   - Test with Parabolic Fader example
   - Verify Claude generates sequential code

3. **Build validator** (2-3 hours)
   - Implement static analysis for red flags
   - Integrate into iteration pipeline
   - Test on existing scanners

4. **Fix one agent as proof-of-concept** (4-6 hours)
   - Choose Parabolic Fader (most recent work)
   - Manually correct scanner logic
   - Re-run iterations 11 and 12
   - Compare honest vs. cheating results

5. **Document findings** (30 min)
   - Update this document with results
   - Share learnings with team
   - Decide on Option A/B/C

---

## Lessons Learned

### For AI-Generated Trading Systems

1. **Never trust backtest results blindly** - Always validate the implementation
2. **LLMs don't understand causality by default** - Must explicitly teach sequential constraints
3. **Realistic simulation is critical** - Real-time bar-by-bar processing required
4. **Validation tools are essential** - Can't manually review every line of generated code
5. **Start with simple strategies** - Easier to spot logic errors

### For This Project

1. **Add look-ahead detection to all code reviews**
2. **Require real-time simulation mode for all backtests**
3. **Test agents in paper trading BEFORE trusting backtest results**
4. **Build a library of "correct" scanner patterns** for Claude to learn from
5. **Consider using walk-forward validation** to catch overfitting

---

## Conclusion

We discovered a **critical systemic flaw** that invalidates all current backtest results. However, this is a **fixable problem** with clear solutions:

1. Update prompts to teach Claude about real-time constraints
2. Add validation to prevent future look-ahead bias
3. Re-run key agents with corrected logic
4. Build confidence through paper trading before live deployment

**The fact that we caught this BEFORE going live is a huge win.** Better to find this now than after losing real money!

---

**Next Update:** After completing audit of all 8 agents
