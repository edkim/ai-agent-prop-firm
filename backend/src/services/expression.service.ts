/**
 * Expression Evaluation Service
 * Safely evaluates strategy condition expressions
 */

import { Parser } from 'expr-eval';
import { EvaluationContext, StrategyCondition, StrategyRules } from '../types/strategy.types';

export class ExpressionService {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(condition: StrategyCondition, context: EvaluationContext): boolean {
    try {
      switch (condition.type) {
        case 'expression':
          return this.evaluateExpression(condition.expression!, context);

        case 'indicator_compare':
          return this.evaluateIndicatorCompare(condition, context);

        case 'price_compare':
          return this.evaluatePriceCompare(condition, context);

        default:
          throw new Error(`Unknown condition type: ${condition.type}`);
      }
    } catch (error: any) {
      console.error('Error evaluating condition:', error.message);
      return false;
    }
  }

  /**
   * Evaluate multiple conditions with logic (AND/OR)
   */
  evaluateRules(rules: StrategyRules, context: EvaluationContext): boolean {
    if (rules.conditions.length === 0) {
      return false;
    }

    const results = rules.conditions.map(condition => this.evaluateCondition(condition, context));

    if (rules.logic === 'AND') {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }

  /**
   * Evaluate an expression string
   */
  private evaluateExpression(expression: string, context: EvaluationContext): boolean {
    const variables = this.buildVariables(context);
    const functions = this.buildCustomFunctions(context);

    try {
      const expr = this.parser.parse(expression);
      const result = expr.evaluate({ ...variables, ...functions });
      return Boolean(result);
    } catch (error: any) {
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  /**
   * Build variables available in expressions
   */
  private buildVariables(context: EvaluationContext): Record<string, any> {
    const vars: Record<string, any> = {
      // Current bar OHLCV
      open: context.currentBar.open,
      high: context.currentBar.high,
      low: context.currentBar.low,
      close: context.currentBar.close,
      volume: context.currentBar.volume,

      // Portfolio information
      cash: context.portfolio.cash,
      equity: context.portfolio.equity,

      // Position information
      hasPosition: !!context.position,
      positionSize: context.position?.quantity || 0,
      positionSide: context.position?.side || 'NONE',
      entryPrice: context.position?.entryPrice || 0,
      unrealizedPnL: context.position?.unrealizedPnL || 0,

      // Earnings information
      has_earnings_today: context.earningsToday || false,
      earnings_time: context.earningsTime || '',
      is_earnings_bmo: context.earningsTime === 'BMO',
      is_earnings_amc: context.earningsTime === 'AMC',
    };

    // Add indicator values
    context.indicators.forEach((value, id) => {
      if (typeof value === 'number') {
        vars[id] = value;
      } else if (typeof value === 'object') {
        // For multi-value indicators like MACD
        Object.entries(value).forEach(([key, val]) => {
          vars[`${id}_${key}`] = val;
        });
      }
    });

    return vars;
  }

  /**
   * Build custom functions available in expressions
   */
  private buildCustomFunctions(context: EvaluationContext): Record<string, Function> {
    return {
      // Cross above: current crosses above reference
      cross_above: (current: number, reference: number) => {
        if (context.currentIndex === 0) return false;
        // In real implementation, need previous indicator value
        const prevCurrent = current;
        const prevReference = reference;
        return current > reference && prevCurrent <= prevReference;
      },

      // Cross below: current crosses below reference
      cross_below: (current: number, reference: number) => {
        if (context.currentIndex === 0) return false;
        const prevCurrent = current;
        const prevReference = reference;
        return current < reference && prevCurrent >= prevReference;
      },

      // Highest value in last N bars
      highest: (n: number, source: string = 'high') => {
        const startIndex = Math.max(0, context.currentIndex - n + 1);
        let max = -Infinity;
        for (let i = startIndex; i <= context.currentIndex; i++) {
          const value = (context.bars[i] as any)[source];
          if (value > max) max = value;
        }
        return max;
      },

      // Lowest value in last N bars
      lowest: (n: number, source: string = 'low') => {
        const startIndex = Math.max(0, context.currentIndex - n + 1);
        let min = Infinity;
        for (let i = startIndex; i <= context.currentIndex; i++) {
          const value = (context.bars[i] as any)[source];
          if (value < min) min = value;
        }
        return min;
      },

      // Average of last N values
      avg: (n: number, source: string = 'close') => {
        const startIndex = Math.max(0, context.currentIndex - n + 1);
        let sum = 0;
        let count = 0;
        for (let i = startIndex; i <= context.currentIndex; i++) {
          sum += (context.bars[i] as any)[source];
          count++;
        }
        return sum / count;
      },

      // Get value N bars ago
      bars_ago: (n: number, source: string = 'close') => {
        const index = context.currentIndex - n;
        if (index < 0) return 0;
        return (context.bars[index] as any)[source];
      },

      // Absolute value
      abs: Math.abs,

      // Maximum of values
      max: Math.max,

      // Minimum of values
      min: Math.min,

      // Cross-ticker functions
      ticker: (symbol: string) => {
        const bar = context.dependencyBars?.get(symbol);
        if (!bar) {
          return { open: 0, high: 0, low: 0, close: 0, volume: 0 };
        }
        return {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        };
      },

      // Ticker is up on the day (close > open)
      ticker_is_up: (symbol: string) => {
        const bar = context.dependencyBars?.get(symbol);
        if (!bar) return false;
        return bar.close > bar.open;
      },

      // Ticker is down on the day
      ticker_is_down: (symbol: string) => {
        const bar = context.dependencyBars?.get(symbol);
        if (!bar) return false;
        return bar.close < bar.open;
      },

      // Ticker percent change
      ticker_pct_change: (symbol: string) => {
        const bar = context.dependencyBars?.get(symbol);
        if (!bar || bar.open === 0) return 0;
        return ((bar.close - bar.open) / bar.open) * 100;
      },

      // Earnings functions
      has_earnings_today: () => context.earningsToday || false,
      has_earnings_bmo: () => context.earningsTime === 'BMO',
      has_earnings_amc: () => context.earningsTime === 'AMC',
    };
  }

  /**
   * Evaluate indicator comparison
   */
  private evaluateIndicatorCompare(condition: StrategyCondition, context: EvaluationContext): boolean {
    const indicator1Value = context.indicators.get(condition.indicator1!);
    const indicator2Value = condition.indicator2
      ? context.indicators.get(condition.indicator2)
      : condition.value;

    if (indicator1Value === undefined || indicator2Value === undefined) {
      return false;
    }

    const value1 = typeof indicator1Value === 'number' ? indicator1Value : 0;
    const value2 = typeof indicator2Value === 'number' ? indicator2Value : 0;

    switch (condition.operator) {
      case 'GT':
        return value1 > value2;
      case 'LT':
        return value1 < value2;
      case 'GTE':
        return value1 >= value2;
      case 'LTE':
        return value1 <= value2;
      case 'EQ':
        return Math.abs(value1 - value2) < 0.0001; // Float comparison
      case 'CROSS_ABOVE':
        // Need historical data to detect crossover
        return value1 > value2;
      case 'CROSS_BELOW':
        return value1 < value2;
      default:
        return false;
    }
  }

  /**
   * Evaluate price comparison
   */
  private evaluatePriceCompare(condition: StrategyCondition, context: EvaluationContext): boolean {
    const price = context.currentBar.close;
    const compareValue = condition.value || 0;

    switch (condition.operator) {
      case 'GT':
        return price > compareValue;
      case 'LT':
        return price < compareValue;
      case 'GTE':
        return price >= compareValue;
      case 'LTE':
        return price <= compareValue;
      case 'EQ':
        return Math.abs(price - compareValue) < 0.01;
      default:
        return false;
    }
  }

  /**
   * Validate expression syntax without evaluating
   */
  validateExpression(expression: string): { valid: boolean; error?: string } {
    try {
      this.parser.parse(expression);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}

// Export singleton instance
export default new ExpressionService();
