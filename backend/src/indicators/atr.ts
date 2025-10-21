/**
 * Average True Range (ATR) Indicator
 */

import { BaseIndicator } from './base';
import { OHLCVBar } from '../types/strategy.types';

export class ATR extends BaseIndicator {
  private period: number;

  constructor(id: string, params: { period?: number }) {
    super(id, params);
    this.period = params.period || 14;
  }

  calculate(data: OHLCVBar[], index: number): number | null {
    if (index < this.period) {
      return null; // Not enough data (need period + 1 for previous close)
    }

    let trSum = 0;

    for (let i = index - this.period + 1; i <= index; i++) {
      const tr = this.calculateTrueRange(data, i);
      trSum += tr;
    }

    return trSum / this.period;
  }

  /**
   * Calculate True Range for a single bar
   */
  private calculateTrueRange(data: OHLCVBar[], index: number): number {
    const current = data[index];

    if (index === 0) {
      // First bar: TR = high - low
      return current.high - current.low;
    }

    const previous = data[index - 1];

    // TR = max(high - low, |high - previous close|, |low - previous close|)
    const highLow = current.high - current.low;
    const highPrevClose = Math.abs(current.high - previous.close);
    const lowPrevClose = Math.abs(current.low - previous.close);

    return Math.max(highLow, highPrevClose, lowPrevClose);
  }

  getRequiredBars(): number {
    return this.period + 1; // Need one extra bar for previous close
  }
}
