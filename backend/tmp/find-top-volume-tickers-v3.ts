/**
 * Find top 100 highest volume tickers - but prefer larger cap stocks
 * Strategy: Filter by minimum price ($20+), then sort by volume
 * This should give us more liquid, established stocks
 */

import Database from 'better-sqlite3';

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

const LOOKBACK_START = '2025-10-07';
const LOOKBACK_END = '2025-10-11';
const MIN_PRICE = 20.0; // Focus on more established stocks

console.error(`Finding top 100 volume tickers from ${LOOKBACK_START} to ${LOOKBACK_END}...`);
console.error(`Filtering for stocks > $${MIN_PRICE} (to get more liquid, established names)`);

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
console.error(`\nTop 30 by volume:`);
results.slice(0, 30).forEach((r, i) => {
  console.error(`  ${(i + 1).toString().padStart(2)}. ${r.ticker.padEnd(6)} ${(r.avg_daily_volume / 1_000_000).toFixed(2).padStart(6)}M volume, $${r.avg_price.toFixed(2).padStart(7)} avg price`);
});

// Output as comma-separated list for SCAN_TICKERS
const tickerList = results.map(r => r.ticker).join(',');
console.log(tickerList);

db.close();
