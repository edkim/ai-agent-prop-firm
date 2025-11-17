/**
 * Shared backtest helper functions
 *
 * Import these in generated scripts to avoid regenerating common calculations.
 * This reduces token usage and ensures consistent implementations.
 */

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay: string;
}

/**
 * Fetch intraday bars for a specific ticker and date
 *
 * @param db - SQLite database instance
 * @param ticker - Stock ticker symbol
 * @param date - Date in YYYY-MM-DD format
 * @param timeframe - Timeframe (e.g., '5min', '1min')
 * @returns Array of bars sorted by time, or null if no data
 */
export function getIntradayData(
  db: any,
  ticker: string,
  date: string,
  timeframe: string
): Bar[] | null {
  const query = `
    SELECT
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      time_of_day as timeOfDay
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = ?
    ORDER BY timestamp ASC
  `;

  try {
    const stmt = db.prepare(query);
    const rows = stmt.all(ticker, date, timeframe);

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows.map((row: any) => ({
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      timeOfDay: row.timeOfDay
    }));
  } catch (error) {
    console.error(`Error fetching intraday data for ${ticker} on ${date}:`, error);
    return null;
  }
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 * Formula: Σ(Price × Volume) / Σ(Volume)
 */
export function calculateVWAP(bars: Bar[]): number {
  let totalPV = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    totalPV += typicalPrice * bar.volume;
    totalVolume += bar.volume;
  }

  return totalVolume > 0 ? totalPV / totalVolume : 0;
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(bars: Bar[], period: number): number {
  if (bars.length < period) return 0;

  const recentBars = bars.slice(-period);
  const sum = recentBars.reduce((acc, bar) => acc + bar.close, 0);
  return sum / period;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(bars: Bar[], period: number): number {
  if (bars.length < period) return 0;

  const multiplier = 2 / (period + 1);

  // Start with SMA for first value
  let ema = bars.slice(0, period).reduce((sum, bar) => sum + bar.close, 0) / period;

  // Calculate EMA for remaining bars
  for (let i = period; i < bars.length; i++) {
    ema = (bars[i].close - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate Average True Range (ATR)
 * Measures market volatility
 */
export function calculateATR(bars: Bar[], period: number = 14): number {
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
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Calculate Relative Strength Index (RSI)
 * Range: 0-100 (>70 overbought, <30 oversold)
 */
export function calculateRSI(bars: Bar[], period: number = 14): number {
  if (bars.length < period + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    changes.push(bars[i].close - bars[i - 1].close);
  }

  const recentChanges = changes.slice(-period);
  let gains = 0;
  let losses = 0;

  for (const change of recentChanges) {
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Bollinger Bands
 * Returns upper, middle (SMA), and lower bands
 */
export function calculateBollingerBands(
  bars: Bar[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  const sma = calculateSMA(bars, period);
  const recentBars = bars.slice(-period);

  // Calculate standard deviation
  const variance = recentBars.reduce((sum, bar) => {
    return sum + Math.pow(bar.close - sma, 2);
  }, 0) / period;

  const std = Math.sqrt(variance);

  return {
    upper: sma + (std * stdDev),
    middle: sma,
    lower: sma - (std * stdDev)
  };
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Returns MACD line, signal line, and histogram
 */
export function calculateMACD(
  bars: Bar[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  const fastEMA = calculateEMA(bars, fastPeriod);
  const slowEMA = calculateEMA(bars, slowPeriod);
  const macdLine = fastEMA - slowEMA;

  // For proper signal line calculation, would need array of MACD values
  // Simplified version returns 0 for signal
  const signalLine = 0;
  const histogram = macdLine - signalLine;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram
  };
}

/**
 * Check if bars form higher highs pattern (uptrend)
 */
export function isHigherHighs(bars: Bar[], lookback: number = 3): boolean {
  if (bars.length < lookback + 1) return false;

  const recentBars = bars.slice(-lookback - 1);

  for (let i = 1; i < recentBars.length; i++) {
    if (recentBars[i].high <= recentBars[i - 1].high) {
      return false;
    }
  }

  return true;
}

/**
 * Check if bars form lower lows pattern (downtrend)
 */
export function isLowerLows(bars: Bar[], lookback: number = 3): boolean {
  if (bars.length < lookback + 1) return false;

  const recentBars = bars.slice(-lookback - 1);

  for (let i = 1; i < recentBars.length; i++) {
    if (recentBars[i].low >= recentBars[i - 1].low) {
      return false;
    }
  }

  return true;
}

/**
 * Find support level (lowest low in lookback period)
 */
export function findSupport(bars: Bar[], lookback: number = 20): number {
  if (bars.length < lookback) return 0;

  const recentBars = bars.slice(-lookback);
  return Math.min(...recentBars.map(b => b.low));
}

/**
 * Find resistance level (highest high in lookback period)
 */
export function findResistance(bars: Bar[], lookback: number = 20): number {
  if (bars.length < lookback) return 0;

  const recentBars = bars.slice(-lookback);
  return Math.max(...recentBars.map(b => b.high));
}

/**
 * Find a clustered pivot-based resistance level.
 * Looks for swing highs (higher than prior and next bar) in the lookback window,
 * groups nearby highs within tolerancePct, and returns the top of the most
 * frequented cluster. Requires a minimum number of touches to avoid one-off wicks.
 */
export function findPivotResistance(
  bars: Bar[],
  lookback: number = 30,
  tolerancePct: number = 0.15,
  minTouches: number = 2
): number {
  if (bars.length < Math.max(3, lookback)) return 0;
  if (tolerancePct <= 0 || minTouches < 1) return 0;

  const recent = bars.slice(-lookback);
  const pivots: { price: number; idx: number }[] = [];

  for (let i = 1; i < recent.length - 1; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const next = recent[i + 1];
    const isPivotHigh = curr.high > prev.high && curr.high > next.high;
    if (isPivotHigh) {
      pivots.push({ price: curr.high, idx: i });
    }
  }

  if (pivots.length === 0) return 0;

  let bestLevel = 0;
  let bestCount = 0;
  let bestRecency = -1; // larger idx = more recent within window

  for (const pivot of pivots) {
    const bandLow = pivot.price * (1 - tolerancePct / 100);
    const bandHigh = pivot.price * (1 + tolerancePct / 100);
    const inBand = pivots.filter(p => p.price >= bandLow && p.price <= bandHigh);
    if (inBand.length < minTouches) continue;

    const count = inBand.length;
    const mostRecentIdx = Math.max(...inBand.map(p => p.idx));
    const level = Math.max(...inBand.map(p => p.price)); // use the top of the band as resistance

    const isBetterCluster =
      count > bestCount ||
      (count === bestCount && mostRecentIdx > bestRecency);

    if (isBetterCluster) {
      bestCount = count;
      bestRecency = mostRecentIdx;
      bestLevel = level;
    }
  }

  return bestLevel;
}

/**
 * Calculate average volume over a period
 */
export function calculateAverageVolume(bars: Bar[], period: number): number {
  if (bars.length < period) return 0;

  const recentBars = bars.slice(-period);
  const totalVolume = recentBars.reduce((sum, bar) => sum + bar.volume, 0);
  return totalVolume / period;
}

/**
 * Determine if current price is near support/resistance
 * Returns percentage distance (negative = below, positive = above)
 */
export function distanceFromLevel(currentPrice: number, level: number): number {
  return ((currentPrice - level) / level) * 100;
}

/**
 * Check if volume spike occurred (current volume vs average)
 */
export function hasVolumeSpike(
  currentVolume: number,
  avgVolume: number,
  multiplier: number = 1.5
): boolean {
  return avgVolume > 0 && currentVolume >= avgVolume * multiplier;
}

/**
 * Calculate relative strength vs a benchmark over a recent window.
 * Returns percentage outperformance (stock return - benchmark return) * 100.
 */
export function calculateRelativeStrength(
  bars: Bar[],
  benchmarkBars: Bar[],
  lookbackBars: number = 12
): number {
  if (
    bars.length < lookbackBars + 1 ||
    benchmarkBars.length < lookbackBars + 1
  ) {
    return 0;
  }

  const stockStart = bars[bars.length - lookbackBars - 1].close;
  const stockEnd = bars[bars.length - 1].close;
  const benchStart = benchmarkBars[benchmarkBars.length - lookbackBars - 1].close;
  const benchEnd = benchmarkBars[benchmarkBars.length - 1].close;

  if (stockStart === 0 || benchStart === 0) {
    return 0;
  }

  const stockRet = (stockEnd - stockStart) / stockStart;
  const benchRet = (benchEnd - benchStart) / benchStart;

  return (stockRet - benchRet) * 100;
}
