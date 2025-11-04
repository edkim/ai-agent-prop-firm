/**
 * Execution Template Exits Service
 * Implements exit logic for different execution templates
 * Currently focused on Price Action Trailing strategy (70% WR)
 */

import { ExitStrategyConfig } from '../types/agent.types';

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time_of_day?: string;
}

export interface Position {
  side: 'LONG' | 'SHORT';
  entry_price: number;
  current_price: number;
  highest_price: number;
  lowest_price: number;
  unrealized_pnl_percent: number;
  metadata?: any; // Template-specific tracking data
}

export interface ExitDecision {
  shouldExit: boolean;
  exitPrice: number;
  exitReason: string;
  updatedMetadata?: any;
}

export class ExecutionTemplateExitsService {
  /**
   * Main entry point - routes to appropriate template exit logic
   */
  checkExit(
    config: ExitStrategyConfig,
    position: Position,
    currentBar: Bar,
    priorBar?: Bar
  ): ExitDecision {
    switch (config.template) {
      case 'price_action':
        return this.priceActionTrailingExit(config, position, currentBar, priorBar);

      case 'intraday_time':
        return this.intradayTimeExit(config, position, currentBar);

      case 'atr_adaptive':
        return this.atrAdaptiveExit(config, position, currentBar);

      case 'aggressive':
        return this.aggressiveSwingExit(config, position, currentBar);

      case 'conservative':
        return this.conservativeScalperExit(config, position, currentBar);

      default:
        // Fallback to simple exits
        return this.simpleExit(position, currentBar);
    }
  }

  /**
   * Price Action Trailing Strategy (70% WR)
   * - Activates trailing stop after 2 profitable bars
   * - Trails at prior bar's extreme (low for LONG, high for SHORT)
   * - Backstop: -2% stop loss, +4% take profit
   * - Market close at 15:55
   */
  private priceActionTrailingExit(
    config: ExitStrategyConfig,
    position: Position,
    currentBar: Bar,
    priorBar?: Bar
  ): ExitDecision {
    const STOP_LOSS_PERCENT = 2;
    const TAKE_PROFIT_PERCENT = 4;
    const MARKET_CLOSE_TIME = '15:55:00';

    // Initialize metadata if not exists
    if (!position.metadata) {
      position.metadata = {
        trailingActive: false,
        profitableBars: 0,
        priorBarTrailingStop: null
      };
    }

    const metadata = position.metadata;

    // Check if current position is profitable
    const isProfitable = position.side === 'LONG'
      ? currentBar.close > position.entry_price
      : currentBar.close < position.entry_price;

    if (isProfitable) {
      metadata.profitableBars++;
    }

    // Activate trailing after 2 profitable bars
    if (!metadata.trailingActive && metadata.profitableBars >= 2) {
      metadata.trailingActive = true;
    }

    // Update price action trailing stop
    if (metadata.trailingActive && priorBar) {
      if (position.side === 'LONG') {
        // Use prior bar's low as trailing stop
        const priorLow = priorBar.low;
        if (metadata.priorBarTrailingStop === null) {
          metadata.priorBarTrailingStop = priorLow;
        } else {
          // Only move stop up, never down
          metadata.priorBarTrailingStop = Math.max(metadata.priorBarTrailingStop, priorLow);
        }
      } else {
        // Use prior bar's high as trailing stop
        const priorHigh = priorBar.high;
        if (metadata.priorBarTrailingStop === null) {
          metadata.priorBarTrailingStop = priorHigh;
        } else {
          // Only move stop down, never up
          metadata.priorBarTrailingStop = Math.min(metadata.priorBarTrailingStop, priorHigh);
        }
      }
    }

    // Check exit conditions
    if (position.side === 'LONG') {
      const stopLoss = position.entry_price * (1 - STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 + TAKE_PROFIT_PERCENT / 100);

      if (currentBar.low <= stopLoss) {
        return {
          shouldExit: true,
          exitPrice: stopLoss,
          exitReason: 'Stop loss',
          updatedMetadata: metadata
        };
      }

      if (metadata.priorBarTrailingStop !== null && currentBar.low <= metadata.priorBarTrailingStop) {
        return {
          shouldExit: true,
          exitPrice: metadata.priorBarTrailingStop,
          exitReason: 'Price action trailing stop',
          updatedMetadata: metadata
        };
      }

      if (currentBar.high >= takeProfit) {
        return {
          shouldExit: true,
          exitPrice: takeProfit,
          exitReason: 'Take profit',
          updatedMetadata: metadata
        };
      }
    } else {
      // SHORT position
      const stopLoss = position.entry_price * (1 + STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 - TAKE_PROFIT_PERCENT / 100);

      if (currentBar.high >= stopLoss) {
        return {
          shouldExit: true,
          exitPrice: stopLoss,
          exitReason: 'Stop loss',
          updatedMetadata: metadata
        };
      }

      if (metadata.priorBarTrailingStop !== null && currentBar.high >= metadata.priorBarTrailingStop) {
        return {
          shouldExit: true,
          exitPrice: metadata.priorBarTrailingStop,
          exitReason: 'Price action trailing stop',
          updatedMetadata: metadata
        };
      }

      if (currentBar.low <= takeProfit) {
        return {
          shouldExit: true,
          exitPrice: takeProfit,
          exitReason: 'Take profit',
          updatedMetadata: metadata
        };
      }
    }

    // Market close exit
    if (currentBar.time_of_day && currentBar.time_of_day >= MARKET_CLOSE_TIME) {
      return {
        shouldExit: true,
        exitPrice: currentBar.close,
        exitReason: 'Market close',
        updatedMetadata: metadata
      };
    }

    // No exit triggered
    return {
      shouldExit: false,
      exitPrice: currentBar.close,
      exitReason: '',
      updatedMetadata: metadata
    };
  }

  /**
   * Intraday Time Exit Strategy (56% WR)
   * - Fixed exit time (default 15:55)
   * - Basic stop loss and take profit
   */
  private intradayTimeExit(
    config: ExitStrategyConfig,
    position: Position,
    currentBar: Bar
  ): ExitDecision {
    const STOP_LOSS_PERCENT = 3;
    const TAKE_PROFIT_PERCENT = 6;
    const exitTime = config.exitTime || '15:55:00';

    // Check stop loss / take profit
    if (position.side === 'LONG') {
      const stopLoss = position.entry_price * (1 - STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 + TAKE_PROFIT_PERCENT / 100);

      if (currentBar.low <= stopLoss) {
        return { shouldExit: true, exitPrice: stopLoss, exitReason: 'Stop loss' };
      }
      if (currentBar.high >= takeProfit) {
        return { shouldExit: true, exitPrice: takeProfit, exitReason: 'Take profit' };
      }
    } else {
      const stopLoss = position.entry_price * (1 + STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 - TAKE_PROFIT_PERCENT / 100);

      if (currentBar.high >= stopLoss) {
        return { shouldExit: true, exitPrice: stopLoss, exitReason: 'Stop loss' };
      }
      if (currentBar.low <= takeProfit) {
        return { shouldExit: true, exitPrice: takeProfit, exitReason: 'Take profit' };
      }
    }

    // Check time exit
    if (currentBar.time_of_day && currentBar.time_of_day >= exitTime) {
      return { shouldExit: true, exitPrice: currentBar.close, exitReason: 'Time exit' };
    }

    return { shouldExit: false, exitPrice: currentBar.close, exitReason: '' };
  }

  /**
   * ATR Adaptive Strategy (40% WR)
   * - Uses ATR multiplier for dynamic stops
   * - Placeholder implementation (needs ATR calculation)
   */
  private atrAdaptiveExit(
    config: ExitStrategyConfig,
    position: Position,
    currentBar: Bar
  ): ExitDecision {
    // TODO: Implement ATR calculation
    // For now, fall back to simple exits
    return this.simpleExit(position, currentBar);
  }

  /**
   * Aggressive Swing Strategy (54% WR)
   * - Wider stops, larger targets
   */
  private aggressiveSwingExit(
    config: ExitStrategyConfig,
    position: Position,
    currentBar: Bar
  ): ExitDecision {
    const STOP_LOSS_PERCENT = 4;
    const TAKE_PROFIT_PERCENT = 8;

    if (position.side === 'LONG') {
      const stopLoss = position.entry_price * (1 - STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 + TAKE_PROFIT_PERCENT / 100);

      if (currentBar.low <= stopLoss) {
        return { shouldExit: true, exitPrice: stopLoss, exitReason: 'Stop loss' };
      }
      if (currentBar.high >= takeProfit) {
        return { shouldExit: true, exitPrice: takeProfit, exitReason: 'Take profit' };
      }
    } else {
      const stopLoss = position.entry_price * (1 + STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 - TAKE_PROFIT_PERCENT / 100);

      if (currentBar.high >= stopLoss) {
        return { shouldExit: true, exitPrice: stopLoss, exitReason: 'Stop loss' };
      }
      if (currentBar.low <= takeProfit) {
        return { shouldExit: true, exitPrice: takeProfit, exitReason: 'Take profit' };
      }
    }

    // Market close
    if (currentBar.time_of_day && currentBar.time_of_day >= '15:55:00') {
      return { shouldExit: true, exitPrice: currentBar.close, exitReason: 'Market close' };
    }

    return { shouldExit: false, exitPrice: currentBar.close, exitReason: '' };
  }

  /**
   * Conservative Scalper Strategy (40% WR)
   * - Tight stops, quick exits
   */
  private conservativeScalperExit(
    config: ExitStrategyConfig,
    position: Position,
    currentBar: Bar
  ): ExitDecision {
    const STOP_LOSS_PERCENT = 1.5;
    const TAKE_PROFIT_PERCENT = 3;

    if (position.side === 'LONG') {
      const stopLoss = position.entry_price * (1 - STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 + TAKE_PROFIT_PERCENT / 100);

      if (currentBar.low <= stopLoss) {
        return { shouldExit: true, exitPrice: stopLoss, exitReason: 'Stop loss' };
      }
      if (currentBar.high >= takeProfit) {
        return { shouldExit: true, exitPrice: takeProfit, exitReason: 'Take profit' };
      }
    } else {
      const stopLoss = position.entry_price * (1 + STOP_LOSS_PERCENT / 100);
      const takeProfit = position.entry_price * (1 - TAKE_PROFIT_PERCENT / 100);

      if (currentBar.high >= stopLoss) {
        return { shouldExit: true, exitPrice: stopLoss, exitReason: 'Stop loss' };
      }
      if (currentBar.low <= takeProfit) {
        return { shouldExit: true, exitPrice: takeProfit, exitReason: 'Take profit' };
      }
    }

    // Market close
    if (currentBar.time_of_day && currentBar.time_of_day >= '15:55:00') {
      return { shouldExit: true, exitPrice: currentBar.close, exitReason: 'Market close' };
    }

    return { shouldExit: false, exitPrice: currentBar.close, exitReason: '' };
  }

  /**
   * Fallback: Simple fixed percentage exits
   */
  private simpleExit(position: Position, currentBar: Bar): ExitDecision {
    const STOP_LOSS_PERCENT = 5;
    const TAKE_PROFIT_PERCENT = 10;

    if (position.unrealized_pnl_percent <= -STOP_LOSS_PERCENT) {
      return {
        shouldExit: true,
        exitPrice: position.current_price,
        exitReason: 'Stop loss (simple)'
      };
    }

    if (position.unrealized_pnl_percent >= TAKE_PROFIT_PERCENT) {
      return {
        shouldExit: true,
        exitPrice: position.current_price,
        exitReason: 'Take profit (simple)'
      };
    }

    // Market close
    if (currentBar.time_of_day && currentBar.time_of_day >= '15:55:00') {
      return {
        shouldExit: true,
        exitPrice: currentBar.close,
        exitReason: 'Market close'
      };
    }

    return { shouldExit: false, exitPrice: currentBar.close, exitReason: '' };
  }
}
