/**
 * Create tech_sector universe in database
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  console.log('📊 Creating tech_sector universe\n');

  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  // Get tech tickers from env
  const techTickers = (process.env.WATCHLIST_TICKERS || '').split(',').map(t => t.trim()).filter(t => t);
  console.log(`Found ${techTickers.length} tech sector tickers\n`);

  // Create universe
  const insertUniverse = db.prepare(`
    INSERT INTO universe (name, description, total_stocks, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      total_stocks = excluded.total_stocks,
      updated_at = datetime('now')
  `);

  const result = insertUniverse.run(
    'tech_sector',
    'S&P Technology Sector stocks from WATCHLIST_TICKERS',
    techTickers.length
  );

  const universeId = result.lastInsertRowid;
  console.log(`✅ Created/updated universe with ID: ${universeId}\n`);

  // Add tickers to universe_stocks
  const insertStock = db.prepare(`
    INSERT INTO universe_stocks (universe_id, ticker, added_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(universe_id, ticker) DO NOTHING
  `);

  const insertMany = db.transaction((tickers: string[]) => {
    for (const ticker of tickers) {
      insertStock.run(universeId, ticker);
    }
  });

  insertMany(techTickers);
  console.log(`✅ Added ${techTickers.length} tickers to tech_sector universe\n`);

  // Verify
  const verifyStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM universe_stocks
    WHERE universe_id = ?
  `);
  const count = (verifyStmt.get(universeId) as { count: number }).count;
  console.log(`Verification: ${count} tickers in tech_sector universe`);

  closeDatabase();
}

main().catch(console.error);
