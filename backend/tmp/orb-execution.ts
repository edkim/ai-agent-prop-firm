/**
 * Opening Range Breakout Execution
 *
 * Entry: LONG at/above opening range high on the NEXT bar after breakout
 * Stop: Opening range low
 * Target: 2x opening range (measured from entry)
 * Exit: Market close if still in position
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'orb-signals.json'), 'utf8')
);

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
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
  noTrade?: boolean;
  noTradeReason?: string;
}

const results: TradeResult[] = [];
const uniqueTickers = [...new Set(SCANNER_SIGNALS.map((s: any) => s.ticker))];
console.error(`Processing ${uniqueTickers.length} tickers with ${SCANNER_SIGNALS.length} signals...`);

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
  const { ticker, signal_date, signal_time, entry_price, or_high, or_low } = signal;

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

  // Find the breakout bar by exact time_of_day
  const signalBarIndex = bars.findIndex((b: Bar) => b.time_of_day === signal_time);

  if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: 'Signal too late or bar not found'
    });
    continue;
  }

  // Entry on next bar at/through OR high (with small slippage tolerance); skip if not reachable
  const entryBar = bars[signalBarIndex + 1];
  const SLIPPAGE_TOLERANCE = 0.002; // 0.2%
  const fillThreshold = or_high * (1 + SLIPPAGE_TOLERANCE);

  if (entryBar.high < or_high) {
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: 'Next bar did not trade at OR high'
    });
    continue;
  }
  // Fill at the first reasonable price: if open is above OR high, use open; otherwise OR high (or within tolerance)
  const entryPrice = entryBar.open >= or_high ? entryBar.open : or_high;
  const orRange = or_high - or_low;

  // Calculate stop and target
  const stopLoss = or_low;
  const target = entryPrice + (orRange * 2);  // 2x range for 2:1 R:R

  let position = {
    entry: entryPrice,
    entryTime: entryBar.time_of_day,
    highestPrice: entryBar.high,
    lowestPrice: entryBar.low
  };

  let exitTriggered = false;
  let exitPrice = 0;
  let exitReason = '';

  for (let i = signalBarIndex + 2; i < bars.length; i++) {
    const bar = bars[i];
    position.highestPrice = Math.max(position.highestPrice, bar.high);
    position.lowestPrice = Math.min(position.lowestPrice, bar.low);

    // Exit conditions
    // 1. Stop loss hit
    if (bar.low <= stopLoss) {
      exitTriggered = true;
      exitPrice = stopLoss;
      exitReason = 'Stop loss';
    }
    // 2. Target hit
    else if (bar.high >= target) {
      exitTriggered = true;
      exitPrice = target;
      exitReason = 'Target';
    }
    // 3. Market close
    else if (bar.time_of_day >= '15:55:00') {
      exitTriggered = true;
      exitPrice = bar.close;
      exitReason = 'Market close';
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
        exitTime: bar.time_of_day,
        exitPrice,
        quantity,
        pnl,
        pnlPercent,
        exitReason,
        highestPrice: position.highestPrice,
        lowestPrice: position.lowestPrice,
        orRange: Math.round(orRange * 100) / 100
      });
      break;
    }
  }

  if (!exitTriggered) {
    results.push({
      date: signal_date,
      ticker,
      side: 'LONG',
      noTrade: true,
      noTradeReason: 'Position not closed'
    });
  }
}

console.log(JSON.stringify(results, null, 2));
db.close();
