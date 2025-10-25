# Pattern-Aware Scanner + Multi-Strategy Testing Feature

**Date:** 2025-10-25
**Status:** Planned (Not Implemented)

## Overview

Build an intelligent system that:
1. Understands trading patterns conceptually (e.g., "capitulatory reversals")
2. Finds the best opportunities in BOTH directions (long and short)
3. Scores setups based on quality (A+, A, B, C tiers)
4. Tests multiple strategy variants side-by-side
5. Shows comparative results to identify optimal approaches

## Key Insights

### Pattern Intelligence
Instead of literal query matching, the scanner interprets patterns:
- **"Find capitulatory reversals"** → Generates TWO scans:
  - **Long side:** Extreme selloffs (down 40%, RSI <20, high volume)
  - **Short side:** Parabolic rallies (up 300%, now -20% from peak)
- Returns top N setups regardless of direction, ranked by quality score

### Signal Scoring (0-100 points)

**For LONG setups (oversold reversals):**
- Selloff extremity (0-50 pts): consecutive down days, % from high, RSI
- Volume characteristics (0-50 pts): volume spike, climax patterns

**For SHORT setups (parabolic exhaustion):**
- Rally extremity (0-50 pts): % gain, consecutive up days, RSI
- Exhaustion signals (0-50 pts): volume spike on pullback, distance from peak

**Tier Mapping:**
- A+: 90-100 points → 5x position size
- A: 75-89 points → 3x position size
- B: 60-74 points → 1x position size
- C: <60 points → 0.5x or skip

### Strategy Variant Testing

Test multiple approaches on the same scanned setups:

**Example Variants:**
1. **Baseline:** Buy/short at close, hold 5 days
2. **Fixed R/R:** Entry at close, exit at 2:1 R/R or 7% stop
3. **Intraday Entry + Trail:** Wait for bounce/rejection confirmation, trail with 20-SMA
4. **Scale Out:** Take 50% at 2:1, trail remaining 50%

**Comparative Output:**
```
Strategy Comparison Results
===========================
Pattern: capitulatory reversals
Setups: 30 total (12 LONG, 18 SHORT)

Strategy          | Win%  | Avg R/R | Total Return | A+ Win% | Long Win% | Short Win%
------------------|-------|---------|--------------|---------|-----------|------------
Baseline          | 55%   | 1.2:1   | +270%        | 75%     | 60%       | 52%
Fixed R/R         | 48%   | 1.8:1   | +310%        | 80%     | 55%       | 44%
Intraday + Trail  | 62%   | 1.5:1   | +420%        | 88%     | 65%       | 60%
Scale Out         | 60%   | 1.9:1   | +380%        | 90%     | 68%       | 56%

🏆 Best Win Rate: Intraday + Trail (62%)
🏆 Best Avg R/R: Scale Out (1.9:1)
🏆 Best A+ Win Rate: Scale Out (90%)
```

## Implementation Architecture

### Backend Components

1. **Signal Scoring Service** (`src/services/signal-scoring.service.ts`)
   - `scoreSetup(ticker, date, direction, metrics)` → score + tier
   - Pattern-specific scoring logic
   - Returns breakdown of score components

2. **Enhanced Scanner Service** (`src/services/scanner.service.ts`)
   - `interpretPatternQuery(query)` → array of scan configs with directions
   - Uses Claude to understand high-level patterns
   - Returns both long and short opportunity criteria

3. **Multi-Strategy Portfolio Service** (`src/services/portfolio-backtest.service.ts`)
   - `scanAndCompareStrategies(patternQuery, strategyVariants, universe, sampleSize)`
   - Workflow:
     1. Interpret pattern → get long + short scans
     2. Run both scans, score all results
     3. Combine and rank top N by score
     4. For each strategy variant:
        - Generate scripts (direction-aware, intraday/daily)
        - Execute backtests
        - Aggregate metrics
     5. Return comparative analysis

4. **Direction-Aware Script Generation** (`src/services/claude.service.ts`)
   - `generateDailyBacktestScript(ticker, date, prompt, direction)`
   - `generateIntradayBacktestScript(ticker, date, prompt, direction)` (new)
   - Generates appropriate buy/cover logic based on direction

5. **Types** (`src/types/portfolio-backtest.types.ts`)
   ```typescript
   interface StrategyVariant {
     name: string;
     entryPrompt: string;
     exitPrompt: string;
     useIntraday: boolean;
   }

   interface ScoredSetup {
     ticker: string;
     date: string;
     direction: 'LONG' | 'SHORT';
     score: number;
     tier: 'A+' | 'A' | 'B' | 'C';
     scoreBreakdown: object;
   }

   interface StrategyComparisonResult {
     patternQuery: string;
     scoredSetups: ScoredSetup[];
     strategyResults: Array<{
       variantName: string;
       portfolioMetrics: PortfolioMetrics;
       tierBreakdown: object;
       directionBreakdown: object;
     }>;
     comparison: {
       bestWinRate: object;
       bestAvgRR: object;
       bestTotalReturn: object;
     };
   }
   ```

6. **API Route** (`src/api/routes/portfolio-backtests.ts`)
   - `POST /api/portfolio-backtests/compare-strategies`
   - Accepts: `{ patternQuery, strategyVariants, universe, sampleSize }`

7. **Database** (`src/database/schema.sql`)
   - Update `portfolio_backtests` table:
     - `pattern_query` TEXT
     - `strategy_variants` TEXT (JSON)
     - `tier_breakdown` TEXT (JSON)
     - `direction_breakdown` TEXT (JSON)

### Frontend Components

1. **Scanner Component** (`frontend/src/components/Scanner.tsx`)
   - **Remove:** "Backfill Data" button
   - **Add:** "Scan & Backtest" button next to "Scan"
   - **Add:** Strategy configuration modal:
     - Add/remove variants dynamically
     - Per-variant: name, entry prompt, exit prompt, intraday toggle
   - **Add:** Comparison results display:
     - Side-by-side metrics table
     - Tier breakdown charts
     - Direction breakdown
     - Expandable individual trade details

2. **Scanner API** (`frontend/src/services/scannerApi.ts`)
   - Add `scanAndBacktest(patternQuery, strategyVariants, universe, sampleSize)`
   - Add types for StrategyVariant and StrategyComparisonResult

## Example User Flow

1. **User enters pattern:** "capitulatory reversals"
2. **Clicks "Scan & Backtest"**
3. **Modal opens** with pre-configured strategy variants:
   - Baseline (5-day hold)
   - Intraday + R/R (bounce entry, 2:1 exit)
   - Trailing Stop (SMA trail)
4. **User configures:** Sample size 30, universe Russell 2000
5. **Backend processes:**
   - Claude interprets pattern → long oversold + short exhaustion
   - Scanner finds 50 total setups (22 long, 28 short)
   - Scores all 50, selects top 30 by score
   - Runs 90 backtests (30 setups × 3 variants)
   - Aggregates results by variant/tier/direction
6. **Results display:** Comparison table showing which strategy works best

## Benefits

1. **Pattern Intelligence:** Think in trading concepts, not rigid criteria
2. **Direction Agnostic:** Captures best opportunities regardless of long/short
3. **Quality Scoring:** Focus capital on highest-quality setups (A+ tier)
4. **Data-Driven Optimization:** See exactly which entry/exit approach works best
5. **Fast Iteration:** Test multiple strategies simultaneously

## Example Use Cases

### Use Case 1: Capitulation Reversals
- **Pattern:** Extreme selloffs and parabolic exhaustion
- **Variants:** Test different entry timing and exit methods
- **Goal:** Find optimal approach for mean reversion trades

### Use Case 2: Breakout Strategies
- **Pattern:** "Strong breakouts with volume confirmation"
- **Variants:** Test immediate entry vs pullback entry vs volume spike confirmation
- **Goal:** Optimize breakout capture rate vs false breakout avoidance

### Use Case 3: Earnings Plays
- **Pattern:** "Stocks beating earnings with strong guidance"
- **Variants:** Test hold durations (1 day, 3 days, 5 days) and exit methods
- **Goal:** Maximize post-earnings momentum capture

## Technical Considerations

### Performance
- 30 stocks × 3 variants = 90 script generations + executions
- Estimated time: ~5-10 minutes
- Could parallelize script execution for better performance

### Claude API Usage
- Pattern interpretation: 1 API call
- Script generation: 90 API calls (can batch)
- Consider caching pattern interpretations

### Data Requirements
- Requires both daily_metrics (for daily strategies) and ohlcv_data (for intraday)
- May need to ensure sufficient data backfill

### UI/UX
- Long-running operation needs progress indicators
- Consider WebSocket for real-time progress updates
- Results table can get large - need good filtering/sorting

## Future Enhancements

1. **Saved Strategy Variants:** Save favorite variants for reuse
2. **Parameter Optimization:** Auto-test ranges (e.g., R/R from 1.5:1 to 3:1)
3. **Pattern Library:** Pre-built pattern interpretations
4. **Position Sizing Integration:** Actually apply tier-based sizing in backtests
5. **Risk Metrics:** Add Sharpe ratio, max drawdown, win streak analysis
6. **Export Results:** CSV export of all trades for external analysis

## Why Not Implementing Now

This is a powerful feature but adds significant complexity:
- Multiple new services and type definitions
- Extensive frontend UI work
- Long execution times
- Potential for confusing UX if not done carefully

Better to:
1. Keep the basic scanner→backtest workflow simple for now
2. Validate the core concept works
3. Gather user feedback on what comparisons matter most
4. Implement incrementally based on actual usage patterns
