/**
 * VWAP Mean Reversion Pattern Resolution Validation
 *
 * Compares VWAP mean reversion pattern at 5-min vs 1-min resolution
 * to validate that learned patterns work at higher frequency.
 *
 * Usage: npx ts-node helper-scripts/validate-vwap-resolution.ts
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
    price: number;
    vwap: number;
    deviation_percent: number;
    volume_ratio: number;
    rejection_type: string;
    wick_ratio: number;
  };
}

interface Bar {
  timestamp: number;
  date: string;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

interface ComparisonResults {
  timeframe: string;
  signals: ScanMatch[];
  uniqueTickers: Set<string>;
  avgPatternStrength: number;
  avgDeviation: number;
  avgVolumeRatio: number;
  bullishCount: number;
  bearishCount: number;
}

function calculateVWAP(bars: Bar[]): Bar[] {
  const barsWithVWAP: Bar[] = [];
  let cumVol = 0;
  let cumVolPrice = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumVolPrice += typicalPrice * bar.volume;
    cumVol += bar.volume;

    barsWithVWAP.push({
      ...bar,
      vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
    });
  }

  return barsWithVWAP;
}

function isRejectionCandle(bar: Bar, direction: 'bullish' | 'bearish'): { isRejection: boolean; wickRatio: number } {
  const bodySize = Math.abs(bar.close - bar.open);
  const totalRange = bar.high - bar.low;

  if (totalRange === 0) return { isRejection: false, wickRatio: 0 };

  if (direction === 'bullish') {
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const wickRatio = lowerWick / totalRange;

    const isRejection = wickRatio > 0.5 && (upperWick / totalRange) < 0.25 && bar.close > bar.open;
    return { isRejection, wickRatio };
  } else {
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const wickRatio = upperWick / totalRange;

    const isRejection = wickRatio > 0.5 && (lowerWick / totalRange) < 0.25 && bar.close < bar.open;
    return { isRejection, wickRatio };
  }
}

function isInTradingWindow(timeOfDay: string): boolean {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;

  const startTime = 10 * 60; // 10:00
  const endTime = 14 * 60;   // 14:00

  return timeInMinutes >= startTime && timeInMinutes <= endTime;
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

  const startDate = '2025-10-14';
  const endDate = '2025-11-02';

  let processedCount = 0;

  // Scan each ticker
  for (const ticker of tickersWithBoth) {
    processedCount++;
    if (processedCount % 10 === 0) {
      console.log(`Progress: ${processedCount}/${tickersWithBoth.length} tickers...`);
    }

    // Get bars for the date range
    const barsStmt = db.prepare(`
      SELECT
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        time_of_day,
        date(timestamp/1000, 'unixepoch') as date
      FROM ohlcv_data
      WHERE ticker = ?
        AND timeframe = ?
        AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    const allBars = barsStmt.all(ticker, timeframe, startDate, endDate) as Bar[];

    if (allBars.length < 50) continue;

    // Check price range ($10-$100)
    const recentPrice = allBars[allBars.length - 1]?.close;
    if (!recentPrice || recentPrice < 10 || recentPrice > 100) continue;

    // Group bars by day
    const barsByDay: { [date: string]: Bar[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each day for VWAP mean reversion patterns
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      if (dayBars.length < 20) continue;

      // Calculate VWAP for each bar
      const barsWithVWAP = calculateVWAP(dayBars);

      // Detect mean reversion patterns
      for (let i = 10; i < barsWithVWAP.length; i++) {
        const current = barsWithVWAP[i];

        // Filter: Only trade during mid-day session (10:00-14:00)
        if (!isInTradingWindow(current.time_of_day)) continue;

        const previous10Bars = barsWithVWAP.slice(i - 10, i);

        // Calculate deviation from VWAP
        const deviation = ((current.close - current.vwap!) / current.vwap!) * 100;
        const absDeviation = Math.abs(deviation);

        // Filter: Deviation must be 1.5-4% from VWAP
        if (absDeviation < 1.5 || absDeviation > 4.0) continue;

        // Calculate average volume from previous 10 bars
        const avgVolume = previous10Bars.reduce((sum, b) => sum + b.volume, 0) / previous10Bars.length;
        const volumeRatio = current.volume / avgVolume;

        // Filter: Volume confirmation (1.3x+ average)
        if (volumeRatio < 1.3) continue;

        // Determine direction and check for rejection candle
        let rejectionType = '';
        let wickRatio = 0;
        let isValidPattern = false;

        if (deviation < -1.5) {
          // Price below VWAP - look for bullish rejection
          const { isRejection, wickRatio: ratio } = isRejectionCandle(current, 'bullish');
          if (isRejection) {
            rejectionType = 'bullish_rejection';
            wickRatio = ratio;
            isValidPattern = true;
          }
        } else if (deviation > 1.5) {
          // Price above VWAP - look for bearish rejection
          const { isRejection, wickRatio: ratio } = isRejectionCandle(current, 'bearish');
          if (isRejection) {
            rejectionType = 'bearish_rejection';
            wickRatio = ratio;
            isValidPattern = true;
          }
        }

        if (!isValidPattern) continue;

        // Calculate pattern strength
        let strength = 50;

        const idealDeviation = 2.5;
        const deviationScore = Math.max(0, 25 - Math.abs(absDeviation - idealDeviation) * 5);
        strength += deviationScore;

        const volumeScore = Math.min(15, (volumeRatio - 1.3) * 10);
        strength += volumeScore;

        const rejectionScore = Math.min(10, wickRatio * 15);
        strength += rejectionScore;

        strength = Math.min(100, strength);

        results.push({
          ticker,
          signal_date: date,
          signal_time: current.time_of_day,
          pattern_strength: Math.round(strength),
          metrics: {
            price: current.close,
            vwap: current.vwap!,
            deviation_percent: parseFloat(deviation.toFixed(2)),
            volume_ratio: parseFloat(volumeRatio.toFixed(2)),
            rejection_type: rejectionType,
            wick_ratio: parseFloat(wickRatio.toFixed(2))
          }
        });
      }
    }
  }

  console.log(`✅ Found ${results.length} VWAP mean reversion patterns at ${timeframe}`);
  return results;
}

function analyzeResults(timeframe: string, signals: ScanMatch[]): ComparisonResults {
  const uniqueTickers = new Set(signals.map(s => s.ticker));

  const avgPatternStrength = signals.reduce((sum, s) => sum + s.pattern_strength, 0) / signals.length || 0;
  const avgDeviation = signals.reduce((sum, s) => sum + Math.abs(s.metrics.deviation_percent), 0) / signals.length || 0;
  const avgVolumeRatio = signals.reduce((sum, s) => sum + s.metrics.volume_ratio, 0) / signals.length || 0;

  const bullishCount = signals.filter(s => s.metrics.rejection_type === 'bullish_rejection').length;
  const bearishCount = signals.filter(s => s.metrics.rejection_type === 'bearish_rejection').length;

  return {
    timeframe,
    signals,
    uniqueTickers,
    avgPatternStrength,
    avgDeviation,
    avgVolumeRatio,
    bullishCount,
    bearishCount
  };
}

function printComparison(results5min: ComparisonResults, results1min: ComparisonResults) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 VWAP PATTERN RESOLUTION VALIDATION RESULTS');
  console.log('='.repeat(80));

  console.log('\n📈 Signal Counts:');
  console.log(`  5-min resolution:  ${results5min.signals.length} signals across ${results5min.uniqueTickers.size} tickers`);
  console.log(`  1-min resolution:  ${results1min.signals.length} signals across ${results1min.uniqueTickers.size} tickers`);

  if (results5min.signals.length > 0) {
    const diff = results1min.signals.length - results5min.signals.length;
    const pct = ((results1min.signals.length / results5min.signals.length - 1) * 100).toFixed(1);
    console.log(`  Difference:        ${diff > 0 ? '+' : ''}${diff} signals (${pct}%)`);
  }

  console.log('\n🎯 Pattern Quality (averages):');
  console.log(`  Pattern Strength:`);
  console.log(`    5-min: ${results5min.avgPatternStrength.toFixed(1)}`);
  console.log(`    1-min: ${results1min.avgPatternStrength.toFixed(1)}`);

  console.log(`  Deviation from VWAP:`);
  console.log(`    5-min: ${results5min.avgDeviation.toFixed(2)}%`);
  console.log(`    1-min: ${results1min.avgDeviation.toFixed(2)}%`);

  console.log(`  Volume Ratio:`);
  console.log(`    5-min: ${results5min.avgVolumeRatio.toFixed(2)}x`);
  console.log(`    1-min: ${results1min.avgVolumeRatio.toFixed(2)}x`);

  console.log('\n📊 Pattern Distribution:');
  console.log(`  5-min: Bullish ${results5min.bullishCount}, Bearish ${results5min.bearishCount}`);
  console.log(`  1-min: Bullish ${results1min.bullishCount}, Bearish ${results1min.bearishCount}`);

  // Find overlapping tickers
  const overlap = [...results5min.uniqueTickers].filter(t => results1min.uniqueTickers.has(t));
  console.log(`\n🔄 Ticker Overlap: ${overlap.length} tickers found in both (${(overlap.length / results5min.uniqueTickers.size * 100).toFixed(1)}% of 5-min signals)`);

  // Show sample signals
  if (results1min.signals.length > 0) {
    console.log('\n📝 Sample 1-min Signals (first 5):');
    results1min.signals.slice(0, 5).forEach(signal => {
      console.log(`  ${signal.ticker} @ ${signal.signal_date} ${signal.signal_time}: ${signal.pattern_strength} strength, ${signal.metrics.deviation_percent.toFixed(1)}% deviation, ${signal.metrics.volume_ratio.toFixed(1)}x volume, ${signal.metrics.rejection_type}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Validation Complete');
  console.log('='.repeat(80));
}

async function main() {
  console.log('🚀 VWAP Mean Reversion Pattern Resolution Validation\n');
  console.log('Testing VWAP pattern at 5-min vs 1-min resolution\n');

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
  const resultsPath = path.resolve(__dirname, '../../vwap-validation-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    '5min': {
      signalCount: results5min.signals.length,
      uniqueTickers: Array.from(results5min.uniqueTickers),
      avgPatternStrength: results5min.avgPatternStrength,
      avgDeviation: results5min.avgDeviation,
      avgVolumeRatio: results5min.avgVolumeRatio,
      bullishCount: results5min.bullishCount,
      bearishCount: results5min.bearishCount,
      signals: signals5min
    },
    '1min': {
      signalCount: results1min.signals.length,
      uniqueTickers: Array.from(results1min.uniqueTickers),
      avgPatternStrength: results1min.avgPatternStrength,
      avgDeviation: results1min.avgDeviation,
      avgVolumeRatio: results1min.avgVolumeRatio,
      bullishCount: results1min.bullishCount,
      bearishCount: results1min.bearishCount,
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
