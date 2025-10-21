/**
 * Indicator Factory
 * Creates indicator instances from configuration
 */

import { BaseIndicator } from './base';
import { SMA } from './sma';
import { EMA } from './ema';
import { RSI } from './rsi';
import { ATR } from './atr';
import { IndicatorConfig } from '../types/strategy.types';

export class IndicatorFactory {
  static create(config: IndicatorConfig): BaseIndicator {
    switch (config.type) {
      case 'SMA':
        return new SMA(config.id, config.params as any);

      case 'EMA':
        return new EMA(config.id, config.params as any);

      case 'RSI':
        return new RSI(config.id, config.params as any);

      case 'ATR':
        return new ATR(config.id, config.params as any);

      // TODO: Implement additional indicators
      case 'MACD':
      case 'BOLLINGER':
      case 'STOCHASTIC':
        throw new Error(`Indicator type ${config.type} not yet implemented`);

      case 'CUSTOM':
        throw new Error('Custom indicators not yet implemented');

      default:
        throw new Error(`Unknown indicator type: ${config.type}`);
    }
  }

  static createMultiple(configs: IndicatorConfig[]): Map<string, BaseIndicator> {
    const indicators = new Map<string, BaseIndicator>();

    for (const config of configs) {
      const indicator = this.create(config);
      indicators.set(config.id, indicator);
    }

    return indicators;
  }
}
