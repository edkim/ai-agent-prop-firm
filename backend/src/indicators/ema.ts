/**
 * Exponential Moving Average (EMA) Indicator
 */

import { BaseIndicator } from './base';
import { OHLCVBar } from '../types/strategy.types';

export class EMA extends BaseIndicator {
  private period: number;
  private source: 'open' | 'high' | 'low' | 'close';
  private multiplier: number;
  private previousEMA: number | null = null;

  constructor(id: string, params: { period: number; source?: 'open' | 'high' | 'low' | 'close' }) {
    super(id, params);
    this.period = params.period || 20;
    this.source = params.source || 'close';
    this.multiplier = 2 / (this.period + 1);
  }

  calculate(data: OHLCVBar[], index: number): number | null {
    if (index < this.period - 1) {
      return null; // Not enough data
    }

    const currentPrice = data[index][this.source];

    // First EMA value is SMA
    if (index === this.period - 1) {
      let sum = 0;
      for (let i = 0; i <= index; i++) {
        sum += data[i][this.source];
      }
      this.previousEMA = sum / this.period;
      return this.previousEMA;
    }

    // Calculate EMA: (Current Price - Previous EMA) * Multiplier + Previous EMA
    if (this.previousEMA === null) {
      // Need to calculate all previous EMAs first
      for (let i = this.period - 1; i < index; i++) {
        this.calculate(data, i);
      }
    }

    const ema = (currentPrice - this.previousEMA!) * this.multiplier + this.previousEMA!;
    this.previousEMA = ema;
    return ema;
  }

  calculateAll(data: OHLCVBar[]): (number | null)[] {
    // Reset state
    this.previousEMA = null;
    return super.calculateAll(data) as (number | null)[];
  }

  getRequiredBars(): number {
    return this.period;
  }
}
