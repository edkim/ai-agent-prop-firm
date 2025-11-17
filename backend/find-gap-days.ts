/**
 * Find days with significant gaps for testing scanners
 */

import Database from 'better-sqlite3';

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// Find gap-down days (open significantly below previous close)
interface GapDown {
  ticker: string;
  trading_date: string;
  gap_percent: number;
  day_open: number;
  prev_close: number;
}

const gapDowns = db.prepare(`
  WITH daily_data AS (
    SELECT
      ticker,
      date(timestamp/1000, 'unixepoch') as trading_date,
      MIN(CASE WHEN time_of_day = (
        SELECT MIN(time_of_day)
        FROM ohlcv_data o2
        WHERE o2.ticker = o1.ticker
        AND date(o2.timestamp/1000, 'unixepoch') = date(o1.timestamp/1000, 'unixepoch')
      ) THEN open END) as day_open,
      MAX(CASE WHEN time_of_day = (
        SELECT MAX(time_of_day)
        FROM ohlcv_data o2
        WHERE o2.ticker = o1.ticker
        AND date(o2.timestamp/1000, 'unixepoch') = date(o1.timestamp/1000, 'unixepoch')
      ) THEN close END) as day_close
    FROM ohlcv_data o1
    WHERE date(timestamp/1000, 'unixepoch') >= date('now', '-30 days')
    GROUP BY ticker, trading_date
  ),
  gaps AS (
    SELECT
      d1.ticker,
      d1.trading_date,
      d1.day_open,
      d2.day_close as prev_close,
      ROUND(((d1.day_open - d2.day_close) / d2.day_close * 100), 2) as gap_percent
    FROM daily_data d1
    JOIN daily_data d2 ON d1.ticker = d2.ticker
      AND d2.trading_date = date(d1.trading_date, '-1 day')
    WHERE d1.day_open IS NOT NULL
      AND d2.day_close IS NOT NULL
  )
  SELECT
    ticker,
    trading_date,
    gap_percent,
    day_open,
    prev_close
  FROM gaps
  WHERE gap_percent <= -1.5  -- Gap down at least 1.5%
  ORDER BY trading_date DESC, gap_percent ASC
  LIMIT 30
`).all() as GapDown[];

console.log('\n🔻 Recent Gap-Down Days (last 30 days):\n');
console.log('Ticker    Date          Gap %    Open     Prev Close');
console.log('--------------------------------------------------------');

for (const gap of gapDowns) {
  console.log(
    `${gap.ticker.padEnd(9)} ${gap.trading_date}  ${String(gap.gap_percent).padStart(6)}%  $${gap.day_open.toFixed(2).padStart(7)}  $${gap.prev_close.toFixed(2).padStart(7)}`
  );
}

console.log('\n');
console.log('💡 Best candidates for testing:');
console.log('   - Gaps > 2% are ideal');
console.log('   - Tech stocks (TSLA, NVDA, AMD) are most volatile');
console.log('   - Recent dates ensure data quality');
console.log('\n');

db.close();
