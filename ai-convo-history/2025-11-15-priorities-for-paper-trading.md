# Priorities for Paper Trading Graduation (Next Week)
**Date:** 2025-11-15
**Goal:** Find strategies ready for paper trading in ~1 week

## Current State Assessment

### ✅ What's Working
- **Lookahead bias prevention** - Architecturally sound, prevents cheating
- **Real-time simulation** - Realistic bar-by-bar processing
- **Performance optimization** - Fast enough to iterate (5-10x speedup)
- **Signal direction fix** - Trades execute correctly (LONG/SHORT)
- **Basic iteration system** - Can generate and test strategies

### ⚠️ What's Incomplete
- **Walk-forward analysis** - Not actually doing it (generating new strategy per period)
- **Statistical significance** - Implemented but not validated
- **Out-of-sample validation** - Not properly implemented
- **Graduation criteria** - Unclear what makes a strategy "good enough"

### ❌ Critical Gaps
- **Not enough data** - Only 67 trading days (Aug-Nov 2025)
- **Not enough trades** - 19 trades is too small for confidence
- **No proper validation** - Strategies tested on same data they're developed on
- **No clear graduation path** - Don't know which strategies to promote

## The Real Problem

**We're generating strategies, but we don't know if they have real edge.**

To find strategies ready for paper trading, we need:
1. **Statistical confidence** - Is this real edge or luck?
2. **Out-of-sample validation** - Does it work on unseen data?
3. **Enough sample size** - 100+ trades minimum
4. **Clear graduation criteria** - What makes a strategy "good enough"?

## Recommended Priorities (Next Week)

### Priority 1: Backfill 2024 Data (CRITICAL - Do First) 🔴
**Why:** We only have 67 trading days. Need 12+ months for proper validation.

**Action:**
```bash
npx ts-node backend/scripts/backfill-2024-data.ts
```

**Impact:**
- Enables proper out-of-sample testing (train on 2024, test on 2025)
- More data = more trades = statistical significance
- Can test strategies across different market conditions

**Time:** 2-4 hours (runs in background, can do other work)

### Priority 2: Implement Simple Out-of-Sample Validation (HIGH) 🟠
**Why:** Current "walk-forward" generates new strategy per period. Need to test ONE strategy on unseen data.

**What to do:**
- Generate strategy ONCE on 2024 data
- Test that SAME strategy on 2025 data (out-of-sample)
- This is simpler than walk-forward but still prevents overfitting

**Implementation:**
- Modify walk-forward to generate strategy once
- Test same strategy across all test periods
- Aggregate results

**Time:** 2-3 hours

### Priority 3: Set Graduation Criteria (HIGH) 🟠
**Why:** Need to know what makes a strategy "good enough" for paper trading.

**Suggested Criteria:**
```typescript
interface GraduationCriteria {
  minTrades: 100;              // Need statistical significance
  minWinRate: 0.55;            // 55% win rate minimum
  minSharpeRatio: 1.5;         // Risk-adjusted returns
  minProfitFactor: 1.5;        // Winners > losers
  maxDrawdown: 0.20;           // Max 20% drawdown
  outOfSampleReturn: 0.10;     // 10%+ return on test data
  consistency: 0.70;            // 70%+ of periods positive
  statisticalSignificance: true; // p < 0.05
}
```

**Time:** 1 hour (define criteria, implement check)

### Priority 4: Run Multiple Iterations (MEDIUM) 🟡
**Why:** Need to generate many strategies to find good ones.

**Action:**
- Run 10-20 iterations on different agents
- Each iteration generates a new strategy
- Test all strategies on out-of-sample data
- Rank by graduation criteria

**Time:** 10-20 iterations × 30-60 min each = 5-20 hours (can parallelize)

### Priority 5: Focus on High-Volume Strategies (MEDIUM) 🟡
**Why:** Need 100+ trades for statistical significance. Current strategies only generate 19 trades.

**What to do:**
- Modify scanner prompts to find more opportunities
- Test on larger universes (more tickers)
- Remove overly restrictive filters
- Focus on strategies that generate 100+ signals

**Time:** 2-3 hours (tune prompts, test)

### Priority 6: Statistical Significance Validation (LOW) 🟢
**Why:** Already implemented, just need to validate it works.

**Action:**
- Test statistical significance calculations
- Verify p-values are reasonable
- Check confidence intervals

**Time:** 1 hour

## Recommended Action Plan (Next Week)

### Day 1-2: Foundation
1. **Backfill 2024 data** (Priority 1) - Start immediately, runs in background
2. **Implement out-of-sample validation** (Priority 2) - While data backfills
3. **Set graduation criteria** (Priority 3) - Quick win

### Day 3-5: Strategy Generation
4. **Run 10-20 iterations** (Priority 4) - Generate many strategies
5. **Focus on high-volume strategies** (Priority 5) - Tune for more trades
6. **Test all strategies on out-of-sample data** - Use 2025 data

### Day 6-7: Selection & Preparation
7. **Rank strategies by graduation criteria** - Find best candidates
8. **Review top strategies manually** - Check for edge cases
9. **Prepare for paper trading** - Set up monitoring, risk limits

## Success Metrics

**By end of week, we should have:**
- ✅ 3-5 strategies that meet graduation criteria
- ✅ Each strategy has 100+ trades on out-of-sample data
- ✅ Statistical significance (p < 0.05)
- ✅ Clear performance metrics (Sharpe > 1.5, win rate > 55%, etc.)
- ✅ Strategies ready for paper trading deployment

## What NOT to Prioritize (This Week)

❌ **True walk-forward with parameter optimization** - Too complex, not needed
❌ **Advanced statistical tests** - Basic significance is enough
❌ **UI improvements** - Can use API/CLI for now
❌ **Performance optimizations** - Already fast enough
❌ **Complex feature additions** - Focus on validation

## Key Insight

**The bottleneck is not the system - it's validation.**

We can generate strategies quickly. What we need is:
1. **More data** (2024 backfill)
2. **Proper validation** (out-of-sample testing)
3. **Clear criteria** (what makes a strategy good)

Once we have these, we can generate many strategies and find the good ones.

## Next Steps

1. **Start 2024 data backfill** (immediately)
2. **Implement simple out-of-sample validation** (today)
3. **Set graduation criteria** (today)
4. **Run iterations** (rest of week)

