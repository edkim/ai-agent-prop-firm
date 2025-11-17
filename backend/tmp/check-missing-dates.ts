/**
 * Check for missing trading days in our 50-ticker universe
 */

import Database from 'better-sqlite3';

const db = new Database('/Users/edwardkim/Code/ai-backtest/backtesting.db', { readonly: true });

const TICKERS = [
  'AAPL','ABBV','ABT','ACN','ADBE','AMD','AMZN','AVGO','BAC','BRK.B',
  'CAT','CRM','CSCO','DIS','GOOGL','IBM','INTC','META','MSFT','NFLX',
  'NVDA','ORCL','QCOM','TSLA','TXN','ADI','AMAT','AMT','AXP','BLK',
  'BMY','BSX','INTU','NOW','ABNB','CRWD','DDOG','IWM','MDB','NET',
  'OKTA','QQQ','SHOP','SNOW','ZM','ZS','BA','BABA','AA','MU'
];

const START_DATE = '2025-09-01';
const END_DATE = '2025-11-15';

// Get all unique dates in the range from any ticker (to identify trading days)
const allDatesResult = db.prepare(`
  SELECT DISTINCT date(timestamp/1000, 'unixepoch') as date
  FROM ohlcv_data
  WHERE timeframe = '5min'
    AND date(timestamp/1000, 'unixepoch') >= ?
    AND date(timestamp/1000, 'unixepoch') <= ?
  ORDER BY date ASC
`).all(START_DATE, END_DATE) as { date: string }[];

const tradingDays = allDatesResult.map(r => r.date);

console.log(`Found ${tradingDays.length} trading days between ${START_DATE} and ${END_DATE}\n`);

// Check each ticker for missing dates
const missingData: { [ticker: string]: string[] } = {};
let totalMissing = 0;

for (const ticker of TICKERS) {
  const tickerDatesResult = db.prepare(`
    SELECT DISTINCT date(timestamp/1000, 'unixepoch') as date
    FROM ohlcv_data
    WHERE ticker = ?
      AND timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') >= ?
      AND date(timestamp/1000, 'unixepoch') <= ?
  `).all(ticker, START_DATE, END_DATE) as { date: string }[];

  const tickerDates = new Set(tickerDatesResult.map(r => r.date));
  const missing = tradingDays.filter(d => !tickerDates.has(d));

  if (missing.length > 0) {
    missingData[ticker] = missing;
    totalMissing += missing.length;
  }
}

console.log(`Tickers with missing dates: ${Object.keys(missingData).length}/${TICKERS.length}`);
console.log(`Total missing ticker-days: ${totalMissing}\n`);

if (Object.keys(missingData).length > 0) {
  console.log('Missing data by ticker:\n');

  const sorted = Object.entries(missingData).sort((a, b) => b[1].length - a[1].length);

  for (const [ticker, dates] of sorted) {
    console.log(`${ticker}: ${dates.length} days missing`);
    if (dates.length <= 5) {
      console.log(`  ${dates.join(', ')}`);
    } else {
      console.log(`  ${dates.slice(0, 3).join(', ')} ... ${dates.slice(-2).join(', ')}`);
    }
  }

  // Save to JSON for backfill script
  const fs = require('fs');
  fs.writeFileSync('tmp/missing-data.json', JSON.stringify(missingData, null, 2));
  console.log('\n✅ Saved missing data details to tmp/missing-data.json');
}

db.close();
