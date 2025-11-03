/**
 * Targeted 1-Minute Backfill for Parabolic Exhaustion Pattern Validation
 *
 * Backfills ONLY the tickers and dates where iteration 22 found signals.
 * Much more efficient than full historical backfill.
 *
 * Targets:
 * - 7 tickers: ABAT, BYND, CRML, OMER, PRAX, REPL, UAMY
 * - Date range: 2025-10-15 to 2025-10-24 (10 trading days)
 * - Expected: ~27,300 bars (7 × 10 × ~390 bars/day)
 *
 * Usage: npx ts-node helper-scripts/backfill-parabolic-signals-1min.ts
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

// Targeted tickers from iteration 22 signals
const TARGET_TICKERS = ['ABAT', 'BYND', 'CRML', 'OMER', 'PRAX', 'REPL', 'UAMY'];

// Date range where signals occurred
const START_DATE = '2025-10-15';
const END_DATE = '2025-10-24';

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

function timestampToTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getUTCHours() - 4).padStart(2, '0'); // Convert to ET (approximate)
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function fetch1MinBars(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<IntradayBar[]> {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not set in .env');
    return [];
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${startDate}/${endDate}`;

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
        timeframe: '1min',
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
      return fetch1MinBars(ticker, startDate, endDate);
    }

    if (error.response?.status === 404) {
      console.log(`⚠️  Ticker ${ticker} not found (may be delisted or invalid)`);
      return [];
    }

    console.error(`❌ Error fetching ${ticker}:`, error.message);
    return [];
  }
}

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Targeted 1-Minute Backfill for Parabolic Exhaustion Validation\\n');
  console.log(`📊 Tickers: ${TARGET_TICKERS.join(', ')} (${TARGET_TICKERS.length} total)`);
  console.log(`📅 Date range: ${START_DATE} to ${END_DATE}`);
  console.log(`⏱️  Expected: ~27,300 bars (${TARGET_TICKERS.length} tickers × ~10 days × ~390 bars/day)\\n`);

  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../backtesting.db');
  initializeDatabase(dbPath);

  let successCount = 0;
  let failCount = 0;
  let totalBars = 0;

  const startTime = Date.now();

  // Process each ticker
  for (let i = 0; i < TARGET_TICKERS.length; i++) {
    const ticker = TARGET_TICKERS[i];

    try {
      const bars = await fetch1MinBars(ticker, START_DATE, END_DATE);
      if (bars.length > 0) {
        saveBarsToDatabase(bars);
        successCount++;
        totalBars += bars.length;
      } else {
        failCount++;
      }
    } catch (error: any) {
      console.error(`❌ Failed ${ticker}:`, error.message);
      failCount++;
    }

    // Progress update
    const progress = ((i + 1) / TARGET_TICKERS.length * 100).toFixed(1);
    console.log(`\\n⏱️  Progress: ${progress}% (${i + 1}/${TARGET_TICKERS.length}) | Total bars: ${totalBars.toLocaleString()}`);

    // Rate limiting: wait 12 seconds between requests (5 requests/min limit)
    if (i < TARGET_TICKERS.length - 1) {
      console.log('⏸️  Waiting 12 seconds (rate limit)...');
      await sleep(12000);
    }
  }

  const totalMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\\n' + '='.repeat(60));
  console.log('📊 TARGETED BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${TARGET_TICKERS.length} tickers`);
  console.log(`❌ Failed: ${failCount}/${TARGET_TICKERS.length} tickers`);
  console.log(`💾 Total bars saved: ${totalBars.toLocaleString()}`);
  console.log(`📅 Date range: ${START_DATE} to ${END_DATE}`);
  console.log(`⏱️  Total time: ${totalMinutes} minutes`);
  if (successCount > 0) {
    console.log(`📈 Average bars per ticker: ${Math.round(totalBars / successCount)}`);
  }
  console.log('='.repeat(60));

  closeDatabase();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
