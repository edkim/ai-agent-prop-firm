/**
 * Script to fetch and store earnings data for a ticker
 */

import PolygonService from './src/services/polygon.service';
import { initializeDatabase } from './src/database/db';
import dotenv from 'dotenv';

dotenv.config();

async function fetchEarnings(ticker: string) {
  // Initialize database
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  console.log(`Fetching earnings data for ${ticker}...`);

  try {
    const earnings = await PolygonService.fetchEarningsCalendar(ticker, 10);

    console.log(`Found ${earnings.length} earnings reports`);

    if (earnings.length === 0) {
      console.log('No earnings data found');
      return;
    }

    // Display the earnings data
    for (const earning of earnings) {
      console.log('\nEarnings Report:');
      console.log(`  Filing Date: ${earning.filing_date}`);
      console.log(`  Fiscal Period: ${earning.fiscal_period}`);
      console.log(`  Fiscal Year: ${earning.fiscal_year}`);
      console.log(`  Start Date: ${earning.start_date}`);
      console.log(`  End Date: ${earning.end_date}`);

      // Try to store it - we'll need to extract the relevant fields
      // The Polygon financials endpoint doesn't give us the exact format we need
      // Let's just display what we get
    }

    console.log('\nRaw data structure:', JSON.stringify(earnings[0], null, 2));

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

const ticker = process.argv[2] || 'HOOD';
fetchEarnings(ticker);
