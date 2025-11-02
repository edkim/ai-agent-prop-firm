# Russell 2000 Agent Setup Plan

**Date**: 2025-10-30
**Status**: 🔄 Planning

## Overview
Create a new learning agent focused on Russell 2000 small-cap stocks with full data backfill.

## Current State
- **Universe 1**: Tech Sector (65 tickers)
- **Agents**: 2 existing (Momentum Breakout Hunter, unnamed)
- **Data**: Tech sector has daily + intraday metrics

## Requirements

### 1. Russell 2000 Universe
- **Universe ID**: 2
- **Ticker Count**: Full R2000 has ~2000 constituents
- **Recommended Start**: 50-100 most liquid R2000 stocks
- **Data Required**:
  - Company names
  - Sectors/industries
  - Market caps
  - Is active status

### 2. Data Backfill Needed
#### Daily Metrics
- OHLCV (Open, High, Low, Close, Volume)
- Date range: Last 2 years (2023-10-30 to 2025-10-30)
- ~500 trading days per ticker
- Total records: ~50,000 for 100 tickers

#### Intraday (5-minute) Metrics
- OHLCV at 5min intervals
- Date range: Last 30 days
- ~78 bars per day × 30 days = 2,340 bars per ticker
- Total records: ~234,000 for 100 tickers

### 3. New Agent Configuration
- **Name**: "Russell 2000 Value Hunter"
- **Trading Style**: swing_trader (2-5 day holds)
- **Risk Tolerance**: moderate
- **Pattern Focus**: value_momentum, reversal_bounce
- **Market Conditions**: oversold_bounce, sector_rotation
- **Universe**: Russell 2000 (ID: 2)
- **Timeframe**: 5min for entry, daily for screening

## Implementation Steps

### Phase 1: Universe Setup (15 min)
1. ✅ Get list of liquid R2000 tickers
2. ✅ Create universe_id 2 entries in database
3. ✅ Populate with top 100 by average volume

### Phase 2: Daily Data Backfill (30-60 min)
1. ✅ Create backfill script: `backfill-russell2000-daily.ts`
2. ✅ Fetch 2 years of daily data via Polygon API
3. ✅ Store in `daily_metrics` table
4. ✅ Run backfill (~100 API calls × 0.5s = 50 seconds)

### Phase 3: Intraday Data Backfill (60-90 min)
1. ✅ Create backfill script: `backfill-russell2000-intraday.ts`
2. ✅ Fetch 30 days of 5min data via Polygon API
3. ✅ Store in `intraday_metrics` table
4. ✅ Run backfill (~3000 API calls × 0.5s = 25 minutes)

### Phase 4: Agent Creation (10 min)
1. ✅ Create agent via API or direct SQL insert
2. ✅ Configure with R2000-specific parameters
3. ✅ Enable auto-approval with conservative thresholds
4. ✅ Enable scheduled learning (optional)

### Phase 5: Initial Learning Iteration (Test)
1. ✅ Trigger first iteration
2. ✅ Verify scanner finds signals
3. ✅ Verify knowledge extraction works
4. ✅ Check iteration completes successfully

## Polygon API Considerations

### Rate Limits
- **Free Tier**: 5 calls/minute
- **Paid Tier**: Higher limits
- **Our Need**: ~3100 total calls

### Data Availability
- Daily: Full history available
- Intraday: Last 2-60 days depending on plan
- Recommendation: Start with 30-day lookback

## Database Impact

### Storage Estimates
- **Daily metrics**: 100 tickers × 500 days × 0.5KB = 25MB
- **Intraday metrics**: 100 tickers × 2340 bars × 0.5KB = 117MB
- **Total**: ~142MB additional data

### Query Performance
- Indexes exist on (ticker, date)
- Should maintain sub-second query times
- Monitor after backfill

## Russell 2000 Ticker Selection

### Option A: Market Cap Weighted (Top 100)
Select largest 100 companies by market cap from R2000

### Option B: Liquidity Weighted (Top 100)
Select most liquid 100 stocks by average daily volume

### Option C: Diversified Sample
- 20 stocks from each major sector
- Ensures sector coverage
- Avoids sector concentration

**Recommendation**: Option B (Liquidity Weighted)
- Best for backtesting (tight spreads, good fills)
- Easier to find patterns (more data points)
- More realistic for paper/live trading

## Success Criteria

1. ✅ 100 R2000 tickers populated in universe_id 2
2. ✅ Daily data: 100 tickers × 500 days minimum
3. ✅ Intraday data: 100 tickers × 30 days minimum
4. ✅ Agent created and active
5. ✅ First learning iteration completes
6. ✅ Knowledge extraction works correctly

## Risks & Mitigation

### Risk: API Rate Limits
**Mitigation**: Add delays between calls, use batch endpoints where available

### Risk: Data Quality Issues
**Mitigation**: Validate data after backfill, check for gaps, handle errors gracefully

### Risk: Long Backfill Time
**Mitigation**: Run in background, show progress, allow resuming

### Risk: Storage Constraints
**Mitigation**: Monitor disk space, implement data retention policy if needed

## Next Actions

1. Confirm ticker list (100 liquid R2000 stocks)
2. Create backfill scripts
3. Run daily backfill first (faster, validates approach)
4. Run intraday backfill
5. Create agent
6. Test iteration

## Notes

- Russell 2000 is rebalanced annually (June)
- Need to handle ticker changes/delistings
- Consider adding fundamental data later (P/E, P/B, etc.)
- Value strategies may need longer lookback (3-5 years)
