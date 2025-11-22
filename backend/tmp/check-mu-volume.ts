/**
 * Check why MU signal fired at 11:40 instead of 09:35
 */

import Database from 'better-sqlite3';

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

const LOOKBACK_BARS = 20;
const MIN_VOLUME_RATIO = 1.0;

interface Bar {
  timestamp: number;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function getRTHBars(ticker: string, date: string): Bar[] {
  const bars = db.prepare(`
    SELECT timestamp, time_of_day, open, high, low, close, volume
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
      AND time_of_day >= '09:30:00'
      AND time_of_day <= '16:00:00'
    ORDER BY timestamp ASC
  `).all(ticker, date) as Bar[];

  return bars;
}

function calculateAverageVolume(bars: Bar[], currentIndex: number, lookback: number): number {
  if (currentIndex < lookback) return 0;

  let totalVolume = 0;
  for (let i = currentIndex - lookback; i < currentIndex; i++) {
    totalVolume += bars[i].volume;
  }

  return totalVolume / lookback;
}

const ticker = 'MU';
const date = '2025-10-23';
const dayBars = getRTHBars(ticker, date);

const orHigh = 199.58;

console.log(`\nChecking ${ticker} ${date}`);
console.log(`OR High: ${orHigh}`);
console.log(`Total RTH bars: ${dayBars.length}\n`);

console.log('Checking bars that break OR high:\n');

for (let i = 1; i < Math.min(50, dayBars.length); i++) {
  const bar = dayBars[i];

  if (bar.high > orHigh) {
    const avgVolume = calculateAverageVolume(dayBars, i, LOOKBACK_BARS);
    const volumeRatio = avgVolume > 0 ? bar.volume / avgVolume : 0;
    const passes = volumeRatio >= MIN_VOLUME_RATIO;

    console.log(`${bar.time_of_day}: High=${bar.high.toFixed(2)} Volume=${bar.volume.toLocaleString()} AvgVol=${Math.floor(avgVolume).toLocaleString()} Ratio=${volumeRatio.toFixed(2)} ${passes ? '✓ PASS' : '✗ FAIL'}`);

    if (passes) {
      console.log(`\n🎯 First qualifying breakout at ${bar.time_of_day}`);
      break;
    }
  }
}

db.close();
