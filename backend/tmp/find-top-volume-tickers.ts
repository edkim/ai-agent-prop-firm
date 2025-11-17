/**
 * Find top 100 highest volume tickers in 5 days before test period
 * Test period: Oct 14 - Nov 12, 2025
 * Lookback period: Oct 7 - Oct 11, 2025
 */

import Database from 'better-sqlite3';

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

const LOOKBACK_START = '2025-10-07';
const LOOKBACK_END = '2025-10-11';

console.error(`Finding top 100 volume tickers from ${LOOKBACK_START} to ${LOOKBACK_END}...`);

// Get average daily volume per ticker
const results = db.prepare(`
  SELECT
    ticker,
    AVG(total_volume) as avg_daily_volume,
    COUNT(DISTINCT trade_date) as trading_days
  FROM (
    SELECT
      ticker,
      date(timestamp/1000, 'unixepoch') as trade_date,
      SUM(volume) as total_volume
    FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') >= ?
      AND date(timestamp/1000, 'unixepoch') <= ?
      AND time_of_day >= '09:30:00'
      AND time_of_day <= '16:00:00'
    GROUP BY ticker, trade_date
  )
  GROUP BY ticker
  HAVING trading_days >= 3
  ORDER BY avg_daily_volume DESC
  LIMIT 100
`).all(LOOKBACK_START, LOOKBACK_END) as Array<{
  ticker: string;
  avg_daily_volume: number;
  trading_days: number;
}>;

console.error(`Found ${results.length} tickers with sufficient data`);
console.error(`Top 10 by volume:`);
results.slice(0, 10).forEach((r, i) => {
  console.error(`  ${i + 1}. ${r.ticker}: ${(r.avg_daily_volume / 1_000_000).toFixed(1)}M avg daily volume`);
});

// Output as comma-separated list for SCAN_TICKERS
const tickerList = results.map(r => r.ticker).join(',');
console.log(tickerList);

db.close();
