import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Test VWAP cross detection on AAPL for one day
const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
initializeDatabase(dbPath);

const db = getDatabase();

// Get AAPL 5min bars for 2025-11-01 (one day)
const bars = db.prepare(`
  SELECT timestamp, open, high, low, close, volume, time_of_day
  FROM ohlcv_data
  WHERE ticker = 'AAPL'
    AND timeframe = '5min'
    AND date(timestamp/1000, 'unixepoch') = '2025-11-01'
  ORDER BY timestamp ASC
`).all() as any[];

console.log(`Found ${bars.length} bars for AAPL on 2025-11-01`);

if (bars.length === 0) {
  console.log('No bars found! Trying different date...');
  const bars2 = db.prepare(`
    SELECT timestamp, open, high, low, close, volume, time_of_day,
           date(timestamp/1000, 'unixepoch') as date
    FROM ohlcv_data
    WHERE ticker = 'AAPL'
      AND timeframe = '5min'
    ORDER BY timestamp ASC
    LIMIT 100
  `).all() as any[];
  console.log(`Sample of first 100 bars:`);
  console.log(bars2.slice(0, 5));
  process.exit(1);
}

// Calculate VWAP
let cumVol = 0;
let cumVolPrice = 0;
const barsWithVWAP = [];

for (const bar of bars) {
  const typicalPrice = (bar.high + bar.low + bar.close) / 3;
  cumVolPrice += typicalPrice * bar.volume;
  cumVol += bar.volume;
  barsWithVWAP.push({
    ...bar,
    vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
  });
}

console.log(`\nFirst 5 bars with VWAP:`);
for (let i = 0; i < Math.min(5, barsWithVWAP.length); i++) {
  const b = barsWithVWAP[i];
  console.log(`Bar ${i}: close=${b.close.toFixed(2)}, vwap=${b.vwap.toFixed(2)}, above=${b.close > b.vwap}`);
}

// Detect VWAP crosses
let crossCount = 0;
for (let i = 1; i < barsWithVWAP.length; i++) {
  const current = barsWithVWAP[i];
  const previous = barsWithVWAP[i - 1];

  const previousBelowVWAP = previous.close <= previous.vwap;
  const currentAboveVWAP = current.close > current.vwap;

  if (previousBelowVWAP && currentAboveVWAP) {
    crossCount++;
    if (crossCount <= 3) {
      console.log(`\nCross #${crossCount} at bar ${i} (${current.time_of_day}):`);
      console.log(`  Previous: close=${previous.close.toFixed(2)}, vwap=${previous.vwap.toFixed(2)} (${previous.close <= previous.vwap ? 'BELOW' : 'ABOVE'})`);
      console.log(`  Current:  close=${current.close.toFixed(2)}, vwap=${current.vwap.toFixed(2)} (${current.close > current.vwap ? 'ABOVE' : 'BELOW'})`);
    }
  }
}

console.log(`\nTotal VWAP crosses found: ${crossCount}`);
