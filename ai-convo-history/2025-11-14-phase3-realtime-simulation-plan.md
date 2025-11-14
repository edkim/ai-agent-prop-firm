# Phase 3: Real-Time Simulation Mode - Implementation Plan

**Date:** 2025-11-14
**Status:** Planning → **Ready for Implementation**
**Goal:** Make backtesting truly simulate real-time bar-by-bar execution to eliminate lookahead bias by construction

---

## 🚨 Critical Discovery: Paper Trading is Fundamentally Broken

**Investigation Date:** 2025-11-14
**Finding:** The existing paper trading system has the same lookahead bias vulnerability as backtesting!

### The Problem

The paper trading orchestrator (Line 268-274 in `paper-trading-orchestrator.service.ts`):
```typescript
// Scan on EVERY bar (now efficient with persistent scripts)
const bars = this.recentBars.get(bar.ticker) || []; // ⚠️ Gets ALL recent bars (up to 100)
const signals = await this.runScanScript(agent, bars); // ⚠️ Scanner sees all 100 bars at once!
```

**What happens:**
1. New bar arrives → `processBar()` called
2. System retrieves ALL 100 recent bars from buffer
3. Passes ALL bars to the scanner script (unchanged from backtest)
4. Scanner can still use lookahead bias (find peak, then process)

**The illusion:**
- ✅ Called "on every bar" (sounds real-time)
- ❌ But scanner gets batch of ALL recent bars (not sequential)
- ❌ No architectural prevention of peeking ahead within that batch

This explains why agents with 60-80% backtest win rates would fail in paper trading - the bias disappears when running against truly live data!

### What This Means

**Bad News:**
- Paper trading is NOT a valid graduation test
- Agents "graduated" from backtest to paper trading carry their lookahead bias
- Performance cliff when moving from paper to live is architectural, not market conditions

**Good News:**
- ✅ We caught this before going live with real money!
- ✅ The paper trading infrastructure is 80% perfect - just needs scanner execution fix
- ✅ Fixing Phase 3 will fix BOTH backtest AND paper trading simultaneously

---

## Executive Summary

We've fixed the **scanner generation prompt** (Phase 2) to instruct Claude to avoid lookahead bias. We've also created a **static validator** to detect bias patterns. However, the fundamental architecture still allows scanners to peek at future data.

**Phase 3** changes the architecture so that **lookahead bias becomes impossible** by only providing bars that would be available in real-time.

**NEW:** Phase 3 will also fix the paper trading system by applying the same real-time simulation architecture.

### What Changes

| Aspect | Current (Phase 2) | Phase 3 (Real-Time Simulation) |
|--------|-------------------|--------------------------------|
| **Scanner input** | Entire day's bars at once | Bars fed sequentially, one at a time |
| **Scanner execution** | Runs once per day/ticker | Runs at every bar (simulating real-time) |
| **Bias prevention** | Relies on Claude following instructions | Architecturally impossible to peek ahead |
| **Performance** | Fast (1 scan per ticker/day) | Slower (N scans per bar, where N = bars per day) |

---

## Current Architecture (Phase 2)

### How Scanners Execute Today

```typescript
// Current approach: Scanner receives ALL bars for a day
async function executeScan(ticker: string, date: string) {
  // Load entire day at once
  const allBars = db.prepare(`
    SELECT * FROM ohlcv_data
    WHERE ticker = ? AND date = ?
    ORDER BY timestamp ASC
  `).all(ticker, date);

  // Scanner can see ALL bars (including future!)
  const signals = runScanner(allBars);  // ⚠️ Can peek ahead

  return signals;
}
```

### The Problem

Even with updated prompts and validation:
- Scanner **receives** all 78 bars for the trading day (9:30 AM - 4:00 PM, 5-minute bars)
- Claude is **instructed** to process sequentially
- But nothing **prevents** the scanner from using `allBars[77]` when at `allBars[0]`
- Validator can catch **obvious** violations but may miss subtle ones

**Bottom line:** We're asking Claude to "play fair" instead of making cheating impossible.

---

## Proposed Architecture (Real-Time Simulation)

### The Core Concept

Instead of giving the scanner all bars at once, **feed bars one at a time**, simulating real-time arrival:

```typescript
// New approach: Feed bars sequentially
async function realtimeBacktest(ticker: string, date: string) {
  const allBars = loadAllBars(ticker, date);
  const signals: Signal[] = [];

  // Simulate each moment in the trading day
  for (let currentBarIndex = 30; currentBarIndex < allBars.length; currentBarIndex++) {

    // Only provide bars UP TO current moment (no future!)
    const availableBars = allBars.slice(0, currentBarIndex + 1);

    // Run scanner with limited context
    const signal = await runScannerAtBar(
      ticker,
      date,
      availableBars,  // ← Can't peek ahead - future bars not provided!
      currentBarIndex
    );

    if (signal) {
      signals.push(signal);
      break; // Found signal, stop scanning this ticker/date
    }
  }

  return signals;
}
```

### Key Architectural Changes

1. **Scanner Interface Changes**
   - **Before:** `runScanner(ticker, date) → Signal[]`
   - **After:** `runScannerAtBar(ticker, date, availableBars, currentIndex) → Signal | null`

2. **Execution Model**
   - **Before:** 1 scan per ticker/date combination
   - **After:** N scans per ticker/date (where N = number of bars after warmup period)

3. **Data Access**
   - **Before:** Scanner queries database for all bars
   - **After:** Backtest engine provides limited bar array

4. **Signal Generation**
   - **Before:** Scanner can return multiple signals per day
   - **After:** Scanner returns first signal, then stops (simulates "I took a trade, now I'm done")

---

## 🎁 Reusable Components from Paper Trading System

**Good News:** The paper trading infrastructure is 80% of what we need! Here's what we can reuse:

### ✅ Already Built and Working

**1. Bar-by-Bar Event Processing Framework**
- `processBar(bar: Bar)` - called for each new bar (Line 229)
- Already handles sequential bar arrival
- **Reuse for:** Triggering scanner execution at each bar

**2. Recent Bars Buffer Management**
- `recentBars: Map<string, Bar[]>` - maintains sliding window (Line 47)
- `MAX_BARS_PER_TICKER = 100` - configurable lookback
- Automatic trimming of old bars
- **Reuse for:** Providing lookback context to scanners

**3. Position Monitoring & Template Exit System**
- `checkExitConditions()` with template-based exits (Line 478)
- `ExecutionTemplateExitsService` integration
- Metadata tracking for stateful exit strategies
- **Reuse for:** Execution side is already correct! No changes needed

**4. Virtual Executor**
- Order simulation, fills, position tracking
- Paper account management
- **Reuse for:** Can test Phase 3 strategies in paper trading immediately

**5. Performance Infrastructure**
- Persistent script files (avoid I/O overhead) (Line 295)
- Parallel processing of tickers
- Efficient polling architecture
- **Reuse for:** Performance optimization techniques

### ❌ What Needs Fixing

**Only ONE component is broken:** Scanner execution (Line 268-274)

**Current (broken):**
```typescript
const bars = this.recentBars.get(bar.ticker) || []; // All 100 bars
const signals = await this.runScanScript(agent, bars); // Batch mode
```

**Phase 3 fix:**
```typescript
// Only provide bars UP TO current bar index
const currentIndex = bars.length - 1;
const availableBars = bars.slice(0, currentIndex + 1); // Same result, but...

// Change scanner to ONLY use bars[currentIndex] and bars.slice(currentIndex - N, currentIndex)
const signal = await this.runScannerAtBar(agent, bars, currentIndex);
```

Actually, the fix is even simpler - we don't change how many bars we pass! We just:
1. Change the scanner generation to produce sequential code
2. Keep the validator running to ensure no peeking
3. The existing infrastructure handles everything else

### 🎯 The Minimal Fix

**For Paper Trading:** Just regenerate scanner scripts using Phase 2 prompts + validator. The infrastructure is fine!

**For Backtesting:** Implement the full real-time simulation loop (Phase 3) because we need to test on historical data.

This means:
- **Paper trading fix:** 1 day (regenerate scanners with new prompts)
- **Backtesting fix:** 5-7 days (implement real-time simulation engine)

---

## Implementation Plan

### Step 0: Quick Win - Fix Paper Trading Scanners (1 day) **NEW**

**Goal:** Get paper trading working correctly ASAP by regenerating scanner scripts

**Tasks:**
1. Add "regenerate scanner" endpoint for paper trading agents
2. Use Phase 2 scanner generation prompt (with anti-bias instructions)
3. Run validator on regenerated scanners
4. Deploy to paper trading without code changes
5. Monitor performance vs. backtest (should see win rate drop to realistic levels)

**Deliverable:** Paper trading agents running with bias-free scanners

---

### Step 1: Create Real-Time Backtest Engine (2-3 days)

Create new module: `backend/src/backtesting/realtime-backtest.ts`

```typescript
export interface RealtimeBacktestOptions {
  startDate: string;
  endDate: string;
  tickers: string[];
  warmupBars: number;  // Minimum bars needed before scanning (e.g., 30 for SMA)
  timeframe: string;   // '5min', '1min', etc.
}

export async function runRealtimeBacktest(
  scannerFunction: ScannerFunction,
  options: RealtimeBacktestOptions
): Promise<Signal[]> {
  const signals: Signal[] = [];

  // For each ticker and date
  for (const ticker of options.tickers) {
    for (const date of getDatesInRange(options.startDate, options.endDate)) {

      // Load all bars for this ticker/date
      const allBars = loadBars(ticker, date, options.timeframe);

      // Skip if insufficient data
      if (allBars.length < options.warmupBars) continue;

      // Simulate real-time bar arrival
      for (let i = options.warmupBars; i < allBars.length; i++) {

        // Provide only bars available "so far"
        const availableBars = allBars.slice(0, i + 1);

        // Run scanner at this moment
        const signal = scannerFunction({
          ticker,
          date,
          bars: availableBars,
          currentBarIndex: i,
          currentBar: allBars[i]
        });

        if (signal) {
          signals.push(signal);
          break; // One signal per ticker/date
        }
      }
    }
  }

  return signals;
}
```

### Step 2: Update Scanner Generation Prompt (1 day)

Change scanner prompt to generate functions instead of full scripts:

**Current Output:**
```typescript
// Full script that runs itself
async function runScan() {
  const db = getDatabase();
  const results = [];
  // ... query and process ...
  console.log(JSON.stringify(results));
}
runScan().catch(console.error);
```

**New Output:**
```typescript
// Pure function that processes one moment
export function scanAtBar(context: ScanContext): Signal | null {
  const { ticker, date, bars, currentBarIndex, currentBar } = context;

  // bars = only bars available up to current moment
  // currentBar = the bar that just closed

  // Can ONLY use bars[0..currentBarIndex]
  const lookback20 = bars.slice(currentBarIndex - 20, currentBarIndex);

  // Pattern detection logic...
  if (patternDetected) {
    return {
      ticker,
      signal_date: date,
      signal_time: currentBar.time_of_day,
      pattern_strength: 75,
      metrics: { /* ... */ }
    };
  }

  return null; // No signal at this bar
}
```

### Step 3: Create Scanner Function Executor (1 day)

Dynamically load and execute scanner functions:

```typescript
// backend/src/services/scanner-executor.service.ts

export class ScannerExecutorService {
  /**
   * Load scanner function from code string
   */
  loadScannerFunction(scannerCode: string): ScannerFunction {
    // Use dynamic import or eval with proper sandboxing
    const module = this.compileScannerModule(scannerCode);
    return module.scanAtBar;
  }

  /**
   * Execute scanner in real-time simulation mode
   */
  async executeRealtimeScan(
    scannerCode: string,
    options: RealtimeBacktestOptions
  ): Promise<Signal[]> {
    const scannerFn = this.loadScannerFunction(scannerCode);
    return runRealtimeBacktest(scannerFn, options);
  }
}
```

### Step 4: Integrate with Learning Iteration Pipeline (1 day)

Update `learning-iteration.service.ts` to use new execution mode:

```typescript
// Option 1: Feature flag for gradual rollout
const USE_REALTIME_SIMULATION = process.env.REALTIME_SIMULATION === 'true';

if (USE_REALTIME_SIMULATION) {
  scanResults = await this.scannerExecutor.executeRealtimeScan(
    strategy.scanScript,
    { startDate, endDate, tickers, warmupBars: 30, timeframe: '5min' }
  );
} else {
  // Legacy mode (current approach)
  scanResults = await this.executeScan(strategy.scanScript, tokenUsage);
}
```

### Step 5: Performance Optimization (2-3 days)

Real-time simulation is slower. Optimize:

1. **Parallel Processing**
   ```typescript
   // Process multiple tickers in parallel
   const chunks = chunkArray(tickers, 10);
   const results = await Promise.all(
     chunks.map(chunk => processChunkInParallel(chunk))
   );
   ```

2. **Early Termination**
   ```typescript
   // Stop scanning once signal found for a ticker/date
   if (signal) {
     break; // Don't process remaining bars
   }
   ```

3. **Caching Indicators**
   ```typescript
   // Pre-calculate VWAP for all bars once
   const barsWithVWAP = calculateVWAPForAllBars(allBars);

   // Then slice for each iteration
   for (let i = 30; i < barsWithVWAP.length; i++) {
     const available = barsWithVWAP.slice(0, i + 1);
     // Scanner gets pre-computed VWAP values
   }
   ```

4. **Database Query Optimization**
   ```typescript
   // Load all ticker/date combinations upfront
   const barCache = await loadBarsForDateRange(tickers, startDate, endDate);

   // Then iterate from memory
   for (const [ticker, dateMap] of barCache) {
     for (const [date, bars] of dateMap) {
       // Process without hitting DB
     }
   }
   ```

---

## Benefits of Real-Time Simulation

### 1. **Eliminates Lookahead Bias by Construction**
- Scanner **cannot** access future bars - they're not provided
- No reliance on Claude following instructions
- Validator becomes less critical (still useful for code quality)

### 2. **Realistic Backtest Results**
- Win rates will be honest (no perfect timing)
- Strategies that only worked with cheating will fail
- Builds confidence for paper/live trading

### 3. **Easier Transition to Live Trading**
- Scanner function works identically in backtest and live
- No code changes needed to deploy
- Just change data source from historical DB to live feed

### 4. **Better Strategy Development**
- Forces focus on patterns detectable in real-time
- Encourages robust entry criteria (not perfect tops/bottoms)
- Teaches agents realistic expectations

---

## Trade-Offs and Challenges

### Performance Impact

| Scenario | Current | Phase 3 | Slowdown |
|----------|---------|---------|----------|
| 100 tickers, 20 days, 78 bars/day | 2,000 scans | 156,000 scans | **78x slower** |
| With early termination (avg 40 bars) | 2,000 scans | 80,000 scans | **40x slower** |
| With parallel processing (10x) | - | 8,000 scans (effective) | **4x slower** |

**Mitigation:**
- Start with fewer tickers (20 instead of 100)
- Reduce date range (10 days instead of 20)
- Use early termination (stop after first signal)
- Parallelize across tickers
- Cache pre-computed indicators

### Memory Usage

- Loading all bars for 100 tickers × 20 days upfront
- Estimated: ~50MB for 5-minute bars (manageable)

### Code Complexity

- Scanner code must be pure functions (no side effects)
- Requires changing scanner generation prompt
- Need dynamic function loading mechanism

---

## Migration Strategy

### Phase 3A: Proof of Concept (Week 1)

**Goal:** Validate the approach works

1. Implement real-time backtest engine for ONE agent
2. Run both old and new approaches side-by-side
3. Compare results:
   - New approach should have lower win rate (more realistic)
   - New approach should have fewer signals (can't perfectly time entries)
4. Document performance (speed, memory)

### Phase 3B: Gradual Rollout (Week 2)

**Goal:** Make it production-ready

1. Add feature flag: `REALTIME_SIMULATION=true/false`
2. Allow per-agent configuration:
   ```typescript
   agent.use_realtime_simulation = true;
   ```
3. Run new agents with real-time mode
4. Keep existing agents in legacy mode (don't invalidate existing work)

### Phase 3C: Full Migration (Week 3-4)

**Goal:** Make real-time simulation the default

1. All new agents use real-time mode by default
2. Provide migration tool for existing agents:
   ```bash
   npm run migrate-agent-to-realtime <agent-id>
   ```
3. Re-run critical iterations for top-performing agents
4. Update documentation and examples

---

## Alternative Approaches Considered

### Option A: Streaming Data API

Instead of slicing arrays, stream bars one at a time:

```typescript
for await (const bar of streamBars(ticker, date)) {
  const signal = scanner.onBar(bar);
  if (signal) break;
}
```

**Pros:** More realistic (matches live trading exactly)
**Cons:** More complex, harder to debug, same performance issues

### Option B: Optimistic Validation

Keep current approach but fail iteration if validator detects bias:

```typescript
const validation = detectLookAheadBias(scannerCode);
if (validation.hasLookAheadBias) {
  throw new Error('Scanner failed validation - regenerate');
}
```

**Pros:** Minimal code changes, keeps performance
**Cons:** Still relies on heuristics, Claude might find new ways to cheat

### Option C: Hybrid Approach (Recommended for Phase 3)

Use real-time simulation for **critical paths** only:

- **Scanner generation:** Use real-time mode (ensures honest signals)
- **Execution testing:** Use template mode (faster, good enough for exit logic)

This gives us 80% of the benefit with 20% of the performance cost.

---

## Success Metrics

### Technical Metrics

- [ ] Real-time backtest runs without errors
- [ ] Performance acceptable (<5 min for 20 tickers, 10 days)
- [ ] Validator detects 0 lookahead bias violations in real-time mode
- [ ] Memory usage <200MB for typical scan

### Business Metrics

- [ ] New agents show realistic win rates (30-50%, not 60-80%)
- [ ] Strategies transition to paper trading without performance drop
- [ ] Team has confidence in backtest results
- [ ] Faster iteration cycles (no need to manually audit scanners)

---

## Implementation Timeline

### Updated Timeline (With Paper Trading Discovery)

| Phase | Tasks | Duration | Deliverables |
|-------|-------|----------|--------------|
| **Step 0: Paper Trading Fix** | Regenerate scanners with Phase 2 prompts, validate | 1 day | Paper trading working correctly |
| **Phase 3A: Backtest POC** | Real-time backtest engine, test with 1 agent | 3 days | Working prototype, performance data |
| **Phase 3B: Rollout** | Feature flags, parallel processing | 4 days | Production-ready backtest system |
| **Phase 3C: Unify Systems** | Use same scanner execution for backtest & paper trading | 2 days | Single codebase, no drift |
| **Total** | | **10 days** | **Honest backtest + paper trading** |

### Quick Win Path (Recommended)

**Week 1 (Days 1-5):**
1. **Day 1:** Fix paper trading scanners (regenerate with anti-bias prompts)
2. **Days 2-4:** Build real-time backtest POC, test with 1 agent
3. **Day 5:** Compare POC results with current backtest (expect lower but realistic win rates)

**Week 2 (Days 6-10):**
1. **Days 6-8:** Add feature flags, parallel processing, optimize performance
2. **Days 9-10:** Unify backtest and paper trading to use same scanner execution model

**Outcome:** By Day 10, we have:
- ✅ Paper trading producing realistic results
- ✅ Backtest simulating real-time bar arrival
- ✅ Both systems using identical scanner execution (no drift)
- ✅ Confidence to transition to live trading

---

## Risk Assessment

### High Risk: Performance Unacceptable

**Mitigation:**
- Benchmark early (Phase 3A)
- Reduce scope if needed (fewer tickers, shorter periods)
- Use hybrid approach (real-time for signals, template for execution)

### Medium Risk: Complex Scanner Functions Break

**Mitigation:**
- Start with simple patterns (VWAP bounce, gap fade)
- Incremental rollout (one agent at a time)
- Keep legacy mode as fallback

### Low Risk: Results Show All Strategies Unprofitable

**Outcome:** This is actually **good news** - we found the truth before going live!
**Response:** Focus on developing genuinely profitable strategies, not optimizing overfitted ones.

---

## Next Steps (After Phase 2)

1. **Review this plan** with team
2. **Prioritize:** Do we need real-time mode immediately, or can Phase 2 (prompts + validation) suffice for now?
3. **Spike:** Build minimal POC over 2 days to validate performance
4. **Decide:** If POC shows acceptable performance, proceed with full Phase 3. If not, stick with Phase 2 and improve validation.

---

## Conclusion

**Phase 3: Real-Time Simulation Mode** represents the **gold standard** for honest backtesting. It eliminates lookahead bias by construction, making it impossible for scanners to cheat.

**Trade-off:** It's slower and more complex than the current approach.

**Recommendation:**
- **Short term (this week):** Ship Phase 2 (prompts + validation), test with new iterations
- **Medium term (next 2 weeks):** Build Phase 3 POC, evaluate performance
- **Long term (month 2):** Migrate all agents to real-time mode once proven

**The fact that we caught this before going live is a huge win. Better to find this now than after losing real money!**

---

**Status:** ✅ **Ready for implementation** - Paper trading investigation complete
**Dependencies:** Phase 2 complete (prompts + validation) ✅
**Critical Finding:** Paper trading has same lookahead bias as backtest - must fix both
**Owner:** TBD
**Target Date:** 2025-11-24 (10 days from now) - **Accelerated due to paper trading urgency**

---

## 🎯 Key Takeaways from Paper Trading Investigation

### What We Learned

1. **Paper trading is fundamentally broken** - same lookahead bias as backtesting
2. **The infrastructure is 80% perfect** - only scanner execution needs fixing
3. **Quick win available** - can fix paper trading in 1 day by regenerating scanners
4. **Phase 3 fixes BOTH systems** - single solution for backtest and paper trading
5. **Reusable components validated** - bar-by-bar framework, exits, monitoring all work

### Why This Changes Everything

**Before investigation:**
- Thought paper trading was "graduation test" for strategies
- Assumed backtest→paper→live was a valid progression
- Focused on fixing backtest only

**After investigation:**
- Paper trading carries same bias as backtest (not a valid test)
- Both systems need the same fix (real-time simulation)
- Can now build unified architecture (no code drift between systems)

### The Path Forward

**Immediate (This Week):**
1. Implement Phase 3 real-time simulation for backtest
2. Apply same architecture to paper trading
3. Regenerate all scanner scripts with anti-bias prompts

**Validation:**
- Run iteration 13 of Parabolic Fader with Phase 3
- Compare: 500 signals, 22% win rate, -$601 return (with bias)
- Expect: Fewer signals, similar/lower win rate, similar/worse return (without bias)
- If results are similar, strategy is genuinely bad (not just biased)

**Confidence Building:**
- Side-by-side comparison of biased vs. unbiased results
- Measure how much bias inflated performance
- Set realistic expectations for live trading

### The Bottom Line

**Finding the paper trading flaw was a huge win!** It means:
- ✅ We caught it before going live with real money
- ✅ We have a clear path to fix both systems
- ✅ We can build confidence through realistic testing
- ✅ The infrastructure investment wasn't wasted - just needs one fix

**This is not a setback - it's validation that we're doing this right.**

---

**Document Updated:** 2025-11-14
**Next Review:** After Phase 3 POC (Day 5)
