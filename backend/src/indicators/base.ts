/**
 * Base Indicator Class
 */

import { OHLCVBar } from '../types/strategy.types';

export abstract class BaseIndicator {
  protected id: string;
  protected params: Record<string, any>;

  constructor(id: string, params: Record<string, any> = {}) {
    this.id = id;
    this.params = params;
  }

  /**
   * Calculate indicator value at a specific index
   */
  abstract calculate(data: OHLCVBar[], index: number): number | { [key: string]: number } | null;

  /**
   * Calculate indicator for entire dataset
   */
  calculateAll(data: OHLCVBar[]): (number | { [key: string]: number } | null)[] {
    const results: (number | { [key: string]: number } | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      results.push(this.calculate(data, i));
    }
    return results;
  }

  /**
   * Get minimum number of bars required for calculation
   */
  abstract getRequiredBars(): number;

  getId(): string {
    return this.id;
  }

  getParams(): Record<string, any> {
    return this.params;
  }
}
