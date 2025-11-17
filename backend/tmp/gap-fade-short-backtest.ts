/**
 * Gap Fade SHORT Execution - Complete Backtest
 *
 * Entry: SHORT after gap up + VWAP breakdown
 * Target: Gap fill (return to previous close)
 * Stop: VWAP reclaim (thesis invalidated)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Load signals
const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'gap-up-fade-signals.json'), 'utf8')
);

const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay: string;
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
  gapSize?: number;
  prevClose?: number;
  exitDetails?: any[];
  noTrade?: boolean;
  noTradeReason?: string;
}

const results: TradeResult[] = [];

// Process each ticker
const uniqueTickers = [...new Set(SCANNER_SIGNALS.map((s: any) => s.ticker))];
console.error(`Processing ${uniqueTickers.length} tickers with ${SCANNER_SIGNALS.length} signals...`);

// Helper: Calculate VWAP
function calculateVWAP(bars: Bar[], upToIndex: number): number {
  let cumVolume = 0;
  let cumVolumePrice = 0;

  for (let i = 0; i <= upToIndex; i++) {
    const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
    cumVolumePrice += typical * bars[i].volume;
    cumVolume += bars[i].volume;
  }

  return cumVolume > 0 ? cumVolumePrice / cumVolume : 0;
}

// Helper: Get previous trading day close
function getPreviousDate(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

for (const ticker of uniqueTickers) {
  const tickerSignals = SCANNER_SIGNALS.filter((s: any) => s.ticker === ticker);
  const timeframe = '5min';

  for (const signal of tickerSignals) {
    const { ticker: sigTicker, signal_date, signal_time, gap_percent } = signal;

    // Get previous day's close for gap calculation
    let prevDate = getPreviousDate(signal_date);

    const prevDayBars = db.prepare(`
      SELECT close
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND date(timestamp/1000, 'unixepoch') = ?
        AND time_of_day >= '09:30:00' AND time_of_day <= '16:00:00'
      ORDER BY timestamp DESC
      LIMIT 1
    `).all(sigTicker, timeframe, prevDate) as any[];

    // Try up to 5 days back for prev close (weekends/holidays)
    let attempts = 0;
    while (prevDayBars.length === 0 && attempts < 5) {
      prevDate = getPreviousDate(prevDate);
      const bars = db.prepare(`
        SELECT close
        FROM ohlcv_data
        WHERE ticker = ? AND timeframe = ?
          AND date(timestamp/1000, 'unixepoch') = ?
          AND time_of_day >= '09:30:00' AND time_of_day <= '16:00:00'
        ORDER BY timestamp DESC
        LIMIT 1
      `).all(sigTicker, timeframe, prevDate);
      prevDayBars.push(...bars);
      attempts++;
    }

    if (prevDayBars.length === 0) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        side: 'SHORT',
        noTrade: true,
        noTradeReason: 'No previous day close data'
      });
      continue;
    }

    const prevClose = prevDayBars[0].close;

    // Get signal day bars
    const bars = db.prepare(`
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND date(timestamp/1000, 'unixepoch') = ?
        AND time_of_day >= '09:30:00' AND time_of_day <= '16:00:00'
      ORDER BY timestamp ASC
    `).all(sigTicker, timeframe, signal_date) as Bar[];

    if (bars.length === 0) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        side: 'SHORT',
        noTrade: true,
        noTradeReason: 'No data available'
      });
      continue;
    }

    const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signal_time);

    if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        side: 'SHORT',
        noTrade: true,
        noTradeReason: 'Signal too late in session'
      });
      continue;
    }

    // SHORT entry on next bar after signal
    const entryBar = bars[signalBarIndex + 1];
    const entryPrice = entryBar.open;
    const openPrice = bars[0].open;
    const gapSize = openPrice - prevClose; // Positive for gap up

    // Calculate target prices for SHORT
    // Target 1: 90% gap fill (close 90% of gap) - exit 70% position
    const fullGapFillTarget = openPrice - (gapSize * 0.90);
    // Target 2: 50% gap fill - exit 30% position
    const partialGapFillTarget = openPrice - (gapSize * 0.50);
    // Stop: VWAP reclaim + buffer
    const vwapReclaimBuffer = 1.003; // 0.3% above VWAP

    let position = {
      entry: entryPrice,
      entryTime: entryBar.timeOfDay,
      highestPrice: entryBar.high,
      lowestPrice: entryBar.low,
      remainingShares: 1.0,
      partialExited: false,
      trailingStop: null as number | null,
      exitDetails: [] as any[]
    };

    let exitTriggered = false;

    for (let i = signalBarIndex + 2; i < bars.length; i++) {
      const bar = bars[i];
      position.highestPrice = Math.max(position.highestPrice, bar.high);
      position.lowestPrice = Math.min(position.lowestPrice, bar.low);

      // Calculate current VWAP
      const vwap = calculateVWAP(bars, i);
      const vwapReclaimStop = vwap * vwapReclaimBuffer;

      // Current P&L for SHORT (profit when price goes DOWN)
      const unrealizedPnl = ((position.entry - bar.close) / position.entry) * 100;

      // Activate trailing stop if profitable (for SHORT: lock in gains as price drops)
      if (unrealizedPnl >= 1.5) {
        const maxGain = ((position.entry - position.lowestPrice) / position.entry) * 100;
        // Trailing: lock in 50% of max gain
        const trailingLevel = position.entry * (1 - (maxGain * 0.5 / 100));

        if (position.trailingStop === null) {
          position.trailingStop = trailingLevel;
        } else {
          position.trailingStop = Math.min(position.trailingStop, trailingLevel);
        }
      }

      let exitPrice = bar.close;
      let exitReason = '';
      let exitSize = 0;

      // Check exit conditions for SHORT

      // 1. VWAP reclaim stop (thesis invalidated - price goes back above VWAP)
      if (bar.high >= vwapReclaimStop) {
        exitTriggered = true;
        exitPrice = vwapReclaimStop;
        exitReason = 'VWAP reclaim stop';
        exitSize = position.remainingShares;
      }
      // 2. Trailing stop hit (price reversed up from lows)
      else if (position.trailingStop !== null && bar.high >= position.trailingStop) {
        exitTriggered = true;
        exitPrice = position.trailingStop;
        exitReason = 'Trailing stop';
        exitSize = position.remainingShares;
      }
      // 3. Full gap fill target (exit 70% of position)
      else if (!position.partialExited && bar.low <= fullGapFillTarget) {
        exitPrice = fullGapFillTarget;
        exitReason = 'Primary target (90% gap fill)';
        exitSize = 0.7;
        position.remainingShares -= 0.7;
        position.partialExited = true;
        position.exitDetails.push({
          time: bar.timeOfDay,
          price: exitPrice,
          reason: exitReason,
          size: exitSize
        });
      }
      // 4. Partial gap fill target (exit 30% of position)
      else if (!position.partialExited && bar.low <= partialGapFillTarget) {
        exitPrice = partialGapFillTarget;
        exitReason = 'Partial target (50% gap fill)';
        exitSize = 0.3;
        position.remainingShares -= 0.3;
        position.partialExited = true;
        position.exitDetails.push({
          time: bar.timeOfDay,
          price: exitPrice,
          reason: exitReason,
          size: exitSize
        });
      }
      // 5. Market close
      else if (bar.timeOfDay >= '15:55:00') {
        exitTriggered = true;
        exitPrice = bar.close;
        exitReason = 'Market close';
        exitSize = position.remainingShares;
      }

      // Full exit
      if (exitTriggered && exitSize > 0) {
        position.exitDetails.push({
          time: bar.timeOfDay,
          price: exitPrice,
          reason: exitReason,
          size: exitSize
        });

        // Calculate weighted average exit price
        const avgExitPrice = position.exitDetails.reduce((sum, exit) =>
          sum + (exit.price * exit.size), 0
        );

        // For SHORT: P&L = (entry - exit) / entry * 100
        const TRADE_SIZE = 10000;
        const quantity = Math.floor(TRADE_SIZE / position.entry);
        const pnlPerShare = position.entry - avgExitPrice; // Profit when price drops
        const pnl = pnlPerShare * quantity;
        const pnlPercent = (pnlPerShare / position.entry) * 100;

        results.push({
          date: signal_date,
          ticker: sigTicker,
          side: 'SHORT',
          entryTime: position.entryTime,
          entryPrice: position.entry,
          exitTime: bar.timeOfDay,
          exitPrice: avgExitPrice,
          quantity,
          pnl,
          pnlPercent,
          exitReason: exitReason + (position.exitDetails.length > 1 ? ' (scaled exit)' : ''),
          highestPrice: position.highestPrice,
          lowestPrice: position.lowestPrice,
          gapSize: Math.abs(gap_percent || 0),
          prevClose,
          exitDetails: position.exitDetails
        });
        break;
      }
    }

    if (!exitTriggered) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        side: 'SHORT',
        noTrade: true,
        noTradeReason: 'Position not closed'
      });
    }
  }
}

// Output results as JSON
console.log(JSON.stringify(results, null, 2));
db.close();
