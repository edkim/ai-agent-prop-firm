import { initializeDatabase, getDatabase } from './src/database/db';
import polygonService from './src/services/polygon.service';

const DB_PATH = '/Users/edwardkim/Code/ai-backtest/backtesting.db';

async function main() {
  initializeDatabase(DB_PATH);
  
  console.log('📥 Backfilling QQQ for 2025-11-13 and 2025-11-14...\n');
  
  for (const date of ['2025-11-13', '2025-11-14']) {
    const count = await polygonService.fetchAndStore('QQQ', '5min', date, date);
    console.log(`✅ QQQ ${date}: ${count} bars`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const db = getDatabase();
  const result = db.prepare(`
    SELECT date(timestamp/1000, 'unixepoch') as date, COUNT(*) as bars
    FROM ohlcv_data
    WHERE ticker='QQQ' AND timeframe='5min'
      AND date(timestamp/1000, 'unixepoch') IN ('2025-11-13', '2025-11-14')
    GROUP BY date
  `).all();
  
  console.log('\n📊 Verification:');
  result.forEach((r: any) => console.log(`  ${r.date}: ${r.bars} bars`));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
