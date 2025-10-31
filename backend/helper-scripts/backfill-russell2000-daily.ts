/**
 * Backfill 2 years of daily bars for Russell 2000
 *
 * Usage: npx tsx backfill-russell2000-daily.ts
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

// Parallel processing - no rate limits
const CONCURRENT_REQUESTS = 20; // Process 20 tickers at once

interface PolygonBar {
  t: number; // timestamp in milliseconds
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface DailyBar {
  ticker: string;
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch daily bars from Polygon API
 */
async function fetchDailyBars(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<DailyBar[]> {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not set in .env');
    return [];
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}`;

    console.log(`📡 Fetching ${ticker}: ${startDate} to ${endDate}...`);

    const response = await axios.get(url, {
      params: {
        apiKey: POLYGON_API_KEY,
        adjusted: true,
        sort: 'asc',
        limit: 50000
      },
      timeout: 30000
    });

    if (response.data.resultsCount === 0) {
      console.log(`⚠️  No data returned for ${ticker}`);
      return [];
    }

    if (response.data.results && response.data.results.length > 0) {
      const bars: DailyBar[] = response.data.results.map((bar: PolygonBar) => {
        const date = new Date(bar.t);
        return {
          ticker,
          date: date.toISOString().split('T')[0],
          timestamp: bar.t,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v
        };
      });

      console.log(`✅ Fetched ${bars.length} daily bars for ${ticker}`);
      return bars;
    }

    return [];

  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`⏸️  Rate limited on ${ticker}, waiting 60 seconds...`);
      await sleep(60000);
      return fetchDailyBars(ticker, startDate, endDate);
    }

    if (error.response?.status === 404) {
      console.log(`⚠️  Ticker ${ticker} not found (may be delisted or invalid)`);
      return [];
    }

    console.error(`❌ Error fetching ${ticker}:`, error.message);
    return [];
  }
}

/**
 * Calculate derived metrics for daily bars
 */
function calculateMetrics(bars: DailyBar[]): any[] {
  const metricsArray: any[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const prevBar = i > 0 ? bars[i - 1] : null;

    // Basic metrics
    const changePercent = prevBar ? ((bar.close - prevBar.close) / prevBar.close) * 100 : 0;
    const changeFromOpen = ((bar.close - bar.open) / bar.open) * 100;
    const highLowRangePercent = ((bar.high - bar.low) / bar.open) * 100;
    const closeToHighPercent = ((bar.high - bar.close) / bar.high) * 100;
    const closeToLowPercent = ((bar.close - bar.low) / bar.low) * 100;

    // Volume ratio (30-day average)
    let volumeRatio = 1.0;
    if (i >= 30) {
      const last30Bars = bars.slice(i - 30, i);
      const avgVolume = last30Bars.reduce((sum, b) => sum + b.volume, 0) / 30;
      volumeRatio = avgVolume > 0 ? bar.volume / avgVolume : 1.0;
    }

    // Consecutive up/down days
    let consecutiveUpDays = 0;
    let consecutiveDownDays = 0;
    for (let j = i; j > 0; j--) {
      if (bars[j].close > bars[j - 1].close) {
        consecutiveUpDays++;
      } else {
        break;
      }
    }
    for (let j = i; j > 0; j--) {
      if (bars[j].close < bars[j - 1].close) {
        consecutiveDownDays++;
      } else {
        break;
      }
    }

    // RSI (14-day)
    let rsi = 50;
    if (i >= 14) {
      const changes = [];
      for (let j = i - 13; j <= i; j++) {
        if (j > 0) {
          changes.push(bars[j].close - bars[j - 1].close);
        }
      }
      const gains = changes.filter(c => c > 0).reduce((sum, c) => sum + c, 0) / 14;
      const losses = Math.abs(changes.filter(c => c < 0).reduce((sum, c) => sum + c, 0)) / 14;
      if (losses === 0) {
        rsi = 100;
      } else {
        const rs = gains / losses;
        rsi = 100 - (100 / (1 + rs));
      }
    }

    // SMAs
    let sma20 = bar.close;
    let sma50 = bar.close;
    if (i >= 20) {
      const last20 = bars.slice(i - 19, i + 1);
      sma20 = last20.reduce((sum, b) => sum + b.close, 0) / 20;
    }
    if (i >= 50) {
      const last50 = bars.slice(i - 49, i + 1);
      sma50 = last50.reduce((sum, b) => sum + b.close, 0) / 50;
    }

    const priceToSma20Percent = ((bar.close - sma20) / sma20) * 100;
    const priceToSma50Percent = ((bar.close - sma50) / sma50) * 100;

    // 5-day and 10-day changes
    let change5dPercent = 0;
    let change10dPercent = 0;
    if (i >= 5) {
      const bar5DaysAgo = bars[i - 5];
      change5dPercent = ((bar.close - bar5DaysAgo.close) / bar5DaysAgo.close) * 100;
    }
    if (i >= 10) {
      const bar10DaysAgo = bars[i - 10];
      change10dPercent = ((bar.close - bar10DaysAgo.close) / bar10DaysAgo.close) * 100;
    }

    metricsArray.push({
      ticker: bar.ticker,
      date: bar.date,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      change_percent: changePercent,
      change_from_open: changeFromOpen,
      change_5d_percent: change5dPercent,
      change_10d_percent: change10dPercent,
      volume_ratio: volumeRatio,
      consecutive_up_days: consecutiveUpDays,
      consecutive_down_days: consecutiveDownDays,
      rsi_14: rsi,
      sma_20: sma20,
      sma_50: sma50,
      price_to_sma20_percent: priceToSma20Percent,
      price_to_sma50_percent: priceToSma50Percent,
      high_low_range_percent: highLowRangePercent,
      close_to_high_percent: closeToHighPercent,
      close_to_low_percent: closeToLowPercent
    });
  }

  return metricsArray;
}

/**
 * Save daily bars and metrics to database
 */
function saveBarsToDatabase(bars: DailyBar[]): void {
  if (bars.length === 0) return;

  const db = getDatabase();

  // Calculate metrics
  const metrics = calculateMetrics(bars);

  // Insert into ohlcv_data
  const insertOhlcvStmt = db.prepare(`
    INSERT OR REPLACE INTO ohlcv_data (
      ticker, timestamp, timeframe, open, high, low, close, volume
    ) VALUES (?, ?, '1day', ?, ?, ?, ?, ?)
  `);

  // Insert into daily_metrics
  const insertMetricsStmt = db.prepare(`
    INSERT OR REPLACE INTO daily_metrics (
      ticker, date, timestamp, open, high, low, close, volume,
      change_percent, change_from_open, change_5d_percent, change_10d_percent,
      volume_ratio, consecutive_up_days, consecutive_down_days, rsi_14,
      sma_20, sma_50, price_to_sma20_percent, price_to_sma50_percent,
      high_low_range_percent, close_to_high_percent, close_to_low_percent
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const insertMany = db.transaction(() => {
    for (const bar of bars) {
      insertOhlcvStmt.run(
        bar.ticker,
        bar.timestamp,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume
      );
    }

    for (const metric of metrics) {
      insertMetricsStmt.run(
        metric.ticker,
        metric.date,
        metric.timestamp,
        metric.open,
        metric.high,
        metric.low,
        metric.close,
        metric.volume,
        metric.change_percent,
        metric.change_from_open,
        metric.change_5d_percent,
        metric.change_10d_percent,
        metric.volume_ratio,
        metric.consecutive_up_days,
        metric.consecutive_down_days,
        metric.rsi_14,
        metric.sma_20,
        metric.sma_50,
        metric.price_to_sma20_percent,
        metric.price_to_sma50_percent,
        metric.high_low_range_percent,
        metric.close_to_high_percent,
        metric.close_to_low_percent
      );
    }
  });

  insertMany();
  console.log(`💾 Saved ${bars.length} daily bars + metrics to database`);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get date range for backfill
 */
function getDateRange(daysBack: number): { startDate: string; endDate: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - daysBack);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0]
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Russell 2000 Daily Data Backfill (2 Years)\n');

  // Initialize database
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  // Get tickers from universe_stocks table
  const db = getDatabase();
  const tickerRows = db.prepare('SELECT ticker FROM universe_stocks WHERE universe_id = 2 AND is_active = 1').all() as Array<{ ticker: string }>;
  const tickers = tickerRows.map(row => row.ticker);

  console.log(`📊 Found ${tickers.length} tickers in Russell 2000 universe\n`);

  if (tickers.length === 0) {
    console.error('❌ No tickers found in universe_id 2. Run populate-russell2000-universe.ts first.');
    process.exit(1);
  }

  // Calculate date range (2 years = 730 days)
  const { startDate, endDate } = getDateRange(730);
  console.log(`📅 Date range: ${startDate} to ${endDate}\n`);

  // Statistics
  let successCount = 0;
  let failCount = 0;
  let totalBars = 0;

  // Process tickers in parallel batches
  const processBatch = async (batch: string[], batchNum: number) => {
    console.log(`\n🔄 Processing batch ${batchNum} (${batch.length} tickers)...`);

    const results = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const bars = await fetchDailyBars(ticker, startDate, endDate);
          if (bars.length > 0) {
            saveBarsToDatabase(bars);
            return { ticker, success: true, barCount: bars.length };
          }
          return { ticker, success: false, barCount: 0 };
        } catch (error: any) {
          console.error(`❌ Failed ${ticker}:`, error.message);
          return { ticker, success: false, barCount: 0 };
        }
      })
    );

    return results;
  };

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < tickers.length; i += CONCURRENT_REQUESTS) {
    batches.push(tickers.slice(i, i + CONCURRENT_REQUESTS));
  }

  console.log(`📦 Processing ${batches.length} batches of up to ${CONCURRENT_REQUESTS} tickers each\n`);

  // Process all batches
  for (let i = 0; i < batches.length; i++) {
    const results = await processBatch(batches[i], i + 1);

    for (const result of results) {
      if (result.success) {
        successCount++;
        totalBars += result.barCount;
      } else {
        failCount++;
      }
    }
  }

  // Final statistics
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKFILL COMPLETE - DAILY BARS');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${tickers.length} tickers`);
  console.log(`❌ Failed: ${failCount}/${tickers.length} tickers`);
  console.log(`💾 Total daily bars saved: ${totalBars.toLocaleString()}`);
  console.log(`📅 Date range: ${startDate} to ${endDate} (1 year)`);
  console.log('='.repeat(60));

  // Close database
  closeDatabase();
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
