import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;  // Trading date (YYYY-MM-DD)
  signal_time: string;  // Time of detection (HH:MM)
  pattern_strength: number; // 0-100
  metrics: {
    vwap: number;
    price: number;
    distance_from_vwap_percent: number;
    volume_spike_multiplier: number;
    rejection_confirmation_bars: number;
    session_trend: string;
    mean_reversion_quality: number;
  };
}

interface BarWithVWAP {
  timestamp: number;
  date: string;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
}

/**
 * Calculate running VWAP for intraday bars
 */
function calculateVWAPForBars(bars: any[]): BarWithVWAP[] {
  const barsWithVWAP: BarWithVWAP[] = [];
  let cumVol = 0;
  let cumVolPrice = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumVolPrice += typicalPrice * bar.volume;
    cumVol += bar.volume;

    barsWithVWAP.push({
      timestamp: bar.timestamp,
      date: bar.date,
      time_of_day: bar.time_of_day,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
    });
  }

  return barsWithVWAP;
}

/**
 * Detect VWAP mean reversion pattern with volume confirmation
 */
function detectMeanReversionPattern(
  bars: BarWithVWAP[],
  currentIndex: number
): { detected: boolean; strength: number; metrics: any } | null {
  
  if (currentIndex < 20) return null;

  const current = bars[currentIndex];
  const lookbackBars = bars.slice(currentIndex - 20, currentIndex);
  
  // Filter for mid-session only (10:00-14:00)
  const timeHour = parseInt(current.time_of_day.split(':')[0]);
  const timeMinute = parseInt(current.time_of_day.split(':')[1]);
  const timeInMinutes = timeHour * 60 + timeMinute;
  
  if (timeInMinutes < 10 * 60 || timeInMinutes > 14 * 60) {
    return null; // Outside mid-session window
  }

  // 1. Calculate distance from VWAP
  const distanceFromVWAP = ((current.close - current.vwap) / current.vwap) * 100;
  const absDistance = Math.abs(distanceFromVWAP);

  // Mean reversion setup: price should be extended from VWAP (1.5% - 4%)
  if (absDistance < 1.5 || absDistance > 4.0) {
    return null;
  }

  // 2. Determine mean reversion direction
  const isOverextendedAbove = distanceFromVWAP > 0; // Price above VWAP, expect reversion down
  const isOverextendedBelow = distanceFromVWAP < 0; // Price below VWAP, expect reversion up

  // 3. Check for rejection/reversal confirmation
  let rejectionBars = 0;
  const recentBars = bars.slice(currentIndex - 3, currentIndex + 1);
  
  for (const bar of recentBars) {
    if (isOverextendedAbove) {
      // Look for bearish rejection (close < open, or upper wick)
      const upperWick = bar.high - Math.max(bar.open, bar.close);
      const bodySize = Math.abs(bar.close - bar.open);
      if (bar.close < bar.open || upperWick > bodySize * 1.5) {
        rejectionBars++;
      }
    } else if (isOverextendedBelow) {
      // Look for bullish rejection (close > open, or lower wick)
      const lowerWick = Math.min(bar.open, bar.close) - bar.low;
      const bodySize = Math.abs(bar.close - bar.open);
      if (bar.close > bar.open || lowerWick > bodySize * 1.5) {
        rejectionBars++;
      }
    }
  }

  if (rejectionBars < 2) {
    return null; // Need at least 2 rejection bars
  }

  // 4. Volume confirmation - current bar should have volume spike
  const avgVolume = lookbackBars.reduce((sum, b) => sum + b.volume, 0) / lookbackBars.length;
  const volumeSpikeMultiplier = current.volume / avgVolume;

  if (volumeSpikeMultiplier < 1.3) {
    return null; // Need at least 30% volume increase
  }

  // 5. Session trend analysis (last 10 bars)
  const sessionBars = bars.slice(currentIndex - 10, currentIndex);
  const sessionTrendUp = sessionBars.filter(b => b.close > b.open).length;
  const sessionTrendDown = sessionBars.filter(b => b.close < b.open).length;
  
  let sessionTrend = 'neutral';
  if (sessionTrendUp > 7) sessionTrend = 'bullish';
  else if (sessionTrendDown > 7) sessionTrend = 'bearish';

  // Mean reversion works best against the trend
  let trendAlignment = 0;
  if (isOverextendedAbove && sessionTrend === 'bullish') trendAlignment = 1; // Fade bullish trend
  if (isOverextendedBelow && sessionTrend === 'bearish') trendAlignment = 1; // Fade bearish trend

  // 6. Calculate pattern strength (0-100)
  let strength = 50; // Base score

  // Distance quality (optimal 2-3%)
  if (absDistance >= 2.0 && absDistance <= 3.0) strength += 15;
  else if (absDistance >= 1.5 && absDistance <= 4.0) strength += 8;

  // Volume spike quality
  if (volumeSpikeMultiplier >= 2.0) strength += 20;
  else if (volumeSpikeMultiplier >= 1.5) strength += 12;
  else if (volumeSpikeMultiplier >= 1.3) strength += 6;

  // Rejection confirmation quality
  if (rejectionBars >= 3) strength += 15;
  else if (rejectionBars >= 2) strength += 8;

  // Trend alignment bonus
  if (trendAlignment === 1) strength += 10;

  // Mean reversion quality score
  const meanReversionQuality = (rejectionBars / 4) * 100; // Max 4 bars checked

  return {
    detected: true,
    strength: Math.min(100, strength),
    metrics: {
      vwap: current.vwap,
      price: current.close,
      distance_from_vwap_percent: distanceFromVWAP,
      volume_spike_multiplier: volumeSpikeMultiplier,
      rejection_confirmation_bars: rejectionBars,
      session_trend: sessionTrend,
      mean_reversion_quality: meanReversionQuality
    }
  };
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  // Get list of tech sector tickers with intraday data
  const tickersStmt = db.prepare(`
    SELECT DISTINCT ticker FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
    ORDER BY ticker
  `);
  const tickers = tickersStmt.all('2025-10-11', '2025-10-30') as any[];

  console.error(`🔍 Scanning ${tickers.length} tickers for VWAP mean reversion patterns...`);
  console.error(`📅 Date range: 2025-10-11 to 2025-10-30`);
  console.error(`⏰ Session filter: 10:00-14:00 (mid-session)`);

  let processedTickers = 0;

  // Scan each ticker
  for (const { ticker } of tickers) {
    processedTickers++;
    if (processedTickers % 10 === 0) {
      console.error(`📊 Progress: ${processedTickers}/${tickers.length} tickers processed...`);
    }

    // Get 5-minute bars for the date range
    const barsStmt = db.prepare(`
      SELECT timestamp, open, high, low, close, volume, time_of_day,
             date(timestamp/1000, 'unixepoch') as date
      FROM ohlcv_data
      WHERE ticker = ?
        AND timeframe = '5min'
        AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    const allBars = barsStmt.all(ticker, '2025-10-11', '2025-10-30') as any[];

    if (allBars.length < 30) continue;

    // Group bars by day (VWAP resets each day)
    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each trading day
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      if (dayBars.length < 20) continue;

      // Calculate VWAP for each bar (cumulative from market open)
      const barsWithVWAP = calculateVWAPForBars(dayBars);

      // Detect mean reversion patterns
      for (let i = 20; i < barsWithVWAP.length; i++) {
        const pattern = detectMeanReversionPattern(barsWithVWAP, i);

        if (pattern && pattern.detected) {
          results.push({
            ticker,
            signal_date: date,
            signal_time: barsWithVWAP[i].time_of_day,
            pattern_strength: pattern.strength,
            metrics: pattern.metrics
          });
        }
      }
    }
  }

  return results;
}

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  // IMPORTANT: Output ONLY the JSON to stdout (no other messages)
  // Progress messages can go to stderr: console.error()
  console.error(`\n✅ Scan complete! Found ${results.length} VWAP mean reversion patterns`);
  console.error(`📊 Outputting top ${topResults.length} patterns (sorted by strength)`);
  console.error(`🎯 Pattern criteria:`);
  console.error(`   - Distance from VWAP: 1.5% - 4.0%`);
  console.error(`   - Volume spike: >1.3x average`);
  console.error(`   - Rejection bars: ≥2`);
  console.error(`   - Session window: 10:00-14:00`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(err => {
  console.error('❌ Error running scan:', err);
  process.exit(1);
});