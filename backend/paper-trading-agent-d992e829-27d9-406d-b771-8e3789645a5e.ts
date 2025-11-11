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
    price: number;
    vwap: number;
    deviation_percent: number;
    volume_ratio: number;
    rejection_type: string;
    wick_ratio: number;
    reversal_strength: number;
  };
}

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time_of_day: string;
  date: string;
  vwap?: number;
}

/**
 * Calculate VWAP for intraday bars (cumulative from market open)
 */
function calculateVWAP(bars: Bar[]): Bar[] {
  const barsWithVWAP: Bar[] = [];
  let cumVolume = 0;
  let cumVolumePrice = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumVolumePrice += typicalPrice * bar.volume;
    cumVolume += bar.volume;

    barsWithVWAP.push({
      ...bar,
      vwap: cumVolume === 0 ? 0 : cumVolumePrice / cumVolume
    });
  }

  return barsWithVWAP;
}

/**
 * Detect rejection candle patterns (wicks, reversals)
 */
function detectRejection(bar: Bar, vwap: number): { 
  hasRejection: boolean; 
  type: string; 
  wickRatio: number;
  reversalStrength: number;
} {
  const bodySize = Math.abs(bar.close - bar.open);
  const totalRange = bar.high - bar.low;
  
  if (totalRange === 0) {
    return { hasRejection: false, type: 'none', wickRatio: 0, reversalStrength: 0 };
  }

  // For bearish deviation (price below VWAP), look for bullish rejection
  if (bar.close < vwap) {
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const wickRatio = lowerWick / totalRange;
    
    // Bullish rejection: long lower wick (>40% of range) + close near high
    const closePosition = (bar.close - bar.low) / totalRange;
    const isBullishReversal = bar.close > bar.open;
    
    if (wickRatio > 0.4 && closePosition > 0.6) {
      const reversalStrength = (wickRatio * 0.6) + (closePosition * 0.4);
      return { 
        hasRejection: true, 
        type: 'bullish_hammer', 
        wickRatio,
        reversalStrength: reversalStrength * 100
      };
    }
    
    if (isBullishReversal && bodySize / totalRange > 0.5) {
      return { 
        hasRejection: true, 
        type: 'bullish_engulfing', 
        wickRatio,
        reversalStrength: (bodySize / totalRange) * 100
      };
    }
  }
  
  // For bullish deviation (price above VWAP), look for bearish rejection
  if (bar.close > vwap) {
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const wickRatio = upperWick / totalRange;
    
    // Bearish rejection: long upper wick (>40% of range) + close near low
    const closePosition = (bar.high - bar.close) / totalRange;
    const isBearishReversal = bar.close < bar.open;
    
    if (wickRatio > 0.4 && closePosition > 0.6) {
      const reversalStrength = (wickRatio * 0.6) + (closePosition * 0.4);
      return { 
        hasRejection: true, 
        type: 'bearish_shooting_star', 
        wickRatio,
        reversalStrength: reversalStrength * 100
      };
    }
    
    if (isBearishReversal && bodySize / totalRange > 0.5) {
      return { 
        hasRejection: true, 
        type: 'bearish_engulfing', 
        wickRatio,
        reversalStrength: (bodySize / totalRange) * 100
      };
    }
  }

  return { hasRejection: false, type: 'none', wickRatio: 0, reversalStrength: 0 };
}

/**
 * Check if time is within mid-day session (10:00-14:00 ET)
 */
function isMidDaySession(timeOfDay: string): boolean {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;
  
  // 10:00 = 600 minutes, 14:00 = 840 minutes
  return timeInMinutes >= 600 && timeInMinutes <= 840;
}

/**
 * Calculate pattern strength score (0-100)
 */
function calculatePatternStrength(
  deviationPercent: number,
  volumeRatio: number,
  rejectionStrength: number,
  wickRatio: number
): number {
  // Deviation score (30 points): optimal 1.5-4%, penalize outside range
  let deviationScore = 0;
  const absDeviation = Math.abs(deviationPercent);
  if (absDeviation >= 1.5 && absDeviation <= 4.0) {
    deviationScore = 30;
  } else if (absDeviation > 4.0) {
    deviationScore = Math.max(0, 30 - (absDeviation - 4.0) * 5);
  } else {
    deviationScore = (absDeviation / 1.5) * 30;
  }

  // Volume score (25 points): 1.3x+ is ideal, scale up to 2.5x
  let volumeScore = 0;
  if (volumeRatio >= 1.3) {
    volumeScore = Math.min(25, 15 + ((volumeRatio - 1.3) / 1.2) * 10);
  } else {
    volumeScore = (volumeRatio / 1.3) * 15;
  }

  // Rejection score (30 points): based on reversal strength
  const rejectionScore = Math.min(30, rejectionStrength * 0.3);

  // Wick score (15 points): strong wicks indicate conviction
  const wickScore = Math.min(15, wickRatio * 37.5);

  return Math.round(deviationScore + volumeScore + rejectionScore + wickScore);
}


// Helper: Calculate time of day from timestamp
function getTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toTimeString().split(' ')[0]; // HH:MM:SS
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  // Get tech sector tickers with intraday data in the date range
  const tickersStmt = db.prepare(`
    SELECT DISTINCT o.ticker
    FROM ohlcv_data o
    WHERE o.timeframe = '5min'
      AND date(o.timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      AND EXISTS (
        SELECT 1 FROM daily_metrics d
        WHERE d.ticker = o.ticker
          AND d.close BETWEEN 10 AND 100
          AND d.date BETWEEN ? AND ?
      )
    ORDER BY o.ticker
  `);
  
  const tickers = tickersStmt.all('2025-10-17', '2025-11-05', '2025-10-17', '2025-11-05') as any[];

  console.error(`\n🔍 Scanning ${tickers.length} tech stocks for VWAP mean reversion patterns...`);
  console.error(`📅 Date range: 2025-10-17 to 2025-11-05`);
  console.error(`⏰ Time window: 10:00-14:00 ET (mid-day session)`);
  console.error(`📊 Criteria: 1.5-4% VWAP deviation, 1.3x+ volume, rejection candles\n`);

  let processedTickers = 0;
  let totalPatterns = 0;

  // Scan each ticker
  for (const { ticker } of tickers) {
    processedTickers++;
    
    if (processedTickers % 10 === 0) {
      console.error(`Progress: ${processedTickers}/${tickers.length} tickers (${totalPatterns} patterns found)`);
    }

    // Get 5-minute bars for the ticker
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
        AND timeframe = '5min'
        AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    
    const allBars = barsStmt.all(ticker, '2025-10-17', '2025-11-05') as Bar[];

    if (allBars.length < 20) continue;

    // Group bars by trading day
    const barsByDay: { [date: string]: Bar[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each trading day
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      if (dayBars.length < 20) continue;

      // Calculate VWAP for the day
      const barsWithVWAP = calculateVWAP(dayBars);

      // Need at least 20 bars to calculate average volume
      if (barsWithVWAP.length < 20) continue;

      // Scan for mean reversion setups
      for (let i = 20; i < barsWithVWAP.length; i++) {
        const current = barsWithVWAP[i];
        
        // Filter: Only mid-day session (10:00-14:00 ET)
        if (!isMidDaySession(current.time_of_day)) continue;

        // Calculate deviation from VWAP
        const deviationPercent = ((current.close - current.vwap!) / current.vwap!) * 100;
        const absDeviation = Math.abs(deviationPercent);

        // Filter: Deviation must be 1.5-4%
        if (absDeviation < 1.5 || absDeviation > 4.0) continue;

        // Calculate average volume from previous 20 bars
        const recentBars = barsWithVWAP.slice(i - 20, i);
        const avgVolume = recentBars.reduce((sum, b) => sum + b.volume, 0) / 20;
        const volumeRatio = current.volume / avgVolume;

        // Filter: Volume must be 1.3x+ average
        if (volumeRatio < 1.3) continue;

        // Detect rejection candle
        const rejection = detectRejection(current, current.vwap!);
        
        // Filter: Must have rejection pattern
        if (!rejection.hasRejection) continue;

        // Calculate pattern strength
        const patternStrength = calculatePatternStrength(
          deviationPercent,
          volumeRatio,
          rejection.reversalStrength,
          rejection.wickRatio
        );

        // Only include patterns with strength >= 50
        if (patternStrength < 50) continue;

        totalPatterns++;

        results.push({
          ticker,
          signal_date: date,
          signal_time: current.time_of_day,
          pattern_strength: patternStrength,
          metrics: {
            price: current.close,
            vwap: current.vwap!,
            deviation_percent: deviationPercent,
            volume_ratio: volumeRatio,
            rejection_type: rejection.type,
            wick_ratio: rejection.wickRatio,
            reversal_strength: rejection.reversalStrength
          }
        });
      }
    }
  }

  console.error(`\n✅ Scan complete! Processed ${processedTickers} tickers`);
  console.error(`📈 Found ${totalPatterns} total pattern matches`);

  return results;
}

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  console.error(`📊 Outputting top ${topResults.length} patterns (sorted by strength)\n`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(err => {
  console.error('❌ Error running scan:', err);
  process.exit(1);
});