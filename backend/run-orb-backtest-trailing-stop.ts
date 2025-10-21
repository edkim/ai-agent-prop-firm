/**
 * Opening Range Breakout Backtest - WITH TRAILING STOP
 *
 * Exit strategy: Trailing stop from entry/high
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

async function runORBBacktestTrailingStop() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const ticker = 'HOOD';
  const timeframe = '5min';

  // Trailing stop configuration (in percentage)
  const trailingStopPct = 2.0; // 2% trailing stop

  console.log('='.repeat(60));
  console.log('OPENING RANGE BREAKOUT BACKTEST - TRAILING STOP');
  console.log('='.repeat(60));
  console.log(`Ticker: ${ticker}`);
  console.log(`Date: 2025-07-31 (Day after earnings)`);
  console.log(`Strategy: 5-minute opening range breakout`);
  console.log(`Filter: NONE`);
  console.log(`Exit: ${trailingStopPct}% trailing stop OR close of day`);
  console.log('='.repeat(60));
  console.log('');

  // July 31, 2025 timestamp range
  const dateStart = new Date('2025-07-31T00:00:00Z').getTime();
  const dateEnd = new Date('2025-08-01T00:00:00Z').getTime();

  // Fetch HOOD data
  const hoodQuery = `
    SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
    FROM ohlcv_data
    WHERE ticker = ? AND timeframe = ? AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `;
  const hoodBars = db.prepare(hoodQuery).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

  if (hoodBars.length === 0) {
    console.log('❌ No HOOD data found!');
    return;
  }

  console.log(`📊 HOOD bars loaded: ${hoodBars.length}`);
  console.log('');

  // Find opening range bar (9:30 AM bar)
  let openingRangeIndex = hoodBars.findIndex(bar => {
    const time = bar.timeOfDay;
    return time === '09:30' || time === '13:30';
  });

  if (openingRangeIndex === -1) {
    console.log('❌ Could not find opening bar (9:30 AM)');
    return;
  }

  const openingBar = hoodBars[openingRangeIndex];
  const openingRangeHigh = openingBar.high;
  const openingRangeLow = openingBar.low;

  console.log('📈 OPENING RANGE (9:30-9:35 AM):');
  console.log(`   Time: ${openingBar.timeOfDay}`);
  console.log(`   Open: $${openingBar.open.toFixed(2)}`);
  console.log(`   High: $${openingRangeHigh.toFixed(2)}`);
  console.log(`   Low: $${openingRangeLow.toFixed(2)}`);
  console.log(`   Close: $${openingBar.close.toFixed(2)}`);
  console.log(`   Range: $${(openingRangeHigh - openingRangeLow).toFixed(2)} (${((openingRangeHigh - openingRangeLow) / openingRangeLow * 100).toFixed(2)}%)`);
  console.log('');

  // Track position
  let position: { entry: number; entryTime: string; entryBar: Bar; highestPrice: number } | null = null;
  let entryIndex = -1;
  let exitBar: Bar | null = null;
  let exitReason = '';

  console.log(`⏰ Starting breakout detection from bar ${openingRangeIndex + 1} (after opening range)`);
  console.log('');

  // Find market close bar index
  const marketCloseIndex = hoodBars.findIndex(bar => bar.timeOfDay === '16:00' || bar.timeOfDay === '20:00');
  const endIndex = marketCloseIndex !== -1 ? marketCloseIndex : hoodBars.length - 1;

  // Look for breakout after opening range
  for (let i = openingRangeIndex + 1; i <= endIndex; i++) {
    const bar = hoodBars[i];

    // Entry logic
    if (!position && bar.high > openingRangeHigh) {
      console.log(`🚀 BREAKOUT at ${bar.timeOfDay}:`);
      console.log(`   HOOD broke above $${openingRangeHigh.toFixed(2)}`);
      console.log(`   Bar: O=$${bar.open.toFixed(2)} H=$${bar.high.toFixed(2)} L=$${bar.low.toFixed(2)} C=$${bar.close.toFixed(2)}`);
      console.log('');

      // Enter position at close of breakout bar
      position = {
        entry: bar.close,
        entryTime: bar.timeOfDay,
        entryBar: bar,
        highestPrice: bar.high // Track highest price for trailing stop
      };
      entryIndex = i;
      console.log(`✅ ENTERED LONG at $${position.entry.toFixed(2)} (${position.entryTime})`);
      console.log(`   Trailing stop: ${trailingStopPct}% from highest price`);
      console.log('');
      continue;
    }

    // Exit logic - trailing stop
    if (position) {
      // Update highest price if new high is made
      if (bar.high > position.highestPrice) {
        const oldHigh = position.highestPrice;
        position.highestPrice = bar.high;
        const newStopPrice = position.highestPrice * (1 - trailingStopPct / 100);
        console.log(`📈 NEW HIGH at ${bar.timeOfDay}: $${bar.high.toFixed(2)} (was $${oldHigh.toFixed(2)})`);
        console.log(`   Trailing stop moved to: $${newStopPrice.toFixed(2)}`);
      }

      // Calculate trailing stop level
      const trailingStopPrice = position.highestPrice * (1 - trailingStopPct / 100);

      // Check if trailing stop is hit
      if (bar.low <= trailingStopPrice) {
        exitBar = bar;
        exitReason = 'Trailing stop hit';
        console.log('');
        console.log(`🛑 TRAILING STOP HIT at ${bar.timeOfDay}:`);
        console.log(`   Bar low: $${bar.low.toFixed(2)}`);
        console.log(`   Stop level: $${trailingStopPrice.toFixed(2)}`);
        console.log(`   Highest price achieved: $${position.highestPrice.toFixed(2)}`);
        console.log(`   Exit price (stop): $${trailingStopPrice.toFixed(2)}`);
        break;
      }
    }
  }

  // If position still open, exit at market close
  if (position && !exitBar) {
    exitBar = hoodBars[endIndex];
    exitReason = 'Market close (4:00 PM)';
  }

  // Calculate results
  if (position && exitBar) {
    const exitPrice = exitReason === 'Trailing stop hit'
      ? position.highestPrice * (1 - trailingStopPct / 100)
      : exitBar.close;
    const exitTime = exitBar.timeOfDay;

    const profitLoss = exitPrice - position.entry;
    const profitLossPct = (profitLoss / position.entry) * 100;

    console.log('');
    console.log('📤 EXIT:');
    console.log(`   Time: ${exitTime}`);
    console.log(`   Reason: ${exitReason}`);
    console.log(`   Exit price: $${exitPrice.toFixed(2)}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('TRADE RESULTS:');
    console.log('='.repeat(60));
    console.log(`Entry: $${position.entry.toFixed(2)} at ${position.entryTime}`);
    console.log(`Exit: $${exitPrice.toFixed(2)} at ${exitTime}`);
    console.log(`Highest price: $${position.highestPrice.toFixed(2)} (+${((position.highestPrice - position.entry) / position.entry * 100).toFixed(2)}%)`);
    console.log(`P&L: $${profitLoss.toFixed(2)} (${profitLossPct > 0 ? '+' : ''}${profitLossPct.toFixed(2)}%)`);
    console.log(`Outcome: ${profitLoss > 0 ? '✅ WINNER' : profitLoss < 0 ? '❌ LOSER' : '⚪ BREAKEVEN'}`);
    console.log('');

    // Calculate MFE and MAE for comparison
    let maxGain = 0;
    let maxLoss = 0;
    let maxGainTime = '';
    let maxLossTime = '';

    for (let i = entryIndex; i <= endIndex; i++) {
      const bar = hoodBars[i];
      const gain = bar.high - position.entry;
      const loss = bar.low - position.entry;

      if (gain > maxGain) {
        maxGain = gain;
        maxGainTime = bar.timeOfDay;
      }
      if (loss < maxLoss) {
        maxLoss = loss;
        maxLossTime = bar.timeOfDay;
      }
    }

    console.log('PERFORMANCE METRICS:');
    console.log(`Exit reason: ${exitReason}`);
    console.log(`Max Favorable Excursion: +$${maxGain.toFixed(2)} (+${((maxGain / position.entry) * 100).toFixed(2)}%) at ${maxGainTime}`);
    console.log(`Max Adverse Excursion: $${maxLoss.toFixed(2)} (${((maxLoss / position.entry) * 100).toFixed(2)}%) at ${maxLossTime}`);
    console.log(`Profit capture: ${((profitLoss / maxGain) * 100).toFixed(2)}% of MFE`);
    console.log('='.repeat(60));

  } else {
    console.log('='.repeat(60));
    console.log('❌ NO TRADE TAKEN');
    console.log('='.repeat(60));
  }
}

runORBBacktestTrailingStop().catch(console.error);
