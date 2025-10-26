/**
 * Script to populate Russell 2000 universe with all constituents
 */

import { readFileSync } from 'fs';
import { initializeDatabase, getDatabase, closeDatabase } from './src/database/db';

async function populateRussell2000() {
  console.log('🚀 Starting Russell 2000 population...\n');

  // Initialize database
  initializeDatabase();
  const db = getDatabase();

  // Read tickers from file
  const tickersFile = '/tmp/russell2000_clean.txt';
  const tickersContent = readFileSync(tickersFile, 'utf-8');
  const tickers = tickersContent
    .split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  console.log(`📊 Found ${tickers.length} tickers to add\n`);

  // Get or create russell2000 universe
  let universe = db.prepare('SELECT * FROM universe WHERE name = ?').get('russell2000') as
    | { id: number; name: string }
    | undefined;

  if (!universe) {
    console.log('Creating russell2000 universe...');
    db.prepare('INSERT INTO universe (name) VALUES (?)').run('russell2000');
    universe = db.prepare('SELECT * FROM universe WHERE name = ?').get('russell2000') as {
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

  console.log(`\n✅ Successfully inserted ${count.count} tickers into russell2000 universe`);

  // Show a few examples
  const examples = db
    .prepare('SELECT ticker FROM universe_stocks WHERE universe_id = ? LIMIT 10')
    .all(universe.id) as { ticker: string }[];

  console.log('\n📋 Sample tickers:');
  examples.forEach(e => console.log(`   - ${e.ticker}`));

  closeDatabase();
  console.log('\n✨ Done!');
}

populateRussell2000().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
