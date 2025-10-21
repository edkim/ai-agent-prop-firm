/**
 * Backtesting Service
 * Core backtesting engine with bar-by-bar simulation
 */

import { Strategy, OHLCVBar, Position, EvaluationContext } from '../types/strategy.types';
import {
  BacktestConfig,
  BacktestResult,
  BacktestState,
  Trade,
  EquityPoint,
  BacktestMetrics,
  OrderRequest,
  OrderResult,
} from '../types/backtest.types';
import { IndicatorFactory } from '../indicators/factory';
import { BaseIndicator } from '../indicators/base';
import ExpressionService from './expression.service';
import PolygonService from './polygon.service';
import StrategyRegistry from '../strategies/registry';
import { BaseStrategy } from '../strategies/base.strategy';

export class BacktestService {
  /**
   * Run a backtest for a strategy
   */
  async runBacktest(strategy: Strategy, config: BacktestConfig): Promise<BacktestResult> {
    console.log(`Starting backtest for strategy: ${strategy.name}`);

    try {
      // Fetch historical data
      const startTimestamp = new Date(config.startDate).getTime();
      const endTimestamp = new Date(config.endDate).getTime();

      const bars = await PolygonService.getHistoricalData(
        strategy.ticker,
        strategy.timeframe,
        startTimestamp,
        endTimestamp
      );

      if (bars.length === 0) {
        throw new Error('No historical data available for the specified period');
      }

      console.log(`Loaded ${bars.length} bars for backtesting`);

      // Load dependency ticker data if needed
      const dependencyData = new Map<string, OHLCVBar[]>();
      if (strategy.dependencies && strategy.dependencies.length > 0) {
        for (const depTicker of strategy.dependencies) {
          console.log(`Loading dependency data for ${depTicker}`);
          const depBars = await PolygonService.getHistoricalData(
            depTicker,
            strategy.timeframe,
            startTimestamp,
            endTimestamp
          );
          dependencyData.set(depTicker, depBars);
          console.log(`Loaded ${depBars.length} bars for ${depTicker}`);
        }
      }

      // Load earnings data if needed
      let earningsEvents: Map<string, any> | undefined;
      if (strategy.requireEarnings) {
        console.log(`Loading earnings events for ${strategy.ticker}`);
        const events = await PolygonService.getEarningsEvents(
          strategy.ticker,
          config.startDate,
          config.endDate
        );
        earningsEvents = new Map();
        events.forEach(event => {
          earningsEvents!.set(event.reportDate, event);
        });
        console.log(`Loaded ${events.length} earnings events`);
      }

      // Initialize indicators (for rule-based strategies)
      const indicators = IndicatorFactory.createMultiple(strategy.indicators || []);

      // Initialize custom strategy if applicable
      let customStrategy: BaseStrategy | null = null;
      if (strategy.strategyType === 'custom' && strategy.customStrategyType) {
        console.log(`Initializing custom strategy: ${strategy.customStrategyType}`);
        const strategyConfig = {
          ticker: strategy.ticker,
          timeframe: strategy.timeframe,
          dependencies: strategy.dependencies,
          requireEarnings: strategy.requireEarnings,
          ...strategy.customConfig,
        };
        customStrategy = StrategyRegistry.create(strategy.customStrategyType, strategyConfig);
        customStrategy.init(bars);
      }

      // Initialize backtest state
      const state: BacktestState = {
        currentBar: bars[0],
        currentIndex: 0,
        cash: config.initialCapital,
        positions: [],
        closedTrades: [],
        equityCurve: [],
        peakEquity: config.initialCapital,
      };

      // Pre-calculate all indicator values
      const indicatorValues = this.precalculateIndicators(indicators, bars);

      // Run bar-by-bar simulation
      for (let i = 0; i < bars.length; i++) {
        state.currentBar = bars[i];
        state.currentIndex = i;

        // Update position values
        this.updatePositions(state);

        // Build evaluation context with dependencies and earnings
        const context = this.buildContext(
          state,
          bars,
          indicatorValues,
          i,
          dependencyData,
          earningsEvents
        );

        // Update trailing stops if custom strategy supports it
        if (customStrategy && customStrategy.updateTrailingStop) {
          this.updateTrailingStops(state, customStrategy, context);
        }

        // Check exit conditions for existing positions
        this.checkExitConditions(state, strategy, context, config, customStrategy);

        // Check entry conditions if we have capacity
        if (this.canEnterPosition(state, strategy)) {
          this.checkEntryConditions(state, strategy, context, config, customStrategy);
        }

        // Record equity point
        this.recordEquityPoint(state);
      }

      // Close any remaining positions at end of backtest
      this.closeAllPositions(state, bars[bars.length - 1], 'END_OF_PERIOD', config);

      // Calculate performance metrics
      const metrics = this.calculateMetrics(state, config, bars);

      const result: BacktestResult = {
        strategyId: strategy.id!,
        config,
        trades: state.closedTrades,
        equityCurve: state.equityCurve,
        metrics,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      };

      console.log(`Backtest completed. Total trades: ${state.closedTrades.length}`);
      console.log(`Final equity: $${state.cash.toFixed(2)}`);
      console.log(`Total return: ${metrics.totalReturnPercent.toFixed(2)}%`);

      return result;
    } catch (error: any) {
      console.error('Backtest error:', error);
      return {
        strategyId: strategy.id!,
        config,
        trades: [],
        equityCurve: [],
        metrics: this.getEmptyMetrics(),
        status: 'FAILED',
        error: error.message,
      };
    }
  }

  /**
   * Pre-calculate all indicator values for all bars
   */
  private precalculateIndicators(
    indicators: Map<string, BaseIndicator>,
    bars: OHLCVBar[]
  ): Map<string, (number | { [key: string]: number } | null)[]> {
    const values = new Map<string, (number | { [key: string]: number } | null)[]>();

    indicators.forEach((indicator, id) => {
      const indicatorValues = indicator.calculateAll(bars);
      values.set(id, indicatorValues);
    });

    return values;
  }

  /**
   * Build evaluation context for current bar
   */
  private buildContext(
    state: BacktestState,
    bars: OHLCVBar[],
    indicatorValues: Map<string, (number | { [key: string]: number } | null)[]>,
    index: number,
    dependencyData?: Map<string, OHLCVBar[]>,
    earningsEvents?: Map<string, any>
  ): EvaluationContext {
    const currentIndicators = new Map<string, number | { [key: string]: number }>();

    indicatorValues.forEach((values, id) => {
      const value = values[index];
      if (value !== null) {
        currentIndicators.set(id, value);
      }
    });

    const totalEquity = state.cash + this.calculatePositionValue(state);

    // Build dependency bars map (synchronized by index)
    const dependencyBars = new Map<string, OHLCVBar>();
    if (dependencyData) {
      dependencyData.forEach((depBars, ticker) => {
        // Find the bar with the closest timestamp to current bar
        const currentTimestamp = state.currentBar.timestamp;
        let closestBar = depBars[0];
        let minDiff = Math.abs(depBars[0].timestamp - currentTimestamp);

        for (const bar of depBars) {
          const diff = Math.abs(bar.timestamp - currentTimestamp);
          if (diff < minDiff) {
            minDiff = diff;
            closestBar = bar;
          }
          // If we've passed the current timestamp, stop
          if (bar.timestamp > currentTimestamp) break;
        }

        dependencyBars.set(ticker, closestBar);
      });
    }

    // Check for earnings on current date
    let earningsToday = false;
    let earningsTime: string | undefined;
    if (earningsEvents) {
      const currentDate = new Date(state.currentBar.timestamp);
      const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const event = earningsEvents.get(dateStr);
      if (event) {
        earningsToday = true;
        earningsTime = event.timeOfDay;
      }
    }

    return {
      currentBar: state.currentBar,
      currentIndex: index,
      bars,
      indicators: currentIndicators,
      position: state.positions[0], // For now, single position
      portfolio: {
        cash: state.cash,
        equity: totalEquity,
      },
      dependencyData,
      dependencyBars,
      earningsToday,
      earningsTime,
    };
  }

  /**
   * Update position values based on current price
   */
  private updatePositions(state: BacktestState): void {
    for (const position of state.positions) {
      position.currentPrice = state.currentBar.close;

      // Track highest price for trailing stop
      if (!position.highestPrice || state.currentBar.high > position.highestPrice) {
        position.highestPrice = state.currentBar.high;
      }

      if (position.side === 'LONG') {
        position.unrealizedPnL = (position.currentPrice - position.entryPrice) * position.quantity;
      } else {
        position.unrealizedPnL = (position.entryPrice - position.currentPrice) * position.quantity;
      }
    }
  }

  /**
   * Update trailing stops using custom strategy logic
   */
  private updateTrailingStops(state: BacktestState, customStrategy: BaseStrategy, context: EvaluationContext): void {
    for (const position of state.positions) {
      if (customStrategy.updateTrailingStop) {
        const newTrailingStop = customStrategy.updateTrailingStop(position, context);
        if (newTrailingStop !== undefined) {
          position.trailingStop = newTrailingStop;
        }
      }
    }
  }

  /**
   * Check if we can enter a new position
   */
  private canEnterPosition(state: BacktestState, strategy: Strategy): boolean {
    const maxPositions = strategy.positionSizing.maxPositions || 1;
    return state.positions.length < maxPositions;
  }

  /**
   * Check entry conditions and enter position if met
   */
  private checkEntryConditions(
    state: BacktestState,
    strategy: Strategy,
    context: EvaluationContext,
    config: BacktestConfig,
    customStrategy?: BaseStrategy | null
  ): void {
    // Check entry conditions using custom strategy or rule-based
    let shouldEnter = false;
    if (customStrategy) {
      shouldEnter = customStrategy.checkEntry(context);
    } else {
      shouldEnter = ExpressionService.evaluateRules(strategy.entryRules, context);
    }

    if (shouldEnter) {
      // Calculate position size using custom strategy or default
      let quantity = 0;
      if (customStrategy && customStrategy.calculatePositionSize) {
        quantity = customStrategy.calculatePositionSize(context);
      } else {
        quantity = this.calculatePositionSize(state, strategy, context);
      }

      if (quantity > 0) {
        const order: OrderRequest = {
          ticker: strategy.ticker,
          side: 'LONG', // TODO: Support short positions
          quantity,
          orderType: 'MARKET',
        };

        const orderResult = this.executeOrder(order, state.currentBar, config);

        if (orderResult.executed) {
          const position: Position = {
            ticker: strategy.ticker,
            entryPrice: orderResult.executionPrice!,
            quantity: order.quantity,
            side: order.side,
            entryTimestamp: state.currentBar.timestamp,
            currentPrice: orderResult.executionPrice!,
            unrealizedPnL: 0,
            highestPrice: orderResult.executionPrice!,
          };

          // Apply stop loss and take profit
          if (customStrategy) {
            // Use custom strategy's stop loss/take profit if available
            if (customStrategy.calculateStopLoss) {
              const customStopLoss = customStrategy.calculateStopLoss(position, context);
              if (customStopLoss !== undefined) {
                position.stopLoss = customStopLoss;
              }
            }
            if (customStrategy.calculateTakeProfit) {
              const customTakeProfit = customStrategy.calculateTakeProfit(position, context);
              if (customTakeProfit !== undefined) {
                position.takeProfit = customTakeProfit;
              }
            }
          } else {
            // Use rule-based risk management
            if (strategy.riskManagement?.stopLoss) {
              position.stopLoss = this.calculateStopLoss(position, strategy, context);
            }
            if (strategy.riskManagement?.takeProfit) {
              position.takeProfit = this.calculateTakeProfit(position, strategy, context);
            }
          }

          state.positions.push(position);
          state.cash -= orderResult.executionPrice! * quantity + orderResult.commission;

          console.log(`Entered ${order.side} position at ${orderResult.executionPrice} x ${quantity}`);
        }
      }
    }
  }

  /**
   * Check exit conditions and close positions if met
   */
  private checkExitConditions(
    state: BacktestState,
    strategy: Strategy,
    context: EvaluationContext,
    config: BacktestConfig,
    customStrategy?: BaseStrategy | null
  ): void {
    const positionsToClose: number[] = [];

    for (let i = 0; i < state.positions.length; i++) {
      const position = state.positions[i];
      let shouldExit = false;
      let exitReason: Trade['exitReason'] = 'SIGNAL';

      // Check strategy exit rules (custom or rule-based)
      if (customStrategy) {
        if (customStrategy.checkExit(context)) {
          shouldExit = true;
          exitReason = 'SIGNAL';
        }
      } else {
        if (ExpressionService.evaluateRules(strategy.exitRules, context)) {
          shouldExit = true;
          exitReason = 'SIGNAL';
        }
      }

      // Check trailing stop
      if (position.trailingStop && state.currentBar.low <= position.trailingStop) {
        shouldExit = true;
        exitReason = 'TRAILING_STOP';
      }

      // Check stop loss
      if (position.stopLoss && state.currentBar.close <= position.stopLoss) {
        shouldExit = true;
        exitReason = 'STOP_LOSS';
      }

      // Check take profit
      if (position.takeProfit && state.currentBar.close >= position.takeProfit) {
        shouldExit = true;
        exitReason = 'TAKE_PROFIT';
      }

      if (shouldExit) {
        this.closePosition(state, i, state.currentBar, exitReason, config);
        positionsToClose.push(i);
      }
    }

    // Remove closed positions (in reverse to maintain indices)
    for (let i = positionsToClose.length - 1; i >= 0; i--) {
      state.positions.splice(positionsToClose[i], 1);
    }
  }

  /**
   * Calculate position size based on strategy rules
   */
  private calculatePositionSize(
    state: BacktestState,
    strategy: Strategy,
    _context: EvaluationContext
  ): number {
    const sizing = strategy.positionSizing;
    const price = state.currentBar.close;

    switch (sizing.method) {
      case 'FIXED_AMOUNT':
        return Math.floor(sizing.value / price);

      case 'PERCENT_PORTFOLIO':
        const totalEquity = state.cash + this.calculatePositionValue(state);
        const allocation = totalEquity * (sizing.value / 100);
        return Math.floor(allocation / price);

      case 'RISK_BASED':
        // TODO: Implement risk-based sizing
        return Math.floor((state.cash * 0.02) / price);

      default:
        return 0;
    }
  }

  /**
   * Calculate stop loss price
   */
  private calculateStopLoss(position: Position, strategy: Strategy, context: EvaluationContext): number {
    const stopLoss = strategy.riskManagement!.stopLoss!;

    switch (stopLoss.type) {
      case 'PERCENT':
        return position.entryPrice * (1 - stopLoss.value / 100);

      case 'FIXED':
        return position.entryPrice - stopLoss.value;

      case 'ATR':
        const atrValue = context.indicators.get('atr') as number || 0;
        return position.entryPrice - atrValue * stopLoss.value;

      default:
        return 0;
    }
  }

  /**
   * Calculate take profit price
   */
  private calculateTakeProfit(position: Position, strategy: Strategy, context: EvaluationContext): number {
    const takeProfit = strategy.riskManagement!.takeProfit!;

    switch (takeProfit.type) {
      case 'PERCENT':
        return position.entryPrice * (1 + takeProfit.value / 100);

      case 'FIXED':
        return position.entryPrice + takeProfit.value;

      case 'ATR':
        const atrValue = context.indicators.get('atr') as number || 0;
        return position.entryPrice + atrValue * takeProfit.value;

      default:
        return 0;
    }
  }

  /**
   * Execute an order
   */
  private executeOrder(_order: OrderRequest, bar: OHLCVBar, config: BacktestConfig): OrderResult {
    const slippage = config.slippage || 0;
    const commission = config.commission || 0;

    // Market order executes at current price with slippage
    const executionPrice = bar.close * (1 + slippage / 100);

    return {
      executed: true,
      executionPrice,
      commission,
      slippage: slippage / 100,
    };
  }

  /**
   * Close a position
   */
  private closePosition(
    state: BacktestState,
    positionIndex: number,
    bar: OHLCVBar,
    reason: Trade['exitReason'],
    config: BacktestConfig
  ): void {
    const position = state.positions[positionIndex];
    const exitPrice = bar.close;
    const commission = config.commission || 0;

    const pnl = position.side === 'LONG'
      ? (exitPrice - position.entryPrice) * position.quantity - commission
      : (position.entryPrice - exitPrice) * position.quantity - commission;

    const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;

    const trade: Trade = {
      ticker: position.ticker,
      side: position.side,
      entryTimestamp: position.entryTimestamp,
      entryPrice: position.entryPrice,
      exitTimestamp: bar.timestamp,
      exitPrice,
      quantity: position.quantity,
      commission,
      pnl,
      pnlPercent,
      exitReason: reason,
      bars: Math.floor((bar.timestamp - position.entryTimestamp) / (1000 * 60)), // Rough estimate
    };

    state.closedTrades.push(trade);
    state.cash += exitPrice * position.quantity - commission;

    console.log(`Closed position: ${reason}, PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
  }

  /**
   * Close all positions
   */
  private closeAllPositions(
    state: BacktestState,
    bar: OHLCVBar,
    reason: Trade['exitReason'],
    config: BacktestConfig
  ): void {
    for (let i = state.positions.length - 1; i >= 0; i--) {
      this.closePosition(state, i, bar, reason, config);
    }
    state.positions = [];
  }

  /**
   * Calculate total position value
   */
  private calculatePositionValue(state: BacktestState): number {
    return state.positions.reduce((sum, pos) => {
      const value = (pos.currentPrice || pos.entryPrice) * pos.quantity;
      return sum + value;
    }, 0);
  }

  /**
   * Record equity point
   */
  private recordEquityPoint(state: BacktestState): void {
    const positionValue = this.calculatePositionValue(state);
    const equity = state.cash + positionValue;

    if (equity > state.peakEquity) {
      state.peakEquity = equity;
    }

    const drawdown = state.peakEquity - equity;
    const drawdownPercent = (drawdown / state.peakEquity) * 100;

    const point: EquityPoint = {
      timestamp: state.currentBar.timestamp,
      equity,
      cash: state.cash,
      positionValue,
      drawdown,
      drawdownPercent,
    };

    state.equityCurve.push(point);
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(state: BacktestState, config: BacktestConfig, _bars: OHLCVBar[]): BacktestMetrics {
    const finalEquity = state.equityCurve[state.equityCurve.length - 1]?.equity || config.initialCapital;
    const totalReturn = finalEquity - config.initialCapital;
    const totalReturnPercent = (totalReturn / config.initialCapital) * 100;

    // Calculate time period in years
    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

    const cagr = (Math.pow(finalEquity / config.initialCapital, 1 / years) - 1) * 100;
    const annualizedReturn = totalReturnPercent / years;

    // Max drawdown
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    for (const point of state.equityCurve) {
      if (point.drawdown > maxDrawdown) {
        maxDrawdown = point.drawdown;
        maxDrawdownPercent = point.drawdownPercent;
      }
    }

    // Trade statistics
    const winningTrades = state.closedTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = state.closedTrades.filter(t => (t.pnl || 0) < 0);

    const winRate = state.closedTrades.length > 0
      ? (winningTrades.length / state.closedTrades.length) * 100
      : 0;

    const averageWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
      : 0;

    const averageLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
      : 0;

    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    const largestWin = winningTrades.length > 0
      ? Math.max(...winningTrades.map(t => t.pnl || 0))
      : 0;

    const largestLoss = losingTrades.length > 0
      ? Math.min(...losingTrades.map(t => t.pnl || 0))
      : 0;

    const averageTradeDuration = state.closedTrades.length > 0
      ? state.closedTrades.reduce((sum, t) => sum + (t.bars || 0), 0) / state.closedTrades.length
      : 0;

    // Calculate returns for Sharpe/Sortino
    const returns: number[] = [];
    for (let i = 1; i < state.equityCurve.length; i++) {
      const ret = (state.equityCurve[i].equity - state.equityCurve[i - 1].equity) / state.equityCurve[i - 1].equity;
      returns.push(ret);
    }

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDevReturns = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    const sharpeRatio = stdDevReturns > 0 ? (avgReturn * Math.sqrt(252)) / stdDevReturns : 0;

    const downside = returns.filter(r => r < 0);
    const downsideStdDev = Math.sqrt(
      downside.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downside.length
    );
    const sortinoRatio = downsideStdDev > 0 ? (avgReturn * Math.sqrt(252)) / downsideStdDev : 0;

    const expectancy = state.closedTrades.length > 0
      ? state.closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / state.closedTrades.length
      : 0;

    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      cagr,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      sortinoRatio,
      winRate,
      profitFactor,
      totalTrades: state.closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      averageTradeDuration,
      expectancy,
      stdDevReturns,
    };
  }

  private getEmptyMetrics(): BacktestMetrics {
    return {
      totalReturn: 0,
      totalReturnPercent: 0,
      annualizedReturn: 0,
      cagr: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      winRate: 0,
      profitFactor: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      averageTradeDuration: 0,
      expectancy: 0,
      stdDevReturns: 0,
    };
  }
}

export default new BacktestService();
