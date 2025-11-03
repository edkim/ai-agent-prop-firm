# Pattern Resolution Validation Results
**Date**: 2025-11-03
**Pattern**: Iteration 22 Parabolic Exhaustion
**Objective**: Validate if patterns learned at 5-min resolution work at 1-min resolution

## Summary

The validation reveals that **iteration 22's parabolic exhaustion pattern does NOT translate directly to 1-minute resolution** with current criteria.

## Data Infrastructure

✅ **1-Minute Data Backfill Complete**
- 613,135 bars across 62 tickers
- 30-day history (Oct 4 - Nov 3, 2025)
- ~950 bars per ticker per day
- Database: `/Users/edwardkim/Code/ai-backtest/backtesting.db`

## Validation Results

### 5-Minute Resolution (Baseline)
- **Signals Found**: 429
- **Unique Tickers**: 8
- **Parabolic Moves**: 22
- **Pattern Strength**: 80.8 avg
- **Distance from High**: 16.31% avg
- **Volume Ratio**: 3.09x avg

### 1-Minute Resolution
- **Signals Found**: 0
- **Unique Tickers**: 0
- **Parabolic Moves**: 44 (2x more than 5-min)
- **Pattern Strength**: N/A
- **Distance from High**: N/A
- **Volume Ratio**: N/A

## Key Findings

### 1. More Parabolic Moves at Higher Resolution
- 5-min: 22 parabolic moves
- 1-min: 44 parabolic moves (100% increase)

**Interpretation**: Higher time resolution captures more granular price movements, detecting additional parabolic moves that were smoothed out in 5-min bars.

### 2. Zero Exhaustion Signals at 1-Min
Despite finding 2x more parabolic moves, **zero exhaustion signals** were detected at 1-min resolution.

**Possible Reasons**:
1. **Volume Pattern Differences**: 1-min average volume behaves differently than 5-min average volume
2. **Timing Mismatch**: Parabolic moves may have occurred outside our 1-min data window (before Oct 4)
3. **Criteria Too Strict**: The 5%+ pullback + 1.5x volume requirement may be too strict at 1-min granularity
4. **Data Sparsity**: Not all tickers have complete 1-min data for the parabolic move dates

### 3. Pattern Adaptation Required
The current exhaustion detection criteria were optimized for 5-min bars and don't directly transfer to 1-min bars without adjustment.

## Implications for Real-Time Trading

### ⚠️ Critical Insight
**Patterns learned at 5-min resolution may not be suitable for 1-min real-time execution without re-optimization.**

This validates the importance of Phase 1 (Infrastructure) in the roadmap:
- Testing at target frequency BEFORE deploying to live trading
- Patterns need frequency-specific tuning
- Cannot assume 5-min patterns work at 1-min

## Next Steps

### Option A: Adjust 1-Min Criteria (Recommended for Real-Time)
1. Relax pullback requirement (5% → 3%)
2. Lower volume threshold (1.5x → 1.2x)
3. Use shorter RSI period (14 → 7 bars)
4. Run validation again

### Option B: Continue with 5-Min for Live Trading
1. Keep patterns at 5-min resolution
2. Accept slightly delayed entries
3. Focus on pattern quality over entry precision

### Option C: Learn 1-Min Patterns from Scratch
1. Run new learning iterations with 1-min data
2. Let agent discover 1-min-specific patterns
3. Compare performance metrics

## Files Created

1. **Backfill Script**: `/backend/helper-scripts/backfill-tech-sector-1min.ts`
2. **Validation Script**: `/backend/helper-scripts/validate-pattern-resolution.ts`
3. **Results JSON**: `/pattern-validation-results.json`
4. **This Document**: `/private/tmp/2025-11-03-pattern-validation-results.md`

## Recommendation

**For Phase 2 (Real-Time Pipeline)**:
- Start with 5-min bars for initial paper trading
- Collect 1-min tick data in parallel
- Run Option C (learn 1-min patterns from scratch) during paper trading phase
- Compare 5-min vs 1-min performance before going live

**Why**: Better to have reliable 5-min signals than unreliable 1-min signals. Quality > Speed for initial deployment.

---

## Technical Details

**Scan Period**: 2025-10-04 to 2025-11-03 (30 days)
**Parabolic Definition**: 100%+ gain in ≤5 days
**Exhaustion Criteria**:
- 5-25% pullback from intraday high
- 1.5x+ volume vs day average
- RSI-14 calculated on timeframe bars

**Data Quality**:
- 5-min: Complete data for all tickers
- 1-min: 62/65 tickers (ANSS, FISV, PARA missing)

