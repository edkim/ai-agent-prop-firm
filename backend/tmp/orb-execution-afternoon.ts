/**
 * Opening Range Breakout - AFTERNOON ENTRIES ONLY
 *
 * Filter: Only take trades where entry time >= 12:00:00 (noon)
 *
 * Hypothesis: Early ORB breakouts are fakeouts, afternoon entries are more reliable
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'orb-signals-oos.json'), 'utf8')
);

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

const MIN_ENTRY_TIME = '12:00:00';  // Only trade after noon

interface Bar {
  timestamp: number;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradeResult {
  date: string;
  ticker: string;
  side: 'LONG';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  quantity?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
  orRange?: number;
  orHigh?: number;
  orLow?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}

const results: TradeResult[] = [];
let filteredByTime = 0;

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

for (const signal of SCANNER_SIGNALS) {
  const { ticker, signal_date, signal_time, or_high, or_low } = signal;

  const bars = getRTHBars(ticker, signal_date);

  if (bars.length === 0) {
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: 'No data available'
    });
    continue;
  }

  const signalBarIndex = bars.findIndex((b: Bar) => b.time_of_day >= signal_time);

  if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: 'Signal too late'
    });
    continue;
  }

  // Entry on next bar
  const entryBar = bars[signalBarIndex + 1];

  // FILTER: Skip if entry time is before noon
  if (entryBar.time_of_day < MIN_ENTRY_TIME) {
    filteredByTime++;
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: `Entry too early (${entryBar.time_of_day} < ${MIN_ENTRY_TIME})`
    });
    continue;
  }

  const entryPrice = entryBar.open;
  const orRange = or_high - or_low;
  const stopLoss = or_low;
  const target = entryPrice + (orRange * 2);

  let position = {
    entry: entryPrice,
    entryTime: entryBar.time_of_day,
    highestPrice: entryBar.high,
    lowestPrice: entryBar.low
  };

  let exitTriggered = false;
  let exitPrice = 0;
  let exitReason = '';
  let exitTime = '';

  // Check if entry bar itself violates stop
  if (entryBar.low <= stopLoss) {
    exitTriggered = true;
    exitPrice = stopLoss;
    exitReason = 'Stop loss (entry bar)';
    exitTime = entryBar.time_of_day;
  }

  if (!exitTriggered) {
    for (let i = signalBarIndex + 2; i < bars.length; i++) {
      const bar = bars[i];
      position.highestPrice = Math.max(position.highestPrice, bar.high);
      position.lowestPrice = Math.min(position.lowestPrice, bar.low);

      if (bar.low <= stopLoss) {
        exitTriggered = true;
        exitPrice = stopLoss;
        exitReason = 'Stop loss';
        exitTime = bar.time_of_day;
      }
      else if (bar.high >= target) {
        exitTriggered = true;
        exitPrice = target;
        exitReason = 'Target';
        exitTime = bar.time_of_day;
      }
      else if (bar.time_of_day >= '15:55:00') {
        exitTriggered = true;
        exitPrice = bar.close;
        exitReason = 'Market close';
        exitTime = bar.time_of_day;
      }

      if (exitTriggered) {
        break;
      }
    }
  }

  if (exitTriggered) {
    const TRADE_SIZE = 10000;
    const quantity = Math.floor(TRADE_SIZE / position.entry);
    const pnlPerShare = exitPrice - position.entry;
    const pnl = pnlPerShare * quantity;
    const pnlPercent = (pnlPerShare / position.entry) * 100;

    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      entryTime: position.entryTime,
      entryPrice: position.entry,
      exitTime,
      exitPrice,
      quantity,
      pnl,
      pnlPercent,
      exitReason,
      highestPrice: position.highestPrice,
      lowestPrice: position.lowestPrice,
      orRange: Math.round(orRange * 100) / 100,
      orHigh: or_high,
      orLow: or_low
    });
  } else {
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: 'Position not closed'
    });
  }
}

console.error(`\nAfternoon Filter Summary:`);
console.error(`Total signals: ${SCANNER_SIGNALS.length}`);
console.error(`Filtered (too early): ${filteredByTime}`);
console.error(`Executed trades: ${results.filter(r => !r.noTrade).length}\n`);

console.log(JSON.stringify(results, null, 2));
db.close();
