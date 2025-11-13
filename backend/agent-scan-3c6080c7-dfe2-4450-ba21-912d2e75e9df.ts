import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;
  signal_time: string;  // UTC timezone
  pattern_strength: number;
  direction: 'SHORT';  // Only shorts per user guidance
  metrics: {
    pattern_type: string;
    entry_price: number;
    stop_loss: number;
    volume_surge: number;
    volatility_score: number;
    momentum_score: number;
    qqq_down: boolean;
    support_resistance: number;
    risk_reward_ratio: number;
  };
}

// Calculate ATR for volatility measurement
function calculateATR(bars: any[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
}

// Calculate momentum score based on price action
function calculateMomentum(bars: any[], currentIdx: number): number {
  if (currentIdx < 10) return 0;
  
  const current = bars[currentIdx];
  const lookback = bars.slice(currentIdx - 10, currentIdx);
  
  // Price momentum (rate of change)
  const priceChange = (current.close - lookback[0].close) / lookback[0].close;
  
  // Volume momentum
  const avgVolume = lookback.reduce((sum, b) => sum + b.volume, 0) / lookback.length;
  const volumeRatio = current.volume / avgVolume;
  
  // Bearish momentum for shorts (negative is good)
  const bearishScore = Math.max(0, -priceChange * 100) * volumeRatio;
  
  return Math.min(100, bearishScore);
}

// Find support/resistance levels
function findSupportResistance(bars: any[], currentIdx: number, lookback: number = 20): number {
  if (currentIdx < lookback) return bars[currentIdx].low;
  
  const recentBars = bars.slice(Math.max(0, currentIdx - lookback), currentIdx);
  const lows = recentBars.map(b => b.low);
  
  // Find recent swing low as resistance for shorts
  return Math.min(...lows);
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  // First, get QQQ daily data to check if it's down
  const qqqDailyStmt = db.prepare(`
    SELECT date, close,
           LAG(close) OVER (ORDER BY date) as prev_close
    FROM daily_metrics
    WHERE ticker = 'QQQ'
      AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `);
  
  const qqqDaily = qqqDailyStmt.all('2025-10-24', '2025-11-12') as any[];
  const qqqDownDates = new Set(
    qqqDaily
      .filter(row => row.prev_close && row.close < row.prev_close)
      .map(row => row.date)
  );

  console.error(`📉 QQQ down on ${qqqDownDates.size} days in range`);

  // Get tech sector tickers with high volume and volatility
  const tickersStmt = db.prepare(`
    SELECT DISTINCT o.ticker
    FROM ohlcv_data o
    JOIN daily_metrics d ON o.ticker = d.ticker 
      AND date(o.timestamp/1000, 'unixepoch') = d.date
    WHERE o.timeframe = '5min'
      AND date(o.timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      AND d.volume > 5000000  -- High volume stocks
      AND d.high_low_range_percent > 2.0  -- Significant intraday volatility
    GROUP BY o.ticker
    HAVING COUNT(*) > 50  -- Sufficient data points
  `);
  
  const tickers = tickersStmt.all('2025-10-24', '2025-11-12') as any[];
  console.error(`🎯 Scanning ${tickers.length} high-volume, volatile tech stocks...`);

  // Scan each ticker
  for (const { ticker } of tickers) {
    // Get 5-minute bars
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
    if (allBars.length < 50) continue;

    // Group bars by day
    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each day
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      // CRITICAL: Only scan days when QQQ is down (per user guidance)
      if (!qqqDownDates.has(date)) continue;

      if (dayBars.length < 20) continue;

      // Calculate VWAP for the day
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

      // Calculate ATR for the day
      const atr = calculateATR(barsWithVWAP);
      if (atr === 0) continue;

      // Scan for SHORT opportunities (momentum bursts, volume surges, breakdowns)
      for (let i = 20; i < barsWithVWAP.length - 5; i++) {  // Leave room for exit
        const current = barsWithVWAP[i];
        const previous = barsWithVWAP.slice(i - 20, i);
        
        // Skip early morning (before 14:30 UTC / 10:30 ET) and late day (after 19:30 UTC / 15:30 ET)
        const timeUTC = current.time_of_day;
        if (timeUTC < '14:30' || timeUTC > '19:30') continue;

        // Pattern 1: VWAP Breakdown with Volume Surge
        const avgVolume = previous.slice(-10).reduce((sum, b) => sum + b.volume, 0) / 10;
        const volumeSurge = current.volume / avgVolume;
        
        const breakingBelowVWAP = current.close < current.vwap && 
                                  previous[previous.length - 1].close >= previous[previous.length - 1].vwap;
        
        const bearishCandle = current.close < current.open;
        const significantMove = (current.open - current.close) / current.open > 0.003; // 0.3%+ drop
        
        if (breakingBelowVWAP && volumeSurge > 1.5 && bearishCandle && significantMove) {
          const momentum = calculateMomentum(barsWithVWAP, i);
          const supportLevel = findSupportResistance(barsWithVWAP, i);
          
          // Entry: Current close (breakdown point)
          const entryPrice = current.close;
          
          // Stop: Above recent high + 1 ATR (tight stop for scalping)
          const recentHigh = Math.max(...previous.slice(-5).map(b => b.high));
          const stopLoss = recentHigh + (atr * 0.5);
          
          // Target: Support level or 1% move
          const target = Math.min(supportLevel, entryPrice * 0.99);
          const riskReward = (entryPrice - target) / (stopLoss - entryPrice);
          
          // Only take high probability setups
          if (riskReward > 1.5 && volumeSurge > 2.0) {
            const volatilityScore = (atr / current.close) * 100;
            
            results.push({
              ticker,
              signal_date: date,
              signal_time: timeUTC,
              pattern_strength: Math.min(100, momentum * 0.6 + volumeSurge * 10 + riskReward * 5),
              direction: 'SHORT',
              metrics: {
                pattern_type: 'VWAP_BREAKDOWN_SCALP',
                entry_price: entryPrice,
                stop_loss: stopLoss,
                volume_surge: volumeSurge,
                volatility_score: volatilityScore,
                momentum_score: momentum,
                qqq_down: true,
                support_resistance: supportLevel,
                risk_reward_ratio: riskReward
              }
            });
          }
        }

        // Pattern 2: Momentum Burst Fade (counter-trend scalp)
        const priceChange5min = (current.close - previous[previous.length - 5].close) / previous[previous.length - 5].close;
        const rapidRise = priceChange5min > 0.01; // 1%+ rise in 5 bars
        
        const exhaustionSignal = current.close < current.open && // Bearish reversal
                                current.high > previous[previous.length - 1].high && // Made new high
                                volumeSurge > 1.8; // Volume confirmation
        
        if (rapidRise && exhaustionSignal) {
          const momentum = calculateMomentum(barsWithVWAP, i);
          const supportLevel = findSupportResistance(barsWithVWAP, i);
          
          const entryPrice = current.close;
          const stopLoss = current.high + (atr * 0.3); // Very tight stop
          const target = Math.min(supportLevel, entryPrice * 0.985); // 1.5% target
          const riskReward = (entryPrice - target) / (stopLoss - entryPrice);
          
          if (riskReward > 2.0) {
            const volatilityScore = (atr / current.close) * 100;
            
            results.push({
              ticker,
              signal_date: date,
              signal_time: timeUTC,
              pattern_strength: Math.min(100, momentum * 0.5 + volumeSurge * 12 + riskReward * 6),
              direction: 'SHORT',
              metrics: {
                pattern_type: 'MOMENTUM_FADE_SCALP',
                entry_price: entryPrice,
                stop_loss: stopLoss,
                volume_surge: volumeSurge,
                volatility_score: volatilityScore,
                momentum_score: momentum,
                qqq_down: true,
                support_resistance: supportLevel,
                risk_reward_ratio: riskReward
              }
            });
          }
        }

        // Pattern 3: Volume Spike Breakdown
        const extremeVolume = volumeSurge > 3.0;
        const breakingSupport = current.low < supportLevel;
        const bearishBar = current.close < current.open && 
                          (current.open - current.close) / current.open > 0.005; // 0.5%+ drop
        
        if (extremeVolume && breakingSupport && bearishBar) {
          const momentum = calculateMomentum(barsWithVWAP, i);
          const supportLevel = findSupportResistance(barsWithVWAP, i);
          
          const entryPrice = current.close;
          const stopLoss = supportLevel + (atr * 0.4);
          const target = entryPrice * 0.98; // 2% target
          const riskReward = (entryPrice - target) / (stopLoss - entryPrice);
          
          if (riskReward > 1.8) {
            const volatilityScore = (atr / current.close) * 100;
            
            results.push({
              ticker,
              signal_date: date,
              signal_time: timeUTC,
              pattern_strength: Math.min(100, momentum * 0.7 + volumeSurge * 8 + riskReward * 7),
              direction: 'SHORT',
              metrics: {
                pattern_type: 'VOLUME_BREAKDOWN_SCALP',
                entry_price: entryPrice,
                stop_loss: stopLoss,
                volume_surge: volumeSurge,
                volatility_score: volatilityScore,
                momentum_score: momentum,
                qqq_down: true,
                support_resistance: supportLevel,
                risk_reward_ratio: riskReward
              }
            });
          }
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
  console.error(`✅ Scan complete! Found ${results.length} SHORT scalping opportunities`);
  console.error(`📊 Outputting top ${topResults.length} patterns`);
  console.error(`📉 All signals are SHORT-only on QQQ down days`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults));
}).catch(console.error);