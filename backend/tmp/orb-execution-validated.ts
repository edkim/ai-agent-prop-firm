/**
 * Opening Range Breakout Execution - WITH VALIDATION
 *
 * ENFORCED RULES:
 * 1. Entry price MUST equal next bar's open (realistic market order)
 * 2. All prices MUST be within bar ranges
 * 3. Entry happens on bar AFTER breakout signal
 *
 * Entry: Market order at open of bar after signal
 * Stop: Opening range low
 * Target: Entry + 2x opening range
 * Exit: Market close if still in position
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'orb-signals-simple.json'), 'utf8')
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
  orHigh?: number;
  orLow?: number;
  noTrade?: boolean;
  noTradeReason?: string;
  validationErrors?: string[];
}

const results: TradeResult[] = [];
let totalValidationErrors = 0;

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

function validatePrice(price: number, bar: Bar, label: string): string | null {
  if (price < bar.low || price > bar.high) {
    return `${label} ${price.toFixed(2)} outside bar range [${bar.low.toFixed(2)}, ${bar.high.toFixed(2)}]`;
  }
  return null;
}

for (const signal of SCANNER_SIGNALS) {
  const { ticker, signal_date, signal_time, or_high, or_low } = signal;
  const validationErrors: string[] = [];

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

  // Entry on next bar at OPEN PRICE - ENFORCED
  const entryBar = bars[signalBarIndex + 1];
  const entryPrice = entryBar.open;  // MUST use bar open

  // VALIDATION: Entry price should match signal's recorded entry_price
  if (Math.abs(entryPrice - signal.entry_price) > 0.01) {
    validationErrors.push(`Entry price mismatch: calculated ${entryPrice.toFixed(2)} vs signal ${signal.entry_price.toFixed(2)}`);
  }

  // VALIDATION: Entry price must be within entry bar range
  const entryValidation = validatePrice(entryPrice, entryBar, 'Entry price');
  if (entryValidation) {
    validationErrors.push(entryValidation);
  }

  const orRange = or_high - or_low;
  const stopLoss = or_low;
  const target = entryPrice + (orRange * 2);  // Measured from ACTUAL entry

  let position = {
    entry: entryPrice,
    entryTime: entryBar.time_of_day,
    highestPrice: entryBar.high,
    lowestPrice: entryBar.low
  };

  // VALIDATION: Lowest price must be <= entry price
  if (position.lowestPrice > position.entry) {
    validationErrors.push(`Lowest price ${position.lowestPrice.toFixed(2)} > entry ${position.entry.toFixed(2)}`);
  }

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

      // Exit conditions (in order of priority)
      // 1. Stop loss hit
      if (bar.low <= stopLoss) {
        exitTriggered = true;
        exitPrice = stopLoss;
        exitReason = 'Stop loss';
        exitTime = bar.time_of_day;

        // VALIDATION: Stop price must be within bar range
        const stopValidation = validatePrice(exitPrice, bar, 'Stop loss exit');
        if (stopValidation) validationErrors.push(stopValidation);
      }
      // 2. Target hit
      else if (bar.high >= target) {
        exitTriggered = true;
        exitPrice = target;
        exitReason = 'Target';
        exitTime = bar.time_of_day;

        // VALIDATION: Target price must be within bar range
        const targetValidation = validatePrice(exitPrice, bar, 'Target exit');
        if (targetValidation) validationErrors.push(targetValidation);
      }
      // 3. Market close
      else if (bar.time_of_day >= '15:55:00') {
        exitTriggered = true;
        exitPrice = bar.close;
        exitReason = 'Market close';
        exitTime = bar.time_of_day;

        // VALIDATION: Close price must be within bar range
        const closeValidation = validatePrice(exitPrice, bar, 'Market close exit');
        if (closeValidation) validationErrors.push(closeValidation);
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

    if (validationErrors.length > 0) {
      totalValidationErrors++;
    }

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
      orLow: or_low,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined
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

console.error(`\nValidation Summary:`);
console.error(`Total trades: ${results.filter(r => !r.noTrade).length}`);
console.error(`Trades with validation errors: ${totalValidationErrors}`);
console.error(`Clean trades: ${results.filter(r => !r.noTrade && !r.validationErrors).length}\n`);

console.log(JSON.stringify(results, null, 2));
db.close();
