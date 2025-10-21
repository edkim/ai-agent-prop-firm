/**
 * Base Strategy Class
 * Abstract class for custom strategy implementations
 */

import { OHLCVBar, Position, EvaluationContext } from '../types/strategy.types';

export interface StrategyConfig {
  ticker: string;
  timeframe: '1min' | '5min' | '15min' | '30min' | '1hour' | '1day' | '1week' | '1month';
  dependencies?: string[]; // Additional tickers needed (e.g., ['QQQ', 'SPY'])
  requireEarnings?: boolean;
  [key: string]: any; // Strategy-specific config
}

export interface StrategyMetadata {
  name: string;
  description: string;
  author?: string;
  version?: string;
  parameters?: {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'select';
    description: string;
    defaultValue: any;
    options?: any[];
  }[];
}

export abstract class BaseStrategy {
  protected config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /**
   * Strategy metadata for UI display
   */
  abstract getMetadata(): StrategyMetadata;

  /**
   * Initialize strategy state before backtest begins
   * Use this to pre-calculate values, find key bars, etc.
   *
   * @param bars - All bars for the backtest period
   */
  abstract init(bars: OHLCVBar[]): void;

  /**
   * Check if should enter a position on current bar
   *
   * @param context - Current evaluation context with bar, indicators, etc.
   * @returns true if entry conditions are met
   */
  abstract checkEntry(context: EvaluationContext): boolean;

  /**
   * Check if should exit current position on current bar
   *
   * @param context - Current evaluation context
   * @returns true if exit conditions are met
   */
  abstract checkExit(context: EvaluationContext): boolean;

  /**
   * Calculate position size
   * Optional - if not implemented, uses default sizing from config
   *
   * @param context - Current evaluation context
   * @returns number of shares to buy/sell
   */
  calculatePositionSize?(context: EvaluationContext): number;

  /**
   * Calculate stop loss price
   * Optional - if not implemented, uses default from risk management
   *
   * @param position - Current position
   * @param context - Current evaluation context
   * @returns stop loss price, or undefined for no stop
   */
  calculateStopLoss?(position: Position, context: EvaluationContext): number | undefined;

  /**
   * Calculate take profit price
   * Optional - if not implemented, uses default from risk management
   *
   * @param position - Current position
   * @param context - Current evaluation context
   * @returns take profit price, or undefined for no target
   */
  calculateTakeProfit?(position: Position, context: EvaluationContext): number | undefined;

  /**
   * Update trailing stop price
   * Called on each bar when position is open
   *
   * @param position - Current position
   * @param context - Current evaluation context
   * @returns new trailing stop price, or undefined to keep current
   */
  updateTrailingStop?(position: Position, context: EvaluationContext): number | undefined;

  /**
   * Get current config
   */
  getConfig(): StrategyConfig {
    return this.config;
  }

  /**
   * Validate configuration
   * Override to add custom validation
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.ticker) {
      errors.push('Ticker is required');
    }

    if (!this.config.timeframe) {
      errors.push('Timeframe is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
