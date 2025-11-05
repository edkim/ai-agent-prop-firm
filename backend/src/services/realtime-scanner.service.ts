/**
 * Real-Time Pattern Scanner Service
 * Detects trading patterns in real-time market data
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/db';
import { LiveSignal, SignalData } from '../types/trading-agent.types';

interface OHLCVBar {
  ticker: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string; // '1m', '5m', '15m', '1h', '1d'
}

interface Pattern {
  type: string;
  ticker: string;
  quality: number; // 0-100
  timestamp: number;
  signalData: SignalData;
}

interface TechnicalIndicators {
  rsi: number;
  vwap: number;
  volumeRatio: number;
  atr: number;
  sma20: number;
  sma50: number;
}

export class RealtimeScannerService {
  private readonly DEDUPLICATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly PATTERN_MATURITY_MIN_BARS = 20;

  constructor() {
    // No initialization needed - uses getDatabase() directly
  }

  /**
   * Main scanning entry point
   * Called when new bar arrives from TradeStation WebSocket
   */
  async scanForPatterns(bar: OHLCVBar): Promise<LiveSignal[]> {
    try {
      // Store the bar in database
      await this.storeBar(bar);

      // Get historical bars for technical analysis
      const historicalBars = await this.getHistoricalBars(bar.ticker, bar.timeframe, 100);

      if (historicalBars.length < this.PATTERN_MATURITY_MIN_BARS) {
        return []; // Not enough data yet
      }

      // Calculate technical indicators
      const indicators = this.calculateIndicators(historicalBars);

      // Detect patterns
      const detectedPatterns: Pattern[] = [];

      // Pattern 1: Breakout with Volume Surge
      const breakoutPattern = this.detectBreakoutVolumeSurge(historicalBars, indicators);
      if (breakoutPattern) {
        detectedPatterns.push(breakoutPattern);
      }

      // Pattern 2: Gap and Go
      const gapPattern = this.detectGapAndGo(historicalBars, indicators);
      if (gapPattern) {
        detectedPatterns.push(gapPattern);
      }

      // Pattern 3: Cup and Handle
      const cupHandlePattern = this.detectCupAndHandle(historicalBars, indicators);
      if (cupHandlePattern) {
        detectedPatterns.push(cupHandlePattern);
      }

      // Pattern 4: Bull Flag
      const bullFlagPattern = this.detectBullFlag(historicalBars, indicators);
      if (bullFlagPattern) {
        detectedPatterns.push(bullFlagPattern);
      }

      // Pattern 5: VWAP Bounce
      const vwapBouncePattern = this.detectVWAPBounce(historicalBars, indicators);
      if (vwapBouncePattern) {
        detectedPatterns.push(vwapBouncePattern);
      }

      // Pattern 6: Momentum Surge
      const momentumPattern = this.detectMomentumSurge(historicalBars, indicators);
      if (momentumPattern) {
        detectedPatterns.push(momentumPattern);
      }

      // Process and emit signals
      const signals: LiveSignal[] = [];
      for (const pattern of detectedPatterns) {
        // Check pattern maturity
        if (!this.checkPatternMaturity(pattern)) {
          continue;
        }

        // Score the pattern
        const quality = this.scorePattern(pattern, indicators);
        pattern.quality = quality;

        // Multi-timeframe confirmation
        const confirmed = await this.multiTimeframeConfirmation(bar.ticker, pattern.type);

        // Check for duplicates
        const isDuplicate = await this.isDuplicateSignal(bar.ticker, pattern.type);
        if (isDuplicate) {
          continue;
        }

        // Emit signal
        const signal = await this.emitSignal(pattern, confirmed);
        signals.push(signal);
      }

      return signals;

    } catch (error) {
      console.error('[RealtimeScanner] Error scanning for patterns:', error);
      return [];
    }
  }

  /**
   * Check if pattern is mature enough to trade
   */
  private checkPatternMaturity(pattern: Pattern): boolean {
    // Pattern-specific maturity rules
    switch (pattern.type) {
      case 'breakout-volume-surge':
        // Breakout must have volume > 2x average
        return pattern.signalData.indicators.volumeRatio >= 2.0;

      case 'gap-and-go':
        // Gap must be at least 1% from previous close
        const gapPercent = Math.abs(pattern.signalData.currentPrice - pattern.signalData.indicators.previousClose) / pattern.signalData.indicators.previousClose;
        return gapPercent >= 0.01;

      case 'cup-and-handle':
        // Handle consolidation must be at least 5 bars
        return pattern.signalData.indicators.handleBars >= 5;

      case 'bull-flag':
        // Flag must be at least 3 bars
        return pattern.signalData.indicators.flagBars >= 3;

      case 'vwap-bounce':
        // Price must be within 0.5% of VWAP
        const vwapDistance = Math.abs(pattern.signalData.currentPrice - pattern.signalData.indicators.vwap) / pattern.signalData.indicators.vwap;
        return vwapDistance <= 0.005;

      case 'momentum-surge':
        // Price must move >2% in short time
        return pattern.signalData.indicators.priceChangePercent >= 2.0;

      default:
        return true;
    }
  }

  /**
   * Score pattern quality (0-100)
   */
  private scorePattern(pattern: Pattern, indicators: TechnicalIndicators): number {
    let score = 50; // Base score

    // Factor 1: Volume (max +20)
    if (indicators.volumeRatio > 3) score += 20;
    else if (indicators.volumeRatio > 2) score += 15;
    else if (indicators.volumeRatio > 1.5) score += 10;
    else if (indicators.volumeRatio < 0.8) score -= 10;

    // Factor 2: RSI (max +15)
    if (pattern.type === 'breakout-volume-surge' || pattern.type === 'momentum-surge') {
      if (indicators.rsi > 50 && indicators.rsi < 70) score += 15; // Bullish but not overbought
      else if (indicators.rsi >= 70) score += 5; // Overbought warning
    }

    // Factor 3: Price vs VWAP (max +10)
    if (pattern.signalData.currentPrice > indicators.vwap) score += 10; // Above VWAP is bullish
    else score -= 5;

    // Factor 4: Trend alignment (max +15)
    if (pattern.signalData.currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50) {
      score += 15; // Strong uptrend
    } else if (pattern.signalData.currentPrice > indicators.sma20) {
      score += 10; // Above short-term average
    }

    // Factor 5: ATR for volatility (max +10)
    const atrPercent = (indicators.atr / pattern.signalData.currentPrice) * 100;
    if (atrPercent > 1 && atrPercent < 5) score += 10; // Good volatility range
    else if (atrPercent > 5) score -= 5; // Too volatile

    // Cap between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Multi-timeframe confirmation
   */
  async multiTimeframeConfirmation(ticker: string, patternType: string): Promise<boolean> {
    try {
      // Check if pattern appears on multiple timeframes
      const timeframes = ['1m', '5m', '15m'];
      let confirmedCount = 0;

      for (const tf of timeframes) {
        const bars = await this.getHistoricalBars(ticker, tf, 50);
        if (bars.length < 20) continue;

        const indicators = this.calculateIndicators(bars);

        // Simple confirmation: price action and volume aligned
        const lastBar = bars[bars.length - 1];
        const priceUp = lastBar.close > lastBar.open;
        const volumeUp = indicators.volumeRatio > 1.2;

        if (priceUp && volumeUp) {
          confirmedCount++;
        }
      }

      // At least 2 out of 3 timeframes must confirm
      return confirmedCount >= 2;

    } catch (error) {
      console.error('[RealtimeScanner] Multi-timeframe confirmation error:', error);
      return false;
    }
  }

  /**
   * Check for duplicate signals
   */
  async isDuplicateSignal(ticker: string, patternType: string): Promise<boolean> {
    const windowStart = Date.now() - this.DEDUPLICATION_WINDOW_MS;

    const query = `
      SELECT COUNT(*) as count
      FROM live_signals
      WHERE ticker = ?
        AND pattern_type = ?
        AND detection_time > datetime(?, 'unixepoch', 'localtime')
    `;

    const db = getDatabase();
    const result = db.prepare(query).get(ticker, patternType, Math.floor(windowStart / 1000)) as { count: number };
    return result.count > 0;
  }

  /**
   * Emit signal to database
   */
  async emitSignal(pattern: Pattern, multiTimeframeConfirmed: boolean): Promise<LiveSignal> {
    const signal: LiveSignal = {
      id: uuidv4(),
      agentId: '', // Will be populated by agent service
      ticker: pattern.ticker,
      patternType: pattern.type,
      detectionTime: new Date(pattern.timestamp),
      signalData: {
        ...pattern.signalData,
        patternQuality: pattern.quality,
        multiTimeframeConfirmed
      },
      status: 'DETECTED',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const query = `
      INSERT INTO live_signals (
        id, agent_id, ticker, pattern_type, detection_time, signal_data, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const db = getDatabase();
    db.prepare(query).run(
      signal.id,
      signal.agentId,
      signal.ticker,
      signal.patternType,
      signal.detectionTime.toISOString(),
      JSON.stringify(signal.signalData),
      signal.status,
      signal.createdAt.toISOString(),
      signal.updatedAt.toISOString()
    );

    console.log(`[RealtimeScanner] 🎯 Signal emitted: ${pattern.type} on ${pattern.ticker} (quality: ${pattern.quality})`);

    return signal;
  }

  // ===== PATTERN DETECTION METHODS =====

  /**
   * Pattern 1: Breakout with Volume Surge
   */
  private detectBreakoutVolumeSurge(bars: OHLCVBar[], indicators: TechnicalIndicators): Pattern | null {
    if (bars.length < 20) return null;

    const currentBar = bars[bars.length - 1];
    const previousBars = bars.slice(-20, -1);

    // Find recent resistance level (highest high in last 20 bars)
    const resistance = Math.max(...previousBars.map(b => b.high));

    // Check if current bar breaks above resistance
    const breakout = currentBar.close > resistance;

    // Volume must be significantly higher
    const volumeSurge = indicators.volumeRatio > 2.0;

    if (breakout && volumeSurge) {
      return {
        type: 'breakout-volume-surge',
        ticker: currentBar.ticker,
        quality: 0, // Will be scored later
        timestamp: currentBar.timestamp,
        signalData: {
          currentPrice: currentBar.close,
          volume: currentBar.volume,
          indicators: {
            ...this.indicatorsToRecord(indicators),
            resistanceLevel: resistance
          },
          patternQuality: 0,
          multiTimeframeConfirmed: false
        }
      };
    }

    return null;
  }

  /**
   * Pattern 2: Gap and Go
   */
  private detectGapAndGo(bars: OHLCVBar[], indicators: TechnicalIndicators): Pattern | null {
    if (bars.length < 2) return null;

    const currentBar = bars[bars.length - 1];
    const previousBar = bars[bars.length - 2];

    // Gap up detection
    const gapPercent = ((currentBar.open - previousBar.close) / previousBar.close) * 100;
    const hasGap = gapPercent > 1.0; // At least 1% gap up

    // Price must continue higher (go)
    const continuation = currentBar.close > currentBar.open;

    // Volume must be elevated
    const volumeSupport = indicators.volumeRatio > 1.5;

    if (hasGap && continuation && volumeSupport) {
      return {
        type: 'gap-and-go',
        ticker: currentBar.ticker,
        quality: 0,
        timestamp: currentBar.timestamp,
        signalData: {
          currentPrice: currentBar.close,
          volume: currentBar.volume,
          indicators: {
            ...this.indicatorsToRecord(indicators),
            gapPercent,
            previousClose: previousBar.close
          },
          patternQuality: 0,
          multiTimeframeConfirmed: false
        }
      };
    }

    return null;
  }

  /**
   * Pattern 3: Cup and Handle
   */
  private detectCupAndHandle(bars: OHLCVBar[], indicators: TechnicalIndicators): Pattern | null {
    if (bars.length < 30) return null;

    const currentBar = bars[bars.length - 1];
    const recentBars = bars.slice(-30);

    // Find the cup: U-shaped price movement
    const firstThird = recentBars.slice(0, 10);
    const middleThird = recentBars.slice(10, 20);
    const lastThird = recentBars.slice(20);

    const leftRim = Math.max(...firstThird.map(b => b.high));
    const bottom = Math.min(...middleThird.map(b => b.low));
    const rightRim = Math.max(...lastThird.map(b => b.high));

    // Cup shape: left rim ≈ right rim, bottom significantly lower
    const cupDepth = ((leftRim - bottom) / leftRim) * 100;
    const rimsAligned = Math.abs(leftRim - rightRim) / leftRim < 0.05;

    // Handle: consolidation in last 5-10 bars
    const handleBars = lastThird.slice(-10);
    const handleHigh = Math.max(...handleBars.map(b => b.high));
    const handleLow = Math.min(...handleBars.map(b => b.low));
    const handleRange = ((handleHigh - handleLow) / handleHigh) * 100;

    const validCup = cupDepth > 10 && cupDepth < 40 && rimsAligned;
    const validHandle = handleRange < 10; // Tight consolidation
    const breakout = currentBar.close > rightRim;

    if (validCup && validHandle && breakout) {
      return {
        type: 'cup-and-handle',
        ticker: currentBar.ticker,
        quality: 0,
        timestamp: currentBar.timestamp,
        signalData: {
          currentPrice: currentBar.close,
          volume: currentBar.volume,
          indicators: {
            ...this.indicatorsToRecord(indicators),
            cupDepth,
            handleBars: handleBars.length,
            rimLevel: rightRim
          },
          patternQuality: 0,
          multiTimeframeConfirmed: false
        }
      };
    }

    return null;
  }

  /**
   * Pattern 4: Bull Flag
   */
  private detectBullFlag(bars: OHLCVBar[], indicators: TechnicalIndicators): Pattern | null {
    if (bars.length < 15) return null;

    const currentBar = bars[bars.length - 1];

    // Flag pole: strong upward move
    const poleBars = bars.slice(-15, -5);
    const poleStart = poleBars[0].close;
    const poleEnd = poleBars[poleBars.length - 1].close;
    const poleGain = ((poleEnd - poleStart) / poleStart) * 100;

    // Flag: consolidation/pullback
    const flagBars = bars.slice(-5, -1);
    const flagHigh = Math.max(...flagBars.map(b => b.high));
    const flagLow = Math.min(...flagBars.map(b => b.low));
    const flagRange = ((flagHigh - flagLow) / flagHigh) * 100;

    // Breakout from flag
    const breakout = currentBar.close > flagHigh;

    const validPole = poleGain > 5; // At least 5% move
    const validFlag = flagRange < 5; // Tight consolidation
    const volumeDrying = indicators.volumeRatio < 1.0; // Volume should contract in flag

    if (validPole && validFlag && breakout) {
      return {
        type: 'bull-flag',
        ticker: currentBar.ticker,
        quality: 0,
        timestamp: currentBar.timestamp,
        signalData: {
          currentPrice: currentBar.close,
          volume: currentBar.volume,
          indicators: {
            ...this.indicatorsToRecord(indicators),
            poleGain,
            flagBars: flagBars.length,
            flagHigh
          },
          patternQuality: 0,
          multiTimeframeConfirmed: false
        }
      };
    }

    return null;
  }

  /**
   * Pattern 5: VWAP Bounce
   */
  private detectVWAPBounce(bars: OHLCVBar[], indicators: TechnicalIndicators): Pattern | null {
    if (bars.length < 10) return null;

    const currentBar = bars[bars.length - 1];
    const previousBars = bars.slice(-10, -1);

    // Price recently touched VWAP
    const touchedVWAP = previousBars.some(bar => {
      const distance = Math.abs(bar.low - indicators.vwap) / indicators.vwap;
      return distance < 0.003; // Within 0.3%
    });

    // Now bouncing up
    const bouncing = currentBar.close > indicators.vwap && currentBar.close > currentBar.open;

    // Volume confirmation
    const volumeSupport = indicators.volumeRatio > 1.2;

    if (touchedVWAP && bouncing && volumeSupport) {
      return {
        type: 'vwap-bounce',
        ticker: currentBar.ticker,
        quality: 0,
        timestamp: currentBar.timestamp,
        signalData: {
          currentPrice: currentBar.close,
          volume: currentBar.volume,
          indicators: {
            ...this.indicatorsToRecord(indicators),
            vwapDistance: ((currentBar.close - indicators.vwap) / indicators.vwap) * 100
          },
          patternQuality: 0,
          multiTimeframeConfirmed: false
        }
      };
    }

    return null;
  }

  /**
   * Pattern 6: Momentum Surge
   */
  private detectMomentumSurge(bars: OHLCVBar[], indicators: TechnicalIndicators): Pattern | null {
    if (bars.length < 5) return null;

    const currentBar = bars[bars.length - 1];
    const recentBars = bars.slice(-5);

    // Rapid price acceleration
    const startPrice = recentBars[0].close;
    const priceChange = ((currentBar.close - startPrice) / startPrice) * 100;

    // Volume must be surging
    const volumeSurge = indicators.volumeRatio > 2.5;

    // Price must be making new highs
    const newHigh = currentBar.high === Math.max(...recentBars.map(b => b.high));

    // Strong momentum
    const strongMove = priceChange > 2.0 && currentBar.close > currentBar.open;

    if (strongMove && volumeSurge && newHigh) {
      return {
        type: 'momentum-surge',
        ticker: currentBar.ticker,
        quality: 0,
        timestamp: currentBar.timestamp,
        signalData: {
          currentPrice: currentBar.close,
          volume: currentBar.volume,
          indicators: {
            ...this.indicatorsToRecord(indicators),
            priceChangePercent: priceChange
          },
          patternQuality: 0,
          multiTimeframeConfirmed: false
        }
      };
    }

    return null;
  }

  // ===== HELPER METHODS =====

  /**
   * Store bar in database
   */
  private async storeBar(bar: OHLCVBar): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO realtime_bars (
        ticker, timestamp, open, high, low, close, volume, timeframe, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    const db = getDatabase();
    db.prepare(query).run(
      bar.ticker,
      bar.timestamp,
      bar.open,
      bar.high,
      bar.low,
      bar.close,
      bar.volume,
      bar.timeframe
    );
  }

  /**
   * Get historical bars from database
   */
  private async getHistoricalBars(ticker: string, timeframe: string, limit: number): Promise<OHLCVBar[]> {
    const query = `
      SELECT * FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const db = getDatabase();
    const rows = db.prepare(query).all(ticker, timeframe, limit) as any[];
    return rows.reverse().map(row => ({
      ticker: row.ticker,
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      timeframe: row.timeframe
    }));
  }

  /**
   * Calculate technical indicators
   */
  private calculateIndicators(bars: OHLCVBar[]): TechnicalIndicators {
    const closes = bars.map(b => b.close);
    const volumes = bars.map(b => b.volume);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);

    // RSI (14-period)
    const rsi = this.calculateRSI(closes, 14);

    // VWAP
    const vwap = this.calculateVWAP(bars);

    // Volume Ratio (current vs 20-period average)
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = bars[bars.length - 1].volume / avgVolume;

    // ATR (14-period)
    const atr = this.calculateATR(highs, lows, closes, 14);

    // Simple Moving Averages
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);

    return {
      rsi,
      vwap,
      volumeRatio,
      atr,
      sma20,
      sma50
    };
  }

  /**
   * Calculate RSI
   */
  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;

    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    const gains = changes.slice(-period).map(c => c > 0 ? c : 0);
    const losses = changes.slice(-period).map(c => c < 0 ? Math.abs(c) : 0);

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate VWAP
   */
  private calculateVWAP(bars: OHLCVBar[]): number {
    let cumVolume = 0;
    let cumVolumePrice = 0;

    for (const bar of bars) {
      const typical = (bar.high + bar.low + bar.close) / 3;
      cumVolumePrice += typical * bar.volume;
      cumVolume += bar.volume;
    }

    return cumVolume === 0 ? 0 : cumVolumePrice / cumVolume;
  }

  /**
   * Calculate ATR
   */
  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return 0;

    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
    return atr;
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1];

    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Convert indicators to record format
   */
  private indicatorsToRecord(indicators: TechnicalIndicators): Record<string, number> {
    return {
      rsi: indicators.rsi,
      vwap: indicators.vwap,
      volumeRatio: indicators.volumeRatio,
      atr: indicators.atr,
      sma20: indicators.sma20,
      sma50: indicators.sma50
    };
  }
}
