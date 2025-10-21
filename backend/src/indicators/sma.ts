/**
 * Simple Moving Average (SMA) Indicator
 */

import { BaseIndicator } from './base';
import { OHLCVBar } from '../types/strategy.types';

export class SMA extends BaseIndicator {
  private period: number;
  private source: 'open' | 'high' | 'low' | 'close';

  constructor(id: string, params: { period: number; source?: 'open' | 'high' | 'low' | 'close' }) {
    super(id, params);
    this.period = params.period || 20;
    this.source = params.source || 'close';
  }

  calculate(data: OHLCVBar[], index: number): number | null {
    if (index < this.period - 1) {
      return null; // Not enough data
    }

    let sum = 0;
    for (let i = index - this.period + 1; i <= index; i++) {
      sum += data[i][this.source];
    }

    return sum / this.period;
  }

  getRequiredBars(): number {
    return this.period;
  }
}
