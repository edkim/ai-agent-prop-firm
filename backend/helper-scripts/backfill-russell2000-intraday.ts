/**
 * Backfill 30 days of 5-minute intraday data for Russell 2000
 *
 * Usage: npx tsx backfill-russell2000-intraday.ts
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

interface IntradayBar {
  ticker: string;
  timestamp: number;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time_of_day: string;
}

/**
 * Convert Unix timestamp to HH:MM format (ET timezone)
 */
function timestampToTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getUTCHours() - 4).padStart(2, '0'); // Convert to ET (approximate)
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Fetch 5-minute bars from Polygon API
 */
async function fetch5MinBars(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<IntradayBar[]> {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not set in .env');
    return [];
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${startDate}/${endDate}`;

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
      const bars: IntradayBar[] = response.data.results.map((bar: PolygonBar) => ({
        ticker,
        timestamp: bar.t,
        timeframe: '5min',
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        time_of_day: timestampToTimeOfDay(bar.t)
      }));

      console.log(`✅ Fetched ${bars.length} bars for ${ticker}`);
      return bars;
    }

    return [];

  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`⏸️  Rate limited on ${ticker}, waiting 60 seconds...`);
      await sleep(60000);
      return fetch5MinBars(ticker, startDate, endDate);
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
 * Save bars to database
 */
function saveBarsToDatabase(bars: IntradayBar[]): void {
  if (bars.length === 0) return;

  const db = getDatabase();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO ohlcv_data (
      ticker, timestamp, timeframe, open, high, low, close, volume, time_of_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((bars: IntradayBar[]) => {
    for (const bar of bars) {
      insertStmt.run(
        bar.ticker,
        bar.timestamp,
        bar.timeframe,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.time_of_day
      );
    }
  });

  insertMany(bars);
  console.log(`💾 Saved ${bars.length} bars to database`);
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
  console.log('🚀 Starting Russell 2000 Intraday Data Backfill (30 Days)\n');

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

  // Calculate date range (30 days back)
  const { startDate, endDate } = getDateRange(30);
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
          const bars = await fetch5MinBars(ticker, startDate, endDate);
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
  console.log('📊 BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${tickers.length} tickers`);
  console.log(`❌ Failed: ${failCount}/${tickers.length} tickers`);
  console.log(`💾 Total bars saved: ${totalBars.toLocaleString()}`);
  console.log(`📅 Date range: ${startDate} to ${endDate}`);
  console.log('='.repeat(60));

  // Close database
  closeDatabase();
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
