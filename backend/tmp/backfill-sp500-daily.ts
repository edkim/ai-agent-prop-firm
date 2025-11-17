/**
 * Backfill 3 months of daily bars for S&P 500 tickers
 * Usage: npx ts-node tmp/backfill-sp500-daily.ts
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const CONCURRENT_REQUESTS = 15; // Process 15 tickers at once
const START_DATE = '2025-08-17';
const END_DATE = '2025-11-17';

interface PolygonBar {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

interface DailyBar {
  ticker: string; date: string; timestamp: number;
  open: number; high: number; low: number; close: number; volume: number;
}

async function fetchDailyBars(ticker: string): Promise<DailyBar[]> {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not set');
    return [];
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${START_DATE}/${END_DATE}`;
    console.log(`📡 ${ticker}: ${START_DATE} to ${END_DATE}...`);

    const response = await axios.get(url, {
      params: { apiKey: POLYGON_API_KEY, adjusted: true, sort: 'asc', limit: 50000 },
      timeout: 30000
    });

    if (response.data.resultsCount === 0) {
      console.log(`⚠️  No data for ${ticker}`);
      return [];
    }

    if (response.data.results) {
      const bars: DailyBar[] = response.data.results.map((bar: PolygonBar) => ({
        ticker,
        date: new Date(bar.t).toISOString().split('T')[0],
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v
      }));

      console.log(`✅ ${ticker}: ${bars.length} daily bars`);
      return bars;
    }

    return [];
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`⏸️  Rate limited on ${ticker}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
      return fetchDailyBars(ticker);
    }
    if (error.response?.status === 404) {
      console.log(`⚠️  ${ticker} not found (delisted/invalid)`);
      return [];
    }
    console.error(`❌ Error ${ticker}:`, error.message);
    return [];
  }
}

function saveBarsToDatabase(bars: DailyBar[]): void {
  if (bars.length === 0) return;

  const db = getDatabase();
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO ohlcv_data (
      ticker, timestamp, timeframe, open, high, low, close, volume
    ) VALUES (?, ?, '1day', ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((bars: DailyBar[]) => {
    for (const bar of bars) {
      insertStmt.run(bar.ticker, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume);
    }
  });

  transaction(bars);
  console.log(`💾 Saved ${bars.length} bars to database`);
}

async function processBatch(tickers: string[], batchNum: number, total: number): Promise<any[]> {
  console.log(`\n📦 Batch ${batchNum}/${total} (${tickers.join(', ')})`);

  const promises = tickers.map(ticker => fetchDailyBars(ticker));
  const results = await Promise.all(promises);

  for (const bars of results) {
    if (bars.length > 0) {
      saveBarsToDatabase(bars);
    }
  }

  return results;
}

async function main() {
  console.log('🚀 S&P 500 Daily Backfill');
  console.log(`📅 Date range: ${START_DATE} to ${END_DATE}\n`);

  await initializeDatabase();

  const tickersFile = fs.readFileSync(path.join(__dirname, 'sp500-tickers-list.txt'), 'utf-8');
  const allTickers = tickersFile.trim().split(',');

  console.log(`📊 Processing ${allTickers.length} tickers in batches of ${CONCURRENT_REQUESTS}...\n`);

  let successCount = 0;
  let failCount = 0;
  let totalBars = 0;

  const batches: string[][] = [];
  for (let i = 0; i < allTickers.length; i += CONCURRENT_REQUESTS) {
    batches.push(allTickers.slice(i, i + CONCURRENT_REQUESTS));
  }

  for (let i = 0; i < batches.length; i++) {
    const results = await processBatch(batches[i], i + 1, batches.length);

    for (const bars of results) {
      if (bars.length > 0) {
        successCount++;
        totalBars += bars.length;
      } else {
        failCount++;
      }
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 DAILY BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${allTickers.length} tickers`);
  console.log(`❌ Failed: ${failCount}/${allTickers.length} tickers`);
  console.log(`💾 Total bars saved: ${totalBars.toLocaleString()}`);
  console.log(`📅 Date range: ${START_DATE} to ${END_DATE}`);
  console.log('='.repeat(60));

  closeDatabase();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
