import { initializeDatabase, getDatabase } from './src/database/db';
import polygonService from './src/services/polygon.service';

const DB_PATH = '/Users/edwardkim/Code/ai-backtest/backtesting.db';

async function main() {
  initializeDatabase(DB_PATH);
  const db = getDatabase();

  console.log('🚀 Starting Russell 2000 backfill for Sep-Nov 2025');
  console.log('📍 Target database:', DB_PATH);
  console.log('📅 Date range: 2025-09-01 to 2025-11-15');
  console.log('⚡ Unlimited API calls, no rate limits\n');

  // Get all distinct tickers that have any data (Russell 2000 universe)
  const tickers = db.prepare(`
    SELECT DISTINCT ticker
    FROM ohlcv_data
    WHERE timeframe = '5min'
      AND ticker NOT LIKE '%.%'
      AND ticker NOT LIKE '%W'
      AND ticker NOT LIKE '%U'
    ORDER BY ticker ASC
  `).all() as { ticker: string }[];

  console.log(`📊 Found ${tickers.length} tickers to backfill\n`);

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let totalBars = 0;

  const startDate = '2025-09-01';
  const endDate = '2025-11-15';

  for (let i = 0; i < tickers.length; i++) {
    const { ticker } = tickers[i];

    try {
      // Check existing data
      const existing = db.prepare(`
        SELECT COUNT(*) as count
        FROM ohlcv_data
        WHERE ticker = ? AND timeframe = '5min'
          AND date(timestamp/1000, 'unixepoch') >= date(?)
          AND date(timestamp/1000, 'unixepoch') <= date(?)
      `).get(ticker, startDate, endDate) as { count: number };

      // Skip if we already have significant data (>1000 bars = ~2+ weeks)
      if (existing.count > 1000) {
        skipped++;
        console.log(`[${i + 1}/${tickers.length}] ${ticker}: ⏭️  Skipped (${existing.count} bars already exist)`);
        continue;
      }

      // Fetch data from Polygon
      const count = await polygonService.fetchAndStore(ticker, '5min', startDate, endDate);

      if (count > 0) {
        completed++;
        totalBars += count;
        console.log(`[${i + 1}/${tickers.length}] ${ticker}: ✅ ${count} bars`);
      } else {
        skipped++;
        console.log(`[${i + 1}/${tickers.length}] ${ticker}: ⚠️  No data`);
      }

      // No delay - unlimited API calls

    } catch (error: any) {
      failed++;
      console.log(`[${i + 1}/${tickers.length}] ${ticker}: ❌ Error: ${error.message}`);
    }

    // Progress report every 100 tickers
    if ((i + 1) % 100 === 0) {
      console.log(`\n📈 Progress: ${i + 1}/${tickers.length} tickers processed`);
      console.log(`   ✅ Completed: ${completed}, ⏭️  Skipped: ${skipped}, ❌ Failed: ${failed}`);
      console.log(`   📊 Total bars fetched: ${totalBars.toLocaleString()}\n`);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Backfill Complete!');
  console.log(`   ✅ Completed: ${completed} tickers`);
  console.log(`   ⏭️  Skipped: ${skipped} tickers (data exists)`);
  console.log(`   ❌ Failed: ${failed} tickers`);
  console.log('='.repeat(60));

  // Check total bars in database for this date range
  const totalResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') >= date(?)
      AND date(timestamp/1000, 'unixepoch') <= date(?)
  `).get(startDate, endDate) as { count: number };

  console.log(`\n💾 Total 5-min bars in database for Sep-Nov 2025: ${totalResult.count.toLocaleString()}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
