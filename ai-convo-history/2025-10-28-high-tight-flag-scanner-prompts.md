# High-Tight Flag / Holy Grail Scanner Prompts

**Date:** 2025-10-28
**Strategy:** High-Tight Flag (Daily) / Holy Grail (Intraday)
**Purpose:** Natural language scanner prompts for Claude to generate executable scanner scripts

---

## Quick Start: Recommended Prompts

### 🎯 Prompt 1: Basic High-Tight Flag (Daily Only)

**Use Case:** Quick daily scan for HTF patterns, no intraday validation

```
Find High-Tight Flag setups from the last 30 days:

1. Rally Phase: Stock gained 30%+ over 5-20 days with volume 1.5x+ average
2. Consolidation: Tight range (<5% daily high-low) for 2-7 days after rally
3. Current Position: Within 5% of consolidation highs
4. Volume: Lower volume during consolidation vs rally

Score each match 0-100 based on:
- Rally strength (gain % and duration)
- Consolidation tightness (tighter = better)
- Volume pattern (expansion on rally, contraction on consolidation)
- Position quality (closer to breakout = better)

Return top 50 matches sorted by pattern_strength.
```

---

### 🎯 Prompt 2: High-Tight Flag with Intraday Validation (Recommended)

**Use Case:** Full dual-timeframe analysis with Holy Grail confirmation

```
Find High-Tight Flag / Holy Grail setups combining daily and intraday analysis:

DAILY CHART (High-Tight Flag):
1. Rally Phase: Stock gained 30%+ over 5-20 days
   - Volume: 1.5x+ average during rally
   - Consecutive up days: Bonus for 5+ consecutive days
2. Consolidation: Tight range (<5% daily high-low) for 2-7 days
   - Volume: Below average during consolidation
   - Pattern: Descending or horizontal flag shape
3. Current Position: Within 5% of consolidation highs

INTRADAY CHART (Holy Grail - 5-minute bars):
For stocks that match daily criteria, analyze 5-minute bars:
1. Micro-consolidation: Price staying within 1-2% range for 50+ minutes
2. Volume pattern: Building volume on recent bars
3. Position: Within 0.5% of micro-range high
4. Bar pattern: Higher lows forming (tightening action)

SCORING (0-100):
- Daily score (60%): Rally strength + consolidation tightness + volume pattern + position
- Intraday score (40%): Micro-range tightness + volume surge + proximity to breakout

Return top 50 matches with both daily and intraday metrics included.
```

---

### 🎯 Prompt 3: Aggressive HTF (High Thresholds)

**Use Case:** Find only the most explosive, high-quality setups

```
Find explosive High-Tight Flag setups with strict criteria:

1. Rally Phase: Stock DOUBLED (100%+ gain) over 10-20 days
   - Volume: 2x+ average volume during rally
   - Consecutive up days: 7+ days preferred
2. Consolidation: VERY tight range (<3% daily high-low) for 3-5 days
   - Volume: 50% or less of rally volume
   - Pattern: Clean horizontal or slightly descending flag
3. Current Position: Within 2% of consolidation highs

Intraday (5-min): Tight micro-consolidation (<1% range) with recent volume spike

Score heavily for:
- Rally size (100% = baseline, 200%+ = max score)
- Extreme tightness (<2% range = bonus)
- Perfect volume pattern (2x+ expansion, then 0.5x contraction)

Return top 25 A+ grade setups only (score 85+).
```

---

## Flexible Variations

### 🔧 Variation 1: Multiple Timeframe Lookbacks

```
Find High-Tight Flag setups across multiple timeframes:

Scan for THREE rally durations and score each:
1. Short-term: 30%+ gain over 5-10 days (fast movers)
2. Medium-term: 40%+ gain over 10-15 days (sustained momentum)
3. Long-term: 50%+ gain over 15-20 days (strong trends)

For each, require:
- Tight consolidation (<5% range) for 2-7 days
- Volume expansion on rally, contraction in consolidation
- Current price within 5% of highs

Score and rank all matches together. Include a "rally_type" field (short/medium/long).

Return top 50 across all timeframes.
```

---

### 🔧 Variation 2: Consolidation Tightness Tiers

```
Find High-Tight Flag setups with multiple tightness levels:

Common Criteria:
- Rally: 30%+ over 5-20 days with volume
- Duration: 2-7 days consolidation

Tightness Tiers:
- Tier A (<2% daily range): "Very Tight" - Score 90-100
- Tier B (2-3% daily range): "Tight" - Score 75-89
- Tier C (3-5% daily range): "Moderate" - Score 60-74

Include intraday validation for Tier A and B only.

Return all tiers separately labeled, top 20 from each tier.
```

---

### 🔧 Variation 3: Volume-Focused Variant

```
Find High-Tight Flag setups with emphasis on volume characteristics:

Primary Criteria:
- Rally: 30%+ gain over 5-20 days
- Consolidation: <5% range for 2-7 days

Volume Requirements (STRICT):
- Rally phase: Volume 2x+ average (not just 1.5x)
- Consolidation: Volume drops to 0.7x or less of average
- Volume ratio: Rally volume / consolidation volume >= 3x

Bonus Scoring:
- Extreme volume expansion (3x+ on rally): +20 points
- Extreme contraction (<0.5x on consolidation): +10 points
- Recent volume pickup (last 2 days >1.2x avg): +15 points

Intraday: Look for volume building on most recent 5-10 bars (5-min chart)

Return top 30 with detailed volume metrics.
```

---

## Intraday-Specific Prompts

### 📊 Intraday Focus: Holy Grail on 5-Minute Chart

```
Find Holy Grail micro-consolidation patterns on 5-minute charts:

Prerequisites (daily):
- Stock in uptrend (30%+ gain over last 10-20 days)
- Currently consolidating (last 2-7 days in tight range)

5-Minute Pattern (focus here):
1. Micro-consolidation: At least 50 bars (250 minutes) in tight range
2. Range: 5-min highs and lows within 1.5% range
3. Current position: Within 0.5% of micro-range high
4. Volume: Building on recent 10-15 bars
5. Pattern: Higher lows on 5-min chart (compression)
6. Time: Avoid first 30 minutes of market open

Scoring:
- Micro-range tightness: 40%
- Volume buildup: 30%
- Higher lows pattern: 20%
- Time of day quality: 10%

Return top 30 with intraday metrics emphasized.
```

---

### 📊 Intraday Focus: 1-Minute Precision

```
Find ultra-tight Holy Grail setups using 1-minute bars:

Daily Setup:
- HTF pattern confirmed (30%+ rally, tight consolidation)

1-Minute Analysis:
1. Extreme tightness: 1-min bars in <1% range for 100+ bars
2. Compression: Recent 30 bars tighter than prior 70 bars
3. Volume: Declining during compression, then recent spike (last 10 bars)
4. Current position: Within 0.3% of 1-min range high
5. Bar pattern: At least 3 consecutive higher lows

This is for precision entries - finds stocks on the verge of breakout.

Score 0-100 based on tightness, compression, volume, and position.

Return top 20 with 1-minute bar details.
```

---

## Time-Specific Prompts

### ⏰ Market Open Holy Grail (First Hour)

```
Find Holy Grail setups forming in the first hour of trading:

Daily Pattern:
- HTF confirmed from previous days (30%+ rally, consolidation)

Intraday (Today's first 60 minutes on 5-min chart):
1. Opening range: First 2 bars (10 minutes) establish range
2. Consolidation: Bars 3-12 stay within opening range
3. Volume: Initial bars high volume, middle bars lighter, recent building
4. Pattern: Forming higher lows within opening range
5. Current: Price at top of opening range, ready for breakout

This catches stocks that gap up or open strong and consolidate immediately.

Return top 20 from today's session.
```

---

### ⏰ Afternoon Power Setup (12pm - 3pm)

```
Find Holy Grail patterns forming in afternoon session:

Daily: HTF pattern confirmed

Intraday (12pm - 3pm window on 5-min chart):
1. Morning consolidation: Tight range for first 2-3 hours
2. Afternoon compression: Even tighter in 12-3pm window
3. Volume: Drying up midday, starting to build after 2pm
4. Pattern: Coiling price action, higher lows
5. Current time: After 2pm, setup mature and ready

These are "power hour" setups that break late day.

Return top 15 with time-of-day annotations.
```

---

## Database Query Structure (For Reference)

The Claude-generated scanner will query these tables:

### Daily Pattern Query Structure
```sql
-- Step 1: Find recent consolidators
WITH recent_consolidation AS (
  SELECT ticker, AVG(ABS(change_percent)) as avg_range
  FROM daily_metrics
  WHERE date >= date('now', '-7 days')
  GROUP BY ticker
  HAVING avg_range < 5
),

-- Step 2: Find prior rallies
prior_rally AS (
  SELECT
    ticker,
    MAX(close) as peak_close,
    MIN(close) as rally_start_close,
    (MAX(close) - MIN(close)) / MIN(close) * 100 as rally_gain
  FROM daily_metrics
  WHERE date BETWEEN date('now', '-30 days') AND date('now', '-7 days')
  GROUP BY ticker
  HAVING rally_gain > 30
)

-- Step 3: Combine and score
SELECT
  dm.ticker,
  dm.date,
  dm.close,
  pr.rally_gain,
  rc.avg_range as consolidation_range,
  dm.volume_ratio,
  -- Calculate pattern_strength score here
  (CASE
    WHEN pr.rally_gain > 50 AND rc.avg_range < 3 THEN 90
    WHEN pr.rally_gain > 40 AND rc.avg_range < 4 THEN 80
    WHEN pr.rally_gain > 30 AND rc.avg_range < 5 THEN 70
    ELSE 60
  END) as pattern_strength
FROM daily_metrics dm
JOIN recent_consolidation rc ON dm.ticker = rc.ticker
JOIN prior_rally pr ON dm.ticker = pr.ticker
WHERE dm.date = date('now', '-1 days')  -- Most recent day
ORDER BY pattern_strength DESC
LIMIT 50;
```

### Intraday Pattern Query Structure
```sql
-- For each ticker from daily scan, fetch 5-min bars
SELECT
  timestamp,
  open,
  high,
  low,
  close,
  volume,
  time_of_day
FROM ohlcv_data
WHERE
  ticker = ?
  AND timeframe = '5min'
  AND timestamp >= ?  -- Last 5-7 trading days
  AND timestamp <= ?
ORDER BY timestamp ASC;

-- Then calculate in TypeScript:
-- - Micro-range high/low
-- - Volume patterns
-- - Higher lows count
-- - Position within range
-- - Intraday score
```

---

## Output Format Template

```typescript
interface HTFScanResult {
  ticker: string;
  date: string;  // Most recent date
  pattern_strength: number;  // 0-100 combined score
  setup_quality: 'A+' | 'A' | 'B' | 'C';

  daily_pattern: {
    rally_start_date: string;
    rally_end_date: string;
    rally_days: number;
    rally_gain_pct: number;
    rally_avg_volume_ratio: number;
    consecutive_up_days: number;

    consolidation_start_date: string;
    consolidation_days: number;
    consolidation_range_pct: number;
    consolidation_high: number;
    consolidation_low: number;
    consolidation_avg_volume_ratio: number;

    current_price: number;
    distance_from_high_pct: number;
    distance_from_low_pct: number;
  };

  intraday_pattern?: {  // Optional, only if intraday validation performed
    timeframe: '1min' | '5min' | '15min';
    bars_analyzed: number;
    consolidation_bars: number;

    micro_range_high: number;
    micro_range_low: number;
    micro_range_pct: number;

    current_5min_price: number;
    distance_from_micro_high_pct: number;

    avg_volume_5min: number;
    recent_volume_5min: number;
    volume_surge: boolean;

    higher_lows_count: number;
    time_of_day: string;
    intraday_score: number;  // 0-100
  };

  notes: string;  // Human-readable summary
}
```

---

## Usage Instructions

### Step 1: Choose Your Prompt
Select from the prompts above based on your needs:
- **Beginner:** Start with Prompt 1 (daily only)
- **Recommended:** Use Prompt 2 (daily + intraday)
- **Advanced:** Try Prompt 3 (aggressive) or custom variations

### Step 2: Run the Scanner
1. Navigate to Scanner page in the UI
2. Paste your chosen prompt
3. Select universe (e.g., Russell 2000)
4. Set date range (typically last 30-60 days)
5. Click "Run Scanner"

### Step 3: Review Results
- Results sorted by `pattern_strength` (highest first)
- Click ticker to view daily chart
- Click "View Intraday" to see 5-minute chart
- Check volume patterns visually
- Note `setup_quality` grade (A+/A/B/C)

### Step 4: Visual AI Analysis (Optional)
For promising setups:
1. Click "Analyze with AI" button
2. Claude Vision API analyzes daily + intraday charts
3. Receives entry/exit strategy suggestions
4. Review suggested trade parameters

### Step 5: Batch Backtest
1. Select top 10-20 setups
2. Click "Backtest All Strategies"
3. System auto-fetches any missing intraday data
4. Claude generates strategy scripts
5. View backtest results with P&L, win rate, etc.

---

## Customization Guide

### Adjust Rally Thresholds
Change `30%+` to any value:
- More conservative: `20%+` or `25%+`
- More aggressive: `50%+` or `100%+`

### Adjust Consolidation Tightness
Change `<5%` to:
- Tighter: `<3%` or `<2%`
- Looser: `<7%` or `<10%`

### Adjust Lookback Period
Change `5-20 days` to:
- Shorter: `3-10 days` (faster setups)
- Longer: `10-30 days` (stronger trends)

### Add Additional Filters
Append to any prompt:
```
Additional filters:
- RSI > 50 (bullish momentum)
- Price above 20-day SMA (uptrend confirmation)
- Stock price > $5 (avoid penny stocks)
- Average daily volume > 500K shares (liquidity)
```

### Adjust Result Count
Change `top 50` to:
- Fewer: `top 20` or `top 10` (highest quality only)
- More: `top 100` (broader scan)

---

## Example Workflow: From Scan to Trade

### Scenario: Finding HTF Setups on Monday Morning

**9:00 AM:** Run Prompt 2 (daily + intraday validation)
- Scan last 30 days of Russell 2000
- Finds 35 matches with scores 60-95

**9:15 AM:** Review top 10 (scores 85-95)
- Visually inspect daily charts for clean patterns
- Check news/earnings catalysts
- Narrow to 5 best candidates

**9:30 AM - 10:00 AM:** Market opens
- Watch 5 candidates on 5-minute chart
- Look for volume building and breakout above consolidation
- 2-3 stocks trigger entry signals

**10:00 AM:** Enter positions
- Buy breakout above consolidation high + 0.10
- Set stop below consolidation low (typically 3-5% risk)
- Target 2-3x risk (6-15% profit target)

**Throughout Day:** Monitor
- Trail stop as price moves higher
- Watch for exhaustion signs (parabolic moves, huge volume)
- Exit at target or trail stop hits

**Evening:** Review
- Log trades in journal
- Note what worked / didn't work
- Refine scanner criteria if needed

---

## Tips for Best Results

### ✅ DO:
- Run scanner on multiple days to find different setups
- Combine scanner with visual confirmation
- Use batch backtest to validate strategy before trading live
- Adjust thresholds based on market conditions (tighter in strong markets)
- Pay attention to volume patterns - critical for success
- Check broader market trend (easier in bull markets)

### ❌ DON'T:
- Trade every scanner match blindly
- Ignore volume patterns (most important indicator)
- Enter before confirmed breakout
- Use stops that are too tight (respect consolidation range)
- Chase stocks that already broke out hours ago
- Ignore risk management (position sizing, stop loss)

---

## Troubleshooting

### Scanner Returns Too Many Results
- Increase thresholds (35%+ rally, <4% consolidation)
- Add stricter volume requirements (2x+ instead of 1.5x+)
- Request only top 20 instead of top 50
- Add minimum score filter: "Only return scores 75+"

### Scanner Returns Too Few Results
- Decrease thresholds (25%+ rally, <7% consolidation)
- Loosen volume requirements (1.3x+ instead of 1.5x+)
- Expand lookback period (last 60 days instead of 30)
- Expand consolidation range (<7% instead of <5%)

### Scanner Returns Low-Quality Setups
- Add "Only A and A+ grades" to prompt
- Require minimum score: "pattern_strength >= 80"
- Add stricter intraday validation
- Add filters: RSI > 50, price > SMA, volume > X

### Intraday Validation Failing
- Check if sufficient 5-min data exists (use /scanner/data-check endpoint)
- Verify Polygon API key is valid and has calls remaining
- Try 15-min bars instead of 5-min (less data required)
- Fall back to daily-only scanning

---

## Next Steps

1. ✅ Choose a prompt from above
2. ✅ Run scanner in the UI
3. ✅ Review top results
4. ✅ Optionally use Visual AI Analysis
5. ✅ Batch backtest promising setups
6. ✅ Iterate on criteria based on results

**Questions or Issues?**
- Check scanner logs for errors
- Verify database has sufficient data
- Review generated TypeScript scanner script
- Adjust prompt and re-run

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Related Docs:**
- Implementation Plan: `2025-10-28-high-tight-flag-implementation-plan.md`
- Scanner System Design: `/backend/docs/scanner-system-design.md`
- Batch Backtest Integration: `2025-10-27-batch-backtesting-implementation.md`
