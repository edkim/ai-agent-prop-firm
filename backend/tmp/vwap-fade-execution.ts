/**
 * Weak-Context VWAP Fade Execution (Short)
 *
 * Entry: SHORT at next bar if it trades at/above VWAP (within tolerance)
 * Stop: max(test bar high + buffer, VWAP + buffer)
 * Target: optional; primary exit via trailing stop or end of day
 * Exit: Trailing stop 1% from best price in favor; forced cover at 15:55 ET
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'vwap-fade-signals.json'), 'utf8')
);

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

interface TradeResult {
  date: string;
  ticker: string;
  side: 'SHORT';
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
  noTrade?: boolean;
  noTradeReason?: string;
}

const VWAP_TOLERANCE = 0.001; // 0.1%
const TRAIL_PCT = 0.01; // 1% trailing stop

function getRTHBars(ticker: string, date: string): Bar[] {
  return db
    .prepare(
      `SELECT timestamp, time_of_day, open, high, low, close, volume
       FROM ohlcv_data
       WHERE ticker = ?
         AND date(timestamp/1000, 'unixepoch') = ?
         AND timeframe = '5min'
         AND time_of_day >= '09:30:00'
         AND time_of_day <= '16:00:00'
       ORDER BY timestamp ASC`
    )
    .all(ticker, date) as Bar[];
}

function computeVWAPSoFar(bars: Bar[], uptoIndex: number): number {
  let pv = 0;
  let vol = 0;
  for (let i = 0; i <= uptoIndex; i++) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
  }
  return vol > 0 ? pv / vol : 0;
}

const results: TradeResult[] = [];

for (const signal of SCANNER_SIGNALS) {
  const { ticker, signal_date, signal_time, vwap_at_signal } = signal;
  const bars = getRTHBars(ticker, signal_date);
  if (!bars.length) {
    results.push({ date: signal_date, ticker, side: 'SHORT', noTrade: true, noTradeReason: 'No data' });
    continue;
  }

  const sigIdx = bars.findIndex((b) => b.time_of_day === signal_time);
  if (sigIdx === -1 || sigIdx >= bars.length - 1) {
    results.push({ date: signal_date, ticker, side: 'SHORT', noTrade: true, noTradeReason: 'Signal bar missing/late' });
    continue;
  }

  // Entry on next bar if trades at/above VWAP (within tolerance)
  const entryBar = bars[sigIdx + 1];
  const fillThreshold = vwap_at_signal * (1 + VWAP_TOLERANCE);
  if (entryBar.high < vwap_at_signal) {
    results.push({ date: signal_date, ticker, side: 'SHORT', noTrade: true, noTradeReason: 'Next bar never touched VWAP' });
    continue;
  }
  const entryPrice = entryBar.open >= vwap_at_signal ? entryBar.open : vwap_at_signal;

  // Stop anchored to structure/vwap
  const stop = Math.max(entryBar.high + entryBar.high * VWAP_TOLERANCE, vwap_at_signal * (1 + VWAP_TOLERANCE));

  let best = entryPrice; // best in favor (lower for short)
  let exitTriggered = false;
  let exitReason = '';
  let exitPrice = entryPrice;

  for (let i = sigIdx + 2; i < bars.length; i++) {
    const bar = bars[i];
    // Update best in favor
    if (bar.low < best) best = bar.low;

    // Trailing stop at 1% from best
    const trailStop = best * (1 + TRAIL_PCT);
    if (bar.high >= stop) {
      exitTriggered = true;
      exitReason = 'Initial stop';
      exitPrice = stop;
    } else if (bar.high >= trailStop) {
      exitTriggered = true;
      exitReason = 'Trailing stop';
      exitPrice = trailStop;
    } else if (bar.time_of_day >= '15:55:00') {
      exitTriggered = true;
      exitReason = 'Market close';
      exitPrice = bar.close;
    }

    if (exitTriggered) {
      const TRADE_SIZE = 10000;
      const qty = Math.floor(TRADE_SIZE / entryPrice);
      const pnlPerShare = entryPrice - exitPrice;
      const pnl = pnlPerShare * qty;
      const pnlPct = (pnlPerShare / entryPrice) * 100;
      results.push({
        date: signal_date,
        ticker,
        side: 'SHORT',
        entryTime: entryBar.time_of_day,
        entryPrice,
        exitTime: bar.time_of_day,
        exitPrice,
        quantity: qty,
        pnl,
        pnlPercent: pnlPct,
        exitReason,
        highestPrice: Math.max(entryPrice, bar.high),
        lowestPrice: Math.min(best, bar.low)
      });
      break;
    }
  }

  if (!exitTriggered) {
    results.push({ date: signal_date, ticker, side: 'SHORT', noTrade: true, noTradeReason: 'Position not closed' });
  }
}

console.log(JSON.stringify(results, null, 2));
db.close();
