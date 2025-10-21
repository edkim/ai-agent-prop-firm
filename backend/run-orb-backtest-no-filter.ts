/**
 * Opening Range Breakout Backtest - NO QQQ FILTER
 *
 * This version removes the QQQ filter to see what the trade would have been
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

async function runORBBacktestNoFilter() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const ticker = 'HOOD';
  const timeframe = '5min';

  console.log('='.repeat(60));
  console.log('OPENING RANGE BREAKOUT BACKTEST - NO QQQ FILTER');
  console.log('='.repeat(60));
  console.log(`Ticker: ${ticker}`);
  console.log(`Date: 2025-07-31 (Day after earnings)`);
  console.log(`Strategy: 5-minute opening range breakout`);
  console.log(`Filter: NONE - For comparison purposes`);
  console.log(`Exit: Close of day`);
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
  let position: { entry: number; entryTime: string; entryBar: Bar } | null = null;
  let entryIndex = -1;

  console.log(`⏰ Starting breakout detection from bar ${openingRangeIndex + 1} (after opening range)`);
  console.log('');

  // Look for breakout after opening range
  for (let i = openingRangeIndex + 1; i < hoodBars.length; i++) {
    const bar = hoodBars[i];

    // Check if we broke above opening range high
    if (!position && bar.high > openingRangeHigh) {
      console.log(`🚀 BREAKOUT at ${bar.timeOfDay}:`);
      console.log(`   HOOD broke above $${openingRangeHigh.toFixed(2)}`);
      console.log(`   Bar: O=$${bar.open.toFixed(2)} H=$${bar.high.toFixed(2)} L=$${bar.low.toFixed(2)} C=$${bar.close.toFixed(2)}`);
      console.log('');

      // Enter position at close of breakout bar
      position = {
        entry: bar.close,
        entryTime: bar.timeOfDay,
        entryBar: bar
      };
      entryIndex = i;
      console.log(`✅ ENTERED LONG at $${position.entry.toFixed(2)} (${position.entryTime})`);
      console.log('');
      break; // Only take first signal
    }
  }

  // Exit at close of regular session (4:00 PM ET = 16:00 or 20:00 UTC)
  if (position) {
    // Find the 4:00 PM bar (market close)
    const marketCloseBar = hoodBars.find(bar => bar.timeOfDay === '16:00' || bar.timeOfDay === '20:00');

    if (!marketCloseBar) {
      console.log('⚠️  Could not find 4:00 PM bar. Using last available regular session bar.');
      console.log('Available times near end:', hoodBars.slice(-5).map(b => b.timeOfDay));
    }

    const exitBar = marketCloseBar || hoodBars[hoodBars.length - 1];
    const exitPrice = exitBar.close;
    const exitTime = exitBar.timeOfDay;

    const profitLoss = exitPrice - position.entry;
    const profitLossPct = (profitLoss / position.entry) * 100;

    console.log('📤 EXIT AT CLOSE:');
    console.log(`   Time: ${exitTime}`);
    console.log(`   Exit price: $${exitPrice.toFixed(2)}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('TRADE RESULTS:');
    console.log('='.repeat(60));
    console.log(`Entry: $${position.entry.toFixed(2)} at ${position.entryTime}`);
    console.log(`Exit: $${exitPrice.toFixed(2)} at ${exitTime}`);
    console.log(`P&L: $${profitLoss.toFixed(2)} (${profitLossPct > 0 ? '+' : ''}${profitLossPct.toFixed(2)}%)`);
    console.log(`Outcome: ${profitLoss > 0 ? '✅ WINNER' : '❌ LOSER'}`);
    console.log('');

    // Calculate detailed trade metrics (only during regular session)
    let maxGain = 0;
    let maxLoss = 0;
    let maxGainTime = '';
    let maxLossTime = '';
    let maxGainPrice = 0;
    let maxLossPrice = 0;

    // Find index of market close bar
    const marketCloseIndex = hoodBars.findIndex(bar => bar.timeOfDay === '16:00' || bar.timeOfDay === '20:00');
    const endIndex = marketCloseIndex !== -1 ? marketCloseIndex : hoodBars.length - 1;

    for (let i = entryIndex; i <= endIndex; i++) {
      const bar = hoodBars[i];
      const gain = bar.high - position.entry;
      const loss = bar.low - position.entry;

      if (gain > maxGain) {
        maxGain = gain;
        maxGainTime = bar.timeOfDay;
        maxGainPrice = bar.high;
      }
      if (loss < maxLoss) {
        maxLoss = loss;
        maxLossTime = bar.timeOfDay;
        maxLossPrice = bar.low;
      }
    }

    console.log('INTRADAY EXCURSION ANALYSIS:');
    console.log(`Max Favorable Excursion (MFE):`);
    console.log(`  High: $${maxGainPrice.toFixed(2)} at ${maxGainTime}`);
    console.log(`  Gain: +$${maxGain.toFixed(2)} (+${((maxGain / position.entry) * 100).toFixed(2)}%)`);
    console.log('');
    console.log(`Max Adverse Excursion (MAE):`);
    console.log(`  Low: $${maxLossPrice.toFixed(2)} at ${maxLossTime}`);
    console.log(`  Drawdown: $${maxLoss.toFixed(2)} (${((maxLoss / position.entry) * 100).toFixed(2)}%)`);
    console.log('');

    // Calculate what percentage of MFE was captured
    const captureRate = (profitLoss / maxGain) * 100;
    console.log(`MFE Capture Rate: ${captureRate.toFixed(2)}%`);
    console.log(`  (How much of the max profit was captured at exit)`);

    // Risk/Reward ratio
    const riskRewardRatio = Math.abs(maxGain / maxLoss);
    console.log(`Risk/Reward (MFE/MAE): ${riskRewardRatio.toFixed(2)}:1`);

    console.log('='.repeat(60));

  } else {
    console.log('='.repeat(60));
    console.log('❌ NO TRADE TAKEN');
    console.log('='.repeat(60));
    console.log('No breakout above opening range high occurred.');
    console.log('='.repeat(60));
  }
}

runORBBacktestNoFilter().catch(console.error);
