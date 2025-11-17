/**
 * Gap Fill VWAP Backtest - Complete Execution Script
 *
 * Runs the gap-fill-vwap execution template on scanner signals
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Load signals
const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'gap-down-signals-clean.json'), 'utf8')
);

// Initialize database
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
  side?: 'LONG' | 'SHORT';
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

for (const ticker of uniqueTickers) {
  const tickerSignals = SCANNER_SIGNALS.filter((s: any) => s.ticker === ticker);
  const timeframe = '5min';

  // Helper: Calculate VWAP for bars up to current index
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

  for (const signal of tickerSignals) {
    const { ticker: sigTicker, signal_date, signal_time, gap_percent } = signal;

    // Get previous day's close for gap calculation
    const prevDate = new Date(signal_date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const prevDateStart = new Date(`${prevDateStr}T00:00:00Z`).getTime();
    const prevDateEnd = new Date(signal_date + 'T00:00:00Z').getTime();

    const prevDayBars = db.prepare(`
      SELECT timestamp, open, high, low, close, volume
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).all(sigTicker, timeframe, prevDateStart, prevDateEnd) as Bar[];

    if (prevDayBars.length === 0) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        noTrade: true,
        noTradeReason: 'No previous day close data'
      });
      continue;
    }

    const prevClose = prevDayBars[0].close;

    // Get signal day bars
    const dateStart = new Date(`${signal_date}T00:00:00Z`).getTime();
    const nextDate = new Date(signal_date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateEnd = nextDate.getTime();

    const bars = db.prepare(`
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp ASC
    `).all(sigTicker, timeframe, dateStart, dateEnd) as Bar[];

    if (bars.length === 0) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
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
        noTrade: true,
        noTradeReason: 'Signal too late in session'
      });
      continue;
    }

    // Entry on next bar after signal
    const entryBar = bars[signalBarIndex + 1];
    const entryPrice = entryBar.open;
    const openPrice = bars[0].open;
    const gapSize = prevClose - openPrice;

    // Calculate target prices
    const fullGapFillTarget = openPrice + (gapSize * 90 / 100);
    const partialGapFillTarget = openPrice + (gapSize * 50 / 100);
    const hardStop = entryPrice * (1 - 2.5 / 100);

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
      const vwapStop = vwap * (1 - 0.3 / 100);

      // Current P&L
      const unrealizedPnl = ((bar.close - position.entry) / position.entry) * 100;

      // Activate trailing stop if profitable enough
      if (unrealizedPnl >= 1.5) {
        const maxGain = ((position.highestPrice - position.entry) / position.entry) * 100;
        const trailingLevel = position.entry * (1 + (maxGain * (1 - 50 / 100) / 100));

        if (position.trailingStop === null) {
          position.trailingStop = trailingLevel;
        } else {
          position.trailingStop = Math.max(position.trailingStop, trailingLevel);
        }
      }

      let exitPrice = bar.close;
      let exitReason = '';
      let exitSize = 0;

      // Check exit conditions

      // 1. Hard stop loss
      if (bar.low <= hardStop) {
        exitTriggered = true;
        exitPrice = hardStop;
        exitReason = 'Hard stop loss';
        exitSize = position.remainingShares;
      }
      // 2. VWAP breakdown stop
      else if (bar.low <= vwapStop) {
        exitTriggered = true;
        exitPrice = vwapStop;
        exitReason = 'VWAP breakdown';
        exitSize = position.remainingShares;
      }
      // 3. Trailing stop hit
      else if (position.trailingStop !== null && bar.low <= position.trailingStop) {
        exitTriggered = true;
        exitPrice = position.trailingStop;
        exitReason = 'Trailing stop';
        exitSize = position.remainingShares;
      }
      // 4. Full gap fill target (exit 70% of position)
      else if (!position.partialExited && bar.high >= fullGapFillTarget) {
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
      // 5. Partial gap fill target (exit 30% of position)
      else if (!position.partialExited && bar.high >= partialGapFillTarget) {
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
      // 6. Market close
      else if (bar.timeOfDay >= '15:55:00') {
        exitTriggered = true;
        exitPrice = bar.close;
        exitReason = 'Market close';
        exitSize = position.remainingShares;
      }

      // Full exit or final partial exit
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

        // Position sizing: $10,000 trade size
        const TRADE_SIZE = 10000;
        const quantity = Math.floor(TRADE_SIZE / position.entry);
        const pnlPerShare = avgExitPrice - position.entry;
        const pnl = pnlPerShare * quantity;
        const pnlPercent = (pnlPerShare / position.entry) * 100;

        results.push({
          date: signal_date,
          ticker: sigTicker,
          side: 'LONG',
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
        noTrade: true,
        noTradeReason: 'Position not closed'
      });
    }
  }
}

// Output results as JSON
console.log(JSON.stringify(results, null, 2));

db.close();
