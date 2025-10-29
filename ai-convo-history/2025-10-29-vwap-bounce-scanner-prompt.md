# VWAP Bounce Strategy Scanner Prompt

**Date:** 2025-10-29
**Strategy:** VWAP Bounce (Intraday)
**Purpose:** Natural language scanner prompt for identifying VWAP bounce setups on Russell 2000

---

## 🎯 Primary VWAP Bounce Scanner Prompt

**Use Case:** Find intraday VWAP bounce setups with institutional support

```
Find VWAP bounce setups on 5-minute charts:

PREREQUISITES (Daily Chart):
1. Stock in uptrend: Price above 20-day SMA
2. Average daily volume > 500K shares (liquidity requirement)
3. Price range: $5-$100 (avoid penny stocks and ultra-expensive stocks)
4. Recent volatility: ATR 2-5% (active but not chaotic)

INTRADAY PATTERN (5-minute bars):
1. VWAP Touch: Price came within 0.3% of VWAP in last 10 bars
2. Bounce Confirmation: Current bar closes above VWAP
   - Green candle (close > open)
   - Low of bar touched or came close to VWAP
3. Volume Support: Current volume > 1.2x recent 20-bar average
4. Price Action: Higher low pattern forming at VWAP level
5. Time of Day: Between 10:00 AM - 3:00 PM ET (avoid first/last 30 min)

TECHNICAL FILTERS:
- RSI: 40-70 (not oversold, not overbought)
- Price position: Within 3% of daily high
- VWAP slope: Positive (uptrending)
- Recent bars: At least 2 touches of VWAP in last 50 bars (established support)

SCORING (0-100):
- VWAP touch quality (30%): Closer = better, within 0.1% = perfect score
- Volume surge (25%): Higher volume ratio = better score
- Price action (20%): Clean bounce with higher lows = higher score
- Trend alignment (15%): Price above SMAs and VWAP trending up = higher score
- Time of day (10%): Prime trading hours (11 AM - 2 PM) = higher score

Return top 50 matches sorted by pattern_strength.
```

---

## 🎯 Alternative: Aggressive VWAP Bounce (High Probability)

**Use Case:** Find only the highest quality VWAP bounces with strong institutional presence

```
Find high-probability VWAP bounce setups with institutional support:

DAILY SETUP:
1. Strong uptrend: Price above 20-day and 50-day SMA
2. Volume: Average daily volume > 1M shares
3. Volatility: ATR 2-4% (sweet spot)
4. Price: $10-$75 (institutional favorites)
5. Relative strength: Outperforming SPY in last 5 days

INTRADAY PATTERN (5-minute bars):
1. Multiple VWAP Tests: Price touched VWAP 3-5 times today
2. Each bounce: Price respected VWAP as support (didn't break below)
3. Current Setup:
   - Price within 0.2% of VWAP
   - Volume building (current bar > 1.5x average)
   - Green candle closing above VWAP
   - Making higher lows at each VWAP test

VOLUME PROFILE:
- Volume at VWAP touches: Increasing with each test
- Recent 10 bars: Volume trending higher
- Current bar: Volume in top 20% of today's bars

ADDITIONAL CONFIRMATION:
- No significant resistance within 1% above current price
- RSI between 45-65 (neutral to slightly bullish)
- VWAP angle: Positive slope (not flat or declining)
- Intraday trend: Series of higher highs and higher lows

SCORING (0-100):
- Number of successful VWAP bounces today (25%)
- Volume progression (25%)
- Price action quality (20%)
- Trend strength (15%)
- Time of day quality (15%)

Return top 25 A-grade setups (score 75+).
```

---

## 🎯 Variation: VWAP Bounce with Multi-Timeframe Confirmation

**Use Case:** Add 1-minute and 15-minute timeframe confirmation for precision entries

```
Find VWAP bounce setups with multi-timeframe alignment:

DAILY CHART:
- Uptrend confirmed (price > 20 SMA > 50 SMA)
- Volume > 750K shares/day average
- ATR 2-5% (active movement)

PRIMARY TIMEFRAME (5-minute):
1. VWAP Support: Price touched VWAP (within 0.3%) in last 10 bars
2. Bounce: Current bar closes above VWAP with green candle
3. Volume: 1.3x+ recent average
4. Pattern: Higher lows forming at VWAP

CONFIRMATION TIMEFRAMES:

1-Minute Chart Confirmation:
- Last 5 bars: Series of higher lows
- Current bar: Strong green candle
- Volume: Increasing on 1-min bars
- Price: Breaking above recent 1-min resistance

15-Minute Chart Confirmation:
- Current 15-min bar: Respecting VWAP support
- Candle: Green or forming green
- Volume: Above 15-min average
- Pattern: Part of larger 15-min uptrend

QUALITY REQUIREMENTS:
- All 3 timeframes (1m, 5m, 15m) show bullish alignment
- Volume increasing across all timeframes
- VWAP acting as support on both 5m and 15m
- RSI 45-70 on 5-minute chart
- Time: 10:30 AM - 2:30 PM ET

SCORING (0-100):
- 5-minute pattern quality (35%)
- 1-minute micro-confirmation (25%)
- 15-minute macro-confirmation (25%)
- Volume alignment across timeframes (15%)

Return top 30 with multi-timeframe confirmation score.
```

---

## 🎯 Variation: VWAP Bounce After Pullback

**Use Case:** Catch bounces after intraday pullbacks in trending stocks

```
Find VWAP bounce setups following intraday pullbacks:

DAILY SETUP:
- Stock up 1-5% today (intraday momentum)
- Volume > average (interest/activity)
- No major resistance nearby

INTRADAY PATTERN:
1. Morning Rally: Stock moved up 2%+ from open
2. Pullback Phase: Retraced to VWAP (30-60 minute pullback)
3. VWAP Test: Price touched VWAP and held
4. Bounce Setup: Now bouncing from VWAP

PULLBACK CHARACTERISTICS:
- Duration: 6-12 bars on 5-minute chart
- Depth: Pulled back 40-60% of morning rally
- Volume: Declined during pullback (profit-taking, not selling)
- Support: VWAP held as clear support level

BOUNCE CONFIRMATION:
- Green candle closes above VWAP
- Volume expanding (>1.4x recent bars)
- Higher low at VWAP vs previous VWAP test
- RSI recovered from 35-45 range to 50+

TIME AND POSITION:
- Time: Between 11:00 AM - 2:00 PM
- Position: Within 1.5% of intraday high
- VWAP: Clearly trending higher (not flat)

SCORING (0-100):
- Morning rally strength (20%)
- Pullback quality (25%): Orderly, volume decline
- VWAP bounce strength (30%): Clean, high volume
- Position quality (15%): Close to highs
- Time of day (10%)

Return top 40 pullback bounce setups.
```

---

## 🎯 Variation: VWAP Reclaim After Breakdown

**Use Case:** Catch powerful reversals when price reclaims VWAP as support

```
Find VWAP reclaim setups (short-term reversal):

PATTERN SEQUENCE:
1. Initial Position: Stock trading above VWAP in morning
2. Breakdown: Price broke below VWAP (failed support)
3. Base Formation: Consolidated below VWAP for 15-30 minutes
4. Reclaim: Now pushing back above VWAP with conviction

RECLAIM CHARACTERISTICS:
- Clean break back above VWAP (not choppy)
- Volume surge: 2x+ average on reclaim bars
- Price action: Strong green candles, minimal wicks
- Speed: Reclaim happening within 3-5 bars (not slow grind)

CONFIRMATION SIGNALS:
- First retest of VWAP from above holds (new support)
- Volume remains elevated
- RSI crosses back above 50
- Price stays above VWAP for at least 3 consecutive bars

QUALITY FILTERS:
- Daily trend: Still bullish (above daily SMAs)
- Today's action: Not a complete reversal day
- Volume: Current volume > 1.5x average
- Time: Before 2:00 PM (enough time for follow-through)
- VWAP slope: Turning positive or already positive

AVOID:
- Multiple failed reclaim attempts today
- Extremely high volume spike (possible exhaustion)
- Price too far from VWAP at reclaim (>1%)
- Late day action (after 2:30 PM)

SCORING (0-100):
- Reclaim strength (30%): Volume and price action
- Base quality below VWAP (25%): Tight, organized
- Follow-through (20%): Staying above VWAP
- Volume conviction (15%)
- Timing (10%)

Return top 35 reclaim setups sorted by strength.
```

---

## Usage Instructions

### Step 1: Choose Your Prompt
- **Beginner:** Start with Primary VWAP Bounce prompt
- **Recommended:** Use Aggressive VWAP Bounce for quality over quantity
- **Advanced:** Multi-timeframe confirmation for precision entries
- **Opportunistic:** Pullback bounce for trending stocks
- **Reversal:** VWAP reclaim for short-term reversals

### Step 2: Run Scanner on Russell 2000
1. Navigate to Scanner page in UI
2. Select universe: **Russell 2000**
3. Paste chosen prompt
4. Set timeframe: **Intraday (5-minute bars)**
5. Date range: Today or last 5 trading days
6. Click "Run Scanner"

### Step 3: Review Results
- Results sorted by `pattern_strength` score
- Top setups typically score 75-95
- Click ticker to view intraday chart
- Verify VWAP support visually
- Check volume pattern confirmation

### Step 4: Backtest Strategy
Once you have scan results:
1. Select top 10-20 setups
2. Click "Backtest Strategy"
3. Use this entry/exit prompt:

```
ENTRY STRATEGY:
- Enter when price closes above VWAP on 5-minute chart
- Entry price: Current 5-min close + $0.05 (or 0.5% above VWAP)
- Confirm volume > 1.2x recent average
- Time window: Only enter between 10:00 AM - 2:30 PM ET

POSITION SIZING:
- Risk 1% of capital per trade
- Position size based on distance to stop loss

STOP LOSS:
- Initial stop: 1.5% below VWAP
- Or: Below recent swing low (whichever is closer)
- Never risk more than 2% on any trade

PROFIT TARGETS:
- Target 1: 1.5% gain (take 50% off)
- Target 2: 2.5% gain (take remaining 50%)
- Trailing stop: Once up 2%, trail stop to breakeven
- Time stop: Exit by 3:45 PM if not hit targets

EXIT RULES:
- Stop hit: Exit immediately
- VWAP recross: If price closes below VWAP on 5-min, exit 50%
- Volume dry up: If volume drops below 0.8x average for 3 bars, consider exit
- End of day: Close all positions by 3:50 PM
```

---

## Expected Performance Characteristics

### Win Rate: 55-65%
- Strategy relies on established intraday support
- Not every bounce follows through
- Best in trending market conditions

### Risk/Reward: 1.5:1 to 2:1
- Tight stops (1-1.5% risk)
- Reasonable targets (2-3% gain)
- Quick exits preserve capital

### Hold Time: 15 minutes - 3 hours
- Intraday strategy, all positions closed EOD
- Average hold: 45-90 minutes
- Quick moves are common at VWAP bounces

### Best Market Conditions:
- ✅ Trending market (SPY uptrending)
- ✅ Normal to slightly elevated volatility
- ✅ Active trading days (not holidays)
- ❌ Avoid in choppy, rangebound markets
- ❌ Avoid during major news events
- ❌ Avoid first and last 30 minutes of day

---

## Customization Tips

### Adjust VWAP Distance Threshold
Change `0.3%` to:
- Tighter: `0.2%` or `0.1%` (fewer signals, higher quality)
- Looser: `0.5%` or `0.7%` (more signals, lower quality)

### Adjust Volume Requirements
Change `1.2x average` to:
- Higher: `1.5x` or `2.0x` (more conviction)
- Lower: `1.0x` or `1.1x` (more setups)

### Adjust Time Windows
Current: `10:00 AM - 3:00 PM`
- More conservative: `10:30 AM - 2:30 PM` (prime hours only)
- More aggressive: `9:45 AM - 3:30 PM` (more opportunities)

### Add Price Range Filters
```
Additional filters:
- Stock price: $10-$50 (adjust based on account size)
- Minimum volume: 1M shares/day (higher liquidity)
- Sector: Technology, Consumer Discretionary (adjust for market rotation)
- Relative strength: RS > 0 vs SPY (only trade leaders)
```

---

## Integration with Autonomous Trading Agent

### Agent Configuration
```javascript
{
  "name": "VWAP Bounce Agent",
  "timeframe": "intraday",
  "strategies": ["vwap-bounce"],
  "riskLimits": {
    "maxPositionSize": 5000,        // $5K per trade
    "maxDailyLoss": 500,            // Stop trading at -$500/day
    "maxConcurrentPositions": 5,    // Max 5 positions at once
    "minConfidenceScore": 70,       // Only trade 70+ quality scores
    "maxPortfolioExposure": 40,     // Max 40% of capital deployed
    "maxCorrelation": 0.6           // Limit correlated positions
  }
}
```

### Pattern Recognition
The agent will automatically detect VWAP bounces in real-time using the pattern detector at `backend/src/services/realtime-scanner.service.ts:504-542`

### Auto-Trading Flow
1. Real-time data streams in from TradeStation
2. Scanner detects VWAP bounce pattern
3. Agent scores pattern quality (0-100)
4. If score ≥ minConfidenceScore, analyze with Claude
5. Claude generates trade recommendation
6. Risk checks validate against limits
7. If all checks pass, execute trade
8. Monitor position with trailing stops
9. Close by end of day or when targets hit

---

## Troubleshooting

### Too Many Signals
- Increase minConfidenceScore to 75 or 80
- Tighten VWAP distance to 0.2%
- Require 2+ prior VWAP bounces today
- Add RSI filter: 50-65 range only

### Too Few Signals
- Loosen VWAP distance to 0.5%
- Lower volume requirement to 1.1x
- Expand time window
- Lower minConfidenceScore to 65

### False Signals (Low Win Rate)
- Add multi-timeframe confirmation requirement
- Require daily uptrend confirmation
- Avoid choppy market days (filter by VIX > 25)
- Only trade stocks with clear VWAP trend (not flat)

### Signals Not Converting
- Entry too aggressive: Use limit orders at/near VWAP
- Stop too tight: Widen to 2% or 1x ATR
- Targets too ambitious: Use 1.5% instead of 2.5%
- Market condition: Pause strategy in bear markets

---

## Pattern Library Examples

### Best VWAP Bounce Example:
```
Ticker: [To be filled from backtest results]
Date: [To be filled]
Pattern: Clean 5-minute bounce from VWAP
Entry: $XX.XX (0.1% above VWAP)
Stop: $XX.XX (1.5% below VWAP)
Exit: $XX.XX (2.3% gain in 47 minutes)
Volume: 3.2x average on bounce bars
Quality Score: 94
```

### Study Notes:
- What made this setup perfect?
- How did volume confirm the bounce?
- What was the broader market doing?
- Time of day significance?
- How quickly did it move to target?

---

## Related Strategies

### Complementary Patterns:
- **Bull Flag**: Often forms above VWAP before breakout
- **Gap and Go**: Can set up VWAP bounces after morning gap
- **Momentum Surge**: May start from VWAP bounce

### Risk Management:
- Diversify across multiple pattern types
- Don't over-concentrate in VWAP bounces alone
- Use VWAP bounce as one tool in the toolkit
- Monitor overall portfolio correlation

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Related Docs:**
- High-Tight Flag Scanner: `2025-10-28-high-tight-flag-scanner-prompts.md`
- Scanner System Design: `/backend/docs/scanner-system-design.md`
- Realtime Scanner Implementation: `/backend/src/services/realtime-scanner.service.ts`
