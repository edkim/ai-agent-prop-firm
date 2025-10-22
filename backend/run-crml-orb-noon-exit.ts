/**
 * CRML Opening Range Breakout - Multiple Days - Noon Exit
 *
 * Runs ORB strategy for CRML over the past 10 trading days
 * Exits at noon (12:00 PM) instead of market close
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
  date: string;
  ticker: string;
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}

async function runORBMultiDay() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const ticker = 'CRML';
  const timeframe = '5min';

  // Past 10 trading days from Oct 21, 2025
  const tradingDays = [
    '2025-10-08',
    '2025-10-09',
    '2025-10-10',
    '2025-10-13',
    '2025-10-14',
    '2025-10-15',
    '2025-10-16',
    '2025-10-17',
    '2025-10-20',
  ];

  console.log('='.repeat(70));
  console.log('CRML OPENING RANGE BREAKOUT - MULTI-DAY BACKTEST');
  console.log('='.repeat(70));
  console.log(`Ticker: ${ticker}`);
  console.log(`Strategy: 5-minute opening range breakout`);
  console.log(`Exit: Noon (12:00 PM) or breakout failure`);
  console.log(`Trading Days: ${tradingDays.length}`);
  console.log('='.repeat(70));
  console.log('');

  const results: TradeResult[] = [];

  // Run backtest for each day
  for (const date of tradingDays) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Testing ${date}...`);
    console.log('─'.repeat(70));

    const dateStart = new Date(`${date}T00:00:00Z`).getTime();
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateEnd = nextDate.getTime();

    // Fetch data for this day
    const query = `
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp ASC
    `;
    const bars = db.prepare(query).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

    if (bars.length === 0) {
      console.log(`⚠️  No data for ${date}`);
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: 'No data available'
      });
      continue;
    }

    console.log(`📊 Loaded ${bars.length} bars`);

    // Find opening range bar (9:30 AM)
    const openingRangeIndex = bars.findIndex(bar =>
      bar.timeOfDay === '09:30' || bar.timeOfDay === '13:30'
    );

    if (openingRangeIndex === -1) {
      console.log(`⚠️  No opening bar found for ${date}`);
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: 'No opening bar (9:30 AM)'
      });
      continue;
    }

    const openingBar = bars[openingRangeIndex];
    const openingRangeHigh = openingBar.high;
    const openingRangeLow = openingBar.low;

    console.log(`📈 Opening Range: H=$${openingRangeHigh.toFixed(2)} L=$${openingRangeLow.toFixed(2)} (${openingBar.timeOfDay})`);

    // Find noon bar index (12:00 PM)
    const noonIndex = bars.findIndex(bar =>
      bar.timeOfDay === '12:00' || bar.timeOfDay === '16:00'
    );
    const endIndex = noonIndex !== -1 ? noonIndex : bars.length - 1;

    // Track position
    let position: { entry: number; entryTime: string; entryBar: Bar } | null = null;
    let entryIndex = -1;
    let exitBar: Bar | null = null;
    let exitReason = '';

    // Look for breakout after opening range
    for (let i = openingRangeIndex + 1; i <= endIndex; i++) {
      const bar = bars[i];

      // Entry logic
      if (!position && bar.high > openingRangeHigh) {
        position = {
          entry: bar.close,
          entryTime: bar.timeOfDay,
          entryBar: bar,
        };
        entryIndex = i;
        console.log(`🚀 BREAKOUT at ${bar.timeOfDay}: Entry at $${position.entry.toFixed(2)}`);
        continue;
      }

      // Exit at noon if position open
      if (position && (bar.timeOfDay === '12:00' || bar.timeOfDay === '16:00')) {
        exitBar = bar;
        exitReason = 'Noon exit (12:00 PM)';
        break;
      }
    }

    // If position still open, exit at last available bar
    if (position && !exitBar) {
      exitBar = bars[endIndex];
      exitReason = 'End of data';
    }

    // Calculate results for this day
    if (position && exitBar) {
      const exitPrice = exitBar.close;
      const pnl = exitPrice - position.entry;
      const pnlPercent = (pnl / position.entry) * 100;

      console.log(`📤 EXIT at ${exitBar.timeOfDay}: $${exitPrice.toFixed(2)}`);
      console.log(`💰 P&L: $${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) - ${pnl > 0 ? '✅ WIN' : pnl < 0 ? '❌ LOSS' : '⚪ BREAK-EVEN'}`);

      results.push({
        date,
        ticker,
        entryTime: position.entryTime,
        entryPrice: position.entry,
        exitTime: exitBar.timeOfDay,
        exitPrice,
        pnl,
        pnlPercent,
        exitReason,
      });
    } else {
      console.log(`❌ NO TRADE - No breakout above $${openingRangeHigh.toFixed(2)}`);
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: 'No breakout signal'
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY - CRML ORB BACKTEST RESULTS');
  console.log('='.repeat(70));

  const trades = results.filter(r => !r.noTrade);
  const winners = trades.filter(r => r.pnl! > 0);
  const losers = trades.filter(r => r.pnl! < 0);
  const totalPnL = trades.reduce((sum, r) => sum + (r.pnl || 0), 0);
  const avgPnL = trades.length > 0 ? totalPnL / trades.length : 0;
  const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;

  console.log(`\nTotal Days Tested: ${tradingDays.length}`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`No Trade Days: ${results.filter(r => r.noTrade).length}`);
  console.log('');
  console.log(`Winners: ${winners.length}`);
  console.log(`Losers: ${losers.length}`);
  console.log(`Win Rate: ${winRate.toFixed(1)}%`);
  console.log('');
  console.log(`Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`Average P&L per trade: $${avgPnL.toFixed(2)}`);
  console.log('');

  // Trade-by-trade breakdown
  console.log('TRADE-BY-TRADE BREAKDOWN:');
  console.log('─'.repeat(70));
  results.forEach((result, index) => {
    if (result.noTrade) {
      console.log(`${index + 1}. ${result.date}: NO TRADE (${result.noTradeReason})`);
    } else {
      const outcome = result.pnl! > 0 ? '✅ WIN' : result.pnl! < 0 ? '❌ LOSS' : '⚪ EVEN';
      console.log(`${index + 1}. ${result.date}: ${outcome} - Entry: $${result.entryPrice!.toFixed(2)} (${result.entryTime}) → Exit: $${result.exitPrice!.toFixed(2)} (${result.exitTime}) = $${result.pnl!.toFixed(2)} (${result.pnlPercent!.toFixed(2)}%)`);
    }
  });

  console.log('='.repeat(70));
}

runORBMultiDay().catch(console.error);
