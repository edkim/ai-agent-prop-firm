/**
 * Gap and Hold Pattern
 *
 * Looks for stocks that gap up 2%+ and hold above previous day's close.
 * Enters when:
 * - Gap >= 2%
 * - Current price > previous close
 * - Volume >= 1.5x average
 */

import { Pattern, TickerState, Signal } from './types';

export const GapAndHold: Pattern = {
  name: 'Gap and Hold',
  description: 'Gap up 2%+ and holding above previous close with volume',
  minBars: 20,

  shouldScan(state: TickerState): boolean {
    // Need enough bars for indicators
    if (state.bars.length < 20) return false;

    // Need prev day close (RTH only)
    if (!state.metadata?.prevDayClose) return false;

    // Need today's RTH open
    const todayOpen = state.metadata?.todayOpen;
    if (!todayOpen) return false;

    // Pre-filter: Check if there's even a gap
    const prevClose = state.metadata.prevDayClose;
    const gapPercent = ((todayOpen - prevClose) / prevClose) * 100;

    // Only scan if gap >= 2.0% (aligned with scan threshold)
    return gapPercent >= 2.0;
  },

  scan(state: TickerState): Signal | null {
    const bars = state.bars;
    const current = bars[bars.length - 1];
    const prevDayClose = state.metadata?.prevDayClose;

    if (!prevDayClose) return null;

    // Calculate gap %
    const todayOpen = state.metadata?.todayOpen || current.open;
    const gapPercent = ((todayOpen - prevDayClose) / prevDayClose) * 100;

    // Must gap at least 2%
    if (gapPercent < 2.0) return null;

    // Must still be holding above previous close (allow 0.2% slippage)
    if (current.low < prevDayClose * 0.998) return null;

    // Check volume
    const avgVolume = state.indicators.avgVolume;
    if (!avgVolume || current.volume < avgVolume * 1.5) return null;

    // Calculate how well it's holding
    const holdStrength = ((current.low - prevDayClose) / prevDayClose) * 100;

    // Calculate confidence
    // Base: 40 points
    // Gap strength: up to 30 points (max at 5% gap)
    // Hold strength: up to 20 points
    // Volume: up to 10 points (max at 3x avg)
    const gapScore = Math.min((gapPercent / 5) * 30, 30);
    const holdScore = Math.min(holdStrength * 10, 20);
    const volumeRatio = current.volume / avgVolume;
    const volumeScore = Math.min((volumeRatio / 3) * 10, 10);
    const confidence = Math.floor(40 + gapScore + holdScore + volumeScore);

    // Entry: current price
    // Stop: previous day close (invalidation level)
    // Target: entry + (entry - stop) for 1:1 R:R (can be adjusted)
    const entry = current.close;
    const stop = prevDayClose;
    const riskAmount = entry - stop;
    const target = entry + riskAmount;  // 1:1 R:R

    return {
      ticker: state.ticker,
      pattern: this.name,
      timestamp: current.timestamp,
      time: current.time,
      entry,
      stop,
      target,
      confidence,
      metadata: {
        gapPercent: Math.round(gapPercent * 100) / 100,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        holdStrength: Math.round(holdStrength * 100) / 100,
        prevDayClose,
        todayOpen,
        todayHigh: state.metadata?.todayHigh,
        todayLow: state.metadata?.todayLow
      }
    };
  }
};
