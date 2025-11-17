/**
 * Backfill Russell 2000 for 2025-11-13
 * Target: Main database at project root
 */

import * as path from 'path';
import { getDatabase, initializeDatabase } from './src/database/db';
import polygonService from './src/services/polygon.service';

const DB_PATH = '/Users/edwardkim/Code/ai-backtest/backtesting.db';

async function main() {
  console.log('🚀 Starting Russell 2000 backfill for 2025-11-13');
  console.log(`📍 Target database: ${DB_PATH}\n`);

  // Initialize database with explicit path
  initializeDatabase(DB_PATH);

  const date = '2025-11-13';

  // Get tickers that already have data for 2025-11-13 (complete or incomplete)
  const db = getDatabase();
  const tickers = db.prepare(`
    SELECT DISTINCT ticker
    FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') = ?
    ORDER BY ticker ASC
  `).all(date) as { ticker: string }[];

  console.log(`📊 Found ${tickers.length} tickers with existing data for ${date}`);
  console.log(`   (Will backfill to ensure complete data for all)\n`);

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i].ticker;
    const progress = `[${i + 1}/${tickers.length}]`;

    try {
      // Check if data already exists
      const existing = db.prepare(`
        SELECT COUNT(*) as count
        FROM ohlcv_data
        WHERE ticker = ? AND timeframe = '5min'
          AND date(timestamp/1000, 'unixepoch') = ?
      `).get(ticker, date) as { count: number };

      if (existing.count > 50) {
        console.log(`${progress} ${ticker}: ⏭️  Skipped (${existing.count} bars already exist)`);
        skipped++;
        continue;
      }

      // Fetch and store data
      const count = await polygonService.fetchAndStore(ticker, '5min', date, date);

      if (count > 0) {
        console.log(`${progress} ${ticker}: ✅ ${count} bars`);
        completed++;
      } else {
        console.log(`${progress} ${ticker}: ⚠️  No data`);
        failed++;
      }

      // Rate limiting: 1 second delay
      if (i < tickers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error: any) {
      console.log(`${progress} ${ticker}: ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Backfill Complete!');
  console.log(`   ✅ Completed: ${completed} tickers`);
  console.log(`   ⏭️  Skipped: ${skipped} tickers (data exists)`);
  console.log(`   ❌ Failed: ${failed} tickers`);
  console.log(`${'='.repeat(60)}\n`);

  // Verify total bars
  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') = ?
  `).get(date) as { count: number };

  console.log(`💾 Total 5-min bars in database for ${date}: ${total.count.toLocaleString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
