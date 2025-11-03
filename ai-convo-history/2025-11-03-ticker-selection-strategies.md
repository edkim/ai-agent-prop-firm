# Ticker Selection Strategies for Paper Trading

**Date**: 2025-11-03
**Context**: Optimizing paper trading watchlists from learning agent signal data
**Goal**: Find the best subset of tickers to monitor for maximum opportunity with minimal overhead

---

## Executive Summary

**The Problem**: The VWAP Mean Reversion Trader found 500 signals in iteration 1, but we only backtested 10. We're leaving 490 signals worth of performance data on the table.

**The Opportunity**: Mine existing signal data to identify which stocks consistently generate high-quality trading opportunities, then focus paper trading resources on those proven winners.

**The Solution**: Use data-driven analysis to select 50-100 optimal tickers instead of blindly monitoring 2000 Russell 2000 stocks.

**Result**: Better performance, lower costs, simpler infrastructure.

---

## Why Ticker Selection Matters

### Current Reality: VWAP Mean Reversion Trader

**Iteration 1 Results:**
- Total signals found: **500**
- Signals backtested: **10** (2% of total)
- Win rate on tested signals: **80%**
- Sharpe ratio: **11.23**

**Questions We Should Answer:**
1. Which of the 500 signals came from the same tickers repeatedly?
2. Which tickers had the highest pattern strength scores?
3. Do certain stocks consistently produce winning signals?
4. What characteristics do the best-performing tickers share?

### The 80/20 Principle Applied

**Hypothesis**: 20% of stocks will generate 80% of high-quality signals.

Instead of watching 2000 Russell 2000 stocks:
- Identify the **top 100 signal generators** from historical data
- Focus paper trading on those proven performers
- Achieve 80% of potential profit with 5% of the infrastructure complexity

---

## Method 1: Signal Performance Analysis

### Query 1: Ticker Signal Distribution

**Find which tickers generated the most signals in iteration 1:**

```sql
-- Get signal count and average pattern strength by ticker
-- for VWAP Mean Reversion Trader (iteration 1)

SELECT
    ticker,
    COUNT(*) as signal_count,
    AVG(pattern_strength) as avg_strength,
    MIN(pattern_strength) as min_strength,
    MAX(pattern_strength) as max_strength,
    AVG(deviation_percent) as avg_deviation
FROM (
    -- Parse the scan_script results from iteration 1
    -- This assumes signals are stored somewhere accessible
    -- You may need to re-run the scan to get this data
    SELECT
        json_extract(value, '$.ticker') as ticker,
        json_extract(value, '$.pattern_strength') as pattern_strength,
        json_extract(value, '$.deviation_percent') as deviation_percent
    FROM agent_iterations,
         json_each(backtest_results, '$.signals')
    WHERE id = '39b9b6e6-d001-4f32-84fd-326716aa3eeb' -- VWAP iteration 1
)
GROUP BY ticker
ORDER BY signal_count DESC, avg_strength DESC
LIMIT 50;
```

**What This Tells You:**
- Which stocks generated the most VWAP mean reversion signals
- Whether signals were high quality (avg_strength)
- Whether the ticker is consistent (min/max range)

### Query 2: Backtest Performance by Ticker

**Of the 10 signals that were backtested, which tickers won?**

```sql
-- Analyze backtest results by ticker
SELECT
    ticker,
    COUNT(*) as trades,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
    CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate,
    AVG(pnl) as avg_pnl,
    SUM(pnl) as total_pnl
FROM (
    SELECT
        json_extract(value, '$.ticker') as ticker,
        json_extract(value, '$.pnl') as pnl
    FROM agent_iterations,
         json_each(backtest_results, '$.trades')
    WHERE id = '39b9b6e6-d001-4f32-84fd-326716aa3eeb'
)
GROUP BY ticker
ORDER BY win_rate DESC, total_pnl DESC;
```

**What This Tells You:**
- Which stocks had highest win rates in backtests
- Which stocks generated the most profit
- Reliability indicators (trade count)

### Query 3: Signal Quality Score

**Combine frequency + strength + backtest results:**

```sql
-- Create a composite quality score for each ticker
-- Score = (signal_count * 0.3) + (avg_strength * 0.4) + (win_rate * 100 * 0.3)

WITH signal_stats AS (
    SELECT
        ticker,
        COUNT(*) as signal_count,
        AVG(pattern_strength) as avg_strength
    FROM iteration_signals
    WHERE iteration_id = '39b9b6e6-d001-4f32-84fd-326716aa3eeb'
    GROUP BY ticker
),
backtest_stats AS (
    SELECT
        ticker,
        CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate,
        AVG(pnl) as avg_pnl
    FROM iteration_trades
    WHERE iteration_id = '39b9b6e6-d001-4f32-84fd-326716aa3eeb'
    GROUP BY ticker
)
SELECT
    s.ticker,
    s.signal_count,
    s.avg_strength,
    COALESCE(b.win_rate, 0.5) as win_rate,
    COALESCE(b.avg_pnl, 0) as avg_pnl,
    -- Composite score
    (s.signal_count * 0.3 + s.avg_strength * 0.4 + COALESCE(b.win_rate * 100, 50) * 0.3) as quality_score
FROM signal_stats s
LEFT JOIN backtest_stats b ON s.ticker = b.ticker
ORDER BY quality_score DESC
LIMIT 100;
```

**What This Tells You:**
- Holistic view combining signal frequency, quality, and profitability
- Top 100 tickers most likely to succeed in paper trading

---

## Method 2: Fundamental Filtering

### Volume-Based Selection

**Why It Matters:**
- Paper trading simulates fills based on bar data
- High volume = tighter spreads = more realistic fills
- Low volume = wide spreads = slippage kills performance

**Filter Criteria:**

```sql
-- Get tickers with sufficient liquidity from stock_bars
SELECT DISTINCT ticker
FROM stock_bars
WHERE timeframe = '1day'
AND timestamp >= datetime('now', '-30 days')
GROUP BY ticker
HAVING AVG(volume) >= 1000000  -- At least 1M shares/day average
ORDER BY AVG(volume) DESC;
```

**Recommended Thresholds:**
- **Minimum**: 500K shares/day (for mid-cap)
- **Ideal**: 1M+ shares/day (for most strategies)
- **Ultra-liquid**: 10M+ shares/day (for high-frequency)

### Price Range Optimization

**VWAP Mean Reversion Sweet Spot Analysis:**

From the validation results, VWAP signals had avg deviation of 1.84%. For meaningful dollar moves:

```sql
-- Find tickers in optimal price range for VWAP strategy
SELECT
    ticker,
    AVG(close) as avg_price,
    COUNT(*) as bars
FROM stock_bars
WHERE timeframe = '5min'
AND timestamp >= datetime('now', '-30 days')
GROUP BY ticker
HAVING avg_price BETWEEN 20 AND 200  -- Sweet spot for 1-2% moves
ORDER BY avg_price DESC;
```

**Price Range Guidelines by Strategy:**

| Strategy Type | Ideal Price Range | Why |
|---------------|-------------------|-----|
| VWAP Mean Reversion | $20 - $200 | 1-2% moves = $0.20-$4.00 profit per share |
| Breakout Patterns | $10 - $100 | Enough volatility, not too expensive |
| Penny Stock Plays | $1 - $10 | High % moves but risky |
| Blue Chip | $100+ | Lower % moves, need larger positions |

**For VWAP**: Avoid stocks <$20 (too volatile) and >$200 (moves too small as %)

### Market Cap Tiers

**Strategy Performance by Market Cap:**

```sql
-- Categorize tickers by market cap tier
-- (Requires market_cap data in database or external join)

SELECT
    CASE
        WHEN market_cap > 200000000000 THEN 'Mega Cap (>$200B)'
        WHEN market_cap > 10000000000 THEN 'Large Cap ($10B-$200B)'
        WHEN market_cap > 2000000000 THEN 'Mid Cap ($2B-$10B)'
        WHEN market_cap > 300000000 THEN 'Small Cap ($300M-$2B)'
        ELSE 'Micro Cap (<$300M)'
    END as cap_tier,
    COUNT(*) as ticker_count,
    AVG(signal_count) as avg_signals_per_ticker
FROM ticker_signals_summary
GROUP BY cap_tier
ORDER BY market_cap DESC;
```

**Recommended Mix for VWAP:**
- **40% Large Cap** - Consistent, reliable patterns
- **40% Mid Cap** - Best signal frequency
- **20% Small Cap** - Higher volatility, more opportunity

### Sector Diversification

**Avoid Over-Concentration:**

```sql
-- Check sector distribution of current watchlist
SELECT
    sector,
    COUNT(*) as ticker_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percent
FROM stock_metadata
WHERE ticker IN (
    -- Your top 100 tickers from quality score analysis
    SELECT ticker FROM top_quality_tickers
)
GROUP BY sector
ORDER BY ticker_count DESC;
```

**Balanced Allocation Example:**
- Technology: 25% (strong signals but correlated)
- Healthcare: 20% (independent moves)
- Financials: 15% (interest rate sensitive)
- Consumer: 15% (stability)
- Industrials: 15% (diversification)
- Other: 10% (opportunistic)

**Red Flag**: >40% in single sector = too concentrated

---

## Method 3: Adaptive Selection

### Rolling Performance Windows

**Don't set watchlist once and forget it - adapt monthly:**

```sql
-- Evaluate paper trading performance by ticker over last 30 days
SELECT
    t.ticker,
    COUNT(*) as trades,
    AVG(t.pnl_percent) as avg_pnl_pct,
    SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as win_rate,
    SUM(t.pnl) as total_pnl
FROM paper_trades t
JOIN paper_accounts a ON t.account_id = a.id
WHERE a.agent_id = 'd992e829-27d9-406d-b771-8e3789645a5e'  -- VWAP agent
AND t.executed_at >= datetime('now', '-30 days')
GROUP BY t.ticker
HAVING COUNT(*) >= 3  -- At least 3 trades to be meaningful
ORDER BY total_pnl DESC;
```

**Monthly Review Process:**
1. Run performance query
2. Drop bottom 10% performers (replace with new candidates)
3. Add 5-10 new tickers from un-tested signal pool
4. Re-balance sector allocation if needed

### Market Regime Filters

**Different tickers work in different market conditions:**

```sql
-- Identify which tickers perform well in current volatility regime
WITH market_volatility AS (
    SELECT AVG(high - low) / AVG(close) as current_volatility
    FROM stock_bars
    WHERE ticker = 'SPY'
    AND timeframe = '1day'
    AND timestamp >= datetime('now', '-10 days')
),
ticker_performance AS (
    SELECT
        ticker,
        AVG(high - low) / AVG(close) as ticker_volatility,
        COUNT(*) as signal_count
    FROM stock_bars
    WHERE timeframe = '5min'
    AND timestamp >= datetime('now', '-30 days')
    GROUP BY ticker
)
SELECT
    t.ticker,
    t.ticker_volatility,
    m.current_volatility,
    t.signal_count,
    ABS(t.ticker_volatility - m.current_volatility) as volatility_match
FROM ticker_performance t
CROSS JOIN market_volatility m
ORDER BY volatility_match ASC
LIMIT 50;
```

**Market Regime Strategy:**
- **High Volatility (VIX >20)**: Focus on large caps, reduce position size
- **Low Volatility (VIX <15)**: Can trade mid/small caps more aggressively
- **Trending Market**: Favor breakout tickers
- **Range-Bound Market**: Favor mean-reversion tickers (VWAP)

---

## Method 4: Practical Example - VWAP Watchlist Optimization

### Step-by-Step: Build Optimal 50-Ticker Watchlist

**Step 1: Extract All 500 Signals from Iteration 1**

```bash
# Run VWAP scan script again to get full signal list
cd backend
sqlite3 ../backtesting.db "
SELECT scan_script
FROM agent_iterations
WHERE id = '39b9b6e6-d001-4f32-84fd-326716aa3eeb'
" > /tmp/vwap_scan.ts

# Execute scan to regenerate all 500 signals
npx ts-node /tmp/vwap_scan.ts > /tmp/vwap_signals_500.json
```

**Step 2: Analyze Signal Distribution**

```javascript
// Parse and analyze the 500 signals
const signals = require('/tmp/vwap_signals_500.json');

const tickerStats = signals.reduce((acc, signal) => {
    const ticker = signal.ticker;
    if (!acc[ticker]) {
        acc[ticker] = {
            count: 0,
            avgStrength: 0,
            strengths: [],
            avgDeviation: 0,
            deviations: []
        };
    }
    acc[ticker].count++;
    acc[ticker].strengths.push(signal.pattern_strength);
    acc[ticker].deviations.push(Math.abs(signal.deviation_percent));
    return acc;
}, {});

// Calculate averages
Object.keys(tickerStats).forEach(ticker => {
    const stats = tickerStats[ticker];
    stats.avgStrength = stats.strengths.reduce((a,b) => a+b) / stats.count;
    stats.avgDeviation = stats.deviations.reduce((a,b) => a+b) / stats.count;
});

// Rank by composite score
const ranked = Object.entries(tickerStats)
    .map(([ticker, stats]) => ({
        ticker,
        ...stats,
        score: stats.count * 0.4 + stats.avgStrength * 0.6
    }))
    .sort((a, b) => b.score - a.score);

console.log('Top 50 tickers by signal quality:');
console.log(ranked.slice(0, 50));
```

**Step 3: Apply Liquidity Filter**

```sql
-- Of the top 50, keep only those with sufficient volume
WITH top_signal_tickers AS (
    SELECT ticker FROM (
        -- Your top 50 from analysis above
        VALUES ('AAPL'), ('MSFT'), ('GOOGL'), ...
    ) AS t(ticker)
)
SELECT
    t.ticker,
    AVG(b.volume) as avg_daily_volume,
    AVG(b.close) as avg_price
FROM top_signal_tickers t
JOIN stock_bars b ON t.ticker = b.ticker
WHERE b.timeframe = '1day'
AND b.timestamp >= datetime('now', '-30 days')
GROUP BY t.ticker
HAVING AVG(b.volume) >= 1000000  -- 1M share minimum
AND AVG(b.close) BETWEEN 20 AND 200  -- Price sweet spot
ORDER BY avg_daily_volume DESC;
```

**Step 4: Check Sector Diversification**

```sql
-- Ensure no single sector dominates
SELECT
    COALESCE(sector, 'Unknown') as sector,
    COUNT(*) as count,
    GROUP_CONCAT(ticker) as tickers
FROM stock_metadata
WHERE ticker IN (
    -- Your filtered list from step 3
)
GROUP BY sector
ORDER BY count DESC;
```

**Manual Adjustment**: If >40% are tech stocks, swap some for other sectors.

**Step 5: Final Watchlist Selection**

Combine automated ranking + manual sector balancing:

```sql
-- Final 50-ticker watchlist for VWAP paper trading
CREATE TABLE vwap_paper_trading_watchlist AS
SELECT
    ticker,
    signal_count,
    avg_pattern_strength,
    avg_daily_volume,
    sector,
    quality_score
FROM ticker_analysis_final
ORDER BY quality_score DESC
LIMIT 50;

-- Export for use in orchestrator
SELECT ticker FROM vwap_paper_trading_watchlist
ORDER BY ticker;
```

**Expected Result:**
- 50 tickers covering 5-6 sectors
- Average 8-12 signals per ticker (400-600 total signals)
- All liquid (>1M volume/day)
- All in $20-$200 price range
- Proven signal generators from iteration 1 data

---

## Method 5: Backtesting the Watchlist

**Before deploying to paper trading, validate the selection:**

### Run Full Backtest on Top 50

```bash
# Create backtest script for top 50 tickers
cd backend/helper-scripts

# Execute VWAP strategy on all 50 tickers
npx ts-node validate-watchlist.ts \
  --tickers "AAPL,MSFT,GOOGL,..." \
  --start-date "2025-10-01" \
  --end-date "2025-11-01" \
  --strategy vwap-mean-reversion
```

**Validation Criteria:**
- ✅ Win rate >60% across all 50
- ✅ Sharpe ratio >2.0
- ✅ At least 3 signals per ticker
- ✅ No single ticker >20% of total P&L (concentration risk)

**If Criteria Not Met:**
- Drop bottom 10 performers
- Add next 10 from ranked list
- Re-test until passing

---

## Recommended Watchlist Sizes

**Based on Paper Trading Infrastructure Limits:**

| Agent Type | Ideal Ticker Count | Rationale |
|------------|-------------------|-----------|
| **Single Strategy** (VWAP) | 30-50 | Focused, manageable, proven performers |
| **Multi-Strategy** | 20-30 per strategy | Avoid overlap, reduce correlation |
| **High-Frequency** | 10-20 | Need very liquid, fast-moving stocks |
| **Position Trading** | 50-100 | Longer holds, can monitor more |

**For VWAP Mean Reversion Trader:**
- **Minimum**: 20 tickers (diversification)
- **Optimal**: 40-50 tickers (sweet spot)
- **Maximum**: 100 tickers (with current architecture)

**Why Not More?**
- **Quality over quantity**: 50 great stocks > 200 mediocre ones
- **Manageable risk**: Easier to monitor 50 positions
- **Infrastructure**: Scan scripts run faster with fewer tickers
- **Focus**: Better to master 50 than spread thin across 2000

---

## Implementation Checklist

### Phase 1: Data Mining (Week 1)
- [ ] Re-run VWAP scan to get all 500 signals
- [ ] Parse signals into structured data
- [ ] Calculate ticker-level statistics
- [ ] Rank tickers by quality score
- [ ] Export top 100 candidates

### Phase 2: Filtering (Week 1)
- [ ] Apply volume filter (>1M shares/day)
- [ ] Apply price range filter ($20-$200)
- [ ] Check sector distribution
- [ ] Manual sector balancing if needed
- [ ] Finalize top 50 list

### Phase 3: Validation (Week 2)
- [ ] Run backtest on all 50 tickers
- [ ] Analyze results (win rate, Sharpe, concentration)
- [ ] Drop underperformers
- [ ] Add replacements from ranked list
- [ ] Final approval

### Phase 4: Deployment (Week 2)
- [ ] Update PaperTradingOrchestrator with ticker list
- [ ] Set PAPER_TRADING_ENABLED=true
- [ ] Start backend
- [ ] Monitor for 1 week
- [ ] Review performance

### Phase 5: Optimization (Monthly)
- [ ] Analyze paper trading results
- [ ] Calculate ROI per ticker
- [ ] Drop bottom 10% performers
- [ ] Add new candidates from signal pool
- [ ] Re-balance sector allocation

---

## Advanced: Machine Learning Approach

**For Future Enhancement:**

### Feature Engineering

```python
# Build ML model to predict ticker success
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

features = [
    'signal_count',
    'avg_pattern_strength',
    'avg_deviation',
    'avg_daily_volume',
    'avg_price',
    'sector_encoded',
    'market_cap_tier',
    'beta',  # Volatility vs market
    'rsi_avg',  # Technical indicator
    'days_since_earnings'  # Fundamental
]

target = 'win_rate_above_60'  # Binary: 1 if >60% win rate, 0 otherwise

# Train on historical iteration data
model = RandomForestClassifier()
model.fit(X_train[features], y_train[target])

# Predict which new tickers likely to succeed
predictions = model.predict_proba(X_new[features])
top_candidates = predictions.argsort()[-50:]  # Top 50 predictions
```

**This Allows:**
- Automatic ticker selection based on learned patterns
- Feature importance analysis (which characteristics matter most)
- Continuous improvement as more data collected

---

## Key Takeaways

### 1. Start with Data, Not Assumptions
- You have 500 signals from iteration 1 - USE THEM
- Mine existing data before adding new tickers randomly
- Let performance guide selection, not gut feel

### 2. Quality Over Quantity
- 50 proven tickers > 2000 random tickers
- Focus infrastructure on winners
- Easier to monitor, manage, optimize

### 3. Balance is Key
- Signal frequency (opportunity)
- Signal quality (reliability)
- Liquidity (realistic fills)
- Diversification (risk management)

### 4. Adapt Continuously
- Review monthly
- Drop underperformers
- Add new candidates
- Re-balance sectors

### 5. Validate Before Deploying
- Backtest watchlist thoroughly
- Ensure win rate >60%, Sharpe >2.0
- Check concentration risk
- Verify sector diversification

---

## SQL Helper Queries Cheat Sheet

```sql
-- 1. Get signal count by ticker
SELECT ticker, COUNT(*) as signals
FROM iteration_signals
WHERE iteration_id = 'ITERATION_ID'
GROUP BY ticker
ORDER BY signals DESC;

-- 2. Get backtest performance by ticker
SELECT ticker, AVG(pnl) as avg_pnl, COUNT(*) as trades
FROM iteration_trades
WHERE iteration_id = 'ITERATION_ID'
GROUP BY ticker
ORDER BY avg_pnl DESC;

-- 3. Check liquidity
SELECT ticker, AVG(volume) as avg_volume
FROM stock_bars
WHERE timeframe = '1day'
AND timestamp >= datetime('now', '-30 days')
GROUP BY ticker
HAVING avg_volume >= 1000000;

-- 4. Check price range
SELECT ticker, AVG(close) as avg_price
FROM stock_bars
WHERE timeframe = '1day'
GROUP BY ticker
HAVING avg_price BETWEEN 20 AND 200;

-- 5. Sector distribution
SELECT sector, COUNT(*) as count
FROM stock_metadata
WHERE ticker IN ('LIST', 'OF', 'TICKERS')
GROUP BY sector;
```

---

## Next Steps

**Immediate Action Items:**

1. **Extract the 500 VWAP signals** from iteration 1
2. **Run the ranking analysis** to identify top 50 tickers
3. **Validate with backtests** to confirm performance
4. **Deploy to paper trading** with optimized 40-50 ticker watchlist
5. **Monitor for 30 days** and iterate

**Expected Outcome:**
- 40-50 ticker watchlist optimized for VWAP mean reversion
- 60-70% win rate in paper trading (validated)
- Manageable infrastructure load
- Clear performance attribution by ticker
- Foundation for scaling to other strategies

---

**Document Status**: ✅ Complete
**Next Update**: After first 30 days of paper trading results
**Contact**: Review monthly and adjust ticker selection based on live performance
