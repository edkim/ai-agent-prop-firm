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
    volume_spike_ratio: number;
    reversion_strength: number;
    session_trend: string;
    rejection_bars: number;
  };
}

// Tech sector tickers (expanded list for better coverage)
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

  console.error(`🔍 Scanning for VWAP mean reversion patterns (mid-session 10:00-14:00)`);
  console.error(`📅 Date range: ${startDate} to ${endDate}`);
  console.error(`🎯 Universe: ${TECH_TICKERS.length} tech sector stocks`);

  let tickersProcessed = 0;
  let totalBarsAnalyzed = 0;

  // Scan each ticker
  for (const ticker of TECH_TICKERS) {
    tickersProcessed++;
    if (tickersProcessed % 10 === 0) {
      console.error(`📊 Progress: ${tickersProcessed}/${TECH_TICKERS.length} tickers processed...`);
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

    if (allBars.length < 50) continue; // Need sufficient data

    totalBarsAnalyzed += allBars.length;

    // Group bars by day
    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each day
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      if (dayBars.length < 30) continue; // Need full day of data

      // Calculate VWAP for each bar (cumulative from market open)
      const barsWithVWAP = [];
      let cumVol = 0, cumVolPrice = 0;

      for (const bar of dayBars) {
        const typical = (bar.high + bar.low + bar.close) / 3;
        cumVolPrice += typical * bar.volume;
        cumVol += bar.volume;
        barsWithVWAP.push({
          ...bar,
          vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol,
          typical_price: typical
        });
      }

      // Filter for mid-session bars (10:00-14:00)
      const midSessionBars = barsWithVWAP.filter(bar => {
        const time = bar.time_of_day;
        return time >= '10:00' && time <= '14:00';
      });

      if (midSessionBars.length < 20) continue;

      // Detect VWAP mean reversion patterns
      for (let i = 20; i < midSessionBars.length; i++) {
        const current = midSessionBars[i];
        const lookback = midSessionBars.slice(Math.max(0, i - 20), i);
        
        if (lookback.length < 10) continue;

        // Calculate session trend (are we in an uptrend or downtrend?)
        const sessionStart = midSessionBars[0];
        const sessionTrend = current.close > sessionStart.close ? 'bullish' : 'bearish';

        // Mean reversion setup: Price extended from VWAP
        const distanceFromVWAP = (current.close - current.vwap) / current.vwap;
        const distancePercent = Math.abs(distanceFromVWAP) * 100;

        // Look for overextension (>1.5% from VWAP)
        const isOverextended = distancePercent > 1.5;
        if (!isOverextended) continue;

        // Determine if we're looking for bullish or bearish reversion
        const lookingForBullishReversion = distanceFromVWAP < 0; // Price below VWAP
        const lookingForBearishReversion = distanceFromVWAP > 0; // Price above VWAP

        // Check for rejection/reversion signals
        let rejectionBars = 0;
        let reversionStrength = 0;

        // Look at last 3-5 bars for rejection confirmation
        const recentBars = lookback.slice(-5);
        
        if (lookingForBullishReversion) {
          // Price was below VWAP, now showing signs of bouncing back
          for (const bar of recentBars) {
            const barDistance = (bar.close - bar.vwap) / bar.vwap;
            if (barDistance < 0 && bar.close > bar.open) {
              rejectionBars++; // Bullish candle while below VWAP
            }
          }
          
          // Current bar should be moving back toward VWAP
          const isReverting = current.close > current.open && 
                             current.close > lookback[lookback.length - 1].close;
          
          if (isReverting) {
            reversionStrength = (current.close - current.open) / current.open * 100;
          }
        } else {
          // Price was above VWAP, now showing signs of pulling back
          for (const bar of recentBars) {
            const barDistance = (bar.close - bar.vwap) / bar.vwap;
            if (barDistance > 0 && bar.close < bar.open) {
              rejectionBars++; // Bearish candle while above VWAP
            }
          }
          
          // Current bar should be moving back toward VWAP
          const isReverting = current.close < current.open && 
                             current.close < lookback[lookback.length - 1].close;
          
          if (isReverting) {
            reversionStrength = (current.open - current.close) / current.open * 100;
          }
        }

        // Need at least 2 rejection bars for confirmation
        if (rejectionBars < 2) continue;
        if (reversionStrength < 0.3) continue; // Need meaningful reversion move

        // Volume confirmation: Current volume should be elevated
        const avgVolume = lookback.reduce((sum, b) => sum + b.volume, 0) / lookback.length;
        const volumeSpikeRatio = current.volume / avgVolume;

        // Volume should be at least 1.3x average (learned parameter)
        if (volumeSpikeRatio < 1.3) continue;

        // Calculate pattern strength (0-100)
        let patternStrength = 50; // Base score

        // Distance from VWAP (more extreme = stronger signal)
        patternStrength += Math.min(distancePercent * 5, 20);

        // Volume confirmation
        patternStrength += Math.min((volumeSpikeRatio - 1) * 15, 20);

        // Rejection confirmation
        patternStrength += rejectionBars * 3;

        // Reversion strength
        patternStrength += Math.min(reversionStrength * 2, 10);

        // Cap at 100
        patternStrength = Math.min(patternStrength, 100);

        results.push({
          ticker,
          signal_date: date,
          signal_time: current.time_of_day,
          pattern_strength: Math.round(patternStrength),
          metrics: {
            vwap: Math.round(current.vwap * 100) / 100,
            price: Math.round(current.close * 100) / 100,
            distance_from_vwap_percent: Math.round(distancePercent * 100) / 100,
            volume_spike_ratio: Math.round(volumeSpikeRatio * 100) / 100,
            reversion_strength: Math.round(reversionStrength * 100) / 100,
            session_trend: sessionTrend,
            rejection_bars: rejectionBars
          }
        });
      }
    }
  }

  console.error(`\n📈 Analysis complete:`);
  console.error(`   - Tickers processed: ${tickersProcessed}`);
  console.error(`   - Total bars analyzed: ${totalBarsAnalyzed.toLocaleString()}`);
  console.error(`   - Patterns found: ${results.length}`);

  return results;
}

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  // IMPORTANT: Output ONLY the JSON to stdout (no other messages)
  console.error(`\n✅ Scan complete! Found ${results.length} pattern matches`);
  console.error(`📊 Outputting top ${topResults.length} patterns (sorted by strength)`);
  console.error(`\n🎯 Top 5 signals:`);
  
  topResults.slice(0, 5).forEach((r, idx) => {
    console.error(`   ${idx + 1}. ${r.ticker} on ${r.signal_date} at ${r.signal_time}`);
    console.error(`      Strength: ${r.pattern_strength}/100, Distance: ${r.metrics.distance_from_vwap_percent}%, Vol: ${r.metrics.volume_spike_ratio}x`);
  });

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(err => {
  console.error('❌ Error running scan:', err);
  process.exit(1);
});