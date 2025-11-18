/**
 * Market State Manager
 *
 * Maintains in-memory sliding window of bar data for all tickers.
 * Updates indicators incrementally as new bars arrive.
 */

import { Bar, TickerState, Indicators } from '../patterns/types';
import logger from '../../services/logger.service';

class MarketState {
  private state: Map<string, TickerState> = new Map();
  private readonly MAX_BARS = 300;  // keep more history to support premarket-aware patterns

  /**
   * Update or add a bar for a ticker
   */
  updateBar(ticker: string, bar: Bar): void {
    let tickerState = this.state.get(ticker);

    if (!tickerState) {
      tickerState = {
        ticker,
        bars: [],
        indicators: {},
        metadata: {}
      };
      this.state.set(ticker, tickerState);
    }

    // Check if this bar already exists (update) or is new (append)
    const lastBar = tickerState.bars[tickerState.bars.length - 1];

    if (lastBar && lastBar.timestamp === bar.timestamp) {
      // Update existing bar (e.g., during aggregation)
      tickerState.bars[tickerState.bars.length - 1] = bar;
    } else {
      // Add new bar
      tickerState.bars.push(bar);

      // Keep only recent bars
      if (tickerState.bars.length > this.MAX_BARS) {
        tickerState.bars.shift();
      }
    }

    // Update indicators
    this.updateIndicators(tickerState);
    this.updateMetadata(tickerState);
  }

  /**
   * Get state for a ticker
   */
  getState(ticker: string): TickerState | undefined {
    return this.state.get(ticker);
  }

  /**
   * Get all tickers being tracked
   */
  getAllTickers(): string[] {
    return Array.from(this.state.keys());
  }

  /**
   * Get number of tickers being tracked
   */
  getTickerCount(): number {
    return this.state.size;
  }

  /**
   * Clear all state (useful for testing)
   */
  clear(): void {
    this.state.clear();
  }

  /**
   * Remove a ticker from tracking
   */
  removeTicker(ticker: string): void {
    this.state.delete(ticker);
  }

  /**
   * Get memory usage summary
   */
  getMemoryStats(): { tickers: number; totalBars: number; avgBarsPerTicker: number } {
    const tickers = this.state.size;
    let totalBars = 0;

    for (const state of this.state.values()) {
      totalBars += state.bars.length;
    }

    return {
      tickers,
      totalBars,
      avgBarsPerTicker: tickers > 0 ? totalBars / tickers : 0
    };
  }

  /**
   * Update technical indicators for a ticker
   */
  private updateIndicators(state: TickerState): void {
    const bars = state.bars;
    const indicators: Indicators = {};

    if (bars.length === 0) {
      state.indicators = indicators;
      return;
    }

    // Average Volume (20 bars)
    if (bars.length >= 20) {
      const sum = bars.slice(-20).reduce((s, b) => s + b.volume, 0);
      indicators.avgVolume = sum / 20;
    }

    // SMA20
    if (bars.length >= 20) {
      const sum = bars.slice(-20).reduce((s, b) => s + b.close, 0);
      indicators.sma20 = sum / 20;
    }

    // SMA50
    if (bars.length >= 50) {
      const sum = bars.slice(-50).reduce((s, b) => s + b.close, 0);
      indicators.sma50 = sum / 50;
    }

    // VWAP (session-based - RTH only to avoid extended hours pollution)
    const todayRTHBars = this.getTodayBars(bars).filter(b => b.isRTH);
    if (todayRTHBars.length > 0) {
      const totalVolPrice = todayRTHBars.reduce((sum, b) =>
        sum + ((b.high + b.low + b.close) / 3) * b.volume, 0);
      const totalVol = todayRTHBars.reduce((sum, b) => sum + b.volume, 0);
      indicators.vwap = totalVol > 0 ? totalVolPrice / totalVol : undefined;
    }

    // RSI (14 periods)
    if (bars.length >= 15) {
      indicators.rsi = this.calculateRSI(bars, 14);
    }

    state.indicators = indicators;
  }

  /**
   * Update metadata (prev day close, today's high/low, etc.)
   * CRITICAL: Uses RTH-only bars to avoid extended hours pollution
   */
  private updateMetadata(state: TickerState): void {
    const bars = state.bars;

    if (bars.length === 0) {
      return;
    }

    // Filter for RTH bars only
    const todayRTHBars = this.getTodayBars(bars).filter(b => b.isRTH);
    const yesterdayRTHBars = this.getYesterdayBars(bars).filter(b => b.isRTH);

    // Previous day close (RTH only - 16:00 ET close)
    if (yesterdayRTHBars.length > 0) {
      state.metadata!.prevDayClose = yesterdayRTHBars[yesterdayRTHBars.length - 1].close;
    }

    // Today's open, high, low (RTH only - 09:30-16:00 ET)
    if (todayRTHBars.length > 0) {
      state.metadata!.todayOpen = todayRTHBars[0].open;  // First RTH bar (09:30)
      state.metadata!.todayHigh = Math.max(...todayRTHBars.map(b => b.high));
      state.metadata!.todayLow = Math.min(...todayRTHBars.map(b => b.low));
    }
  }

  /**
   * Get today's bars only
   * Uses bar.date field (ET timezone) instead of local machine timezone
   */
  private getTodayBars(bars: Bar[]): Bar[] {
    if (bars.length === 0) return [];

    const todayET = bars[bars.length - 1].date;  // YYYY-MM-DD in ET
    return bars.filter(b => b.date === todayET);
  }

  /**
   * Get yesterday's bars
   * Uses bar.date field (ET timezone) instead of local machine timezone
   */
  private getYesterdayBars(bars: Bar[]): Bar[] {
    if (bars.length === 0) return [];

    const todayET = bars[bars.length - 1].date;

    // Find the most recent date before today
    const dates = [...new Set(bars.map(b => b.date))].sort().reverse();
    const yesterdayDate = dates.find(d => d < todayET);

    if (!yesterdayDate) return [];

    return bars.filter(b => b.date === yesterdayDate);
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(bars: Bar[], period: number): number | undefined {
    if (bars.length < period + 1) return undefined;

    const recentBars = bars.slice(-(period + 1));
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < recentBars.length; i++) {
      const change = recentBars[i].close - recentBars[i - 1].close;

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
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }
}

// Singleton instance
export const marketState = new MarketState();
