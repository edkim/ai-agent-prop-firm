/**
 * "Always Signal" Scanner Test
 *
 * This scanner triggers a signal on EVERY bar after warmup.
 * Purpose: Isolate whether the problem is:
 * - Infrastructure (real-time scanner not working) → 0 signals = BROKEN
 * - VWAP logic (detection logic has bugs) → Many signals = INFRASTRUCTURE WORKS
 */

import { runRealtimeBacktest, RealtimeBacktestOptions } from './src/backtesting/realtime-backtest.engine';
import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize database
const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
initializeDatabase(dbPath);

const db = getDatabase();

// Get list of active tickers (limit to 5 for fast test)
const tickers = db.prepare(`
  SELECT DISTINCT ticker FROM universe_stocks
  WHERE is_active = 1
  ORDER BY ticker
  LIMIT 5
`).all() as any[];

const tickerList = tickers.map((t: any) => t.ticker);

console.log('🧪 ALWAYS SIGNAL TEST');
console.log('='.repeat(60));
console.log(`Purpose: Verify real-time scanner infrastructure works`);
console.log(`Strategy: Signal on EVERY bar after 30-bar warmup`);
console.log(`Tickers: ${tickerList.join(', ')} (${tickerList.length} tickers)`);
console.log(`Date Range: Last 3 days`);
console.log(`Expected: Should produce MANY signals (hundreds)`);
console.log('='.repeat(60));
console.log();

// Scanner script that ALWAYS signals
const alwaysSignalScanner = `
import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  direction: 'LONG' | 'SHORT';
  metrics: any;
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  const tickerList = (process.env.SCAN_TICKERS || '').split(',').filter(t => t.trim());

  console.error(\`🔍 ALWAYS SIGNAL TEST: Scanning \${tickerList.length} tickers\`);

  for (const ticker of tickerList) {
    // Get all bars for this ticker
    const bars = db.prepare(\`
      SELECT timestamp, time_of_day, open, high, low, close, volume,
             date(timestamp/1000, 'unixepoch') as date
      FROM ohlcv_data
      WHERE ticker = ?
        AND timeframe = '5min'
      ORDER BY timestamp ASC
    \`).all(ticker) as any[];

    console.error(\`  \${ticker}: \${bars.length} bars\`);

    // Signal on EVERY bar after 30-bar warmup
    for (let i = 30; i < bars.length; i++) {
      const bar = bars[i];
      results.push({
        ticker,
        signal_date: bar.date,
        signal_time: bar.time_of_day,
        pattern_strength: 100,
        direction: 'LONG',
        metrics: {
          entry_price: bar.close,
          bar_index: i,
          test_type: 'ALWAYS_SIGNAL'
        }
      });
    }
  }

  console.error(\`  ✅ Generated \${results.length} signals (EVERY bar after warmup)\`);
  return results;
}

// Execute and return scan results (wrapper will capture this)
return await runScan();
`;

async function runTest() {
  try {
    console.log('📊 Checking data availability...');

    // Check if we have data for the test period
    const dataCheck = db.prepare(`
      SELECT
        date(timestamp/1000, 'unixepoch') as date,
        COUNT(DISTINCT ticker) as ticker_count,
        COUNT(*) as bar_count
      FROM ohlcv_data
      WHERE timeframe = '5min'
        AND ticker IN (${tickerList.map(() => '?').join(',')})
        AND date(timestamp/1000, 'unixepoch') >= date('now', '-4 days')
        AND date(timestamp/1000, 'unixepoch') <= date('now', '-1 day')
      GROUP BY date
      ORDER BY date DESC
    `).all(...tickerList) as any[];

    if (dataCheck.length === 0) {
      console.error('❌ NO DATA FOUND for the test period!');
      console.error('   This explains why no signals were found.');
      console.error('   Check if you have 5min data for these tickers in the last 4 days.');
      return;
    }

    console.log('✅ Data availability:');
    dataCheck.forEach((row: any) => {
      console.log(`   ${row.date}: ${row.ticker_count} tickers, ${row.bar_count} bars`);
    });
    console.log();

    // Calculate expected signals
    const totalBars = dataCheck.reduce((sum: number, row: any) => sum + row.bar_count, 0);
    const expectedSignals = Math.max(0, totalBars - (tickerList.length * 30)); // Subtract warmup bars
    console.log(`📈 Expected signals: ~${expectedSignals} (total bars minus warmup)`);
    console.log();

    // Configure real-time backtest
    const options: RealtimeBacktestOptions = {
      startDate: getDateDaysAgo(3),
      endDate: getDateDaysAgo(1),
      tickers: tickerList,
      warmupBars: 30,
      timeframe: '5min',
      maxSignalsPerIteration: 999999, // No limit - we want ALL signals
      enableParallelProcessing: false  // Sequential for easier debugging
    };

    console.log('🚀 Running real-time backtest with "always signal" scanner...');
    console.log();

    const startTime = Date.now();
    const signals = await runRealtimeBacktest(alwaysSignalScanner, options);
    const elapsed = Date.now() - startTime;

    console.log();
    console.log('='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Signals found: ${signals.length}`);
    console.log(`Execution time: ${(elapsed / 1000).toFixed(2)}s`);
    console.log();

    if (signals.length === 0) {
      console.log('❌ CRITICAL: ZERO signals found!');
      console.log('   This means the real-time scanner infrastructure is BROKEN.');
      console.log('   The scanner should have triggered on EVERY bar after warmup.');
      console.log();
      console.log('   Possible causes:');
      console.log('   1. Scanner function not being called');
      console.log('   2. Scanner results not being collected');
      console.log('   3. Bar data not being passed correctly');
      console.log('   4. Signal format validation rejecting all signals');
    } else {
      console.log('✅ SUCCESS: Infrastructure is working!');
      console.log('   The real-time scanner CAN detect and return signals.');
      console.log('   This means the VWAP cross logic is the problem.');
      console.log();
      console.log(`   Signal breakdown:`);

      // Group by ticker
      const byTicker = signals.reduce((acc: any, s: any) => {
        acc[s.ticker] = (acc[s.ticker] || 0) + 1;
        return acc;
      }, {});

      Object.entries(byTicker).forEach(([ticker, count]) => {
        console.log(`   - ${ticker}: ${count} signals`);
      });

      console.log();
      console.log(`   Sample signals (first 3):`);
      signals.slice(0, 3).forEach((s: any, i: number) => {
        console.log(`   ${i + 1}. ${s.ticker} @ ${s.signal_date} ${s.signal_time} - entry: $${s.metrics.entry_price}`);
      });
    }

    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
  }
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

// Run the test
runTest().then(() => {
  console.log('\\n✅ Test complete');
  process.exit(0);
}).catch((err) => {
  console.error('\\n❌ Test error:', err);
  process.exit(1);
});
