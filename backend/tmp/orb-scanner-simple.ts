/**
 * Simple Opening Range Breakout Scanner - CORRECT IMPLEMENTATION
 *
 * Strategy: Enter IMMEDIATELY on first break above opening range high
 * No volume filter delays - this is a pure momentum play
 *
 * Entry: LONG on first bar that breaks above OR high
 * Stop: OR low
 * Target: OR high + 2x OR range
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

interface Bar {
  timestamp: number;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  direction: 'LONG';
  pattern_strength: number;
  entry_price: number;  // Will be next bar's open - for validation
  or_high: number;
  or_low: number;
  or_range: number;
  breakout_bar_time: string;
  breakout_bar_volume: number;
  metrics: {
    or_high: number;
    or_low: number;
    or_range_percent: number;
    breakout_time: string;
    minutes_after_open: number;
  };
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

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

async function scan(): Promise<Signal[]> {
  const tickers = process.env.SCAN_TICKERS?.split(',') || [];
  const startDate = process.env.SCAN_START_DATE || '';
  const endDate = process.env.SCAN_END_DATE || '';

  if (tickers.length === 0) {
    console.error('No tickers provided in SCAN_TICKERS');
    return [];
  }

  const signals: Signal[] = [];

  for (const ticker of tickers) {
    try {
      const datesResult = db.prepare(`
        SELECT DISTINCT date(timestamp/1000, 'unixepoch') as trade_date
        FROM ohlcv_data
        WHERE ticker = ?
          AND date(timestamp/1000, 'unixepoch') >= ?
          AND date(timestamp/1000, 'unixepoch') <= ?
          AND timeframe = '5min'
        ORDER BY trade_date ASC
      `).all(ticker, startDate, endDate) as { trade_date: string }[];

      for (const { trade_date } of datesResult) {
        const dayBars = getRTHBars(ticker, trade_date);
        if (dayBars.length < 3) continue;  // Need at least OR bar + 2 bars

        // Opening Range: First bar (09:30-09:35)
        const orBar = dayBars[0];
        if (orBar.time_of_day !== '09:30:00') continue;

        const orHigh = orBar.high;
        const orLow = orBar.low;
        const orRange = ((orHigh - orLow) / orLow) * 100;

        // Find FIRST bar that breaks above OR high
        let breakoutBarIndex = -1;

        for (let i = 1; i < dayBars.length; i++) {
          const bar = dayBars[i];

          // Check if price breaks above OR high
          if (bar.high > orHigh) {
            breakoutBarIndex = i;
            break;  // Take FIRST break, not delayed by filters
          }
        }

        if (breakoutBarIndex === -1) continue;
        if (breakoutBarIndex >= dayBars.length - 1) continue;  // Need next bar for entry

        // Calculate signal strength based on timing and range
        const breakoutBar = dayBars[breakoutBarIndex];
        const minutesAfterOpen = timeToMinutes(breakoutBar.time_of_day) - timeToMinutes('09:30:00');

        // Earlier breakout = stronger signal (max 40 points)
        const timingStrength = Math.max(40 - minutesAfterOpen, 0);

        // Larger OR range = stronger signal (max 40 points)
        const rangeStrength = Math.min(orRange * 20, 40);

        // Volume vs OR bar (max 20 points)
        const volumeStrength = Math.min((breakoutBar.volume / orBar.volume) * 10, 20);

        const patternStrength = Math.floor(timingStrength + rangeStrength + volumeStrength);

        // Entry will be on NEXT bar at open price
        const nextBar = dayBars[breakoutBarIndex + 1];

        signals.push({
          ticker,
          signal_date: trade_date,
          signal_time: breakoutBar.time_of_day,
          direction: 'LONG',
          pattern_strength: patternStrength,
          entry_price: nextBar.open,  // IMPORTANT: This is what entry WILL BE
          or_high: orHigh,
          or_low: orLow,
          or_range: Math.round(orRange * 100) / 100,
          breakout_bar_time: breakoutBar.time_of_day,
          breakout_bar_volume: breakoutBar.volume,
          metrics: {
            or_high: orHigh,
            or_low: orLow,
            or_range_percent: Math.round(orRange * 100) / 100,
            breakout_time: breakoutBar.time_of_day,
            minutes_after_open: minutesAfterOpen
          }
        });
      }
    } catch (error: any) {
      console.error(`Error scanning ${ticker}:`, error.message);
    }
  }

  return signals;
}

scan()
  .then(signals => {
    console.log(JSON.stringify(signals, null, 2));
    db.close();
  })
  .catch(error => {
    console.error('Scan failed:', error);
    db.close();
    process.exit(1);
  });
