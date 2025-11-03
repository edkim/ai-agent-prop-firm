# Pattern Resolution Validation - 5-Min vs 1-Min Comparison

**Date**: 2025-11-03
**Objective**: Validate if patterns learned at 5-minute resolution work at 1-minute resolution for real-time trading

---

## Summary

Completed comprehensive validation testing two different pattern types at 5-min vs 1-min bar resolution:

1. ✅ **VWAP Mean Reversion** - Successfully translates to 1-min (12x more signals)
2. ❌ **Parabolic Exhaustion** - Does not translate to 1-min (0 signals, needs longer history)

---

## Key Findings

### Pattern Type Matters

Not all patterns benefit from higher-frequency data:

| Pattern Type | Time Horizon | 5-Min → 1-Min | Recommendation |
|--------------|--------------|---------------|----------------|
| **VWAP Mean Reversion** | Intraday (<1 day) | ✅ Success (2 → 26 signals) | Use 1-min for real-time |
| **Parabolic Exhaustion** | Multi-day (2 years) | ❌ Failed (0 signals) | Keep 5-min resolution |

### General Rule

**Intraday technical patterns** (VWAP, ORB, micro-reversals) → **Benefit from 1-min resolution**

**Multi-day fundamental patterns** (breakouts, exhaustion, swing setups) → **Work fine at 5-min resolution**

---

## Validation Results: VWAP Mean Reversion

### Signal Comparison
- **5-min**: 2 signals across 2 tickers
- **1-min**: 26 signals across 8 tickers
- **Difference**: +1200% signals, +300% ticker coverage

### Pattern Quality
| Metric | 5-Min | 1-Min | Change |
|--------|-------|-------|--------|
| Pattern Strength | 91.0 | 85.8 | −5.7% |
| VWAP Deviation | 1.64% | 1.84% | +0.20% |
| Volume Ratio | 2.50x | 2.23x | −10.8% |

**Result**: Quality remains high across both resolutions ✅

### Why More Signals at 1-Min?
1. **78 bars vs 15 bars** during 10:00-14:00 trading window
2. **Mean reversion is continuous** - prices oscillate around VWAP all day
3. **5-min bars smooth out** many micro-reversions that complete within single bars
4. **More precision** in detecting exact rejection moments

---

## Files Created

### Infrastructure
1. `/backend/helper-scripts/backfill-tech-sector-1min.ts`
   - Backfilled 613,135 1-min bars for 62 tech tickers (30 days)

### Validation Scripts
2. `/backend/helper-scripts/validate-pattern-resolution.ts`
   - Parabolic exhaustion comparison (failed - time period mismatch)

3. `/backend/helper-scripts/validate-vwap-resolution.ts`
   - VWAP mean reversion comparison (success)

### Agents
4. Created VWAP Mean Reversion Trader agent via API
   - Agent ID: `d992e829-27d9-406d-b771-8e3789645a5e`
   - Iteration 1: 500 signals, 80% win rate, 11.23 Sharpe

### Documentation
5. `/private/tmp/2025-11-03-pattern-validation-results.md`
   - Initial parabolic exhaustion validation (discovered time period issue)

6. `/private/tmp/2025-11-03-vwap-pattern-validation.md`
   - Comprehensive VWAP validation results and recommendations

7. `/vwap-validation-results.json`
   - Detailed signal data for both resolutions

---

## Recommendations

### For Real-Time Trading (Phase 2)

#### ✅ VWAP Mean Reversion
- **Use 1-min bars** for pattern detection
- Deploy for paper trading immediately
- Expected: 26+ signals per 20-day period on 62 tech stocks
- Pattern quality: 85+ strength score

#### ⚠️ Parabolic Exhaustion
- **Keep 5-min bars** (no benefit from 1-min)
- Alternative: Backfill 2 years of 1-min data for proper validation (~43M bars)
- Or: Build history organically with daily 1-min backfill

### Pattern Classification Framework

Before deploying any pattern to real-time:

1. **Classify Pattern Type**
   - Intraday technical → Test at 1-min
   - Multi-day fundamental → Use 5-min

2. **Validate at Target Resolution**
   - Run comparison script (5-min vs 1-min)
   - Check signal count and quality metrics
   - Document results

3. **Make Deployment Decision**
   - If quality preserved + more signals → Use 1-min
   - If no improvement or quality drops → Use 5-min

---

## Lessons Learned

### Universe Consistency is Critical
- Initial parabolic validation compared 2,013 tickers vs 62 tickers ❌
- Fixed by restricting both scans to same 62-ticker universe ✅

### Time Period Alignment Matters
- Parabolic pattern needed 2 years of history
- Only had 30 days of 1-min data
- Comparison was invalid even with correct universe

### Pattern Characteristics Determine Resolution Benefit
- High-frequency patterns (mean reversion) → Benefit from 1-min
- Low-frequency patterns (parabolic moves) → No benefit from 1-min

---

## Next Steps

1. **Immediate**: Paper trade VWAP pattern at 1-min resolution
2. **Near-term**: Test other patterns (ORB, gaps, breakouts) at 1-min
3. **Long-term**: Build automated resolution validation into learning pipeline
4. **Infrastructure**: Set up daily 1-min backfill cron job

---

## Technical Details

### Data Summary
- **Database**: `/Users/edwardkim/Code/ai-backtest/backtesting.db`
- **1-Min Bars**: 613,135 (62 tickers, 30 days)
- **Date Range**: 2025-10-04 to 2025-11-03
- **Scan Period**: 2025-10-14 to 2025-11-02 (20 trading days)

### Pattern Criteria (VWAP)
- Deviation from VWAP: 1.5-4%
- Volume confirmation: 1.3x+ average
- Rejection candles: >50% wick ratio
- Price range: $10-$100
- Trading window: 10:00-14:00 ET

---

**Status**: ✅ Validation Complete
**Outcome**: VWAP pattern approved for 1-min real-time deployment
