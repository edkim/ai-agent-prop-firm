/**
 * Fetch all US stock tickers from Polygon API and populate universe
 */

import { initializeDatabase, getDatabase, closeDatabase } from './src/database/db';
import axios from 'axios';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface PolygonTicker {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  cik?: string;
}

async function fetchAllUSStocks(): Promise<PolygonTicker[]> {
  console.log('📡 Fetching US stock tickers from Polygon API...\n');

  const allTickers: PolygonTicker[] = [];
  let nextUrl = `https://api.polygon.io/v3/reference/tickers`;
  let page = 1;

  try {
    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        params: {
          apiKey: POLYGON_API_KEY,
          market: 'stocks',
          locale: 'us',
          active: true,
          limit: 1000,
        },
      });

      const tickers = response.data.results || [];
      allTickers.push(...tickers);

      console.log(`  Page ${page}: Fetched ${tickers.length} tickers (Total: ${allTickers.length})`);

      nextUrl = response.data.next_url;
      if (nextUrl) {
        nextUrl = `${nextUrl}&apiKey=${POLYGON_API_KEY}`;
        page++;
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    console.log(`\n✅ Total US stock tickers fetched: ${allTickers.length}\n`);
    return allTickers;
  } catch (error: any) {
    console.error('❌ Error fetching tickers:', error.message);
    throw error;
  }
}

async function populateUSStocksUniverse() {
  console.log('🚀 Starting US stocks universe population...\n');

  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY environment variable not set');
    process.exit(1);
  }

  // Fetch tickers from Polygon
  const tickers = await fetchAllUSStocks();

  // Filter to only include stocks (not ETFs, warrants, etc.)
  const stocks = tickers.filter(t =>
    t.type === 'CS' || // Common Stock
    t.type === 'ADRC' || // American Depositary Receipt Common
    t.type === 'PFD' // Preferred Stock
  );

  console.log(`📊 Filtered to ${stocks.length} common/preferred stocks\n`);

  // Initialize database
  initializeDatabase();
  const db = getDatabase();

  // Get or create us-stocks universe
  let universe = db.prepare('SELECT * FROM universe WHERE name = ?').get('us-stocks') as
    | { id: number; name: string }
    | undefined;

  if (!universe) {
    console.log('Creating us-stocks universe...');
    db.prepare('INSERT INTO universe (name, description) VALUES (?, ?)').run(
      'us-stocks',
      'All actively traded US stocks (common and preferred)'
    );
    universe = db.prepare('SELECT * FROM universe WHERE name = ?').get('us-stocks') as {
      id: number;
      name: string;
    };
  }

  console.log(`✅ Universe ID: ${universe.id}\n`);

  // Delete existing tickers from universe
  const deleteResult = db.prepare('DELETE FROM universe_stocks WHERE universe_id = ?').run(universe.id);
  console.log(`🗑️  Deleted ${deleteResult.changes} existing tickers\n`);

  // Insert all tickers with metadata
  console.log('📝 Inserting tickers...');
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO universe_stocks (universe_id, ticker, name, sector, industry)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((stocks: PolygonTicker[]) => {
    for (const stock of stocks) {
      insertStmt.run(
        universe!.id,
        stock.ticker,
        stock.name || null,
        null, // sector not available from this endpoint
        null  // industry not available from this endpoint
      );
    }
  });

  insertMany(stocks);

  // Update universe total count
  db.prepare('UPDATE universe SET total_stocks = ? WHERE id = ?').run(stocks.length, universe.id);

  // Verify count
  const count = db
    .prepare('SELECT COUNT(*) as count FROM universe_stocks WHERE universe_id = ?')
    .get(universe.id) as { count: number };

  console.log(`\n✅ Successfully inserted ${count.count} tickers into us-stocks universe`);

  // Show a few examples
  const examples = db
    .prepare('SELECT ticker, name FROM universe_stocks WHERE universe_id = ? LIMIT 10')
    .all(universe.id) as { ticker: string; name: string | null }[];

  console.log('\n📋 Sample tickers:');
  examples.forEach(e => console.log(`   - ${e.ticker}: ${e.name || 'N/A'}`));

  closeDatabase();
  console.log('\n✨ Done!');
}

populateUSStocksUniverse().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
