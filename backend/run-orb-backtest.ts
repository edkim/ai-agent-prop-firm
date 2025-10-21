/**
 * Opening Range Breakout Backtest
 *
 * Strategy:
 * - Entry: 5-minute opening range breakout (price breaks above high of 9:30-9:35 AM bar)
 * - Filter: Only enter if QQQ is positive at entry time
 * - Exit: Close of day
 * - Date: Day after earnings announcement (July 31, 2025)
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

async function runORBBacktest() {
  // Initialize database
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const ticker = 'HOOD';
  const filterTicker = 'QQQ';
  const timeframe = '5min';
  const date = '2025-07-31';

  console.log('='.repeat(60));
  console.log('OPENING RANGE BREAKOUT BACKTEST');
  console.log('='.repeat(60));
  console.log(`Ticker: ${ticker}`);
  console.log(`Date: ${date} (Day after earnings)`);
  console.log(`Strategy: 5-minute opening range breakout`);
  console.log(`Filter: QQQ must be positive at entry`);
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

  // Fetch QQQ data
  const qqqBars = db.prepare(hoodQuery).all(filterTicker, timeframe, dateStart, dateEnd) as Bar[];

  if (hoodBars.length === 0) {
    console.log('❌ No HOOD data found!');
    return;
  }

  if (qqqBars.length === 0) {
    console.log('❌ No QQQ data found!');
    return;
  }

  console.log(`📊 HOOD bars loaded: ${hoodBars.length}`);
  console.log(`📊 QQQ bars loaded: ${qqqBars.length}`);
  console.log('');

  // Create a map of QQQ bars by timestamp for quick lookup
  const qqqBarMap = new Map<number, Bar>();
  for (const bar of qqqBars) {
    qqqBarMap.set(bar.timestamp, bar);
  }

  // Find opening range bar (9:30 AM bar)
  // Regular market hours start at 9:30 AM ET (13:30 UTC)
  let openingRangeIndex = hoodBars.findIndex(bar => {
    const time = bar.timeOfDay;
    return time === '09:30' || time === '13:30'; // Could be 13:30 UTC if data is in UTC
  });

  if (openingRangeIndex === -1) {
    console.log('Available times:', hoodBars.slice(0, 10).map(b => b.timeOfDay));
    console.log('❌ Could not find opening bar (9:30 AM)');
    console.log('Cannot run backtest without proper opening range.');
    return;
  }

  const openingBar = hoodBars[openingRangeIndex];
  const openingRangeHigh = openingBar.high;
  const openingRangeLow = openingBar.low;

  console.log('📈 OPENING RANGE (9:30-9:35 AM):');
  console.log(`   Time: ${openingBar.timeOfDay}`);
  console.log(`   High: $${openingRangeHigh.toFixed(2)}`);
  console.log(`   Low: $${openingRangeLow.toFixed(2)}`);
  console.log(`   Range: $${(openingRangeHigh - openingRangeLow).toFixed(2)}`);
  console.log('');

  // Track position
  let position: { entry: number; entryTime: string; entryBar: Bar } | null = null;
  let entryIndex = -1;

  // CRITICAL: Only look for breakout AFTER opening range is established
  // Start from the bar AFTER the opening range (9:35 AM onwards)
  console.log(`⏰ Starting breakout detection from bar ${openingRangeIndex + 1} (after opening range)`);
  console.log('');

  for (let i = openingRangeIndex + 1; i < hoodBars.length; i++) {
    const bar = hoodBars[i];
    const qqqBar = qqqBarMap.get(bar.timestamp);

    if (!qqqBar) continue;

    // Check if we broke above opening range high
    if (!position && bar.high > openingRangeHigh) {
      // Check QQQ filter: QQQ must be positive (compare to 9:30 AM open, not pre-market)
      const qqqOpeningBar = qqqBars[openingRangeIndex];
      const qqqOpen = qqqOpeningBar.open;
      const qqqIsPositive = qqqBar.close > qqqOpen;

      console.log(`🔍 BREAKOUT DETECTED at ${bar.timeOfDay}:`);
      console.log(`   HOOD broke above $${openingRangeHigh.toFixed(2)}`);
      console.log(`   HOOD price: $${bar.close.toFixed(2)}`);
      console.log(`   QQQ open (9:30 AM): $${qqqOpen.toFixed(2)}`);
      console.log(`   QQQ current: $${qqqBar.close.toFixed(2)}`);
      console.log(`   QQQ change: ${((qqqBar.close - qqqOpen) / qqqOpen * 100).toFixed(2)}%`);
      console.log(`   QQQ positive? ${qqqIsPositive ? '✅ YES' : '❌ NO'}`);
      console.log('');

      if (qqqIsPositive) {
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
      } else {
        console.log(`⏭️  SKIPPED: QQQ filter not met`);
        console.log('');
      }
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
    console.log('');

    // Calculate some additional metrics (only during regular session)
    let maxGain = 0;
    let maxLoss = 0;
    let maxGainTime = '';
    let maxLossTime = '';

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
      }
      if (loss < maxLoss) {
        maxLoss = loss;
        maxLossTime = bar.timeOfDay;
      }
    }

    console.log('TRADE STATISTICS:');
    console.log(`Max favorable excursion: +$${maxGain.toFixed(2)} (+${((maxGain / position.entry) * 100).toFixed(2)}%) at ${maxGainTime}`);
    console.log(`Max adverse excursion: $${maxLoss.toFixed(2)} (${((maxLoss / position.entry) * 100).toFixed(2)}%) at ${maxLossTime}`);
    console.log('='.repeat(60));

  } else {
    console.log('='.repeat(60));
    console.log('❌ NO TRADE TAKEN');
    console.log('='.repeat(60));
    console.log('Reason: Either no breakout occurred or QQQ filter prevented entry');
    console.log('='.repeat(60));
  }
}

runORBBacktest().catch(console.error);
