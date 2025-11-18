/**
 * VWAP Fade Pattern
 *
 * Detects weak stocks that fade below VWAP and stay there throughout the session.
 * This pattern works best in risk-off environments when the broader market is weak.
 *
 * Pattern characteristics:
 * - Stock opens with some initial strength or weakness
 * - Fails to hold gains or continues lower
 * - 60-80%+ of bars trade BELOW VWAP
 * - Few meaningful recovery attempts
 * - Gradually grinds lower throughout session
 *
 * Best conditions:
 * - Market is risk-off (QQQ, SPY red)
 * - During intraday fades (10:00 AM - 3:00 PM ET)
 * - Stocks with decent volume
 * - Works on 5-minute RTH bars
 */

import { Pattern, TickerState, Signal } from './types';

export const VWAPFade: Pattern = {
  name: 'VWAP Fade',
  description: 'Stock trading below VWAP for majority of session (weakness)',
  minBars: 15,  // Need at least 75 minutes of data

  shouldScan(state: TickerState): boolean {
    // Need RTH bars
    const rthBars = state.bars.filter(b => b.isRTH);
    if (rthBars.length < 15) return false;

    // Need VWAP to be calculated
    if (!state.indicators?.vwap) return false;

    // Only scan during RTH (skip pre-market/after-hours)
    const current = state.bars[state.bars.length - 1];
    if (!current.isRTH) return false;

    return true;
  },

  scan(state: TickerState): Signal | null {
    const bars = state.bars;
    const current = bars[bars.length - 1];

    // Only process RTH bars
    if (!current.isRTH) return null;

    // Get RTH bars from today only
    const todayRTHBars = bars.filter(b => b.isRTH && b.date === current.date);
    if (todayRTHBars.length < 15) return null;

    // Use last 40 bars (200 minutes) for analysis, or all available if less
    const analysisWindow = Math.min(40, todayRTHBars.length);
    const recentBars = todayRTHBars.slice(-analysisWindow);

    // Calculate VWAP for each bar in the window
    const vwaps: number[] = [];
    let cumulativePV = 0;
    let cumulativeV = 0;

    for (const bar of todayRTHBars) {
      const tp = (bar.high + bar.low + bar.close) / 3;
      cumulativePV += tp * bar.volume;
      cumulativeV += bar.volume;
      vwaps.push(cumulativePV / cumulativeV);
    }

    const recentVwaps = vwaps.slice(-analysisWindow);

    // Analyze pattern
    let barsBelow = 0;
    let recoveryAttempts = 0;
    let maxDeviation = 0;
    let prevAbove = false;

    for (let i = 0; i < recentBars.length; i++) {
      const bar = recentBars[i];
      const vwap = recentVwaps[i];
      const below = bar.close < vwap;

      if (below) {
        barsBelow++;
        const deviation = vwap - bar.close;
        maxDeviation = Math.max(maxDeviation, deviation);
      } else if (prevAbove === false && i > 0) {
        // Count when price crosses back above VWAP (recovery attempt)
        recoveryAttempts++;
      }

      prevAbove = !below;
    }

    const percentBarsBelow = (barsBelow / analysisWindow) * 100;

    // Need at least 60% of bars below VWAP to signal
    if (percentBarsBelow < 60) return null;

    // Get current VWAP and price
    const currentVwap = vwaps[vwaps.length - 1];
    const percentBelowVwap = ((currentVwap - current.close) / currentVwap) * 100;

    // Determine pattern status
    let status: 'EMERGING' | 'CONFIRMED' | 'EXTREME' = 'EMERGING';
    if (percentBarsBelow >= 80 && maxDeviation > 0.5) {
      status = 'EXTREME';
    } else if (percentBarsBelow >= 70 && recoveryAttempts <= 2) {
      status = 'CONFIRMED';
    }

    // Calculate confidence/strength score
    // - Consistency: How many bars below VWAP (0-100)
    // - Deviation: How far below VWAP (0-100, scaled by $0.50 = 100)
    // - Recovery resistance: Fewer recoveries = stronger (0-40)
    const consistencyScore = Math.min(100, percentBarsBelow);
    const deviationScore = Math.min(100, (maxDeviation / 0.5) * 100);
    const recoveryScore = Math.max(0, 40 - (recoveryAttempts * 10));

    const confidence = Math.floor(
      consistencyScore * 0.5 +  // 50% weight on consistency
      deviationScore * 0.3 +    // 30% weight on deviation
      recoveryScore * 0.2       // 20% weight on recovery resistance
    );

    // Calculate fade from session open
    const sessionOpen = state.metadata?.todayOpen || todayRTHBars[0].open;
    const fadeFromOpen = ((sessionOpen - current.close) / sessionOpen) * 100;

    // Entry: current price (for shorting)
    // Stop: above VWAP (invalidation if price reclaims VWAP)
    // Target: based on deviation, assume continuation
    const entry = current.close;
    const stop = currentVwap * 1.002;  // 0.2% above VWAP

    // Target: extension of the max deviation
    const target = entry - maxDeviation;

    // Calculate time into session
    const minutesIntoSession = todayRTHBars.length * 5;

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
        status,
        percentBarsBelow: Math.round(percentBarsBelow * 10) / 10,
        barsBelow,
        totalBars: analysisWindow,
        currentVwap: Math.round(currentVwap * 100) / 100,
        percentBelowVwap: Math.round(percentBelowVwap * 100) / 100,
        maxDeviation: Math.round(maxDeviation * 100) / 100,
        recoveryAttempts,
        fadeFromOpen: Math.round(fadeFromOpen * 100) / 100,
        sessionOpen: Math.round(sessionOpen * 100) / 100,
        minutesIntoSession,
        // Context
        prevDayClose: state.metadata?.prevDayClose,
        // Risk/reward
        riskReward: Math.abs((target - entry) / (stop - entry)).toFixed(2)
      }
    };
  }
};
