/**
 * New Session High Pattern
 *
 * Detects when price makes a new high for the current RTH session.
 * Can be used for:
 * - Breakout momentum plays
 * - Trend continuation
 * - Resistance breaks
 */

import { Pattern, TickerState, Signal } from './types';

export const NewSessionHigh: Pattern = {
  name: 'New Session High',
  description: 'Price breaks above session high (potential breakout or fade)',
  minBars: 5,  // Need at least a few bars to establish session range

  shouldScan(state: TickerState): boolean {
    // Need RTH bars
    const rthBars = state.bars.filter(b => b.isRTH);
    if (rthBars.length < 5) return false;

    // Need today's high to be established
    if (!state.metadata?.todayHigh) return false;

    return true;
  },

  scan(state: TickerState): Signal | null {
    const bars = state.bars;
    const current = bars[bars.length - 1];

    // Only scan RTH bars
    if (!current.isRTH) return null;

    const rthBars = bars.filter(b => b.isRTH && b.date === current.date);
    if (rthBars.length < 5) return null;

    // Get session high BEFORE current bar
    const priorBars = rthBars.slice(0, -1);
    if (priorBars.length === 0) return null;

    const sessionHighBeforeCurrent = Math.max(...priorBars.map(b => b.high));

    // Check if current bar made a new session high
    if (current.high <= sessionHighBeforeCurrent) return null;

    // New session high detected!
    const breakAmount = current.high - sessionHighBeforeCurrent;
    const breakPercent = (breakAmount / sessionHighBeforeCurrent) * 100;

    // Calculate how far from session open
    const sessionOpen = state.metadata?.todayOpen || rthBars[0].open;
    const rallyFromOpen = ((current.high - sessionOpen) / sessionOpen) * 100;

    // Check if price is above VWAP (bullish confirmation)
    const vwap = state.indicators.vwap || current.close;
    const aboveVWAP = current.close > vwap;

    // Calculate confidence
    // Higher confidence if:
    // - Larger break (up to 0.5%)
    // - Higher volume
    // - Larger rally from open
    // - Above VWAP (trend confirmation)
    const breakScore = Math.min((breakPercent / 0.5) * 25, 25);
    const volumeRatio = state.indicators.avgVolume
      ? current.volume / state.indicators.avgVolume
      : 1;
    const volumeScore = Math.min((volumeRatio / 2) * 25, 25);
    const rallyScore = Math.min((rallyFromOpen / 3) * 30, 30);
    const vwapScore = aboveVWAP ? 20 : 0;

    const confidence = Math.floor(breakScore + volumeScore + rallyScore + vwapScore);

    // Entry: current price (we're at the new high)
    // Stop: slightly below the break point (invalidation)
    // Target: extension based on session range
    const entry = current.close;
    const stop = sessionHighBeforeCurrent * 0.998;  // 0.2% below break point

    // Target: extension equal to the break amount
    const target = entry + breakAmount;

    // Calculate time into session
    const minutesIntoSession = rthBars.length * 5;

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
        sessionHighBeforeCurrent,
        newSessionHigh: current.high,
        breakAmount: Math.round(breakAmount * 100) / 100,
        breakPercent: Math.round(breakPercent * 1000) / 1000,
        rallyFromOpen: Math.round(rallyFromOpen * 100) / 100,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        minutesIntoSession,
        sessionOpen,
        vwap,
        aboveVWAP
      }
    };
  }
};
