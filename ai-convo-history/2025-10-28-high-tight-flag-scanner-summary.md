# High-Tight Flag / Holy Grail Scanner - Quick Start Guide

**Date:** 2025-10-28
**Status:** Ready to Use ✅
**Your System:** Full intraday support already implemented!

---

## 🎯 What You Asked For

You wanted help creating a scanner prompt for the **High-Tight Flag / Holy Grail** strategy:
- **Daily Chart:** Stock rallies sharply, then consolidates in tight range (High-Tight Flag)
- **Intraday Chart:** Micro-consolidation pattern near highs on 5-min chart (Holy Grail)
- **Goal:** Find continuation breakout setups with high reward-to-risk ratios

---

## ✅ What I Created

### 1. **Implementation Plan**
`2025-10-28-high-tight-flag-implementation-plan.md`

Complete technical implementation guide including:
- Pattern detection criteria (rally, consolidation, volume)
- Scoring algorithms (0-100 pattern strength)
- Database query structures
- Integration with existing batch backtest system
- Risk management guidelines

### 2. **Scanner Prompts Collection**
`2025-10-28-high-tight-flag-scanner-prompts.md`

**8 ready-to-use prompts:**
- ✅ Prompt 1: Basic HTF (daily only) - Quick scan
- ✅ Prompt 2: Full HTF + Holy Grail (daily + intraday) - **RECOMMENDED**
- ✅ Prompt 3: Aggressive HTF (100%+ rallies, very tight)
- ✅ 5 specialized variations (multiple timeframes, tightness tiers, volume-focused, etc.)

**Plus:**
- Customization guide
- Usage instructions
- Troubleshooting tips
- Example workflow

---

## 🚀 Quick Start: Use It Now

### Copy This Prompt (Recommended Starting Point):

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

### How to Run:

1. **Go to your Scanner UI**
2. **Paste the prompt above**
3. **Select universe:** Russell 2000 (or S&P 500)
4. **Set date range:** Last 30-60 days
5. **Click "Run Scanner"**

Your system will:
- Generate executable TypeScript scanner script via Claude
- Query `daily_metrics` and `ohlcv_data` tables
- Return ranked results with pattern strength scores
- Automatically fetch any missing intraday data if needed

---

## 📊 What You'll Get Back

**Each result includes:**

```json
{
  "ticker": "ABCD",
  "date": "2024-01-15",
  "pattern_strength": 85,
  "setup_quality": "A",

  "daily_pattern": {
    "rally_gain_pct": 45.2,
    "rally_days": 10,
    "consolidation_range_pct": 2.8,
    "consolidation_days": 5,
    "current_price": 29.05,
    "distance_from_high_pct": 0.5,
    "volume_ratio_on_rally": 2.3,
    "consecutive_up_days": 7
  },

  "intraday_pattern": {
    "timeframe": "5min",
    "micro_range_pct": 1.2,
    "recent_volume_surge": true,
    "higher_lows_count": 6,
    "distance_from_micro_high_pct": 0.3
  },

  "notes": "Strong HTF on daily. Tight Holy Grail on 5-min with volume building."
}
```

---

## 🎨 What You Can Do With Results

### Option 1: Visual Review
- Click ticker to view daily chart
- Manually confirm pattern quality
- Check news/catalysts

### Option 2: AI Analysis (Your System Has This!)
- Click "Analyze with AI"
- Claude Vision API reviews daily + intraday charts
- Suggests entry/exit strategies
- Provides visual condition descriptions

### Option 3: Batch Backtest (Your System Has This!)
- Select top 10-20 setups
- Click "Backtest All Strategies"
- System auto-fetches missing 5-min data ✅
- Claude generates strategy scripts
- View results: P&L, win rate, max drawdown, etc.

---

## 💡 Good News: Your System is Perfect for This!

I discovered your platform already has:

✅ **Intraday data support** (implemented Oct 27, 2025)
- 5-minute bars in `ohlcv_data` table
- Automatic fetching from Polygon API
- Smart caching to avoid redundant API calls

✅ **Batch backtesting with intraday data**
- Auto-detects missing data and fetches before backtest
- Generates strategy scripts using 5-min bars
- Complete end-to-end workflow

✅ **Visual AI analysis**
- Dual-chart generation (daily + intraday)
- Claude Vision API integration
- Strategy suggestion based on chart patterns

**Your system is uniquely well-suited for this strategy!**

---

## 📚 Documentation Created

All files saved to `ai-convo-history/`:

1. **2025-10-28-high-tight-flag-scanner-summary.md** (this file)
   - Quick start guide
   - Copy-paste prompts
   - Next steps

2. **2025-10-28-high-tight-flag-scanner-prompts.md**
   - 8 different prompt variations
   - Customization guide
   - Usage instructions
   - Troubleshooting

3. **2025-10-28-high-tight-flag-implementation-plan.md**
   - Technical implementation details
   - Scoring algorithms
   - Database query structures
   - Integration architecture

---

## 🎯 Recommended Next Steps

### Step 1: Test the Basic Prompt (5 minutes)
- Use Prompt 1 from the prompts document (daily only)
- Scan Russell 2000 from last 30 days
- Review top 10 results
- Get familiar with output format

### Step 2: Try Full HTF + Holy Grail (10 minutes)
- Use the recommended prompt above (daily + intraday)
- Same universe and date range
- Compare results to daily-only scan
- Note intraday validation adds quality filter

### Step 3: Visual AI Analysis (Optional, 5 minutes per stock)
- Pick 2-3 top setups
- Use your Visual AI Analysis feature
- Review Claude's entry/exit suggestions
- Compare to your own analysis

### Step 4: Batch Backtest (15-20 minutes)
- Select top 5-10 setups
- Run batch backtest
- Review performance metrics
- Iterate on scanner criteria based on results

### Step 5: Refine and Customize (Ongoing)
- Adjust thresholds based on what works
- Try different prompt variations
- Add additional filters (RSI, SMA, etc.)
- Document your findings

---

## 🔧 Customization Examples

### Make It More Aggressive:
Change `30%+` to `50%+` or `100%+`
Change `<5%` consolidation to `<3%`
Add `Only return A+ setups (score >= 90)`

### Make It More Conservative:
Change `30%+` to `20%+`
Change `<5%` consolidation to `<7%`
Add filters: `Price > $10`, `Volume > 1M shares`

### Focus on Specific Timeframe:
Change `5-20 days` to `10-15 days` (medium-term only)
Or create separate scans: `5-10 days`, `10-15 days`, `15-20 days`

### Add Technical Filters:
```
Additional filters:
- RSI > 50 (bullish momentum)
- Price above 20-day SMA (uptrend confirmation)
- No earnings in next 7 days
```

---

## ⚠️ Important Notes

### Volume is Critical
The most important factor for this strategy. Make sure scanner results show:
- High volume expansion during rally (1.5x-2x+ average)
- Low volume during consolidation (contraction)
- Building volume on recent bars (breakout setup)

### Visual Confirmation Recommended
Scanner finds candidates, but visual review is important:
- Clean flag pattern (not choppy)
- Clear consolidation boundaries
- Volume pattern matches description
- No major support/resistance overhead

### Risk Management
- Stop loss: Below consolidation low (typically 3-5% risk)
- Position size: Risk 1-2% of capital per trade
- Target: 2-3x risk initially (6-15% gain)
- Trail stop after profit secured

---

## 🎉 You're Ready!

Everything you need is in place:
- ✅ System has full intraday data support
- ✅ Scanner prompts are ready to use
- ✅ Integration with batch backtest works
- ✅ Documentation is complete

**Just copy a prompt and run your first scan!**

---

## Questions?

Refer to these documents:
- **Quick prompts:** This file (scanner-summary.md)
- **All variations:** 2025-10-28-high-tight-flag-scanner-prompts.md
- **Technical details:** 2025-10-28-high-tight-flag-implementation-plan.md
- **Scanner system:** /backend/docs/scanner-system-design.md

---

## Example Output Preview

When you run the recommended prompt, you'll see results like:

```
Found 47 matches:

1. ABCD - Score: 92 (A+)
   Rally: 48% over 12 days, Consolidation: 2.8% range (5 days)
   Intraday: 1.1% micro-range, volume surging, 0.4% from breakout

2. EFGH - Score: 87 (A)
   Rally: 38% over 15 days, Consolidation: 3.2% range (4 days)
   Intraday: 1.4% micro-range, volume building, 0.7% from breakout

3. IJKL - Score: 84 (A)
   Rally: 52% over 18 days, Consolidation: 4.1% range (6 days)
   Intraday: 1.8% micro-range, recent volume spike, 0.5% from breakout

...
```

Click any ticker to view charts, run AI analysis, or add to backtest batch.

---

**Happy Scanning! 🚀**

This strategy has excellent historical performance when volume patterns confirm. Your system gives you all the tools to find, analyze, and backtest these setups systematically.

Remember: Scanner finds candidates, your judgment (and backtests) confirm quality!
