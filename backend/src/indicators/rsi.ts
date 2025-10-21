/**
 * Relative Strength Index (RSI) Indicator
 */

import { BaseIndicator } from './base';
import { OHLCVBar } from '../types/strategy.types';

export class RSI extends BaseIndicator {
  private period: number;
  private source: 'open' | 'high' | 'low' | 'close';

  constructor(id: string, params: { period?: number; source?: 'open' | 'high' | 'low' | 'close' }) {
    super(id, params);
    this.period = params.period || 14;
    this.source = params.source || 'close';
  }

  calculate(data: OHLCVBar[], index: number): number | null {
    if (index < this.period) {
      return null; // Not enough data (need period + 1 for price changes)
    }

    let gains = 0;
    let losses = 0;

    // Calculate average gains and losses over the period
    for (let i = index - this.period + 1; i <= index; i++) {
      const change = data[i][this.source] - data[i - 1][this.source];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / this.period;
    const avgLoss = losses / this.period;

    if (avgLoss === 0) {
      return 100; // No losses means RSI is 100
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  getRequiredBars(): number {
    return this.period + 1; // Need one extra bar to calculate price change
  }
}
