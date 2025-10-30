/**
 * Fix time_of_day field for existing 5-minute data
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function timestampToTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  // Convert to ET timezone (UTC-5 for EST, UTC-4 for EDT)
  // Using -5 for simplicity
  const hours = date.getUTCHours() - 5;
  const adjustedHours = hours < 0 ? hours + 24 : hours;
  const minutes = date.getUTCMinutes();
  return `${String(adjustedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

async function main() {
  console.log('🔧 Fixing time_of_day field for 5-minute bars\n');

  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  // Get all 5-minute bars without time_of_day
  const stmt = db.prepare(`
    SELECT ticker, timestamp
    FROM ohlcv_data
    WHERE timeframe = '5min' AND time_of_day IS NULL
  `);

  const rows = stmt.all() as Array<{ ticker: string; timestamp: number }>;
  console.log(`Found ${rows.length} bars to update`);

  if (rows.length === 0) {
    console.log('✅ All bars already have time_of_day set!');
    closeDatabase();
    return;
  }

  // Update in batches
  const updateStmt = db.prepare(`
    UPDATE ohlcv_data
    SET time_of_day = ?
    WHERE ticker = ? AND timestamp = ? AND timeframe = '5min'
  `);

  const updateBatch = db.transaction((rows: Array<{ ticker: string; timestamp: number }>) => {
    for (const row of rows) {
      const timeOfDay = timestampToTimeOfDay(row.timestamp);
      updateStmt.run(timeOfDay, row.ticker, row.timestamp);
    }
  });

  console.log('⏳ Updating...');
  updateBatch(rows);
  console.log(`✅ Updated ${rows.length} bars with time_of_day values\n`);

  // Verify
  const verifyStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM ohlcv_data
    WHERE timeframe = '5min' AND time_of_day IS NULL
  `);
  const result = verifyStmt.get() as { count: number };

  console.log(`Remaining bars without time_of_day: ${result.count}`);

  closeDatabase();
}

main().catch(console.error);
