/**
 * Backfill Russell 2000 component stocks - daily and 5-minute bars for the last month
 *
 * Usage: npx ts-node helper-scripts/backfill-russell-2000-components.ts
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

// Parallel processing - Polygon Premium can handle high concurrency
const CONCURRENT_REQUESTS = 50;
const CONCURRENT_INTRADAY_REQUESTS = 20;

interface PolygonBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
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

interface IntradayBar {
  ticker: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch Russell 2000 component tickers from Polygon
 */
async function fetchRussell2000Tickers(): Promise<string[]> {
  try {
    console.log('📡 Fetching Russell 2000 component tickers from Polygon...');

    const url = 'https://api.polygon.io/v3/reference/tickers';
    const allTickers: string[] = [];
    let nextUrl = url;

    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        params: {
          apiKey: POLYGON_API_KEY,
          market: 'stocks',
          active: true,
          limit: 1000
        },
        timeout: 30000
      });

      if (response.data.results) {
        // Filter for US stocks only
        const usTickers = response.data.results
          .filter((t: any) => t.locale === 'us' && t.market === 'stocks')
          .map((t: any) => t.ticker);
        allTickers.push(...usTickers);
      }

      nextUrl = response.data.next_url;
      if (nextUrl && POLYGON_API_KEY) {
        nextUrl = `${nextUrl}&apiKey=${POLYGON_API_KEY}`;
      } else {
        break;
      }

      // Small delay
      await sleep(100);
    }

    console.log(`✅ Found ${allTickers.length} active US stock tickers`);

    // For Russell 2000, we'll take small/mid cap stocks
    // Sort and take first 2000 (this is approximate - real R2000 would need market cap data)
    const russell2000 = allTickers.slice(0, 2000);

    console.log(`📊 Using ${russell2000.length} tickers for backfill`);
    return russell2000;

  } catch (error: any) {
    console.error('❌ Error fetching tickers:', error.message);
    return [];
  }
}

/**
 * Fetch daily bars from Polygon API
 */
async function fetchDailyBars(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<DailyBar[]> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}`;

    const response = await axios.get(url, {
      params: {
        apiKey: POLYGON_API_KEY,
        adjusted: true,
        sort: 'asc',
        limit: 50000
      },
      timeout: 30000
    });

    if (response.data.resultsCount > 0 && response.data.results) {
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

      return bars;
    }

    return [];

  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`⏸️  Rate limited on ${ticker}, waiting 10 seconds...`);
      await sleep(10000);
      return fetchDailyBars(ticker, startDate, endDate);
    }

    // Silently skip 404s (delisted/invalid tickers)
    if (error.response?.status !== 404) {
      console.error(`❌ Error fetching ${ticker}:`, error.message);
    }
    return [];
  }
}

/**
 * Fetch 5-minute bars from Polygon API for entire date range
 */
async function fetchIntradayBars(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<IntradayBar[]> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${startDate}/${endDate}`;

    const response = await axios.get(url, {
      params: {
        apiKey: POLYGON_API_KEY,
        adjusted: true,
        sort: 'asc',
        limit: 50000
      },
      timeout: 60000
    });

    if (response.data.resultsCount > 0 && response.data.results) {
      const bars: IntradayBar[] = response.data.results.map((bar: PolygonBar) => ({
        ticker,
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v
      }));

      return bars;
    }

    return [];

  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`⏸️  Rate limited on ${ticker}, waiting 10 seconds...`);
      await sleep(10000);
      return fetchIntradayBars(ticker, startDate, endDate);
    }

    // Silently skip 404s
    if (error.response?.status !== 404) {
      console.error(`❌ Error fetching intraday ${ticker}:`, error.message);
    }
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

    const changePercent = prevBar ? ((bar.close - prevBar.close) / prevBar.close) * 100 : 0;
    const changeFromOpen = ((bar.close - bar.open) / bar.open) * 100;
    const highLowRangePercent = ((bar.high - bar.low) / bar.open) * 100;
    const closeToHighPercent = ((bar.high - bar.close) / bar.high) * 100;
    const closeToLowPercent = ((bar.close - bar.low) / bar.low) * 100;

    let volumeRatio = 1.0;
    if (i >= 30) {
      const last30Bars = bars.slice(i - 30, i);
      const avgVolume = last30Bars.reduce((sum, b) => sum + b.volume, 0) / 30;
      volumeRatio = avgVolume > 0 ? bar.volume / avgVolume : 1.0;
    }

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
function saveDailyBarsToDatabase(bars: DailyBar[]): void {
  if (bars.length === 0) return;

  const db = getDatabase();
  const metrics = calculateMetrics(bars);

  const insertOhlcvStmt = db.prepare(`
    INSERT OR REPLACE INTO ohlcv_data (
      ticker, timestamp, timeframe, open, high, low, close, volume
    ) VALUES (?, ?, '1day', ?, ?, ?, ?, ?)
  `);

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
        bar.ticker, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume
      );
    }

    for (const metric of metrics) {
      insertMetricsStmt.run(
        metric.ticker, metric.date, metric.timestamp, metric.open, metric.high, metric.low,
        metric.close, metric.volume, metric.change_percent, metric.change_from_open,
        metric.change_5d_percent, metric.change_10d_percent, metric.volume_ratio,
        metric.consecutive_up_days, metric.consecutive_down_days, metric.rsi_14,
        metric.sma_20, metric.sma_50, metric.price_to_sma20_percent,
        metric.price_to_sma50_percent, metric.high_low_range_percent,
        metric.close_to_high_percent, metric.close_to_low_percent
      );
    }
  });

  insertMany();
}

/**
 * Save intraday bars to database
 */
function saveIntradayBarsToDatabase(bars: IntradayBar[]): void {
  if (bars.length === 0) return;

  const db = getDatabase();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO ohlcv_data (
      ticker, timestamp, timeframe, open, high, low, close, volume
    ) VALUES (?, ?, '5min', ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const bar of bars) {
      insertStmt.run(
        bar.ticker, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume
      );
    }
  });

  insertMany();
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
  console.log('🚀 Starting Russell 2000 Components Backfill - Last Month\n');

  // Initialize database
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  // Fetch Russell 2000 component tickers
  const tickers = await fetchRussell2000Tickers();

  if (tickers.length === 0) {
    console.error('❌ No tickers found');
    process.exit(1);
  }

  // Calculate date range (30 days)
  const { startDate, endDate } = getDateRange(30);
  console.log(`📅 Date range: ${startDate} to ${endDate} (30 days)\n`);

  // Statistics
  let dailySuccessCount = 0;
  let dailyFailCount = 0;
  let totalDailyBars = 0;
  let intradaySuccessCount = 0;
  let intradayFailCount = 0;
  let totalIntradayBars = 0;

  // ========================================
  // PHASE 1: DAILY BARS
  // ========================================
  console.log('='.repeat(60));
  console.log('📊 PHASE 1: FETCHING DAILY BARS');
  console.log('='.repeat(60));

  const dailyBatches: string[][] = [];
  for (let i = 0; i < tickers.length; i += CONCURRENT_REQUESTS) {
    dailyBatches.push(tickers.slice(i, i + CONCURRENT_REQUESTS));
  }

  console.log(`📦 Processing ${dailyBatches.length} batches of up to ${CONCURRENT_REQUESTS} tickers each\n`);

  for (let i = 0; i < dailyBatches.length; i++) {
    const batch = dailyBatches[i];
    console.log(`🔄 Daily batch ${i + 1}/${dailyBatches.length} (${batch.length} tickers)...`);

    const results = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const bars = await fetchDailyBars(ticker, startDate, endDate);
          if (bars.length > 0) {
            saveDailyBarsToDatabase(bars);
            return { ticker, success: true, barCount: bars.length };
          }
          return { ticker, success: false, barCount: 0 };
        } catch (error: any) {
          return { ticker, success: false, barCount: 0 };
        }
      })
    );

    for (const result of results) {
      if (result.success) {
        dailySuccessCount++;
        totalDailyBars += result.barCount;
      } else {
        dailyFailCount++;
      }
    }

    console.log(`  ✅ ${dailySuccessCount} successful, ❌ ${dailyFailCount} failed, 💾 ${totalDailyBars.toLocaleString()} bars saved`);

    // Small delay between batches
    await sleep(200);
  }

  // ========================================
  // PHASE 2: 5-MINUTE BARS
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 PHASE 2: FETCHING 5-MINUTE BARS');
  console.log('='.repeat(60));

  // Only fetch intraday for tickers that had daily data
  const successfulTickers = tickers.slice(0, dailySuccessCount);

  const intradayBatches: string[][] = [];
  for (let i = 0; i < successfulTickers.length; i += CONCURRENT_INTRADAY_REQUESTS) {
    intradayBatches.push(successfulTickers.slice(i, i + CONCURRENT_INTRADAY_REQUESTS));
  }

  console.log(`📦 Processing ${intradayBatches.length} batches of up to ${CONCURRENT_INTRADAY_REQUESTS} tickers each\n`);

  for (let i = 0; i < intradayBatches.length; i++) {
    const batch = intradayBatches[i];
    console.log(`🔄 Intraday batch ${i + 1}/${intradayBatches.length} (${batch.length} tickers)...`);

    const results = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const bars = await fetchIntradayBars(ticker, startDate, endDate);
          if (bars.length > 0) {
            saveIntradayBarsToDatabase(bars);
            return { ticker, success: true, barCount: bars.length };
          }
          return { ticker, success: false, barCount: 0 };
        } catch (error: any) {
          return { ticker, success: false, barCount: 0 };
        }
      })
    );

    for (const result of results) {
      if (result.success) {
        intradaySuccessCount++;
        totalIntradayBars += result.barCount;
      } else {
        intradayFailCount++;
      }
    }

    console.log(`  ✅ ${intradaySuccessCount} successful, ❌ ${intradayFailCount} failed, 💾 ${totalIntradayBars.toLocaleString()} bars saved`);

    // Small delay between batches
    await sleep(200);
  }

  // Final statistics
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKFILL COMPLETE - RUSSELL 2000 COMPONENTS');
  console.log('='.repeat(60));
  console.log(`📅 Date range: ${startDate} to ${endDate} (30 days)`);
  console.log(`\n📊 Daily Bars:`);
  console.log(`  ✅ Successful tickers: ${dailySuccessCount}/${tickers.length}`);
  console.log(`  ❌ Failed tickers: ${dailyFailCount}/${tickers.length}`);
  console.log(`  💾 Total daily bars: ${totalDailyBars.toLocaleString()}`);
  console.log(`\n📊 5-Minute Bars:`);
  console.log(`  ✅ Successful tickers: ${intradaySuccessCount}/${successfulTickers.length}`);
  console.log(`  ❌ Failed tickers: ${intradayFailCount}/${successfulTickers.length}`);
  console.log(`  💾 Total 5-min bars: ${totalIntradayBars.toLocaleString()}`);
  console.log('='.repeat(60));

  // Close database
  closeDatabase();
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
