# Scanner-Execution Alignment Strategy

**Date**: 2025-11-01
**Status**: Planning
**Priority**: High - Architectural Change

---

## Executive Summary

**Current Problem:** Scanner generates signals, but execution re-evaluates with different criteria, causing signal-to-trade mismatch (e.g., 6 signals → 0 trades).

**Proposed Solution:** Scanner owns ALL entry criteria. Execution always trades signals (focuses on risk management and exits only).

**Key Challenge:** How to evolve scanner criteria across learning iterations while finding repeatable edge and maintaining cost efficiency?

---

## Paradigm Shift: Roles Redefined

### Current Architecture (Misaligned)

```
Scanner:
  ├─ Find pattern candidates (broad criteria)
  └─ Generate signals

Execution:
  ├─ Re-evaluate signals (strict criteria)
  ├─ Reject signals that don't meet criteria
  └─ Manage exits for accepted signals

Result: Signal count ≠ Trade count
```

### Proposed Architecture (Aligned)

```
Scanner:
  ├─ Find pattern candidates (broad initial screen)
  ├─ Validate ALL entry criteria
  │  ├─ Technical indicators (RSI, momentum, volume)
  │  ├─ Data availability (sufficient bars)
  │  ├─ Timing constraints (hours before close)
  │  └─ Quality filters (liquidity, volatility)
  └─ Generate HIGH-QUALITY signals

Execution:
  ├─ ALWAYS enter on signals (next bar)
  ├─ Focus on risk management
  │  ├─ Stop loss placement
  │  ├─ Take profit targets
  │  ├─ Trailing stops
  │  └─ Position sizing
  └─ Execute exits only

Result: Signal count ≈ Trade count (minus rare technical failures)
```

---

## Strategic Questions

### 1. Initial Scanning Approach

**Question:** Should we start broad and layer in requirements, or start strict?

#### Option A: Broad → Narrow (Funnel Approach)

**Phase 1 (Iterations 1-3):** Cast wide net
```typescript
// Scanner: Very permissive
- Find 50%+ 3-day gains (lower threshold)
- Any cross below prior day close
- No indicator requirements
→ Expect: 50+ signals per iteration
```

**Phase 2 (Iterations 4-7):** Add quality filters based on learnings
```typescript
// Scanner: Layer in criteria
- Find 100%+ 3-day gains (raise threshold)
- Cross below prior close + RSI > 60
- Volume > 1.2× average
→ Expect: 15-25 signals per iteration
```

**Phase 3 (Iterations 8+):** Strict high-conviction setups
```typescript
// Scanner: Tight criteria
- Find 100%+ 3-day gains
- Cross below prior close + RSI > 70
- Volume > 1.5× average + momentum > 2%
→ Expect: 5-10 signals per iteration
```

**Pros:**
- ✅ Discover what actually works through experimentation
- ✅ Avoid premature optimization
- ✅ More data points for learning (50 trades > 5 trades)
- ✅ Can identify unexpected patterns

**Cons:**
- ❌ High cost initially (processing 50+ signals)
- ❌ Many losing trades in early iterations
- ❌ Noise in learning data (hard to identify true edge)
- ❌ Risk of overfitting to noise

**Cost Estimate:**
- Iterations 1-3: 50 signals × 3 iterations = 150 trades
- Iterations 4-7: 20 signals × 4 iterations = 80 trades
- Total early phase: ~230 trades to find edge

---

#### Option B: Narrow → Adaptive (Hypothesis-Driven)

**Phase 1 (Iterations 1-2):** Start with strong hypothesis
```typescript
// Scanner: Well-defined criteria from start
- Find 100%+ 3-day gains (parabolic moves)
- Cross below prior close in first 2 hours
- RSI > 70 (exhaustion confirmed)
- Volume > 2× average (conviction)
→ Expect: 3-8 signals per iteration
```

**Phase 2 (Iterations 3-5):** Test variations systematically
```typescript
// Scanner: A/B test single parameters
Iteration 3: Test RSI threshold (65 vs 70 vs 75)
Iteration 4: Test volume multiplier (1.5× vs 2× vs 3×)
Iteration 5: Test timing window (first 1hr vs 2hr vs 3hr)
→ Expect: 5-12 signals per iteration
```

**Phase 3 (Iterations 6+):** Refine winners
```typescript
// Scanner: Optimize best-performing criteria
- Use winning parameters from Phase 2
- Add secondary filters (volatility, liquidity)
- Fine-tune thresholds
→ Expect: 3-7 signals per iteration
```

**Pros:**
- ✅ Lower cost (fewer trades to test)
- ✅ Cleaner data (high-quality setups only)
- ✅ Faster to identify true edge
- ✅ More focused learning

**Cons:**
- ❌ Risk of missing unexpected patterns
- ❌ Hypothesis might be wrong (wasted iterations)
- ❌ Fewer data points for statistical significance
- ❌ Harder to discover novel strategies

**Cost Estimate:**
- Iterations 1-2: 6 signals × 2 iterations = 12 trades
- Iterations 3-5: 8 signals × 3 iterations = 24 trades
- Total early phase: ~36 trades to validate hypothesis

---

#### Option C: Hybrid (Recommended)

**Combine best of both approaches:**

**Iteration 1:** Broad discovery (one-time)
```typescript
// Scanner: Permissive to understand market
- Find 50%+ 3-day gains
- Cross below prior close (any time)
- Minimal filters
→ Expect: 30-50 signals
→ Goal: Identify which patterns have potential
```

**Iteration 2-3:** Hypothesis formation
```typescript
// Scanner: Analyze Iteration 1 results
- What % gain threshold had best win rate?
- What time of day had best results?
- What volume levels correlated with success?
→ Use insights to form hypothesis for next phase
```

**Iteration 4+:** Hypothesis-driven refinement
```typescript
// Scanner: Test focused hypotheses
- Apply winning criteria from Iteration 1 analysis
- A/B test variations
- Gradually tighten as edge is validated
```

**Pros:**
- ✅ One broad sweep for discovery
- ✅ Data-driven hypothesis formation
- ✅ Lower cost after initial exploration
- ✅ Balance between discovery and efficiency

**Cons:**
- ❌ Still requires one expensive iteration
- ❌ Risk of noise in first iteration

**Cost Estimate:**
- Iteration 1: 40 signals (discovery)
- Iterations 2-10: 7 signals avg × 9 iterations = 63 trades
- Total: ~103 trades to find and refine edge

---

#### Recommended: Adaptive Approach (Option 3.5)

**Based on discussion, we're adopting an adaptive strategy that respects user intent:**

**How It Works:**

1. **Iteration 1**: Use user's prompt as-is (respect their initial intent)
2. **Classify** based on results:
   - **High signal count (>25)**: Discovery mode → analyze patterns, tighten criteria
   - **Low signal count (<10)**: Refinement mode → optimize parameters, test variations
   - **Moderate (10-25)**: Hybrid mode → balanced refinement

3. **Adapt** subsequent iterations based on classification

**Implementation:**

```typescript
async runIteration(agentId: string, iterationNumber: number) {
  const scanResults = await this.runScan(scanScript);
  const signalCount = scanResults.length;

  if (iterationNumber === 1) {
    // Classify based on results
    let learningStrategy: 'discovery' | 'refinement' | 'hybrid';
    let guidance: string;

    if (signalCount > 25) {
      learningStrategy = 'discovery';
      guidance = `
        Found ${signalCount} signals - indicates broad search space.
        Next iteration: Analyze winning patterns, tighten criteria to 10-15 signals.
      `;
    } else if (signalCount < 10) {
      learningStrategy = 'refinement';
      guidance = `
        Found ${signalCount} signals - focused strategy detected.
        Next iteration: A/B test parameters to optimize performance.
      `;
    } else {
      learningStrategy = 'hybrid';
      guidance = `
        Found ${signalCount} signals - balanced approach.
        Next iteration: Refine based on trade quality metrics.
      `;
    }

    // Store for next iteration
    await this.storeLearningStrategy(agentId, learningStrategy, guidance);
  }
}
```

**Benefits:**
- ✅ Respects user's initial prompt (doesn't override)
- ✅ Adapts to actual results (data-driven)
- ✅ No upfront decision needed
- ✅ Self-correcting based on signal volume

**Example Flow:**

```
User prompt: "Find parabolic moves showing exhaustion"

Iteration 1:
→ Scanner interprets broadly (50%+ gain, any cross)
→ Results: 35 signals → DISCOVERY MODE

Iteration 2 (auto-guidance):
→ "Analyze winners: avg 120% gain, RSI > 70, cross before 10 AM"
→ Tighten criteria based on learnings
→ Results: 12 signals → HYBRID MODE

Iteration 3+:
→ Optimize parameters (RSI 70 vs 75, etc.)
→ Maintain edge, improve execution
```

---

### 2. Finding Repeatable Edge

**Question:** How do we increase chances of finding a strategy with consistent alpha?

#### Principles for Edge Discovery

**A. Focus on Behavioral Anomalies (Not Technical Artifacts)**

❌ **Avoid:** Pure technical patterns
```
"Buy when RSI crosses above 30"
→ Technical artifact, no behavioral cause
→ Likely to stop working (regime change)
```

✅ **Prefer:** Behavioral patterns with logical basis
```
"Fade parabolic moves when retail exhaustion signals appear"
→ Based on: FOMO → overextension → reversal
→ More likely to persist (human nature)
```

**B. Look for Asymmetric Risk/Reward**

The best edges aren't about win rate, they're about:
- Small losses when wrong
- Large gains when right
- Consistent opportunity frequency

**Example:**
```
Win rate: 40%
Avg win: +8%
Avg loss: -2%
Expected value: (0.4 × 8%) + (0.6 × -2%) = +2% per trade
```

**C. Multi-Timeframe Confirmation**

Stronger signals combine:
- Daily level: Identify overextended moves (3-day 100%+ gain)
- Intraday level: Find exhaustion confirmation (RSI, volume, cross)
- Micro level: Enter on specific trigger (cross below prior close)

**D. Volume as Truth Serum**

Price can be manipulated, volume reveals conviction:
```typescript
// Weak signal
price_up_100% + volume_normal
→ Suspect move, likely to reverse violently

// Strong signal
price_up_100% + volume_spike_5x
→ Real conviction, but also exhaustion risk
```

---

#### Edge Validation Checklist

After 5-10 iterations, evaluate:

**Statistical Significance:**
- [ ] Sample size: Minimum 20 trades
- [ ] Win rate: Above 40% (for mean reversion) or above 55% (for momentum)
- [ ] Profit factor: > 1.5 (gross wins / gross losses)
- [ ] Sharpe ratio: > 1.0

**Consistency:**
- [ ] Works across different market conditions (up, down, sideways)
- [ ] Works across different sectors (not just one ticker)
- [ ] Works across different time periods (not just one week)

**Logical Foundation:**
- [ ] Can explain WHY this pattern works
- [ ] Based on behavioral bias or structural inefficiency
- [ ] Not purely curve-fitted to historical data

**If 2+ checkboxes fail:** Pivot strategy or refine criteria

---

### 3. Scanner Evolution Across Iterations

**Question:** How does scanner criteria evolve as agent learns?

#### Learning Loop Architecture

```
Iteration N:
  ├─ Scanner generates signals with current criteria
  ├─ Execution trades all signals
  ├─ Analysis evaluates results
  │  ├─ Which criteria correlated with winners?
  │  ├─ Which criteria correlated with losers?
  │  └─ What new patterns emerged?
  └─ Update scanner criteria for Iteration N+1

Iteration N+1:
  ├─ Scanner uses REFINED criteria
  └─ Repeat...
```

#### Criteria Evolution Examples

**Example 1: RSI Threshold Tuning**

```
Iteration 1: RSI > 70 → Win rate 30% (too many signals)
Iteration 2: RSI > 75 → Win rate 45% (better)
Iteration 3: RSI > 80 → Win rate 55% (good, but only 2 signals)
Iteration 4: RSI > 77 → Win rate 50%, 5 signals (optimal balance)
```

**Example 2: Timing Window Discovery**

```
Iteration 1: Cross anytime → Analysis shows:
  - Before 10:00 AM: 60% win rate
  - 10:00 AM - 2:00 PM: 35% win rate
  - After 2:00 PM: 25% win rate

Iteration 2: Cross before 10:00 AM only
→ Higher win rate, fewer signals but better quality
```

**Example 3: Volume Confirmation**

```
Iteration 1: Volume > 1.5× average
→ Analysis: Losses often had volume 1.5-2×, wins had volume > 3×

Iteration 2: Volume > 3× average
→ Fewer signals, but cleaner setups
```

---

#### Parameter Tracking Table

| Iteration | RSI Threshold | Volume Multiplier | Time Window | Signals | Win Rate | Sharpe |
|-----------|---------------|-------------------|-------------|---------|----------|--------|
| 1         | 70            | 1.5×              | Any         | 40      | 30%      | 0.2    |
| 2         | 75            | 1.5×              | Any         | 25      | 40%      | 0.6    |
| 3         | 75            | 2.0×              | Any         | 18      | 45%      | 0.9    |
| 4         | 75            | 2.0×              | < 10:00     | 12      | 55%      | 1.3    |
| 5         | 77            | 2.5×              | < 10:00     | 8       | 60%      | 1.6    |

**Insight:** Gradual tightening of criteria improved quality without over-restricting

---

### 4. Cost Management Strategies

**Question:** How do we keep API costs reasonable while learning?

#### Cost Breakdown per Iteration

**Current costs (observed from Iteration #11):**
- Scanner generation: ~4,800 input + 3,400 output = **8,200 tokens**
- Execution generation: ~4,000 input + 4,800 output = **8,800 tokens**
- Analysis: ~5,000 input + 3,000 output = **8,000 tokens**
- **Total per iteration: ~25,000 tokens**

**With 3 signals:**
- Script execution: CPU only (no API cost)
- **Cost per iteration: ~25K tokens ≈ $0.63 (Sonnet 3.5)**

**With 50 signals (broad scan):**
- Same script generation (25K tokens)
- More execution time (CPU), but no extra API cost
- **Cost per iteration: ~25K tokens ≈ $0.63** (same!)

**Key Insight:** Signal count doesn't affect API costs! Only affects compute time.

---

#### Cost Optimization Strategies

**Strategy 1: Use Haiku for Script Generation**

```
Current (Sonnet 3.5):
- Scanner: 8,200 tokens × $3/MTok = $0.025
- Execution: 8,800 tokens × $3/MTok = $0.026
- Analysis: 8,000 tokens × $15/MTok = $0.12
→ Total: $0.171 per iteration

With Haiku:
- Scanner: 8,200 tokens × $0.25/MTok = $0.002
- Execution: 8,800 tokens × $0.25/MTok = $0.002
- Analysis: 8,000 tokens × $1.25/MTok = $0.01
→ Total: $0.014 per iteration

Savings: 92% reduction ($0.171 → $0.014)
```

**Trade-off:** Haiku scripts may be lower quality (more errors)
**Recommendation:** Use Haiku for scanner/execution, keep Sonnet for analysis

---

**Strategy 2: Cache Execution Template**

```
Current: Regenerate execution script every iteration
Proposed: Generate once, reuse with parameter substitution

Iteration 1:
- Generate scanner: 8,200 tokens
- Generate execution: 8,800 tokens
- Analysis: 8,000 tokens
→ Total: 25,000 tokens

Iterations 2-10:
- Generate scanner: 8,200 tokens
- Reuse execution template: 0 tokens (just parameter swap)
- Analysis: 8,000 tokens
→ Total: 16,200 tokens per iteration

Total 10 iterations:
- Current: 25,000 × 10 = 250,000 tokens
- Cached: 25,000 + (16,200 × 9) = 170,800 tokens
→ Savings: 32% reduction
```

**Trade-off:** Can't evolve execution logic based on learnings
**Recommendation:** Only cache if execution logic is stable

---

**Strategy 3: Batch Iterations**

```
Instead of: Run 1 iteration → analyze → adjust → run next
Do: Run 5 iterations in parallel → analyze batch → adjust

Benefit: Reduce API calls for analysis (1 call for 5 iterations)
Cost: Can't adapt mid-batch
```

---

**Strategy 4: Limit Signal Count (Recommended)**

```
Scanner criteria should aim for:
- Iteration 1 (discovery): 30-50 signals (acceptable for one-time)
- Iterations 2-5 (validation): 10-20 signals
- Iterations 6+ (refinement): 5-10 signals

Why: More signals = more compute time (not API cost)
- 50 signals × 2 sec execution = 100 seconds
- 10 signals × 2 sec execution = 20 seconds
→ 5× faster iteration cycle
```

---

#### Recommended Cost Strategy

**Use all 4 strategies combined:**

1. **Haiku for scripts** (92% API cost reduction)
2. **Cache execution template** after Iteration 3 (once logic is stable)
3. **Limit signals** to 5-15 per iteration after discovery phase
4. **Manual batching**: Run 2-3 iterations before major analysis

**Projected Cost:**
- 10 iterations with Haiku + caching + limited signals
- ~15,000 tokens/iteration avg
- 150,000 tokens total ≈ **$0.40 for 10 iterations**

**Compare to current:**
- 10 iterations with Sonnet, no caching
- 25,000 tokens/iteration
- 250,000 tokens ≈ **$6.30 for 10 iterations**

**Savings: 94% cost reduction ($6.30 → $0.40)**

---

## Dual Learning Tracks: Scanner + Execution

**Key Insight:** With scanner owning entry criteria and execution owning exits, we have **two independent but complementary learning processes**.

### The Two Tracks

```
Scanner Learning Track:  "WHAT to trade" (entry criteria evolution)
Execution Learning Track: "HOW to trade it" (exit strategy evolution)
```

### How They Work Together

**Iteration Structure:**

```
Iteration N:
  ├─ Scanner generates signals (with current entry criteria)
  ├─ Execution trades ALL signals (with current exit strategy)
  ├─ Analysis separates entry quality from exit quality
  │  ├─ Scanner analysis: Which entry patterns led to wins?
  │  └─ Execution analysis: Which exits captured most profit?
  └─ Dual refinement for Iteration N+1
     ├─ Scanner: Tighten entry criteria based on winning patterns
     └─ Execution: Optimize exits based on trade management
```

### Scanner Learning (Entry Evolution)

**What It Learns:**
- Which patterns correlate with winning trades
- Optimal parameter thresholds (RSI, volume, timing)
- Signal quality vs quantity trade-offs

**Example Progression:**

```
Iteration 1:
Scanner: 3-day gain > 50%, RSI > 60, volume > 1.5×
→ 35 signals, 40% win rate

Analysis: "Winners averaged 120% gain (vs 65% for losers)"

Iteration 2:
Scanner: 3-day gain > 100%, RSI > 70, volume > 2×
→ 14 signals, 57% win rate ✅

Analysis: "Win rate improved, signal quality up"

Iteration 3:
Scanner: 3-day gain > 100%, RSI > 75, volume > 2.5×
→ 8 signals, 62% win rate ✅
```

**Guidance Focus:**
- Pattern identification
- Threshold optimization
- Signal filtering
- **NOT:** Exit strategy or trade management

---

### Execution Learning (Exit Evolution)

**What It Learns:**
- Optimal stop loss placement
- Take profit targets
- Trailing stop activation and width
- Time-based exit rules
- Indicator-based exit signals

**Example Progression:**

```
Iteration 1:
Execution: Stop 1.5%, Target 2.0%, Trailing 1.0%
→ Avg win +1.8%, Avg loss -1.5%

Analysis: "Trailing stops exit too early (avg +0.8% vs +2.0% potential)"

Iteration 2:
Execution: Stop 1.5%, Target 2.5%, Trailing 1.5%
→ Avg win +2.2%, Avg loss -1.5% ✅

Analysis: "Better profit capture, risk still controlled"

Iteration 3:
Execution: Stop 1.5%, Target 3.0%, Trailing 1.5%
→ Avg win +2.6%, Avg loss -1.5% ✅
```

**Guidance Focus:**
- Exit timing
- Risk/reward optimization
- Position management
- **NOT:** Entry criteria or signal generation

---

### Coordinated Analysis

**Analysis service separates concerns:**

```typescript
async analyzeResults(agent, backtestResults, scanResults, iteration) {
  return {
    summary: `Iteration ${iteration.number}: ${scanResults.length} signals → ${backtestResults.totalTrades} trades`,

    // SCANNER TRACK
    entry_quality: {
      signal_count: scanResults.length,
      win_rate: backtestResults.winRate,
      winning_patterns: this.analyzeWinningPatterns(scanResults, backtestResults),
      scanner_recommendations: [
        "Winning trades had avg RSI 76 (vs 68 for losers) → raise threshold to 75",
        "All wins occurred before 10 AM → add time filter"
      ]
    },

    // EXECUTION TRACK
    exit_quality: {
      avg_win: backtestResults.avgWin,
      avg_loss: backtestResults.avgLoss,
      profit_factor: backtestResults.profitFactor,
      exit_breakdown: this.analyzeExitReasons(backtestResults),
      execution_recommendations: [
        "Trailing stops working well (+2.0% avg) → maintain",
        "Take profit rarely hit (only 30% of wins) → consider widening to 3.5%"
      ]
    },

    // COMBINED STRATEGIC DIRECTION
    strategic_insights: [
      "Entry quality improved (40% → 57% win rate)",
      "Exit efficiency improved (+1.8% → +2.2% avg win)",
      "Combined profit factor: 1.2 → 1.8 ✅"
    ]
  };
}
```

---

### Separation of Concerns

**Scanner Prompt (Iteration N+1):**

```
Previous iteration entry quality:
- 14 signals generated, 57% win rate
- Winners had: RSI > 75, volume > 3×, cross before 10 AM
- Losers had: RSI 60-70, lower volume, afternoon crosses

ENTRY CRITERIA REFINEMENTS:
- Raise RSI threshold from 70 to 75
- Increase volume requirement from 2× to 2.5×
- Add time filter: signals before 10 AM only

Generate scanner with these refined entry criteria.
DO NOT include exit rules - execution handles that.
```

**Execution Prompt (Iteration N+1):**

```
Previous iteration exit performance:
- Stop loss: Hit on 43% of trades (appropriate)
- Take profit: Hit on 30% of trades (could be wider)
- Trailing stop: Hit on 38% of trades, avg +2.0% (working well)
- Winners averaged +2.2%, losers averaged -1.5%

EXIT STRATEGY REFINEMENTS:
- Widen take profit from 2.5% to 3.0%
- Maintain stop loss at 1.5%
- Maintain trailing stop at 1.5%

Generate execution script with refined exits.
IMPORTANT: Script MUST enter on ALL signals - no filtering.
```

---

### Adaptive Strategy Applied to Both Tracks

**Discovery Mode** (High signal count):

```
Scanner Focus:
→ "Too many signals - analyze winning patterns"
→ Tighten entry criteria aggressively
→ Goal: Reduce to 10-15 high-quality signals

Execution Focus:
→ "Wide variety of setups - use conservative exits"
→ Protect capital with tight stops
→ Don't over-optimize until entries are validated
```

**Refinement Mode** (Low signal count):

```
Scanner Focus:
→ "Good signal count - optimize thresholds"
→ Fine-tune parameters (RSI 70 vs 75 vs 77)
→ Maintain signal quality

Execution Focus:
→ "High-quality entries - can use wider exits"
→ Let winners run more
→ Optimize for profit capture, not just win rate
```

**Hybrid Mode** (Moderate signal count):

```
Scanner Focus:
→ "Balanced - refine based on quality metrics"
→ Adjust criteria if win rate < 45%

Execution Focus:
→ "Balanced risk management"
→ Standard optimization approach
```

---

### Example: Full Dual-Track Flow

**Iteration 1 Results:**
```
Scanner: 35 signals
Execution: 14 wins / 35 trades (40% win rate), +1.8% avg win
System classification: DISCOVERY MODE
```

**Iteration 2 Plan:**

**Scanner Task:**
```
Focus: Reduce signal count, improve quality
Action: Add RSI > 70, volume > 2×, time < 10 AM filters
Expected: 12-15 signals, 50%+ win rate
```

**Execution Task:**
```
Focus: Protect capital during discovery
Action: Keep stops conservative (1.5%), widen targets slightly (2.5%)
Expected: Maintain -1.5% avg loss, improve avg win
```

**Iteration 2 Results:**
```
Scanner: 14 signals
Execution: 8 wins / 14 trades (57% win rate), +2.2% avg win
System classification: HYBRID MODE
```

**Iteration 3 Plan:**

**Scanner Task:**
```
Focus: Validate current criteria are stable
Action: Test RSI 75 vs 70 (minor variation)
Expected: 10-12 signals, maintain 55%+ win rate
```

**Execution Task:**
```
Focus: Optimize for quality entries
Action: Widen trailing stops to capture more upside
Expected: +2.5%+ avg wins
```

---

### Key Principles

**1. Scanner Never Optimizes Exits**
- Scanner prompt includes overall win rate
- Includes which entry patterns worked
- **Excludes** exit reasons, profit targets, stop placement

**2. Execution Never Validates Entries**
- Execution prompt includes exit performance metrics
- Includes risk/reward analysis
- **Excludes** signal generation criteria

**3. Analysis Connects Them**
- Evaluates: Are we finding good opportunities? → Scanner feedback
- Evaluates: Are we managing them well? → Execution feedback
- Evaluates: Is combined system profitable? → Strategic direction

**4. Both Evolve Simultaneously**
- Scanner gets better at finding trades (40% → 57% win rate)
- Execution gets better at managing them (+1.8% → +2.2% avg win)
- Combined improvement is exponential (1.2 → 1.8 profit factor)

---

### Benefits of Dual-Track Learning

**1. Faster Convergence**
- Two independent optimization processes
- Scanner and execution improve in parallel
- Don't wait for one to perfect before optimizing the other

**2. Clear Attribution**
- Win rate degradation → Scanner problem (bad entries)
- Profit factor degradation → Execution problem (bad exits)
- Both degrading → Strategy fundamentally broken

**3. Reusable Components**
- Good execution strategy can be applied to different scanners
- Good scanner can be tested with multiple exit strategies
- Mix and match to find optimal combinations

**4. Easier Debugging**
- "Win rate is 60% but profit factor is 1.1" → Execution issue (exits too early)
- "Win rate is 30% but profit factor is 1.5" → Scanner issue (bad entries, lucky exits)

---

## Related Documents

**Companion Document:** [Learning Enhancements Implementation Plan](./2025-11-01-learning-enhancements-implementation-plan.md)

This companion document details:
- Priority 1: Execution Template Library (reusable exit strategies)
- Priority 2: Multiple Execution Scripts per Scan (test 5 exits per scan)
- Priority 3: Manual Guidance Between Iterations
- Priority 4: Grid Search for Parameters
- Priority 5: AI-Powered Execution Analysis

Expected impact: 92% cost reduction, 67% faster learning

---

## Implementation Roadmap

### Phase 1: Architecture Shift (Immediate)

**Goal:** Align scanner and execution responsibilities

**Tasks:**
1. Update Claude system prompts
   - Scanner: "Generate signals ONLY if all entry criteria are met"
   - Execution: "Always enter on signals. Focus on exits."

2. Modify scanner prompt template
   - Include RSI calculation instructions
   - Include momentum calculation
   - Include volume spike detection
   - Add data sufficiency checks

3. Simplify execution prompt template
   - Remove entry criteria validation
   - Keep only risk management logic
   - Make entry automatic

4. Update analysis prompts
   - Focus on scanner criteria effectiveness
   - Focus on exit strategy performance
   - Separate entry analysis from exit analysis

**Expected outcome:** Signal count ≈ trade count

---

### Phase 2: Discovery Iteration (Week 1)

**Goal:** Identify which scanner criteria have potential

**Iteration 1:**
- Broad scanner criteria (50%+ gain, any cross time)
- Run backtest
- Analyze which signals resulted in wins
- Document patterns in winning trades

**Metrics to track:**
- Win rate by 3-day gain threshold (50-100%, 100-200%, 200%+)
- Win rate by time of day (pre-market, morning, afternoon)
- Win rate by volume spike (1×, 2×, 3×, 5×)
- Win rate by RSI level (60-70, 70-80, 80+)

**Deliverable:** Hypothesis document for Phase 3

---

### Phase 3: Hypothesis Testing (Weeks 2-3)

**Goal:** Validate which criteria improve edge

**Iterations 2-5:**
- Apply tighter criteria based on Iteration 1 insights
- A/B test individual parameters (change one at a time)
- Track performance consistently

**Example progression:**
```
Iteration 2: Test "100%+ gain" threshold
Iteration 3: Test "RSI > 70" requirement
Iteration 4: Test "volume > 2×" requirement
Iteration 5: Test "cross before 10 AM" timing
```

**Deliverable:** Validated scanner criteria with statistical backing

---

### Phase 4: Refinement (Weeks 4-6)

**Goal:** Optimize parameters for best risk-adjusted returns

**Iterations 6-10:**
- Fine-tune thresholds (RSI 75 vs 77, volume 2× vs 2.5×)
- Test combinations of filters
- Validate consistency across time periods

**Deliverable:** Production-ready scanner criteria

---

### Phase 5: Continuous Learning (Ongoing)

**Goal:** Adapt to changing market conditions

**Iterations 11+:**
- Monitor performance degradation
- Detect regime changes
- Adjust criteria as needed
- Maintain edge through adaptation

---

## Decision Framework

### When to Tighten Scanner Criteria

**Tighten if:**
- Win rate < 40% across 10+ trades
- Many signals but few quality setups
- Analysis shows clear filter that separates winners from losers

**Don't tighten if:**
- Sample size < 10 trades (insufficient data)
- Win rate is acceptable but want "perfection"
- Only 1-2 losing trades in pattern

---

### When to Loosen Scanner Criteria

**Loosen if:**
- Signal count < 3 per iteration consistently
- Missing obvious opportunities
- Strategy has proven edge but insufficient volume

**Don't loosen if:**
- Win rate is already strong with current volume
- Trying to force more trades (quality > quantity)
- Just had one iteration with few signals

---

### When to Pivot Strategy Entirely

**Pivot if:**
- 5+ iterations with < 35% win rate
- No logical explanation for why pattern should work
- Statistical analysis shows no edge exists
- Market regime has fundamentally changed

**Don't pivot if:**
- Only 2-3 iterations tested
- Small sample size (< 15 trades total)
- Short-term drawdown (expected variance)

---

## Success Metrics

### After 10 Iterations, We Should See:

**Quantitative:**
- [ ] Win rate: 45-60% (for mean reversion strategy)
- [ ] Sharpe ratio: > 1.2
- [ ] Profit factor: > 1.5
- [ ] Signal count: 5-10 per iteration (quality over quantity)
- [ ] Sample size: 50+ total trades

**Qualitative:**
- [ ] Clear understanding of what criteria matter
- [ ] Documented logical basis for edge
- [ ] Consistent performance across different market conditions
- [ ] Execution always trades scanner signals (no misalignment)

**Cost:**
- [ ] Total API cost < $5 for 10 iterations
- [ ] Iteration cycle time < 5 minutes

---

## Risks & Mitigations

### Risk 1: Overfitting

**Risk:** Optimize scanner criteria to historical data, but strategy fails going forward

**Mitigation:**
- Require logical basis for all criteria (not just statistical fit)
- Test across multiple time periods (walk-forward)
- Use out-of-sample validation (reserve last 20% of data)
- Limit parameter count (Occam's razor - simpler is better)

### Risk 2: Insufficient Data

**Risk:** Make decisions based on small sample sizes (2-3 trades)

**Mitigation:**
- Minimum 10 trades before drawing conclusions
- Track confidence intervals on metrics
- Use Bayesian updating (incorporate prior beliefs)

### Risk 3: High Initial Costs

**Risk:** Broad discovery phase generates 50 signals × expensive analysis

**Mitigation:**
- Use Haiku for initial iterations
- Limit discovery to 1-2 iterations only
- Start with hypothesis-driven approach if budget constrained

### Risk 4: Scanner Too Complex

**Risk:** Adding too many criteria makes scanner slow/brittle

**Mitigation:**
- Limit to 3-5 key criteria maximum
- Each criterion must have clear impact on win rate
- Regular code reviews for performance

---

## Next Steps

1. **Review & Approve Strategy** (This Document)
   - Discuss approach: Hybrid (Option C) vs Hypothesis-driven (Option B)
   - Confirm cost optimization strategies
   - Agree on success metrics

2. **Update System Prompts** (1-2 hours)
   - Modify scanner prompt to include entry validation
   - Simplify execution prompt to focus on exits
   - Update analysis prompt for new architecture

3. **Run Discovery Iteration** (1 day)
   - Execute Iteration 1 with broad criteria
   - Analyze results to form hypothesis
   - Document patterns

4. **Begin Hypothesis Testing** (1-2 weeks)
   - Iterations 2-5 with focused criteria
   - Track parameter effectiveness
   - Validate edge

5. **Review Progress** (After Iteration 5)
   - Assess if edge exists
   - Decide: refine, pivot, or scale
   - Document learnings

---

**Document Owner:** AI Assistant + User
**Created:** 2025-11-01
**Last Updated:** 2025-11-01
**Status:** Draft - Awaiting Approval
