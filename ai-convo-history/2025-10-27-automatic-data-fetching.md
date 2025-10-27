# Automatic Intraday Data Fetching for Batch Backtesting

**Date:** 2025-10-27
**Feature:** Automatic data availability checking and fetching
**Branch:** `feature/batch-backtesting`

## Problem

During initial testing of the batch backtesting system, all 25 tests returned 0 trades. Investigation revealed:

- **Root Cause**: Database lacked 5-minute intraday data for test tickers
- **Data Available**: Only 46 bars (~4 hours) for ATXS on 2025-10-27
- **Data Expected**: 40 days (2025-09-24 to 2025-11-03) for all tickers
- **Impact**: Strategies couldn't find entry signals without sufficient historical data

## Solution

Added automatic data fetching to ensure backtests always have the required data.

### Implementation

**File**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/batch-backtest.service.ts`

**Changes**:

1. **Added imports** (lines 14-15):
```typescript
import polygonService from './polygon.service';
import UniverseDataService from './universe-data.service';
```

2. **Added pre-flight check** (lines 144-146):
```typescript
// Step 1.5: Ensure intraday data is available for all samples
logger.info(`📊 Checking intraday data availability for ${samples.length} samples...`);
await this.ensureIntradayData(samples);
```

3. **New method** `ensureIntradayData()` (lines 576-642):
```typescript
private async ensureIntradayData(samples: Sample[]): Promise<void> {
  const uniqueTickers = new Map<string, Sample>();

  // Deduplicate by ticker (use widest date range if duplicates)
  for (const sample of samples) {
    const existing = uniqueTickers.get(sample.ticker);
    if (!existing) {
      uniqueTickers.set(sample.ticker, sample);
    } else {
      // Use widest date range
      const startDate = new Date(sample.start_date) < new Date(existing.start_date)
        ? sample.start_date
        : existing.start_date;
      const endDate = new Date(sample.end_date) > new Date(existing.end_date)
        ? sample.end_date
        : existing.end_date;
      uniqueTickers.set(sample.ticker, { ...sample, start_date: startDate, end_date: endDate });
    }
  }

  let fetchedCount = 0;
  let cachedCount = 0;

  for (const sample of uniqueTickers.values()) {
    const startTimestamp = new Date(sample.start_date).getTime();
    const endTimestamp = new Date(sample.end_date).getTime();

    // Check if 5-minute data exists
    const hasData = await polygonService.hasData(
      sample.ticker,
      '5min',
      startTimestamp,
      endTimestamp
    );

    if (!hasData) {
      logger.info(`  📥 Fetching 5-min data for ${sample.ticker} (${sample.start_date} to ${sample.end_date})...`);
      try {
        await UniverseDataService.fetchIntradayDataOnDemand(
          sample.ticker,
          sample.start_date,
          sample.end_date,
          '5min'
        );
        fetchedCount++;
      } catch (error: any) {
        logger.error(`  ❌ Failed to fetch data for ${sample.ticker}: ${error.message}`);
        // Continue with other samples even if one fails
      }
    } else {
      logger.info(`  ✓ ${sample.ticker}: Data already cached`);
      cachedCount++;
    }

    // Small delay between fetches to respect API rate limits
    if (fetchedCount > 0 && uniqueTickers.size > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (fetchedCount > 0) {
    logger.info(`✅ Fetched 5-min data for ${fetchedCount} ticker(s)`);
  }
  if (cachedCount > 0) {
    logger.info(`✅ Using cached data for ${cachedCount} ticker(s)`);
  }
}
```

## How It Works

### Execution Flow

```
1. User clicks "Backtest All Strategies"
   ↓
2. Backend: Generate strategy scripts
   ↓
3. Backend: Check data availability ← NEW STEP
   - For each sample:
     - Check if 5-min data exists in database
     - If missing: Fetch from Polygon API
     - Cache in database
   ↓
4. Backend: Execute backtests (now with complete data)
   ↓
5. Frontend: Display results with actual trades
```

### Smart Features

1. **Deduplication**: Multiple samples with same ticker → single data fetch
2. **Widest Range**: If ticker appears multiple times, fetches data for widest date range
3. **Graceful Degradation**: Individual fetch failures don't stop entire batch
4. **Clear Logging**: Shows "📥 Fetching..." vs "✓ Data already cached"
5. **Rate Limiting**: 500ms delay between fetches
6. **Caching**: Fetched data is permanently cached for future runs

## Benefits

### Before
- ❌ Silent failures with 0 trades
- ❌ User has to manually check/fetch data
- ❌ Confusing results (no error, just no trades)
- ❌ Wastes Anthropic API calls (script generation for nothing)

### After
- ✅ Automatic data fetching
- ✅ Zero configuration required
- ✅ Clear logging shows progress
- ✅ Data cached for future runs
- ✅ Backtests produce actual results

## Example Log Output

```
📝 Generating backtest scripts for 5 strategies...
📊 Checking intraday data availability for 5 samples...
  ✓ ATXS: Data already cached
  📥 Fetching 5-min data for INTG (2025-09-24 to 2025-11-03)...
  📥 Fetching 5-min data for IMDX (2025-09-24 to 2025-11-03)...
  ✓ IMMX: Data already cached
  ✓ DGXX: Data already cached
✅ Fetched 5-min data for 2 ticker(s)
✅ Using cached data for 3 ticker(s)
🧪 Testing strategy: Volume Confirmation Entry (long)
```

## Technical Details

### API Used
- `polygonService.hasData()` - Check if data exists in database
- `UniverseDataService.fetchIntradayDataOnDemand()` - Fetch from Polygon + cache
- Both services already existed, just wired them together

### Performance Impact
- **First run**: +10-30 seconds (depends on tickers/date ranges)
- **Subsequent runs**: ~0 seconds (all cached)
- **Rate limits**: 500ms delay between fetches (Polygon limit: 5 req/min free tier)

### Error Handling
- Individual fetch failures logged but don't stop batch
- Backtest will run with whatever data is available
- If no data after fetch attempt, backtest returns 0 trades (as expected)

## Testing

### Manual Test Scenario
1. Create backtest set with new tickers (no cached data)
2. Run Claude visual analysis
3. Click "Backtest All Strategies"
4. Observe logs showing automatic fetching
5. Verify backtests return trades (not 0)

### Validation
- Check backend logs for "📥 Fetching..." messages
- Check database: `SELECT COUNT(*) FROM ohlcv_data WHERE ticker='...' AND timeframe='5min'`
- Verify batch backtest results have non-zero trade counts

## Update: Fixed Future Date Handling (2025-10-27)

### Problem Identified
When backtest samples had end dates in the future (e.g., 2025-11-03 when today is 2025-10-27), Polygon API would return incomplete data, resulting in insufficient bars for backtesting.

### Solution Implemented
Added automatic date capping in `ensureIntradayData()`:

```typescript
// Get today's date in YYYY-MM-DD format
const today = new Date();
today.setHours(0, 0, 0, 0);
const todayStr = today.toISOString().split('T')[0];

// Cap end date at today to prevent requesting future data
let effectiveEndDate = sample.end_date;
if (new Date(sample.end_date) > today) {
  effectiveEndDate = todayStr;
  cappedCount++;
}
```

**Logging**:
- Shows capped date ranges: `Fetching 5-min data for IMMX (2025-09-24 to 2025-10-27, capped from 2025-11-03)`
- Summary: `⚠️  Capped 5 ticker(s) end date to today (2025-10-27) to avoid future dates`

**Benefits**:
- ✅ No more incomplete data fetches
- ✅ Always fetches maximum available historical data
- ✅ Clear logging shows what was adjusted
- ✅ Automatic - no user intervention needed

## Future Enhancements

1. **Progress UI**: Show data fetching progress in frontend modal
2. **Parallel Fetching**: Fetch multiple tickers simultaneously (respecting rate limits)
3. **Preflight Estimate**: Show "Fetching data for X tickers (~Y seconds)" before starting
4. **Data Validation**: Check data quality (no gaps, sufficient bars, etc.)
5. **Smart Caching**: Only fetch data for new date ranges (extend existing data)

## Related Files

- `backend/src/services/batch-backtest.service.ts` - Main implementation
- `backend/src/services/polygon.service.ts` - Data availability checking
- `backend/src/services/universe-data.service.ts` - On-demand data fetching
- `ai-convo-history/2025-10-27-batch-backtesting-implementation.md` - Feature overview

## Commit Message

```
feat: Add automatic intraday data fetching for batch backtests

- Check 5-min data availability before executing backtests
- Automatically fetch missing data from Polygon API
- Deduplicate by ticker, use widest date range
- Cache fetched data for future runs
- Graceful error handling for individual fetch failures
- Clear logging: "📥 Fetching..." vs "✓ Data already cached"

Fixes issue where backtests returned 0 trades due to missing data.
```

---

**Status**: ✅ Implementation complete, ready for testing with real batch backtest
