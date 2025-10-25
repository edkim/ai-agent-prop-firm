/**
 * Migration script for Phase 3 tables
 * Adds samples and scan_history tables to the database
 */

import { initializeDatabase } from './src/database/db';

const dbPath = process.env.DATABASE_PATH || './backtesting.db';

console.log('Running Phase 3 migration...');
console.log(`Database: ${dbPath}`);

// Initialize database (this will create new tables from schema.sql)
initializeDatabase(dbPath);

console.log('✅ Phase 3 migration complete!');
console.log('   - samples table created');
console.log('   - scan_history table created');
