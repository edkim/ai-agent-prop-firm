/**
 * Pattern Resolution Validation Script
 *
 * Compares iteration 22's parabolic exhaustion pattern at 5-min vs 1-min resolution
 * to validate that learned patterns work at higher frequency.
 *
 * Usage: npx ts-node helper-scripts/validate-pattern-resolution.ts
 */

import { initializeDatabase, getDatabase } from '../src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: {
    distance_from_high_percent: number;
    volume_ratio: number;
    rsi_14?: number;
    signal_price: number;
  };
}

interface ComparisonResults {
  timeframe: string;
  signals: ScanMatch[];
  uniqueTickers: Set<string>;
  avgPatternStrength: number;
  avgDistanceFromHigh: number;
  avgVolumeRatio: number;
}

async function runScanAtTimeframe(timeframe: '5min' | '1min'): Promise<ScanMatch[]> {
  const db = getDatabase();
  const results: ScanMatch[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Scanning at ${timeframe} resolution...`);
  console.log(`${'='.repeat(60)}\n`);

  // Get list of tickers that have 1-min data (for fair comparison)
  const tickersWithBothStmt = db.prepare(`
    SELECT DISTINCT ticker
    FROM ohlcv_data
    WHERE timeframe = '1min'
  `);
  const tickersWithBoth = tickersWithBothStmt.all().map((row: any) => row.ticker);
  console.log(`📊 Restricting to ${tickersWithBoth.length} tickers with both 5-min and 1-min data\n`);

  // Step 1: Find parabolic moves (100%+ in ≤5 days) over 30-day period
  const startDate = '2025-10-04';
  const endDate = '2025-11-03';

  const placeholders = tickersWithBoth.map(() => '?').join(',');
  const dailyMetricsStmt = db.prepare(`
    SELECT ticker, date, close, volume
    FROM daily_metrics
    WHERE date BETWEEN ? AND ?
      AND ticker IN (${placeholders})
    ORDER BY ticker, date ASC
  `);
  const allDailyData = dailyMetricsStmt.all(startDate, endDate, ...tickersWithBoth) as any[];

  // Group by ticker
  const byTicker: { [key: string]: any[] } = {};
  for (const row of allDailyData) {
    if (!byTicker[row.ticker]) byTicker[row.ticker] = [];
    byTicker[row.ticker].push(row);
  }

  let parabolicsFound = 0;

  // Find parabolic moves
  for (const [ticker, dailyData] of Object.entries(byTicker)) {
    if (dailyData.length < 5) continue;

    for (let i = 0; i < dailyData.length - 1; i++) {
      const startDay = dailyData[i];
      if (startDay.close < 1) continue; // Minimum $1.00

      // Check gains over next 1-5 days
      for (let lookAhead = 1; lookAhead <= 5 && i + lookAhead < dailyData.length; lookAhead++) {
        const endDay = dailyData[i + lookAhead];
        const gainPercent = ((endDay.close - startDay.close) / startDay.close) * 100;

        if (gainPercent >= 100) {
          parabolicsFound++;

          // Step 2: Find exhaustion signals in intraday data
          const intradayStmt = db.prepare(`
            SELECT ticker, timestamp, open, high, low, close, volume, time_of_day
            FROM ohlcv_data
            WHERE ticker = ?
              AND timeframe = ?
              AND date(timestamp/1000, 'unixepoch') = ?
            ORDER BY timestamp ASC
          `);

          const intradayBars = intradayStmt.all(ticker, timeframe, endDay.date) as any[];

          if (intradayBars.length === 0) continue;

          // Calculate average volume for the day
          const avgVolume = intradayBars.reduce((sum, bar) => sum + bar.volume, 0) / intradayBars.length;

          // Find potential exhaustion points
          const dayHigh = Math.max(...intradayBars.map(b => b.high));

          for (let barIdx = 30; barIdx < intradayBars.length - 10; barIdx++) {
            const bar = intradayBars[barIdx];

            // Calculate RSI-14 (simplified - use close prices)
            const closes = intradayBars.slice(Math.max(0, barIdx - 14), barIdx + 1).map(b => b.close);
            const rsi = calculateRSI(closes, 14);

            // Exhaustion criteria
            const distanceFromHigh = ((dayHigh - bar.close) / dayHigh) * 100;
            const volumeRatio = bar.volume / avgVolume;

            // Pattern: 5%+ pullback from high, elevated volume, RSI suggesting reversal
            if (distanceFromHigh >= 5 && distanceFromHigh <= 25 && volumeRatio >= 1.5) {
              results.push({
                ticker,
                signal_date: endDay.date,
                signal_time: bar.time_of_day,
                pattern_strength: Math.min(100, distanceFromHigh * 2 + volumeRatio * 10 + (rsi ? (100 - rsi) / 2 : 0)),
                metrics: {
                  distance_from_high_percent: distanceFromHigh,
                  volume_ratio: volumeRatio,
                  rsi_14: rsi,
                  signal_price: bar.close
                }
              });
            }
          }

          break; // Found parabolic move for this start day
        }
      }
    }
  }

  console.log(`📊 Found ${parabolicsFound} parabolic moves`);
  console.log(`🎯 Found ${results.length} exhaustion signals at ${timeframe}`);

  return results;
}

function calculateRSI(closes: number[], period: number): number | undefined {
  if (closes.length < period + 1) return undefined;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function analyzeResults(timeframe: string, signals: ScanMatch[]): ComparisonResults {
  const uniqueTickers = new Set(signals.map(s => s.ticker));

  const avgPatternStrength = signals.reduce((sum, s) => sum + s.pattern_strength, 0) / signals.length || 0;
  const avgDistanceFromHigh = signals.reduce((sum, s) => sum + s.metrics.distance_from_high_percent, 0) / signals.length || 0;
  const avgVolumeRatio = signals.reduce((sum, s) => sum + s.metrics.volume_ratio, 0) / signals.length || 0;

  return {
    timeframe,
    signals,
    uniqueTickers,
    avgPatternStrength,
    avgDistanceFromHigh,
    avgVolumeRatio
  };
}

function printComparison(results5min: ComparisonResults, results1min: ComparisonResults) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PATTERN RESOLUTION VALIDATION RESULTS');
  console.log('='.repeat(80));

  console.log('\n📈 Signal Counts:');
  console.log(`  5-min resolution:  ${results5min.signals.length} signals across ${results5min.uniqueTickers.size} tickers`);
  console.log(`  1-min resolution:  ${results1min.signals.length} signals across ${results1min.uniqueTickers.size} tickers`);
  console.log(`  Difference:        ${results1min.signals.length - results5min.signals.length} signals (${((results1min.signals.length / results5min.signals.length - 1) * 100).toFixed(1)}%)`);

  console.log('\n🎯 Pattern Quality (averages):');
  console.log(`  Pattern Strength:`);
  console.log(`    5-min: ${results5min.avgPatternStrength.toFixed(1)}`);
  console.log(`    1-min: ${results1min.avgPatternStrength.toFixed(1)}`);

  console.log(`  Distance from High:`);
  console.log(`    5-min: ${results5min.avgDistanceFromHigh.toFixed(2)}%`);
  console.log(`    1-min: ${results1min.avgDistanceFromHigh.toFixed(2)}%`);

  console.log(`  Volume Ratio:`);
  console.log(`    5-min: ${results5min.avgVolumeRatio.toFixed(2)}x`);
    console.log(`    1-min: ${results1min.avgVolumeRatio.toFixed(2)}x`);

  // Find overlapping tickers
  const overlap = [...results5min.uniqueTickers].filter(t => results1min.uniqueTickers.has(t));
  console.log(`\n🔄 Ticker Overlap: ${overlap.length} tickers found in both (${(overlap.length / results5min.uniqueTickers.size * 100).toFixed(1)}% of 5-min signals)`);

  // Show sample signals
  console.log('\n📝 Sample 1-min Signals (first 5):');
  results1min.signals.slice(0, 5).forEach(signal => {
    console.log(`  ${signal.ticker} @ ${signal.signal_date} ${signal.signal_time}: ${signal.pattern_strength.toFixed(1)} strength, ${signal.metrics.distance_from_high_percent.toFixed(1)}% from high, ${signal.metrics.volume_ratio.toFixed(1)}x volume`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ Validation Complete');
  console.log('='.repeat(80));
}

async function main() {
  console.log('🚀 Pattern Resolution Validation\n');
  console.log('Testing iteration 22 parabolic exhaustion pattern at 5-min vs 1-min resolution\n');

  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../backtesting.db');
  initializeDatabase(dbPath);

  // Run scans at both resolutions
  const signals5min = await runScanAtTimeframe('5min');
  const signals1min = await runScanAtTimeframe('1min');

  // Analyze and compare
  const results5min = analyzeResults('5min', signals5min);
  const results1min = analyzeResults('1min', signals1min);

  printComparison(results5min, results1min);

  // Save detailed results
  const fs = require('fs');
  const resultsPath = path.resolve(__dirname, '../../pattern-validation-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    '5min': {
      signalCount: results5min.signals.length,
      uniqueTickers: Array.from(results5min.uniqueTickers),
      avgPatternStrength: results5min.avgPatternStrength,
      avgDistanceFromHigh: results5min.avgDistanceFromHigh,
      avgVolumeRatio: results5min.avgVolumeRatio,
      signals: signals5min
    },
    '1min': {
      signalCount: results1min.signals.length,
      uniqueTickers: Array.from(results1min.uniqueTickers),
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
