# High-Tight Flag / Holy Grail Scanner Implementation Plan

**Date:** 2025-10-28
**Strategy:** High-Tight Flag (Daily Chart) / Holy Grail (Intraday Chart)
**Status:** Implementation in Progress

## Strategy Overview

This scanner identifies stocks exhibiting a classic continuation pattern characterized by:

1. **Sharp Rally Phase:** Strong upward movement with expanding volume
2. **Tight Consolidation Phase:** Narrow range price action after the rally (flag pattern)
3. **Breakout Setup:** Position at or near the consolidation highs with volume building

### Dual-Timeframe Analysis

- **Daily Chart (High-Tight Flag):** Identifies the overall pattern - rally followed by consolidation
- **Intraday Chart (Holy Grail):** Validates the setup with 5-minute bar micro-patterns showing tight consolidation and potential breakout

## Implementation Approach

### Phase 1: Daily Chart Scanner (High-Tight Flag)

**Data Source:** `daily_metrics` table

**Detection Criteria:**
- **Rally Phase:**
  - Lookback periods: Flexible (5, 10, or 20 days)
  - Minimum gain: 30%+ (configurable: 30%, 50%, 100%)
  - Volume expansion: 1.5x+ average volume during rally
  - Consecutive up days as bonus scoring factor

- **Consolidation Phase:**
  - Duration: 2-7 days of tight range action
  - Range tightness options:
    - Standard: Daily high-low < 5%
    - Tight: Daily high-low < 3%
    - Very tight: Daily high-low < 2%
  - Volume contraction: Below average volume
  - Pattern type: Descending or horizontal flag

- **Current Position:**
  - Within 5% of consolidation highs
  - Not breaking down below consolidation lows
  - Recent bars showing compression

**Scoring Factors (0-100):**
- Rally strength: Gain % relative to threshold (30% baseline)
- Volume expansion during rally: Volume ratio vs average
- Consolidation tightness: Inverse of range %
- Consolidation duration: Optimal 3-5 days (too short or long scores lower)
- Position quality: Proximity to breakout point
- Consecutive up days: Bonus for strong momentum

### Phase 2: Intraday Validation (Holy Grail)

**Data Source:** `ohlcv_data` table with `timeframe='5min'` (optionally `'1min'`)

**Detection Criteria:**
- **Micro-Consolidation:**
  - Tight range within the daily consolidation
  - 5-min bars staying within 1-2% range
  - Duration: 10+ bars (50+ minutes)
  - Highs and lows converging

- **Volume Characteristics:**
  - Lower volume during micro-consolidation
  - Volume building on recent bars
  - Volume surge on breakout confirmation

- **Breakout Setup:**
  - Current price within 0.5% of micro-range high
  - Recent bars showing higher lows
  - Time-of-day consideration (avoid first 15 minutes)

**Intraday Scoring (0-100):**
- Range tightness: Tighter = higher score
- Volume pattern: Clear surge = bonus
- Position: Closer to breakout = higher score
- Bar pattern: Higher lows = trend strength
- Time of day: Optimal timing bonus

**Combined Score:**
```
final_score = (daily_score * 0.6) + (intraday_score * 0.4)
```

## Scanner Output Format

```json
{
  "ticker": "ABCD",
  "date": "2024-01-15",
  "pattern_strength": 85,
  "setup_quality": "A",
  "daily_pattern": {
    "rally_days": 10,
    "rally_gain_pct": 45.2,
    "rally_start_date": "2024-01-01",
    "rally_end_date": "2024-01-10",
    "consolidation_days": 5,
    "consolidation_range_pct": 2.8,
    "consolidation_start": 28.50,
    "consolidation_high": 29.20,
    "consolidation_low": 28.40,
    "current_price": 29.05,
    "distance_from_high_pct": 0.5,
    "volume_ratio_on_rally": 2.3,
    "volume_ratio_in_consolidation": 0.6,
    "consecutive_up_days": 7
  },
  "intraday_pattern": {
    "timeframe": "5min",
    "consolidation_bars": 48,
    "micro_range_pct": 1.2,
    "micro_range_high": 29.15,
    "micro_range_low": 28.80,
    "current_5min_price": 29.10,
    "recent_volume_surge": true,
    "avg_volume_5min": 12500,
    "recent_volume_5min": 28000,
    "higher_lows_count": 6,
    "time_of_day": "10:45"
  },
  "notes": "Strong HTF on daily (45% rally, 2.8% consolidation range). Tight Holy Grail on 5-min with volume building. Setup within 0.5% of breakout."
}
```

## Setup Quality Tiers

- **A+ (90-100):** Textbook setup, all criteria optimal
- **A (80-89):** Strong setup, minor imperfections
- **B (70-79):** Good setup, some criteria not optimal
- **C (60-69):** Acceptable setup, several compromises

## Implementation Steps

### Step 1: Documentation ✅
- [x] Create implementation plan (this document)
- [ ] Create detailed scanner prompt

### Step 2: Daily Scanner Development
- [ ] Write natural language query for daily HTF pattern
- [ ] Test scanner generation via Claude
- [ ] Validate results against known examples
- [ ] Iterate on scoring logic

### Step 3: Intraday Enhancement
- [ ] Extend scanner to query 5-min intraday data
- [ ] Implement Holy Grail micro-pattern detection
- [ ] Add intraday scoring logic
- [ ] Combine daily + intraday scores

### Step 4: Testing & Validation
- [ ] Run against Russell 2000 universe
- [ ] Compare daily-only vs daily+intraday results
- [ ] Validate pattern strength rankings
- [ ] Document typical match counts

### Step 5: Documentation & Examples
- [ ] Document usage instructions
- [ ] Provide example natural language queries
- [ ] Show sample results with annotations
- [ ] Integration with batch backtest workflow

## Example Natural Language Queries

### Basic Query (Daily Only)
```
Find High-Tight Flag setups: stocks that rallied 30%+ over 5-20 days with volume expansion,
then consolidated in a tight range (<5% daily movement) for 2-7 days.
Current price should be within 5% of consolidation highs.
```

### Advanced Query (Daily + Intraday)
```
Find High-Tight Flag / Holy Grail setups: stocks that rallied 30%+ over 5-20 days with
volume expansion, then consolidated in a tight range (<5% daily movement) for 2-7 days.
On the intraday 5-minute chart, look for micro-consolidation patterns (Holy Grail) near
the highs with building volume. Score setups based on rally strength, consolidation
tightness, volume patterns, and proximity to breakout.
```

### Aggressive Query (Higher Thresholds)
```
Find explosive High-Tight Flag setups: stocks that doubled (100%+ gain) over 10-20 days
with 2x+ volume, then consolidated in a very tight range (<3% daily movement) for 3-5 days.
Must be within 2% of consolidation highs. Use 5-min intraday data to confirm tight
micro-consolidation with recent volume surge.
```

### Flexible Query (Multiple Variations)
```
Find High-Tight Flag variations across multiple timeframes: scan for stocks with rallies
ranging from 30%-100% over 5-20 day periods, followed by consolidations with ranges from
2%-5%. Score each setup based on rally strength, tightness, volume characteristics, and
intraday Holy Grail pattern quality. Return top 50 matches ranked by combined score.
```

## Technical Implementation Notes

### Database Queries

**Daily Pattern Detection:**
```sql
-- Find candidates with recent strong rallies
SELECT
  ticker,
  date,
  close,
  change_percent,
  volume_ratio,
  consecutive_up_days
FROM daily_metrics
WHERE
  date >= ?
  AND date <= ?
  -- Recent consolidation (last 7 days)
  AND ticker IN (
    SELECT ticker
    FROM daily_metrics
    WHERE date >= date(?, '-7 days')
    GROUP BY ticker
    HAVING AVG(ABS(change_percent)) < 5  -- Tight daily ranges
  )
  -- Prior rally
  AND ticker IN (
    SELECT ticker
    FROM (
      SELECT
        ticker,
        date,
        close,
        LAG(close, 10) OVER (PARTITION BY ticker ORDER BY date) as close_10d_ago
      FROM daily_metrics
    )
    WHERE
      (close - close_10d_ago) / close_10d_ago > 0.30  -- 30%+ gain over 10 days
  )
ORDER BY pattern_strength DESC
LIMIT 100;
```

**Intraday Pattern Detection:**
```sql
-- Fetch 5-min bars for candidates
SELECT
  timestamp,
  open,
  high,
  low,
  close,
  volume
FROM ohlcv_data
WHERE
  ticker = ?
  AND timeframe = '5min'
  AND timestamp >= ?  -- Last 5-7 trading days
  AND timestamp <= ?
ORDER BY timestamp ASC;
```

### Scoring Algorithm Pseudocode

```typescript
function calculatePatternStrength(daily, intraday): number {
  // Daily score (0-100)
  const rallyScore = Math.min(100, (daily.rallyGainPct / 30) * 50);
  const volumeScore = Math.min(50, daily.volumeRatio * 20);
  const tightnessScore = Math.max(0, 100 - (daily.consolidationRangePct * 20));
  const positionScore = Math.max(0, 100 - (daily.distanceFromHighPct * 20));

  const dailyScore = (rallyScore + volumeScore + tightnessScore + positionScore) / 4;

  // Intraday score (0-100)
  if (!intraday) return dailyScore;

  const microTightnessScore = Math.max(0, 100 - (intraday.microRangePct * 50));
  const volumeSurgeScore = intraday.recentVolumeSurge ? 100 : 50;
  const microPositionScore = Math.max(0, 100 - (intraday.distanceFromMicroHighPct * 40));
  const higherLowsScore = Math.min(100, intraday.higherLowsCount * 15);

  const intradayScore = (microTightnessScore + volumeSurgeScore + microPositionScore + higherLowsScore) / 4;

  // Combined score (60% daily, 40% intraday)
  return (dailyScore * 0.6) + (intradayScore * 0.4);
}
```

## Integration with Existing System

### Scanner Service Integration
The scanner will use the existing natural language scanner system:

1. User enters query in scanner UI
2. Backend sends query to Claude with scanner system prompt
3. Claude generates TypeScript scanner script
4. Script executes against database (daily_metrics + ohlcv_data)
5. Results returned with pattern strength scores
6. User can click "Backtest All" to test strategies

### Batch Backtest Integration
Once candidates are identified:

1. Visual AI analysis generates dual charts (daily + intraday)
2. Claude analyzes charts and suggests entry/exit strategies
3. Claude generates strategy scripts using 5-min data
4. Automatic intraday data fetching ensures complete bars
5. Batch backtest executes all strategies
6. Results displayed with performance metrics

## Risk Management

**Stop-Loss Placement:**
- Below consolidation low (typically 3-5% risk)
- Below recent swing low on 5-min chart
- Trail stop as position moves in your favor

**Position Sizing:**
- Risk 1-2% of capital per trade
- Calculate based on stop-loss distance
- Adjust for volatility (ATR-based)

**Profit Targets:**
- Initial target: 2-3x risk (6-15% gain)
- Extended target: Rally length projection
- Trail stops after 1R profit secured

## Success Criteria

✅ Scanner identifies stocks with 30%+ rallies followed by tight consolidation
✅ Scanner filters for optimal volume patterns (expansion/contraction)
✅ Scanner validates intraday Holy Grail micro-patterns
✅ Pattern strength scoring ranks best setups at top
✅ Scanner output includes comprehensive daily + intraday metrics
✅ Flexible parameters support strategy variations
✅ Results feed seamlessly into batch backtest workflow
✅ False positive rate is acceptable (<30% of matches)

## Known Limitations & Future Enhancements

**Current Limitations:**
- Relies on sufficient historical intraday data (Polygon API)
- Scanner may produce false positives in choppy markets
- Scoring is heuristic-based, may need tuning
- Time-of-day filtering is basic (could be enhanced)

**Future Enhancements:**
- Add 1-minute bar analysis for ultra-precise entries
- Machine learning for pattern strength scoring
- Market regime filtering (bull/bear/neutral)
- Relative strength ranking vs sector/market
- Earnings event filtering
- Float and short interest integration
- Real-time alerts when new setups appear
- Historical backtest of scanner hit rate

## References

- Scanner System Design: `/backend/docs/scanner-system-design.md`
- Batch Backtest Integration: `/ai-convo-history/2025-10-27-batch-backtesting-implementation.md`
- Automatic Intraday Data Fetching: `/ai-convo-history/2025-10-27-automatic-data-fetching.md`
- Opening Range Breakout Strategy: `/backend/src/strategies/opening-range-breakout.strategy.ts`

---

**Next Steps:** Create detailed scanner prompt document and begin testing daily-only version.
