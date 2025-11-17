/**
 * Gap-and-Go LONG Execution (TREND FOLLOWING)
 *
 * Entry: LONG after gap up when price holds above VWAP (strength)
 * Target: Momentum continuation (trail the move)
 * Stop: VWAP breakdown (momentum lost)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const SCANNER_SIGNALS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'gap-and-go-signals.json'), 'utf8')
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
  gapSize?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}

const results: TradeResult[] = [];
const uniqueTickers = [...new Set(SCANNER_SIGNALS.map((s: any) => s.ticker))];
console.error(`Processing ${uniqueTickers.length} tickers with ${SCANNER_SIGNALS.length} signals...`);

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

function getPreviousDate(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

for (const ticker of uniqueTickers) {
  const tickerSignals = SCANNER_SIGNALS.filter((s: any) => s.ticker === ticker);

  for (const signal of tickerSignals) {
    const { ticker: sigTicker, signal_date, signal_time, gap_percent } = signal;

    const bars = db.prepare(`
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND date(timestamp/1000, 'unixepoch') = ?
        AND time_of_day >= '09:30:00' AND time_of_day <= '16:00:00'
      ORDER BY timestamp ASC
    `).all(sigTicker, '5min', signal_date) as Bar[];

    if (bars.length === 0) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        side: 'LONG',
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
        side: 'LONG',
        noTrade: true,
        noTradeReason: 'Signal too late'
      });
      continue;
    }

    // LONG entry on next bar
    const entryBar = bars[signalBarIndex + 1];
    const entryPrice = entryBar.open;

    let position = {
      entry: entryPrice,
      entryTime: entryBar.timeOfDay,
      highestPrice: entryBar.high,
      lowestPrice: entryBar.low,
      trailingStop: null as number | null
    };

    let exitTriggered = false;
    let exitPrice = 0;
    let exitReason = '';

    for (let i = signalBarIndex + 2; i < bars.length; i++) {
      const bar = bars[i];
      position.highestPrice = Math.max(position.highestPrice, bar.high);
      position.lowestPrice = Math.min(position.lowestPrice, bar.low);

      const vwap = calculateVWAP(bars, i);
      const vwapStop = vwap * 0.997; // 0.3% below VWAP

      const unrealizedPnl = ((bar.close - position.entry) / position.entry) * 100;

      // Activate trailing stop at +1% profit
      if (unrealizedPnl >= 1.0) {
        const maxGain = ((position.highestPrice - position.entry) / position.entry) * 100;
        const trailingLevel = position.entry * (1 + (maxGain * 0.5 / 100)); // Lock 50% of gains

        if (position.trailingStop === null) {
          position.trailingStop = trailingLevel;
        } else {
          position.trailingStop = Math.max(position.trailingStop, trailingLevel);
        }
      }

      // Exit conditions
      // 1. VWAP breakdown (momentum lost)
      if (bar.low <= vwapStop) {
        exitTriggered = true;
        exitPrice = vwapStop;
        exitReason = 'VWAP breakdown';
      }
      // 2. Trailing stop
      else if (position.trailingStop !== null && bar.low <= position.trailingStop) {
        exitTriggered = true;
        exitPrice = position.trailingStop;
        exitReason = 'Trailing stop';
      }
      // 3. Market close
      else if (bar.timeOfDay >= '15:55:00') {
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
          ticker: sigTicker,
          side: 'LONG',
          entryTime: position.entryTime,
          entryPrice: position.entry,
          exitTime: bar.timeOfDay,
          exitPrice,
          quantity,
          pnl,
          pnlPercent,
          exitReason,
          highestPrice: position.highestPrice,
          lowestPrice: position.lowestPrice,
          gapSize: Math.abs(gap_percent || 0)
        });
        break;
      }
    }

    if (!exitTriggered) {
      results.push({
        date: signal_date,
        ticker: sigTicker,
        side: 'LONG',
        noTrade: true,
        noTradeReason: 'Position not closed'
      });
    }
  }
}

console.log(JSON.stringify(results, null, 2));
db.close();
