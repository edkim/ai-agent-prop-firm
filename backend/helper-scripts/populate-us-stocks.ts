/**
 * Script to populate US stocks universe with all actively traded stocks
 */

import { readFileSync } from 'fs';
import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';

async function populateUSStocks() {
  console.log('🚀 Starting US stocks population...\n');

  // Initialize database
  initializeDatabase();
  const db = getDatabase();

  // Read tickers from file
  const tickersFile = '/tmp/us-stocks.txt';
  const tickersContent = readFileSync(tickersFile, 'utf-8');
  const tickers = tickersContent
    .split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  console.log(`📊 Found ${tickers.length} tickers to add\n`);

  // Get or create us-stocks universe
  let universe = db.prepare('SELECT * FROM universe WHERE name = ?').get('us-stocks') as
    | { id: number; name: string }
    | undefined;

  if (!universe) {
    console.log('Creating us-stocks universe...');
    db.prepare('INSERT INTO universe (name) VALUES (?)').run('us-stocks');
    universe = db.prepare('SELECT * FROM universe WHERE name = ?').get('us-stocks') as {
      id: number;
      name: string;
    };
  }

  console.log(`✅ Universe ID: ${universe.id}\n`);

  // Delete existing tickers from universe
  const deleteResult = db.prepare('DELETE FROM universe_stocks WHERE universe_id = ?').run(universe.id);
  console.log(`🗑️  Deleted ${deleteResult.changes} existing tickers\n`);

  // Insert all tickers
  console.log('📝 Inserting tickers...');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO universe_stocks (universe_id, ticker) VALUES (?, ?)');

  const insertMany = db.transaction((tickers: string[]) => {
    for (const ticker of tickers) {
      insertStmt.run(universe!.id, ticker);
    }
  });

  insertMany(tickers);

  // Verify count
  const count = db
    .prepare('SELECT COUNT(*) as count FROM universe_stocks WHERE universe_id = ?')
    .get(universe.id) as { count: number };

  console.log(`\n✅ Successfully inserted ${count.count} tickers into us-stocks universe`);

  // Show a few examples
  const examples = db
    .prepare('SELECT ticker FROM universe_stocks WHERE universe_id = ? LIMIT 10')
    .all(universe.id) as { ticker: string }[];

  console.log('\n📋 Sample tickers:');
  examples.forEach(e => console.log(`   - ${e.ticker}`));

  closeDatabase();
  console.log('\n✨ Done!');
}

populateUSStocks().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
