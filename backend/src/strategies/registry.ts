/**
 * Strategy Registry
 * Central registry for all custom strategy types
 */

import { BaseStrategy, StrategyConfig } from './base.strategy';
import { OpeningRangeBreakoutStrategy } from './opening-range-breakout.strategy';

type StrategyConstructor = new (config: any) => BaseStrategy;

export class StrategyRegistry {
  private static strategies = new Map<string, StrategyConstructor>();
  private static initialized = false;

  /**
   * Initialize the registry with all built-in strategies
   */
  static initialize(): void {
    if (this.initialized) return;

    // Register built-in strategies
    this.register('opening-range-breakout', OpeningRangeBreakoutStrategy);

    // Future strategies:
    // this.register('mean-reversion', MeanReversionStrategy);
    // this.register('momentum-breakout', MomentumBreakoutStrategy);
    // this.register('pairs-trading', PairsTradingStrategy);

    this.initialized = true;
    console.log(`Strategy Registry initialized with ${this.strategies.size} strategies`);
  }

  /**
   * Register a new strategy type
   */
  static register(type: string, strategyClass: StrategyConstructor): void {
    if (this.strategies.has(type)) {
      console.warn(`Strategy type '${type}' already registered, overwriting`);
    }
    this.strategies.set(type, strategyClass);
  }

  /**
   * Create a strategy instance
   */
  static create(type: string, config: StrategyConfig): BaseStrategy {
    if (!this.initialized) {
      this.initialize();
    }

    const StrategyClass = this.strategies.get(type);
    if (!StrategyClass) {
      throw new Error(
        `Unknown strategy type: '${type}'. Available types: ${Array.from(this.strategies.keys()).join(', ')}`
      );
    }

    const strategy = new StrategyClass(config);

    // Validate configuration
    const validation = strategy.validate();
    if (!validation.valid) {
      throw new Error(`Invalid strategy configuration: ${validation.errors.join(', ')}`);
    }

    return strategy;
  }

  /**
   * Check if a strategy type is registered
   */
  static has(type: string): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.strategies.has(type);
  }

  /**
   * Get all registered strategy types
   */
  static getTypes(): string[] {
    if (!this.initialized) {
      this.initialize();
    }
    return Array.from(this.strategies.keys());
  }

  /**
   * Get metadata for all registered strategies
   */
  static getAllMetadata(): Array<{ type: string; metadata: any }> {
    if (!this.initialized) {
      this.initialize();
    }

    const metadata: Array<{ type: string; metadata: any }> = [];

    this.strategies.forEach((StrategyClass, type) => {
      // Create a temporary instance to get metadata
      try {
        const tempConfig = { ticker: 'TEMP', timeframe: '5min' as const };
        const instance = new StrategyClass(tempConfig);
        metadata.push({
          type,
          metadata: instance.getMetadata(),
        });
      } catch (error) {
        console.error(`Error getting metadata for strategy type '${type}':`, error);
      }
    });

    return metadata;
  }
}

// Auto-initialize on module load
StrategyRegistry.initialize();

export default StrategyRegistry;
