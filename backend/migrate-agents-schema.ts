/**
 * Migration script: Add learning laboratory columns to trading_agents table
 */

import { initializeDatabase, getDatabase, closeDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function migrate() {
  console.log('📊 Migrating trading_agents table for learning laboratory\n');

  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  try {
    // Check if columns already exist
    const tableInfo = db.pragma('table_info(trading_agents)') as Array<{ name: string }>;
    const existingColumns = tableInfo.map((col) => col.name);

    console.log('Existing columns:', existingColumns);

    // Add new columns if they don't exist
    const newColumns = [
      { name: 'instructions', type: 'TEXT' },
      { name: 'system_prompt', type: 'TEXT' },
      { name: 'risk_tolerance', type: 'TEXT' },
      { name: 'trading_style', type: 'TEXT' },
      { name: 'pattern_focus', type: 'TEXT' },
      { name: 'market_conditions', type: 'TEXT' },
      { name: 'risk_config', type: 'TEXT' },
      { name: 'status', type: 'TEXT', default: "'learning'" },
    ];

    for (const col of newColumns) {
      if (!existingColumns.includes(col.name)) {
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        const sql = `ALTER TABLE trading_agents ADD COLUMN ${col.name} ${col.type}${defaultClause}`;
        console.log(`Adding column: ${col.name}`);
        db.exec(sql);
      } else {
        console.log(`Column already exists: ${col.name}`);
      }
    }

    // Make account_id nullable by recreating constraints
    // SQLite doesn't support DROP NOT NULL, so we'll leave it as is
    // New agents for learning won't have account_id set

    console.log('\n✅ Migration completed successfully\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    closeDatabase();
  }
}

migrate().catch(console.error);
