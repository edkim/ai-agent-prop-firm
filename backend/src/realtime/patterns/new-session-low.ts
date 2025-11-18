/**
 * New Session Low Pattern
 *
 * Detects when price makes a new low for the current RTH session.
 * Can be used for:
 * - Breakdown momentum plays
 * - Reversal/bounce setups
 * - Stop hunting detection
 */

import { Pattern, TickerState, Signal } from './types';

export const NewSessionLow: Pattern = {
  name: 'New Session Low',
  description: 'Price breaks below session low (potential breakdown or reversal)',
  minBars: 5,  // Need at least a few bars to establish session range

  shouldScan(state: TickerState): boolean {
    // Need RTH bars
    const rthBars = state.bars.filter(b => b.isRTH);
    if (rthBars.length < 5) return false;

    // Need today's low to be established
    if (!state.metadata?.todayLow) return false;

    return true;
  },

  scan(state: TickerState): Signal | null {
    const bars = state.bars;
    const current = bars[bars.length - 1];

    // Only scan RTH bars
    if (!current.isRTH) return null;

    const rthBars = bars.filter(b => b.isRTH && b.date === current.date);
    if (rthBars.length < 5) return null;

    // Get session low BEFORE current bar
    const priorBars = rthBars.slice(0, -1);
    if (priorBars.length === 0) return null;

    const sessionLowBeforeCurrent = Math.min(...priorBars.map(b => b.low));

    // Check if current bar made a new session low
    if (current.low >= sessionLowBeforeCurrent) return null;

    // New session low detected!
    const breakAmount = sessionLowBeforeCurrent - current.low;
    const breakPercent = (breakAmount / sessionLowBeforeCurrent) * 100;

    // Calculate how far from session open
    const sessionOpen = state.metadata?.todayOpen || rthBars[0].open;
    const declineFromOpen = ((sessionOpen - current.low) / sessionOpen) * 100;

    // Calculate confidence
    // Higher confidence if:
    // - Larger break (up to 0.5%)
    // - Higher volume
    // - Larger decline from open
    const breakScore = Math.min((breakPercent / 0.5) * 30, 30);
    const volumeRatio = state.indicators.avgVolume
      ? current.volume / state.indicators.avgVolume
      : 1;
    const volumeScore = Math.min((volumeRatio / 2) * 30, 30);
    const declineScore = Math.min((declineFromOpen / 3) * 40, 40);

    const confidence = Math.floor(breakScore + volumeScore + declineScore);

    // Entry: current price (we're already at the new low)
    // Stop: slightly above the break point (invalidation)
    // Target: reversion to VWAP or previous support
    const entry = current.close;
    const stop = sessionLowBeforeCurrent * 1.002;  // 0.2% above break point
    const vwap = state.indicators.vwap || entry;

    // Target: halfway back to VWAP (conservative reversal)
    const target = entry + (vwap - entry) * 0.5;

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
        sessionLowBeforeCurrent,
        newSessionLow: current.low,
        breakAmount: Math.round(breakAmount * 100) / 100,
        breakPercent: Math.round(breakPercent * 1000) / 1000,
        declineFromOpen: Math.round(declineFromOpen * 100) / 100,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        minutesIntoSession,
        sessionOpen,
        vwap
      }
    };
  }
};
