/**
 * Opening Range Breakout - Trailing Stop Comparison
 * Test multiple trailing stop percentages
 */

import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';

dotenv.config();

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
  trailingStopPct: number;
  entry: number;
  exit: number;
  exitTime: string;
  exitReason: string;
  highestPrice: number;
  pnl: number;
  pnlPct: number;
  outcome: string;
}

function runBacktestWithTrailingStop(
  hoodBars: Bar[],
  openingRangeIndex: number,
  openingRangeHigh: number,
  trailingStopPct: number,
  endIndex: number
): TradeResult | null {
  let position: { entry: number; entryTime: string; highestPrice: number } | null = null;
  let entryIndex = -1;
  let exitBar: Bar | null = null;
  let exitReason = '';
  let exitPrice = 0;

  // Look for entry
  for (let i = openingRangeIndex + 1; i <= endIndex; i++) {
    const bar = hoodBars[i];

    if (!position && bar.high > openingRangeHigh) {
      position = {
        entry: bar.close,
        entryTime: bar.timeOfDay,
        highestPrice: bar.high
      };
      entryIndex = i;
      continue;
    }

    if (position) {
      // Update highest price
      if (bar.high > position.highestPrice) {
        position.highestPrice = bar.high;
      }

      // Check trailing stop
      const trailingStopPrice = position.highestPrice * (1 - trailingStopPct / 100);

      if (bar.low <= trailingStopPrice) {
        exitBar = bar;
        exitReason = 'Trailing stop';
        exitPrice = trailingStopPrice;
        break;
      }
    }
  }

  // Exit at close if still in position
  if (position && !exitBar) {
    exitBar = hoodBars[endIndex];
    exitReason = 'Market close';
    exitPrice = exitBar.close;
  }

  if (position && exitBar) {
    const pnl = exitPrice - position.entry;
    const pnlPct = (pnl / position.entry) * 100;

    return {
      trailingStopPct,
      entry: position.entry,
      exit: exitPrice,
      exitTime: exitBar.timeOfDay,
      exitReason,
      highestPrice: position.highestPrice,
      pnl,
      pnlPct,
      outcome: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BE'
    };
  }

  return null;
}

async function runTrailingStopComparison() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const ticker = 'HOOD';
  const timeframe = '5min';

  console.log('='.repeat(80));
  console.log('TRAILING STOP COMPARISON - HOOD ORB BACKTEST');
  console.log('='.repeat(80));
  console.log('Date: 2025-07-31 (Day after earnings)');
  console.log('Strategy: 5-minute opening range breakout');
  console.log('');

  const dateStart = new Date('2025-07-31T00:00:00Z').getTime();
  const dateEnd = new Date('2025-08-01T00:00:00Z').getTime();

  const hoodQuery = `
    SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
    FROM ohlcv_data
    WHERE ticker = ? AND timeframe = ? AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `;
  const hoodBars = db.prepare(hoodQuery).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

  const openingRangeIndex = hoodBars.findIndex(bar => bar.timeOfDay === '09:30' || bar.timeOfDay === '13:30');
  const openingBar = hoodBars[openingRangeIndex];
  const openingRangeHigh = openingBar.high;

  const marketCloseIndex = hoodBars.findIndex(bar => bar.timeOfDay === '16:00' || bar.timeOfDay === '20:00');
  const endIndex = marketCloseIndex !== -1 ? marketCloseIndex : hoodBars.length - 1;

  console.log(`Opening Range High: $${openingRangeHigh.toFixed(2)}`);
  console.log('');

  // Test different trailing stop percentages
  const trailingStopLevels = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0];
  const results: TradeResult[] = [];

  for (const stopPct of trailingStopLevels) {
    const result = runBacktestWithTrailingStop(
      hoodBars,
      openingRangeIndex,
      openingRangeHigh,
      stopPct,
      endIndex
    );

    if (result) {
      results.push(result);
    }
  }

  // Also run hold-to-close for comparison
  const holdToCloseResult = runBacktestWithTrailingStop(
    hoodBars,
    openingRangeIndex,
    openingRangeHigh,
    999, // Very large stop that won't be hit
    endIndex
  );

  console.log('='.repeat(80));
  console.log('RESULTS:');
  console.log('='.repeat(80));
  console.log('');

  // Print results table
  console.log('Trailing | Entry    | Exit     | Exit    | Highest  | P&L      | P&L   | Result');
  console.log('Stop %   | Price    | Price    | Time    | Price    | ($)      | (%)   |       ');
  console.log('-'.repeat(80));

  for (const result of results) {
    console.log(
      `${result.trailingStopPct.toFixed(1).padStart(6)}%  | ` +
      `$${result.entry.toFixed(2).padStart(6)} | ` +
      `$${result.exit.toFixed(2).padStart(6)} | ` +
      `${result.exitTime.padEnd(7)} | ` +
      `$${result.highestPrice.toFixed(2).padStart(6)} | ` +
      `$${result.pnl.toFixed(2).padStart(6)} | ` +
      `${result.pnlPct.toFixed(2).padStart(5)}% | ` +
      `${result.outcome}`
    );
  }

  if (holdToCloseResult) {
    console.log('-'.repeat(80));
    console.log(
      `Hold     | ` +
      `$${holdToCloseResult.entry.toFixed(2).padStart(6)} | ` +
      `$${holdToCloseResult.exit.toFixed(2).padStart(6)} | ` +
      `${holdToCloseResult.exitTime.padEnd(7)} | ` +
      `$${holdToCloseResult.highestPrice.toFixed(2).padStart(6)} | ` +
      `$${holdToCloseResult.pnl.toFixed(2).padStart(6)} | ` +
      `${holdToCloseResult.pnlPct.toFixed(2).padStart(5)}% | ` +
      `${holdToCloseResult.outcome}`
    );
  }

  console.log('='.repeat(80));
  console.log('');

  // Find best result
  const bestResult = results.reduce((best, current) =>
    current.pnl > best.pnl ? current : best
  );

  console.log('BEST PERFORMING TRAILING STOP:');
  console.log(`  ${bestResult.trailingStopPct}% trailing stop`);
  console.log(`  P&L: $${bestResult.pnl.toFixed(2)} (${bestResult.pnlPct > 0 ? '+' : ''}${bestResult.pnlPct.toFixed(2)}%)`);
  console.log(`  Exit: ${bestResult.exitTime} (${bestResult.exitReason})`);
  console.log(`  Highest price achieved: $${bestResult.highestPrice.toFixed(2)}`);
  console.log('');

  console.log('INSIGHTS:');
  const winners = results.filter(r => r.pnl > 0);
  const losers = results.filter(r => r.pnl < 0);
  console.log(`  Winners: ${winners.length}/${results.length}`);
  console.log(`  Losers: ${losers.length}/${results.length}`);
  console.log(`  Best P&L: +$${Math.max(...results.map(r => r.pnl)).toFixed(2)}`);
  console.log(`  Worst P&L: $${Math.min(...results.map(r => r.pnl)).toFixed(2)}`);

  if (holdToCloseResult) {
    const improvement = bestResult.pnl - holdToCloseResult.pnl;
    console.log(`  Improvement vs Hold-to-Close: $${improvement.toFixed(2)} (${((improvement / Math.abs(holdToCloseResult.pnl)) * 100).toFixed(1)}% better)`);
  }

  console.log('='.repeat(80));
}

runTrailingStopComparison().catch(console.error);
