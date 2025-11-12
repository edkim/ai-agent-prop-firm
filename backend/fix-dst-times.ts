/**
 * Fix DST time_of_day values in the database
 *
 * The old extractTimeOfDay implementation had a bug that caused times
 * after 11/2/2025 (DST transition) to be off by one hour.
 *
 * This script recalculates all time_of_day values using the correct method.
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../backtesting.db');
const db = new Database(dbPath);

/**
 * Extract time of day correctly with DST handling
 */
function extractTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const hours = parts.find(p => p.type === 'hour')?.value || '00';
  const minutes = parts.find(p => p.type === 'minute')?.value || '00';
  const seconds = parts.find(p => p.type === 'second')?.value || '00';

  return `${hours}:${minutes}:${seconds}`;
}

console.log('Fetching all intraday bars from database...');

// Get all intraday bars (5min, 1min, etc.)
const rows = db.prepare(`
  SELECT rowid, timestamp, time_of_day
  FROM ohlcv_data
  WHERE timeframe IN ('5min', '1min')
  ORDER BY timestamp
`).all();

console.log(`Found ${rows.length} intraday bars to process`);

// Update time_of_day for each bar
const update = db.prepare(`
  UPDATE ohlcv_data
  SET time_of_day = ?
  WHERE rowid = ?
`);

let updatedCount = 0;
let unchangedCount = 0;

console.log('Recalculating time_of_day values...\n');

const updateMany = db.transaction((rows: any[]) => {
  for (const row of rows) {
    const correctTime = extractTimeOfDay(row.timestamp);

    if (correctTime !== row.time_of_day) {
      update.run(correctTime, row.rowid);
      updatedCount++;

      // Show some examples of what changed
      if (updatedCount <= 10) {
        const date = new Date(row.timestamp).toISOString().split('T')[0];
        console.log(`  ${date} ${row.time_of_day} → ${correctTime}`);
      }
    } else {
      unchangedCount++;
    }
  }
});

updateMany(rows);

console.log(`\n✅ Done!`);
console.log(`   Updated: ${updatedCount} bars`);
console.log(`   Unchanged: ${unchangedCount} bars`);
console.log(`\nTime values are now correct with proper DST handling.`);

db.close();
