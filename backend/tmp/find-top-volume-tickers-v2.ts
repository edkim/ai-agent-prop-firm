/**
 * Find top 100 highest volume tickers in 5 days before test period
 * Filter for stocks trading above $5 to avoid penny stocks
 * Test period: Oct 14 - Nov 12, 2025
 * Lookback period: Oct 7 - Oct 11, 2025
 */

import Database from 'better-sqlite3';

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

const LOOKBACK_START = '2025-10-07';
const LOOKBACK_END = '2025-10-11';
const MIN_PRICE = 5.0; // Filter out penny stocks

console.error(`Finding top 100 volume tickers from ${LOOKBACK_START} to ${LOOKBACK_END}...`);
console.error(`Filtering for stocks > $${MIN_PRICE}`);

// Get average daily volume and average price per ticker
const results = db.prepare(`
  SELECT
    ticker,
    AVG(total_volume) as avg_daily_volume,
    AVG(avg_price) as avg_price,
    COUNT(DISTINCT trade_date) as trading_days
  FROM (
    SELECT
      ticker,
      date(timestamp/1000, 'unixepoch') as trade_date,
      SUM(volume) as total_volume,
      AVG((high + low) / 2) as avg_price
    FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') >= ?
      AND date(timestamp/1000, 'unixepoch') <= ?
      AND time_of_day >= '09:30:00'
      AND time_of_day <= '16:00:00'
    GROUP BY ticker, trade_date
  )
  GROUP BY ticker
  HAVING trading_days >= 3 AND avg_price >= ?
  ORDER BY avg_daily_volume DESC
  LIMIT 100
`).all(LOOKBACK_START, LOOKBACK_END, MIN_PRICE) as Array<{
  ticker: string;
  avg_daily_volume: number;
  avg_price: number;
  trading_days: number;
}>;

console.error(`Found ${results.length} tickers with sufficient data`);
console.error(`Top 20 by volume:`);
results.slice(0, 20).forEach((r, i) => {
  console.error(`  ${i + 1}. ${r.ticker}: ${(r.avg_daily_volume / 1_000_000).toFixed(1)}M volume, $${r.avg_price.toFixed(2)} avg price`);
});

// Output as comma-separated list for SCAN_TICKERS
const tickerList = results.map(r => r.ticker).join(',');
console.log(tickerList);

db.close();
