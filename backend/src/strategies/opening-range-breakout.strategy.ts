/**
 * Opening Range Breakout Strategy
 *
 * Entry:
 * - Wait for opening range to establish (first N minutes, default 5)
 * - Enter long when price breaks above opening range high
 * - Optional: Require earnings on entry day
 * - Optional: Require market filter (e.g., QQQ) to be positive
 *
 * Exit:
 * - Market close (4:00 PM ET)
 * - Optional: Trailing stop
 *
 * No lookahead bias - can only enter AFTER opening range is established
 */

import { BaseStrategy, StrategyConfig, StrategyMetadata } from './base.strategy';
import { OHLCVBar, Position, EvaluationContext } from '../types/strategy.types';

export interface ORBStrategyConfig extends StrategyConfig {
  openingRangeMinutes: number; // Duration of opening range (e.g., 5 for 9:30-9:35)
  marketFilterTicker?: string; // Optional filter ticker (e.g., 'QQQ')
  trailingStopPercent?: number; // Optional trailing stop percentage
  requireEarnings?: boolean; // Only trade on earnings days
}

export class OpeningRangeBreakoutStrategy extends BaseStrategy {
  private orbConfig: ORBStrategyConfig;
  private openingRangeHigh: number = 0;
  private openingRangeLow: number = 0;
  private openingRangeEstablished: boolean = false;
  private openingRangeIndex: number = -1;
  private marketCloseTime: string = '16:00'; // 4:00 PM ET (or 20:00 UTC)
  private highestPriceInTrade: number = 0; // Track for trailing stop

  constructor(config: ORBStrategyConfig) {
    super(config);
    this.orbConfig = {
      ...config,
      openingRangeMinutes: config.openingRangeMinutes || 5,
      requireEarnings: config.requireEarnings || false,
    };
  }

  getMetadata(): StrategyMetadata {
    return {
      name: 'Opening Range Breakout',
      description: 'Breaks above the opening range high with optional market filter and trailing stop',
      author: 'Claude',
      version: '1.0.0',
      parameters: [
        {
          name: 'openingRangeMinutes',
          type: 'number',
          description: 'Duration of opening range in minutes',
          defaultValue: 5,
        },
        {
          name: 'marketFilterTicker',
          type: 'string',
          description: 'Optional market filter ticker (e.g., QQQ)',
          defaultValue: '',
        },
        {
          name: 'trailingStopPercent',
          type: 'number',
          description: 'Trailing stop percentage (e.g., 2.5 for 2.5%)',
          defaultValue: 0,
        },
        {
          name: 'requireEarnings',
          type: 'boolean',
          description: 'Only trade on days with earnings announcements',
          defaultValue: false,
        },
      ],
    };
  }

  init(bars: OHLCVBar[]): void {
    // Reset state
    this.openingRangeEstablished = false;
    this.openingRangeHigh = 0;
    this.openingRangeLow = 0;
    this.openingRangeIndex = -1;
    this.highestPriceInTrade = 0;

    // Find the opening range bar (9:30 AM bar)
    // Could be 09:30 (local) or 13:30 (UTC)
    this.openingRangeIndex = bars.findIndex(
      (bar) => bar.timeOfDay === '09:30' || bar.timeOfDay === '13:30'
    );

    if (this.openingRangeIndex === -1) {
      console.warn('ORB Strategy: Could not find 9:30 AM bar for opening range');
      return;
    }

    const openingBar = bars[this.openingRangeIndex];
    this.openingRangeHigh = openingBar.high;
    this.openingRangeLow = openingBar.low;
    this.openingRangeEstablished = true;

    console.log(
      `ORB Strategy initialized: Opening Range High: $${this.openingRangeHigh.toFixed(2)}, Low: $${this.openingRangeLow.toFixed(2)}`
    );
  }

  checkEntry(context: EvaluationContext): boolean {
    // Can't enter if opening range not established
    if (!this.openingRangeEstablished) {
      return false;
    }

    // CRITICAL: Prevent lookahead bias
    // Can't enter until AFTER opening range period ends
    // If opening range is at index N, can only enter from index N+1 onwards
    if (context.currentIndex <= this.openingRangeIndex) {
      return false;
    }

    // Can't enter before opening range ends (time check as backup)
    const currentTime = context.currentBar.timeOfDay || '';
    if (currentTime < '09:35' && currentTime >= '09:30') {
      return false;
    }

    // Check earnings filter if required
    if (this.orbConfig.requireEarnings && !context.earningsToday) {
      return false;
    }

    // Check if price broke above opening range high
    const breakout = context.currentBar.high > this.openingRangeHigh;
    if (!breakout) {
      return false;
    }

    // Check market filter if configured
    if (this.orbConfig.marketFilterTicker && context.dependencyBars) {
      const filterTicker = this.orbConfig.marketFilterTicker;
      const filterBar = context.dependencyBars.get(filterTicker);

      if (!filterBar) {
        console.warn(`Market filter ticker ${filterTicker} not found in dependencies`);
        return false;
      }

      // Find the opening bar for filter ticker to compare against
      const filterData = context.dependencyData?.get(filterTicker);
      if (!filterData || filterData.length === 0) {
        return false;
      }

      // Find 9:30 AM bar for filter ticker
      const filterOpeningBar = filterData.find(
        (bar) => bar.timeOfDay === '09:30' || bar.timeOfDay === '13:30'
      );

      if (!filterOpeningBar) {
        return false;
      }

      // Check if filter ticker is positive (current close > opening bar open)
      const filterPositive = filterBar.close > filterOpeningBar.open;

      if (!filterPositive) {
        return false;
      }
    }

    // All conditions met
    return true;
  }

  checkExit(context: EvaluationContext): boolean {
    // Exit at market close (4:00 PM)
    const currentTime = context.currentBar.timeOfDay || '';
    if (currentTime === this.marketCloseTime || currentTime === '20:00') {
      return true;
    }

    // Trailing stop handled by updateTrailingStop and backtest engine
    return false;
  }

  calculatePositionSize(context: EvaluationContext): number {
    // Use 100% of portfolio (or whatever is available)
    const price = context.currentBar.close;
    const availableCash = context.portfolio.cash;

    // Calculate shares we can afford
    const shares = Math.floor(availableCash / price);

    return shares;
  }

  updateTrailingStop(position: Position, context: EvaluationContext): number | undefined {
    if (!this.orbConfig.trailingStopPercent) {
      return undefined; // No trailing stop
    }

    const currentPrice = context.currentBar.close;

    // Track highest price achieved
    if (currentPrice > this.highestPriceInTrade) {
      this.highestPriceInTrade = currentPrice;
    }

    // Calculate trailing stop from highest price
    const trailingStopPrice =
      this.highestPriceInTrade * (1 - this.orbConfig.trailingStopPercent / 100);

    return trailingStopPrice;
  }

  validate(): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate();
    const errors = [...baseValidation.errors];

    if (
      this.orbConfig.openingRangeMinutes &&
      (this.orbConfig.openingRangeMinutes < 1 || this.orbConfig.openingRangeMinutes > 60)
    ) {
      errors.push('Opening range minutes must be between 1 and 60');
    }

    if (
      this.orbConfig.trailingStopPercent &&
      (this.orbConfig.trailingStopPercent < 0 || this.orbConfig.trailingStopPercent > 100)
    ) {
      errors.push('Trailing stop percentage must be between 0 and 100');
    }

    if (this.orbConfig.marketFilterTicker) {
      if (!this.config.dependencies) {
        this.config.dependencies = [];
      }
      if (!this.config.dependencies.includes(this.orbConfig.marketFilterTicker)) {
        this.config.dependencies.push(this.orbConfig.marketFilterTicker);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
