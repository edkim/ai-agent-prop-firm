import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay: string;
}

// CRITICAL: This is the EXACT interface for trade results
interface TradeResult {
  date: string;
  ticker: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}

// CRITICAL: This is the EXACT interface for scanner signals
interface ScannerSignal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: {
    [key: string]: any;
  };
}

// Declare SCANNER_SIGNALS as potentially undefined
declare const SCANNER_SIGNALS: ScannerSignal[] | undefined;

// Helper function: Calculate average volume over a period
function calculateAverageVolume(bars: Bar[], period: number): number {
  if (bars.length < period) return 0;
  const recentBars = bars.slice(-period);
  const totalVolume = recentBars.reduce((sum: number, bar: Bar) => sum + bar.volume, 0);
  return totalVolume / period;
}

// Helper function: Calculate VWAP for session
function calculateVWAP(bars: Bar[]): number {
  let totalPriceVolume = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    totalPriceVolume += typicalPrice * bar.volume;
    totalVolume += bar.volume;
  }

  return totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
}

// Helper function: Detect volume spike
function detectVolumeSpike(currentVolume: number, avgVolume: number, multiplier: number): boolean {
  return avgVolume > 0 && currentVolume >= avgVolume * multiplier;
}

// Helper function: Detect rejection pattern (bearish rejection at resistance)
function detectBearishRejection(bars: Bar[], confirmationBars: number): boolean {
  if (bars.length < confirmationBars + 1) return false;
  
  const recentBars = bars.slice(-confirmationBars);
  const signalBar = bars[bars.length - confirmationBars - 1];
  
  // Signal bar should have upper wick (rejection from high)
  const upperWick = signalBar.high - Math.max(signalBar.open, signalBar.close);
  const bodySize = Math.abs(signalBar.close - signalBar.open);
  const hasRejectionWick = upperWick > bodySize * 1.5;
  
  // Confirmation bars should show downward pressure
  const confirmationValid = recentBars.every((bar: Bar) => bar.close < signalBar.high);
  
  return hasRejectionWick && confirmationValid;
}

// Helper function: Detect bullish rejection pattern (at support)
function detectBullishRejection(bars: Bar[], confirmationBars: number): boolean {
  if (bars.length < confirmationBars + 1) return false;
  
  const recentBars = bars.slice(-confirmationBars);
  const signalBar = bars[bars.length - confirmationBars - 1];
  
  // Signal bar should have lower wick (rejection from low)
  const lowerWick = Math.min(signalBar.open, signalBar.close) - signalBar.low;
  const bodySize = Math.abs(signalBar.close - signalBar.open);
  const hasRejectionWick = lowerWick > bodySize * 1.5;
  
  // Confirmation bars should show upward pressure
  const confirmationValid = recentBars.every((bar: Bar) => bar.close > signalBar.low);
  
  return hasRejectionWick && confirmationValid;
}

// Helper function: Determine session trend
function determineSessionTrend(bars: Bar[], lookback: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (bars.length < lookback) return 'NEUTRAL';
  
  const recentBars = bars.slice(-lookback);
  const firstPrice = recentBars[0].close;
  const lastPrice = recentBars[recentBars.length - 1].close;
  const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
  
  if (priceChange > 0.5) return 'BULLISH';
  if (priceChange < -0.5) return 'BEARISH';
  return 'NEUTRAL';
}

async function runBacktest() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  // Configuration
  const ticker = 'AAOI';
  const timeframe = '5min';
  const tradingDays: string[] = [null];

// SIGNALS FROM SCANNER (injected by learning system)
const SCANNER_SIGNALS = [
  {
    "ticker": "AAOI",
    "signal_date": "2025-10-13",
    "signal_time": "13:00",
    "pattern_strength": 100,
    "metrics": {
      "vwap": 28.581063777359038,
      "price": 29.3,
      "distance_from_vwap_percent": 2.5154284957387767,
      "volume_spike_multiplier": 2.332465312201205,
      "rejection_confirmation_bars": 2,
      "session_trend": "bullish",
      "mean_reversion_quality": 50
    }
  },
  {
    "ticker": "AAOI",
    "signal_date": "2025-10-22",
    "signal_time": "10:55",
    "pattern_strength": 100,
    "metrics": {
      "vwap": 31.40116974778881,
      "price": 30.62,
      "distance_from_vwap_percent": -2.487709069640047,
      "volume_spike_multiplier": 1.9388247537757188,
      "rejection_confirmation_bars": 3,
      "session_trend": "bearish",
      "mean_reversion_quality": 75
    }
  }
];


  // Strategy parameters (with reasonable defaults for undefined values)
  const volumeSpikeMultiplier = 2.0; // Default: 2x average volume
  const rejectionConfirmationBars = 2; // Default: 2 bars confirmation
  const sessionTrendLookback = 12; // Default: 12 bars (1 hour on 5min chart)
  
  // Risk management parameters
  const stopLossPct = 1.5; // 1.5% stop loss
  const takeProfitPct = 2.5; // 2.5% take profit
  const maxTradesPerDay = 2; // Limit to 2 trades per day
  
  const results: TradeResult[] = [];

  // Check if scanner signals are available
  const useSignalBasedExecution = typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS && SCANNER_SIGNALS.length > 0;

  if (useSignalBasedExecution && SCANNER_SIGNALS) {
    console.log(`Using signal-based execution with ${SCANNER_SIGNALS.length} signals`);

    // Process each signal from the scanner
    for (const signal of SCANNER_SIGNALS) {
      const { ticker: signalTicker, signal_date, signal_time, pattern_strength, metrics } = signal;

      // Skip if signal is for different ticker
      if (signalTicker !== ticker) continue;

      // Fetch bars for this signal's date
      const dateStart = new Date(`${signal_date}T00:00:00Z`).getTime();
      const nextDate = new Date(signal_date);
      nextDate.setDate(nextDate.getDate() + 1);
      const dateEnd = nextDate.getTime();

      const query = `
        SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
        FROM ohlcv_data
        WHERE ticker = ? AND timeframe = ?
          AND timestamp >= ? AND timestamp < ?
        ORDER BY timestamp ASC
      `;

      const bars = db.prepare(query).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

      if (bars.length === 0) {
        results.push({
          date: signal_date,
          ticker,
          noTrade: true,
          noTradeReason: 'No data available'
        });
        continue;
      }

      // Find the bar at or after signal time
      const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signal_time);
      if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
        results.push({
          date: signal_date,
          ticker,
          noTrade: true,
          noTradeReason: 'Signal too late in day'
        });
        continue;
      }

      // Check if we've already taken max trades for this day
      const tradesCountToday = results.filter((r: TradeResult) => r.date === signal_date && !r.noTrade).length;
      if (tradesCountToday >= maxTradesPerDay) {
        results.push({
          date: signal_date,
          ticker,
          noTrade: true,
          noTradeReason: 'Max trades per day reached'
        });
        continue;
      }

      // Get bars up to signal for context analysis
      const barsUpToSignal = bars.slice(0, signalBarIndex + 1);
      
      // Filter to market hours only for analysis
      const marketHoursBars = barsUpToSignal.filter((b: Bar) => b.timeOfDay >= '09:30:00' && b.timeOfDay < '16:00:00');
      
      if (marketHoursBars.length < sessionTrendLookback) {
        results.push({
          date: signal_date,
          ticker,
          noTrade: true,
          noTradeReason: 'Insufficient data for analysis'
        });
        continue;
      }

      // Analyze session context
      const sessionTrend = determineSessionTrend(marketHoursBars, sessionTrendLookback);
      const vwap = calculateVWAP(marketHoursBars);
      const currentPrice = marketHoursBars[marketHoursBars.length - 1].close;
      
      // Determine trade direction based on pattern and context
      let side: 'LONG' | 'SHORT' | null = null;
      
      // Extract pattern type from metrics if available
      const volumeSpike = metrics.volume_spike || false;
      const bearishRejection = metrics.bearish_rejection || false;
      const bullishRejection = metrics.bullish_rejection || false;
      
      // Decision logic: Fade bearish rejections in uptrends, buy bullish rejections in downtrends
      if (bearishRejection && volumeSpike && sessionTrend === 'BULLISH' && currentPrice > vwap) {
        // Bearish rejection in uptrend with volume = fade (SHORT)
        side = 'SHORT';
      } else if (bullishRejection && volumeSpike && sessionTrend === 'BEARISH' && currentPrice < vwap) {
        // Bullish rejection in downtrend with volume = reversal (LONG)
        side = 'LONG';
      } else if (bearishRejection && currentPrice > vwap * 1.01) {
        // Bearish rejection above VWAP = SHORT
        side = 'SHORT';
      } else if (bullishRejection && currentPrice < vwap * 0.99) {
        // Bullish rejection below VWAP = LONG
        side = 'LONG';
      }

      if (!side) {
        results.push({
          date: signal_date,
          ticker,
          noTrade: true,
          noTradeReason: 'Pattern context not favorable'
        });
        continue;
      }

      // Enter on NEXT bar after signal (realistic execution)
      const entryBar = bars[signalBarIndex + 1];
      
      let position = {
        side,
        entry: entryBar.open,
        entryTime: entryBar.timeOfDay,
        highestPrice: entryBar.high,
        lowestPrice: entryBar.low
      };

      // Monitor position until exit
      let exitTriggered = false;
      let exitPrice = entryBar.close;
      let exitTime = entryBar.timeOfDay;
      let exitReason = '';

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        
        // Skip if outside market hours
        if (bar.timeOfDay < '09:30:00' || bar.timeOfDay >= '16:00:00') continue;
        
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        if (side === 'LONG') {
          const stopLoss = position.entry * (1 - stopLossPct / 100);
          const takeProfit = position.entry * (1 + takeProfitPct / 100);

          if (bar.low <= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitTime = bar.timeOfDay;
            exitReason = 'Stop loss';
          } else if (bar.high >= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitTime = bar.timeOfDay;
            exitReason = 'Take profit';
          } else if (bar.timeOfDay >= '15:55:00') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitTime = bar.timeOfDay;
            exitReason = 'Market close';
          }
        } else { // SHORT
          const stopLoss = position.entry * (1 + stopLossPct / 100);
          const takeProfit = position.entry * (1 - takeProfitPct / 100);

          if (bar.high >= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitTime = bar.timeOfDay;
            exitReason = 'Stop loss';
          } else if (bar.low <= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitTime = bar.timeOfDay;
            exitReason = 'Take profit';
          } else if (bar.timeOfDay >= '15:55:00