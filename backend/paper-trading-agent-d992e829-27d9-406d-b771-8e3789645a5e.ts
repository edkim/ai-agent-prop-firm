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
    wick_ratio: number;
    rejection_type: 'bullish' | 'bearish';
    candle_body_percent: number;
  };
}

// Tech sector tickers (liquid stocks)
const TECH_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
  'AVGO', 'ORCL', 'ADBE', 'CRM', 'CSCO', 'ACN', 'AMD', 'INTC',
  'QCOM', 'TXN', 'INTU', 'AMAT', 'MU', 'ADI', 'LRCX', 'KLAC',
  'SNPS', 'CDNS', 'MCHP', 'FTNT', 'PANW', 'WDAY', 'DDOG', 'SNOW',
  'CRWD', 'ZS', 'NET', 'TEAM', 'HUBS', 'OKTA', 'DOCU', 'ZM',
  'TWLO', 'SHOP', 'SQ', 'PYPL', 'COIN', 'RBLX', 'U', 'DASH'
];


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

  const startDate = '2025-11-06';
  const endDate = '2025-11-06';

  console.error(`🔍 Scanning VWAP mean reversion patterns...`);
  console.error(`📅 Date range: ${startDate} to ${endDate}`);
  console.error(`🎯 Time window: 10:00-14:00 ET (mid-day session)`);
  console.error(`📊 Deviation range: 1.5-4% from VWAP`);
  console.error(`📈 Volume filter: 1.3x+ average`);
  console.error(`💰 Price range: $10-$100`);

  let tickersScanned = 0;
  let patternsFound = 0;

  // Scan each tech ticker
  for (const ticker of TECH_TICKERS) {
    tickersScanned++;
    if (tickersScanned % 10 === 0) {
      console.error(`Progress: ${tickersScanned}/${TECH_TICKERS.length} tickers scanned, ${patternsFound} patterns found`);
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
    const allBars = barsStmt.all(ticker, startDate, endDate) as any[];

    if (allBars.length < 50) continue;

    // Group bars by day
    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each trading day
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      if (dayBars.length < 20) continue;

      // Calculate running VWAP for each bar
      const barsWithVWAP = [];
      let cumVol = 0, cumVolPrice = 0;

      for (const bar of dayBars) {
        const typical = (bar.high + bar.low + bar.close) / 3;
        cumVolPrice += typical * bar.volume;
        cumVol += bar.volume;
        barsWithVWAP.push({
          ...bar,
          vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
        });
      }

      // Filter for mid-day session (10:00-14:00 ET)
      const midDayBars = barsWithVWAP.filter(bar => {
        const time = bar.time_of_day;
        return time >= '10:00' && time <= '14:00';
      });

      if (midDayBars.length < 10) continue;

      // Calculate average volume for the day (for volume confirmation)
      const avgVolume = dayBars.reduce((sum, b) => sum + b.volume, 0) / dayBars.length;

      // Detect VWAP mean reversion patterns
      for (let i = 5; i < midDayBars.length; i++) {
        const current = midDayBars[i];
        const previous = midDayBars.slice(Math.max(0, i - 10), i);

        // Price filter: $10-$100 range
        if (current.close < 10 || current.close > 100) continue;

        // Calculate deviation from VWAP
        const deviationPercent = Math.abs((current.close - current.vwap) / current.vwap) * 100;

        // Check if deviation is in target range (1.5-4%)
        if (deviationPercent < 1.5 || deviationPercent > 4.0) continue;

        // Volume confirmation: 1.3x+ average
        const volumeRatio = current.volume / avgVolume;
        if (volumeRatio < 1.3) continue;

        // Detect rejection candle (wick analysis)
        const bodySize = Math.abs(current.close - current.open);
        const totalRange = current.high - current.low;
        const upperWick = current.high - Math.max(current.open, current.close);
        const lowerWick = Math.min(current.open, current.close) - current.low;

        if (totalRange === 0) continue;

        const wickRatio = Math.max(upperWick, lowerWick) / totalRange;
        const bodyPercent = (bodySize / totalRange) * 100;

        // Rejection candle criteria:
        // - Significant wick (>40% of total range)
        // - Small body (<50% of total range)
        if (wickRatio < 0.4 || bodyPercent > 50) continue;

        // Determine rejection type
        let rejectionType: 'bullish' | 'bearish';
        let isValidRejection = false;

        if (current.close < current.vwap) {
          // Price below VWAP - look for bullish rejection (lower wick)
          if (lowerWick > upperWick && current.close > current.open) {
            rejectionType = 'bullish';
            isValidRejection = true;
          }
        } else {
          // Price above VWAP - look for bearish rejection (upper wick)
          if (upperWick > lowerWick && current.close < current.open) {
            rejectionType = 'bearish';
            isValidRejection = true;
          }
        }

        if (!isValidRejection) continue;

        // Calculate pattern strength (0-100)
        let strength = 50; // Base score

        // Deviation quality (closer to 2-3% is ideal)
        const idealDeviation = 2.5;
        const deviationScore = Math.max(0, 25 - Math.abs(deviationPercent - idealDeviation) * 5);
        strength += deviationScore;

        // Volume strength (higher is better, up to 2x)
        const volumeScore = Math.min(15, (volumeRatio - 1.3) * 20);
        strength += volumeScore;

        // Wick quality (larger wick = stronger rejection)
        const wickScore = Math.min(10, wickRatio * 20);
        strength += wickScore;

        // Cap at 100
        strength = Math.min(100, strength);

        patternsFound++;
        results.push({
          ticker,
          signal_date: date,
          signal_time: current.time_of_day,
          pattern_strength: Math.round(strength),
          metrics: {
            price: current.close,
            vwap: current.vwap,
            deviation_percent: deviationPercent,
            volume_ratio: volumeRatio,
            wick_ratio: wickRatio,
            rejection_type: rejectionType!,
            candle_body_percent: bodyPercent
          }
        });
      }
    }
  }

  console.error(`\n✅ Scan complete!`);
  console.error(`📊 Tickers scanned: ${tickersScanned}`);
  console.error(`🎯 Total patterns found: ${patternsFound}`);

  return results;
}

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  console.error(`📈 Outputting top ${topResults.length} patterns (sorted by strength)`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(err => {
  console.error('❌ Error running scan:', err);
  process.exit(1);
});