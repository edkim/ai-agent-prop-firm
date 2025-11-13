import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;  // Trading date (YYYY-MM-DD)
  signal_time: string;  // Time of exhaustion signal (HH:MM in UTC)
  pattern_strength: number; // 0-100
  direction: 'SHORT';  // Always SHORT for fade setups
  metrics: {
    spike_percent: number;  // Intraday gain at peak
    peak_time: string;  // Time of intraday peak (UTC)
    peak_price: number;
    signal_price: number;  // Price at exhaustion signal
    vwap_at_signal: number;
    volume_decline_percent: number;  // Volume decline from peak
    lower_highs_count: number;  // Number of lower highs after peak
    distance_below_vwap_percent: number;  // How far below VWAP at signal
  };
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  // Get list of tickers with intraday data in date range
  const tickersStmt = db.prepare(`
    SELECT DISTINCT ticker FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
  `);
  const tickers = tickersStmt.all('2025-10-24', '2025-11-12') as any[];

  console.error(`🔍 Scanning ${tickers.length} tickers for parabolic fade setups...`);

  // Scan each ticker
  for (const { ticker } of tickers) {
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
    const allBars = barsStmt.all(ticker, '2025-10-24', '2025-11-12') as any[];

    if (allBars.length < 20) continue;

    // Group bars by day
    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each day for parabolic spikes and exhaustion
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      if (dayBars.length < 20) continue;  // Need enough bars for pattern

      // Calculate VWAP for each bar (cumulative from market open)
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

      // Find the opening price (first bar of the day)
      const openPrice = barsWithVWAP[0].open;

      // Scan for parabolic spike followed by exhaustion
      for (let i = 10; i < barsWithVWAP.length - 5; i++) {
        const current = barsWithVWAP[i];
        
        // Step 1: Identify if we're at or past a parabolic spike
        // Look back to find the peak in the last 10-30 bars
        const lookbackStart = Math.max(0, i - 30);
        const lookbackBars = barsWithVWAP.slice(lookbackStart, i + 1);
        
        // Find the highest high in lookback period
        const peakBar = lookbackBars.reduce((max, bar) => 
          bar.high > max.high ? bar : max
        , lookbackBars[0]);
        
        const peakIndex = barsWithVWAP.indexOf(peakBar);
        
        // Calculate intraday spike percentage from open to peak
        const spikePercent = ((peakBar.high - openPrice) / openPrice) * 100;
        
        // Filter 1: Must have spiked 10-20%+ intraday
        if (spikePercent < 10) continue;
        
        // Filter 2: Peak must be recent (within last 5-20 bars)
        const barsSincePeak = i - peakIndex;
        if (barsSincePeak < 5 || barsSincePeak > 20) continue;
        
        // Step 2: Check for exhaustion signals
        const postPeakBars = barsWithVWAP.slice(peakIndex, i + 1);
        
        // Exhaustion Signal 1: Declining volume
        // Compare average volume in 5 bars after peak vs 5 bars before peak
        const prePeakBars = barsWithVWAP.slice(Math.max(0, peakIndex - 5), peakIndex);
        const avgVolumePre = prePeakBars.reduce((sum, b) => sum + b.volume, 0) / prePeakBars.length;
        const recentBars = postPeakBars.slice(-5);
        const avgVolumePost = recentBars.reduce((sum, b) => sum + b.volume, 0) / recentBars.length;
        const volumeDeclinePercent = ((avgVolumePre - avgVolumePost) / avgVolumePre) * 100;
        
        if (volumeDeclinePercent < 10) continue;  // Volume must decline at least 10%
        
        // Exhaustion Signal 2: Lower highs formation
        // Count consecutive lower highs after peak
        let lowerHighsCount = 0;
        for (let j = 1; j < postPeakBars.length; j++) {
          if (postPeakBars[j].high < postPeakBars[j - 1].high) {
            lowerHighsCount++;
          } else {
            break;  // Stop counting if we get a higher high
          }
        }
        
        if (lowerHighsCount < 2) continue;  // Need at least 2 lower highs
        
        // Exhaustion Signal 3: Break below VWAP
        const distanceBelowVWAP = ((current.vwap - current.close) / current.vwap) * 100;
        
        if (current.close > current.vwap) continue;  // Must be below VWAP
        if (distanceBelowVWAP < 0.2) continue;  // Must be meaningfully below (at least 0.2%)
        
        // Exhaustion Signal 4: Current bar shows weakness
        // Red candle (close < open) with lower high than previous bar
        const previousBar = barsWithVWAP[i - 1];
        const isRedCandle = current.close < current.open;
        const lowerHigh = current.high < previousBar.high;
        
        if (!isRedCandle || !lowerHigh) continue;
        
        // Calculate pattern strength (0-100)
        let strength = 0;
        
        // Spike magnitude (0-30 points)
        strength += Math.min(30, (spikePercent / 20) * 30);
        
        // Volume decline (0-25 points)
        strength += Math.min(25, (volumeDeclinePercent / 50) * 25);
        
        // Lower highs count (0-20 points)
        strength += Math.min(20, lowerHighsCount * 5);
        
        // Distance below VWAP (0-15 points)
        strength += Math.min(15, distanceBelowVWAP * 3);
        
        // Timing: Earlier in day = better (0-10 points)
        // Parse time_of_day (HH:MM:SS format in UTC)
        const timeMatch = current.time_of_day.match(/(\d{2}):(\d{2})/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const minute = parseInt(timeMatch[2]);
          const minutesSinceOpen = (hour - 13) * 60 + minute - 30;  // 13:30 UTC = 09:30 ET
          if (minutesSinceOpen < 120) {  // Within first 2 hours
            strength += 10;
          } else if (minutesSinceOpen < 240) {  // Within first 4 hours
            strength += 5;
          }
        }
        
        // Only keep high-quality setups (strength >= 60)
        if (strength < 60) continue;
        
        results.push({
          ticker,
          signal_date: date,
          signal_time: current.time_of_day,
          pattern_strength: Math.round(strength),
          direction: 'SHORT',
          metrics: {
            spike_percent: Math.round(spikePercent * 100) / 100,
            peak_time: peakBar.time_of_day,
            peak_price: Math.round(peakBar.high * 100) / 100,
            signal_price: Math.round(current.close * 100) / 100,
            vwap_at_signal: Math.round(current.vwap * 100) / 100,
            volume_decline_percent: Math.round(volumeDeclinePercent * 100) / 100,
            lower_highs_count: lowerHighsCount,
            distance_below_vwap_percent: Math.round(distanceBelowVWAP * 100) / 100
          }
        });
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
  console.error(`✅ Scan complete! Found ${results.length} parabolic fade setups`);
  console.error(`📊 Outputting top ${topResults.length} patterns`);
  
  if (topResults.length > 0) {
    console.error(`\n🎯 Top 5 Setups:`);
    topResults.slice(0, 5).forEach((r, idx) => {
      console.error(`${idx + 1}. ${r.ticker} on ${r.signal_date} at ${r.signal_time}`);
      console.error(`   Spike: +${r.metrics.spike_percent}% | Strength: ${r.pattern_strength}`);
      console.error(`   Peak: $${r.metrics.peak_price} → Signal: $${r.metrics.signal_price}`);
      console.error(`   Below VWAP: ${r.metrics.distance_below_vwap_percent}% | Vol Decline: ${r.metrics.volume_decline_percent}%`);
    });
  }

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults));
}).catch(err => {
  console.error('❌ Scanner error:', err);
  process.exit(1);
});