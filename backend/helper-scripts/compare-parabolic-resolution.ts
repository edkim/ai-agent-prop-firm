/**
 * Parabolic Exhaustion Pattern - Resolution Comparison
 *
 * Compares exhaustion signal detection at 5-min vs 1-min on the exact dates
 * where iteration 22 found parabolic moves.
 *
 * Usage: npx ts-node helper-scripts/compare-parabolic-resolution.ts
 */

import { initializeDatabase, getDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Known signal dates from iteration 22
const SIGNAL_DATES = [
  { ticker: 'ABAT', date: '2025-10-15' },
  { ticker: 'BYND', date: '2025-10-22' },
  { ticker: 'BYND', date: '2025-10-24' },
  { ticker: 'CRML', date: '2025-10-15' },
  { ticker: 'OMER', date: '2025-10-16' },
  { ticker: 'OMER', date: '2025-10-17' },
  { ticker: 'PRAX', date: '2025-10-22' },
  { ticker: 'PRAX', date: '2025-10-23' },
  { ticker: 'REPL', date: '2025-10-21' },
  { ticker: 'UAMY', date: '2025-10-15' },
];

interface ExhaustionSignal {
  ticker: string;
  date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: {
    distance_from_high_percent: number;
    volume_ratio: number;
    intraday_high: number;
    signal_price: number;
  };
}

interface ComparisonResults {
  timeframe: string;
  signals: ExhaustionSignal[];
  avgPatternStrength: number;
  avgDistanceFromHigh: number;
  avgVolumeRatio: number;
}

async function scanExhaustionAtTimeframe(timeframe: '5min' | '1min'): Promise<ExhaustionSignal[]> {
  const db = getDatabase();
  const results: ExhaustionSignal[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Scanning for exhaustion at ${timeframe} resolution...`);
  console.log(`${'='.repeat(60)}\n`);

  for (const signalDate of SIGNAL_DATES) {
    const { ticker, date } = signalDate;

    // Get intraday bars for this date
    const barsStmt = db.prepare(`
      SELECT timestamp, open, high, low, close, volume, time_of_day
      FROM ohlcv_data
      WHERE ticker = ?
        AND timeframe = ?
        AND date(timestamp/1000, 'unixepoch') = ?
      ORDER BY timestamp ASC
    `);
    const bars = barsStmt.all(ticker, timeframe, date) as any[];

    if (bars.length < 10) {
      console.log(`⚠️  ${ticker} ${date}: Insufficient bars (${bars.length})`);
      continue;
    }

    // Calculate intraday high
    const intradayHigh = Math.max(...bars.map(b => b.high));

    // Calculate average volume
    const avgVolume = bars.reduce((sum, b) => sum + b.volume, 0) / bars.length;

    // Scan for exhaustion signals
    for (let i = 10; i < bars.length - 5; i++) {
      const bar = bars[i];

      // Volume ratio check (iteration 22 criteria: >= 1.5x)
      const volumeRatio = bar.volume / avgVolume;
      if (volumeRatio < 1.5) continue;

      // Distance from high (pullback)
      const distanceFromHigh = ((intradayHigh - bar.close) / intradayHigh) * 100;

      // Must have some pullback from high (at least 1%)
      if (distanceFromHigh < 1.0) continue;

      // Calculate pattern strength (matching iteration 22 logic)
      let strength = 50; // Base score

      // Volume strength
      if (volumeRatio >= 3.0) strength += 15;
      else if (volumeRatio >= 2.0) strength += 10;
      else if (volumeRatio >= 1.5) strength += 5;

      // Pullback strength
      if (distanceFromHigh >= 5) strength += 15;
      else if (distanceFromHigh >= 3) strength += 10;
      else if (distanceFromHigh >= 1) strength += 5;

      results.push({
        ticker,
        date,
        signal_time: bar.time_of_day,
        pattern_strength: Math.min(100, strength),
        metrics: {
          distance_from_high_percent: parseFloat(distanceFromHigh.toFixed(2)),
          volume_ratio: parseFloat(volumeRatio.toFixed(2)),
          intraday_high: intradayHigh,
          signal_price: bar.close
        }
      });
    }
  }

  console.log(`✅ Found ${results.length} exhaustion signals at ${timeframe}\n`);
  return results;
}

function analyzeResults(timeframe: string, signals: ExhaustionSignal[]): ComparisonResults {
  const avgPatternStrength = signals.reduce((sum, s) => sum + s.pattern_strength, 0) / signals.length || 0;
  const avgDistanceFromHigh = signals.reduce((sum, s) => sum + s.metrics.distance_from_high_percent, 0) / signals.length || 0;
  const avgVolumeRatio = signals.reduce((sum, s) => sum + s.metrics.volume_ratio, 0) / signals.length || 0;

  return {
    timeframe,
    signals,
    avgPatternStrength,
    avgDistanceFromHigh,
    avgVolumeRatio
  };
}

function printComparison(results5min: ComparisonResults, results1min: ComparisonResults) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PARABOLIC EXHAUSTION PATTERN - RESOLUTION COMPARISON');
  console.log('='.repeat(80));

  console.log('\n📈 Signal Counts:');
  console.log(`  5-min resolution:  ${results5min.signals.length} exhaustion signals`);
  console.log(`  1-min resolution:  ${results1min.signals.length} exhaustion signals`);

  if (results5min.signals.length > 0) {
    const diff = results1min.signals.length - results5min.signals.length;
    const pct = ((results1min.signals.length / results5min.signals.length - 1) * 100).toFixed(1);
    console.log(`  Difference:        ${diff > 0 ? '+' : ''}${diff} signals (${pct}%)`);
  }

  console.log('\n🎯 Pattern Quality (averages):');
  console.log(`  Pattern Strength:`);
  console.log(`    5-min: ${results5min.avgPatternStrength.toFixed(1)}`);
  console.log(`    1-min: ${results1min.avgPatternStrength.toFixed(1)}`);

  console.log(`  Distance from Intraday High:`);
  console.log(`    5-min: ${results5min.avgDistanceFromHigh.toFixed(2)}%`);
  console.log(`    1-min: ${results1min.avgDistanceFromHigh.toFixed(2)}%`);

  console.log(`  Volume Ratio:`);
  console.log(`    5-min: ${results5min.avgVolumeRatio.toFixed(2)}x`);
  console.log(`    1-min: ${results1min.avgVolumeRatio.toFixed(2)}x`);

  // Breakdown by ticker
  const tickers5min = new Set(results5min.signals.map(s => s.ticker));
  const tickers1min = new Set(results1min.signals.map(s => s.ticker));

  console.log(`\n📊 Ticker Coverage:`);
  console.log(`  5-min: ${tickers5min.size} tickers (${Array.from(tickers5min).join(', ')})`);
  console.log(`  1-min: ${tickers1min.size} tickers (${Array.from(tickers1min).join(', ')})`);

  // Show sample signals
  if (results1min.signals.length > 0) {
    console.log('\n📝 Sample 1-min Signals (first 5):');
    results1min.signals.slice(0, 5).forEach(signal => {
      console.log(`  ${signal.ticker} @ ${signal.date} ${signal.signal_time}: strength ${signal.pattern_strength}, ${signal.metrics.distance_from_high_percent.toFixed(1)}% from high, ${signal.metrics.volume_ratio.toFixed(1)}x volume`);
    });
  }

  if (results5min.signals.length > 0) {
    console.log('\n📝 Sample 5-min Signals (first 5):');
    results5min.signals.slice(0, 5).forEach(signal => {
      console.log(`  ${signal.ticker} @ ${signal.date} ${signal.signal_time}: strength ${signal.pattern_strength}, ${signal.metrics.distance_from_high_percent.toFixed(1)}% from high, ${signal.metrics.volume_ratio.toFixed(1)}x volume`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Comparison Complete');
  console.log('='.repeat(80));
}

async function main() {
  console.log('🚀 Parabolic Exhaustion Pattern - Resolution Comparison\n');
  console.log(`Testing ${SIGNAL_DATES.length} known parabolic move dates\n`);

  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../backtesting.db');
  initializeDatabase(dbPath);

  // Run scans at both resolutions
  const signals5min = await scanExhaustionAtTimeframe('5min');
  const signals1min = await scanExhaustionAtTimeframe('1min');

  // Analyze and compare
  const results5min = analyzeResults('5min', signals5min);
  const results1min = analyzeResults('1min', signals1min);

  printComparison(results5min, results1min);

  // Save detailed results
  const fs = require('fs');
  const resultsPath = path.resolve(__dirname, '../../parabolic-resolution-comparison.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    signalDates: SIGNAL_DATES,
    '5min': {
      signalCount: results5min.signals.length,
      avgPatternStrength: results5min.avgPatternStrength,
      avgDistanceFromHigh: results5min.avgDistanceFromHigh,
      avgVolumeRatio: results5min.avgVolumeRatio,
      signals: signals5min
    },
    '1min': {
      signalCount: results1min.signals.length,
      avgPatternStrength: results1min.avgPatternStrength,
      avgDistanceFromHigh: results1min.avgDistanceFromHigh,
      avgVolumeRatio: results1min.avgVolumeRatio,
      signals: signals1min
    }
  }, null, 2));

  console.log(`\n💾 Detailed results saved to: ${resultsPath}`);

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
