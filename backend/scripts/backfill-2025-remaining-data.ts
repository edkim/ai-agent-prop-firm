/**
 * Backfill Remaining 2025 Data for Tech Sector
 * 
 * This script backfills missing 2025 data:
 * - Jan 1, 2025 to Aug 12, 2025 (before current data)
 * - Nov 14, 2025 to today (after current data)
 * 
 * Usage:
 *   npx ts-node backend/scripts/backfill-2025-remaining-data.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file (project root)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import IntradayBackfillService from '../src/services/intraday-backfill.service';
import logger from '../src/services/logger.service';
import { initializeDatabase } from '../src/database/db';

async function main() {
  console.log('\n🚀 Starting 2025 Remaining Data Backfill for Tech Sector\n');

  // Initialize database - use project root database (where OHLCV data is stored)
  const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'backtesting.db');
  initializeDatabase(dbPath);
  console.log(`📊 Database initialized: ${dbPath}\n`);

  const backfillService = IntradayBackfillService;

  try {
    // Get tickers from database
    const { getDatabase } = require('../src/database/db');
    const db = getDatabase();
    const tickers = db.prepare(`
      SELECT DISTINCT ticker FROM universe_stocks
      WHERE universe_id = (SELECT id FROM universe WHERE name = 'tech_sector')
      AND is_active = 1
      ORDER BY ticker ASC
    `).all().map((r: any) => r.ticker);
    
    console.log(`📊 Found ${tickers.length} tickers in tech_sector universe\n`);

    // Get current date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Backfill period 1: Jan 1, 2025 to Aug 12, 2025 (before existing data)
    console.log('📅 Period 1: Backfilling Jan 1 - Aug 12, 2025\n');
    await backfillService.backfillUniverse({
      tickers: tickers,
      startDate: '2025-01-01',
      endDate: '2025-08-12',
      delayMs: 1000,
      batchSize: 50
    });

    console.log('\n✅ Period 1 complete!\n');

    // Backfill period 2: Nov 14, 2025 to today (after existing data)
    console.log(`📅 Period 2: Backfilling Nov 14, 2025 - ${todayStr}\n`);
    await backfillService.backfillUniverse({
      tickers: tickers,
      startDate: '2025-11-14',
      endDate: todayStr,
      delayMs: 1000,
      batchSize: 50
    });

    console.log('\n✅ 2025 remaining data backfill complete!');
    console.log('   You now have complete 2025 data for tech sector stocks\n');

  } catch (error: any) {
    console.error('\n❌ Backfill failed:', error.message);
    process.exit(1);
  }
}

main();

