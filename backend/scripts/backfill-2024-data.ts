/**
 * Backfill 2024 Data for Walk-Forward Analysis
 * 
 * This script backfills 5-minute intraday data for 2024
 * to enable proper walk-forward analysis (train on 2024, test on 2025)
 * 
 * Usage:
 *   npx ts-node backend/scripts/backfill-2024-data.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file (project root)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import IntradayBackfillService from '../src/services/intraday-backfill.service';
import logger from '../src/services/logger.service';
import { initializeDatabase } from '../src/database/db';

async function main() {
  console.log('\n🚀 Starting 2024 Data Backfill for Walk-Forward Analysis\n');

  // Initialize database - use project root database (where OHLCV data is stored)
  // __dirname is backend/scripts/, so go up 2 levels to project root
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../backtesting.db');
  initializeDatabase(dbPath);
  console.log(`📊 Database initialized: ${dbPath}\n`);

  const backfillService = IntradayBackfillService;

  try {
    // Get tickers from database directly (workaround for getUniverseTickers issue)
    const { getDatabase } = require('../src/database/db');
    const db = getDatabase();
    const tickers = db.prepare(`
      SELECT DISTINCT ticker FROM universe_stocks
      WHERE universe_id = (SELECT id FROM universe WHERE name = 'tech_sector')
      AND is_active = 1
      ORDER BY ticker ASC
    `).all().map((r: any) => r.ticker);
    
    console.log(`📊 Found ${tickers.length} tickers in tech_sector universe\n`);

    // Backfill 2024 data (Jan 1, 2024 to Dec 31, 2024)
    // This will take a while - processes in batches with delays
    await backfillService.backfillUniverse({
      tickers: tickers, // Pass tickers directly instead of universe name
      startDate: '2024-01-01',  // Explicit start date
      endDate: '2024-12-31',   // Explicit end date
      delayMs: 1000, // 1 second delay between tickers (rate limit)
      batchSize: 50 // Process 50 tickers at a time
    });

    console.log('\n✅ 2024 data backfill complete!');
    console.log('   You can now run walk-forward analysis with train=2024, test=2025\n');

  } catch (error: any) {
    console.error('\n❌ Backfill failed:', error.message);
    process.exit(1);
  }
}

main();

