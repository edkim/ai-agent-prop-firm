/**
 * Position Monitor Service
 * Real-time position monitoring and exit management
 */

import { getDatabase } from '../database/db';
import tradingAgentService from './live-trading-agent.service';
import tradestationService from './tradestation.service';
import { ExecutionEngineService } from './execution-engine.service';
import { ExecutedTrade, TradingAgent } from '../types/trading-agent.types';

interface ExitDecision {
  shouldExit: boolean;
  reason?: 'STOP_HIT' | 'TARGET_HIT' | 'TIME_EXIT' | 'TRAILING_STOP';
  exitPrice?: number;
  updateTrailingStop?: boolean;
  newTrailingStop?: number;
}

interface PositionUpdate {
  ticker: string;
  currentPrice: number;
  timestamp: Date;
}

export class PositionMonitorService {
  private executionEngine: ExecutionEngineService;
  private monitoringIntervals: Map<string, NodeJS.Timeout>;
  private readonly MONITOR_INTERVAL_MS = 5000; // 5 seconds
  private readonly MAX_SLIPPAGE_PERCENT = 2;

  constructor() {
    this.executionEngine = new ExecutionEngineService();
    this.monitoringIntervals = new Map();
  }

  /**
   * Start monitoring positions for an agent
   */
  startMonitoring(agentId: string): void {
    // Don't start if already monitoring
    if (this.monitoringIntervals.has(agentId)) {
      console.log(`[PositionMonitor] Already monitoring agent ${agentId}`);
      return;
    }

    console.log(`[PositionMonitor] 📊 Starting position monitoring for agent ${agentId}`);

    const interval = setInterval(async () => {
      try {
        await this.monitorPositions(agentId);
      } catch (error) {
        console.error(`[PositionMonitor] Error monitoring agent ${agentId}:`, error);
      }
    }, this.MONITOR_INTERVAL_MS);

    this.monitoringIntervals.set(agentId, interval);
  }

  /**
   * Stop monitoring positions for an agent
   */
  stopMonitoring(agentId: string): void {
    const interval = this.monitoringIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(agentId);
      console.log(`[PositionMonitor] ⏹️ Stopped monitoring agent ${agentId}`);
    }
  }

  /**
   * Main monitoring loop - checks all open positions
   */
  async monitorPositions(agentId: string): Promise<void> {
    try {
      // Get agent
      const agent = await tradingAgentService.getAgent(agentId);
      if (!agent || !agent.active) {
        return; // Agent inactive, skip monitoring
      }

      // Get all open trades
      const openTrades = await this.executionEngine.getOpenTrades(agentId);

      if (openTrades.length === 0) {
        return; // No open positions
      }

      // Get current prices for all tickers
      const tickers = [...new Set(openTrades.map(t => t.ticker))];
      const priceUpdates = await this.getCurrentPrices(tickers);

      // Check each position
      for (const trade of openTrades) {
        const priceUpdate = priceUpdates.get(trade.ticker);
        if (!priceUpdate) {
          console.warn(`[PositionMonitor] No price data for ${trade.ticker}`);
          continue;
        }

        // Update position prices in portfolio state
        await this.updatePositionPrices(agentId, trade.ticker, priceUpdate.currentPrice);

        // Check exit conditions
        const exitDecision = await this.checkPosition(trade, priceUpdate.currentPrice, agent);

        if (exitDecision.shouldExit && exitDecision.reason) {
          // Execute exit
          await this.executeExit(
            trade,
            exitDecision.exitPrice || priceUpdate.currentPrice,
            exitDecision.reason
          );
        } else if (exitDecision.updateTrailingStop && exitDecision.newTrailingStop) {
          // Update trailing stop
          await this.updateTrailingStopLevel(trade.id, exitDecision.newTrailingStop);
        }
      }

    } catch (error) {
      console.error('[PositionMonitor] Error in monitoring loop:', error);
    }
  }

  /**
   * Check a single position against all exit conditions
   */
  async checkPosition(
    trade: ExecutedTrade,
    currentPrice: number,
    agent: TradingAgent
  ): Promise<ExitDecision> {
    // Priority 1: Stop Loss (prevent catastrophic loss)
    if (this.checkStopLoss(trade, currentPrice)) {
      return {
        shouldExit: true,
        reason: 'STOP_HIT',
        exitPrice: currentPrice
      };
    }

    // Priority 2: Trailing Stop (lock in profits)
    if (trade.trailingStop && this.checkTrailingStop(trade, currentPrice)) {
      return {
        shouldExit: true,
        reason: 'TRAILING_STOP',
        exitPrice: currentPrice
      };
    }

    // Priority 3: Take Profit (capture target gains)
    if (this.checkTakeProfit(trade, currentPrice)) {
      return {
        shouldExit: true,
        reason: 'TARGET_HIT',
        exitPrice: currentPrice
      };
    }

    // Priority 4: Time Exit (cleanup stale positions)
    if (this.checkTimeExit(trade, agent.timeframe)) {
      return {
        shouldExit: true,
        reason: 'TIME_EXIT',
        exitPrice: currentPrice
      };
    }

    // Check if trailing stop should be updated
    const trailingUpdate = this.calculateTrailingStopUpdate(trade, currentPrice);
    if (trailingUpdate) {
      return {
        shouldExit: false,
        updateTrailingStop: true,
        newTrailingStop: trailingUpdate
      };
    }

    return { shouldExit: false };
  }

  /**
   * Check if stop loss is hit
   */
  private checkStopLoss(trade: ExecutedTrade, currentPrice: number): boolean {
    if (trade.side === 'LONG') {
      return currentPrice <= trade.stopLoss;
    } else {
      return currentPrice >= trade.stopLoss;
    }
  }

  /**
   * Check if take profit target is hit
   */
  private checkTakeProfit(trade: ExecutedTrade, currentPrice: number): boolean {
    if (trade.side === 'LONG') {
      return currentPrice >= trade.takeProfit;
    } else {
      return currentPrice <= trade.takeProfit;
    }
  }

  /**
   * Check if trailing stop is hit
   */
  private checkTrailingStop(trade: ExecutedTrade, currentPrice: number): boolean {
    if (!trade.trailingStop) return false;

    if (trade.side === 'LONG') {
      return currentPrice <= trade.trailingStop;
    } else {
      return currentPrice >= trade.trailingStop;
    }
  }

  /**
   * Check if time-based exit is triggered
   */
  private checkTimeExit(trade: ExecutedTrade, timeframe: string): boolean {
    const now = new Date();
    const entryTime = new Date(trade.entryTime);

    switch (timeframe) {
      case 'intraday':
        // Exit 5 minutes before market close (3:55 PM ET)
        return this.isNearMarketClose(now);

      case 'swing':
        // Max 5 trading days
        return this.getTradingDaysHeld(entryTime, now) >= 5;

      case 'position':
        // Max 20 trading days
        return this.getTradingDaysHeld(entryTime, now) >= 20;

      default:
        return false;
    }
  }

  /**
   * Calculate trailing stop update
   */
  private calculateTrailingStopUpdate(trade: ExecutedTrade, currentPrice: number): number | null {
    if (!trade.trailingStop) return null;

    // Get trailing percent from database (default 5%)
    const trailingPercent = 5;

    if (trade.side === 'LONG') {
      // Check if price made new high
      const currentHighWaterMark = Math.max(trade.entryPrice, currentPrice);
      const newTrailingStop = currentHighWaterMark * (1 - trailingPercent / 100);

      // Only update if new stop is higher (tighter)
      if (newTrailingStop > trade.trailingStop) {
        return newTrailingStop;
      }
    } else {
      // SHORT position
      const currentLowWaterMark = Math.min(trade.entryPrice, currentPrice);
      const newTrailingStop = currentLowWaterMark * (1 + trailingPercent / 100);

      // Only update if new stop is lower (tighter)
      if (newTrailingStop < trade.trailingStop) {
        return newTrailingStop;
      }
    }

    return null;
  }

  /**
   * Execute exit order
   */
  private async executeExit(
    trade: ExecutedTrade,
    exitPrice: number,
    reason: string
  ): Promise<void> {
    try {
      console.log(`[PositionMonitor] 🚪 Exiting ${trade.ticker}: ${reason} @ $${exitPrice.toFixed(2)}`);

      // Check slippage
      const expectedPrice = this.getExpectedExitPrice(trade, reason);
      const slippage = Math.abs((exitPrice - expectedPrice) / expectedPrice) * 100;

      if (slippage > this.MAX_SLIPPAGE_PERCENT) {
        console.warn(`[PositionMonitor] ⚠️ High slippage detected: ${slippage.toFixed(2)}%`);
      }

      // Close the trade
      await this.executionEngine.closeTrade(trade.id, exitPrice, reason);

      console.log(`[PositionMonitor] ✅ Position closed: ${trade.ticker} - ${reason}`);

    } catch (error) {
      console.error('[PositionMonitor] Error executing exit:', error);

      // Log error activity
      await tradingAgentService.logActivity(
        trade.agentId,
        'ERROR',
        `Failed to execute exit for ${trade.ticker}: ${error.message}`,
        trade.ticker,
        { tradeId: trade.id, reason, error: error.message }
      );
    }
  }

  /**
   * Get expected exit price based on reason
   */
  private getExpectedExitPrice(trade: ExecutedTrade, reason: string): number {
    switch (reason) {
      case 'STOP_HIT':
        return trade.stopLoss;
      case 'TARGET_HIT':
        return trade.takeProfit;
      case 'TRAILING_STOP':
        return trade.trailingStop || trade.stopLoss;
      case 'TIME_EXIT':
        return trade.entryPrice; // No specific target
      default:
        return trade.entryPrice;
    }
  }

  /**
   * Update position prices in portfolio state
   */
  async updatePositionPrices(
    agentId: string,
    ticker: string,
    currentPrice: number
  ): Promise<void> {
    try {
      const portfolioState = await tradingAgentService.getPortfolioState(agentId);
      if (!portfolioState) return;

      const position = portfolioState.positions[ticker];
      if (!position) return;

      // Update current price
      position.currentPrice = currentPrice;

      // Recalculate P&L
      position.pnl = (currentPrice - position.avgPrice) * position.shares;
      position.pnlPercent = (position.pnl / (position.avgPrice * position.shares)) * 100;

      // Update market value
      position.marketValue = currentPrice * position.shares;

      // Recalculate total equity
      const totalPositionValue = Object.values(portfolioState.positions)
        .reduce((sum, pos) => sum + pos.marketValue, 0);

      portfolioState.totalEquity = portfolioState.cash + totalPositionValue;

      // Update unrealized P&L
      const unrealizedPnL = Object.values(portfolioState.positions)
        .reduce((sum, pos) => sum + pos.pnl, 0);

      // Get realized P&L for today
      const realizedPnL = await this.getRealizedPnLToday(agentId);

      portfolioState.dailyPnL = realizedPnL + unrealizedPnL;
      portfolioState.dailyPnLPercent = (portfolioState.dailyPnL / portfolioState.totalEquity) * 100;
      portfolioState.lastUpdated = new Date();

      // Save updated state
      await this.savePortfolioState(agentId, portfolioState);

    } catch (error) {
      console.error('[PositionMonitor] Error updating position prices:', error);
    }
  }

  /**
   * Get current prices for tickers
   */
  private async getCurrentPrices(tickers: string[]): Promise<Map<string, PositionUpdate>> {
    const prices = new Map<string, PositionUpdate>();

    for (const ticker of tickers) {
      try {
        // In production, use TradeStation WebSocket for real-time prices
        // For now, use last known price or quote API
        const quote = await tradestationService.getQuote(ticker);

        prices.set(ticker, {
          ticker,
          currentPrice: quote.last || quote.bid,
          timestamp: new Date()
        });

      } catch (error) {
        console.error(`[PositionMonitor] Error getting price for ${ticker}:`, error);
      }
    }

    return prices;
  }

  /**
   * Update trailing stop level in database
   */
  private async updateTrailingStopLevel(tradeId: string, newTrailingStop: number): Promise<void> {
    const query = `
      UPDATE executed_trades
      SET trailing_stop = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(query, [newTrailingStop, tradeId]);

    console.log(`[PositionMonitor] Updated trailing stop for trade ${tradeId}: $${newTrailingStop.toFixed(2)}`);
  }

  /**
   * Get realized P&L for today
   */
  private async getRealizedPnLToday(agentId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const query = `
      SELECT COALESCE(SUM(pnl), 0) as total_pnl
      FROM executed_trades
      WHERE agent_id = ?
        AND status = 'CLOSED'
        AND DATE(exit_time) = ?
    `;

    const result = await this.db.get(query, [agentId, today]);
    return result.total_pnl || 0;
  }

  /**
   * Save portfolio state to database
   */
  private async savePortfolioState(agentId: string, portfolioState: any): Promise<void> {
    const query = `
      UPDATE portfolio_state
      SET cash = ?,
          positions = ?,
          total_equity = ?,
          daily_pnl = ?,
          daily_pnl_percent = ?,
          total_exposure = ?,
          last_updated = ?
      WHERE agent_id = ?
    `;

    await this.db.run(query, [
      portfolioState.cash,
      JSON.stringify(portfolioState.positions),
      portfolioState.totalEquity,
      portfolioState.dailyPnL,
      portfolioState.dailyPnLPercent,
      portfolioState.totalExposure,
      portfolioState.lastUpdated.toISOString(),
      agentId
    ]);
  }

  /**
   * Check if near market close (3:55 PM ET)
   */
  private isNearMarketClose(now: Date): boolean {
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Simple check: 3:55 PM or later (15:55)
    // In production, account for timezone and market holidays
    return hours >= 15 && minutes >= 55;
  }

  /**
   * Count trading days between two dates
   */
  private getTradingDaysHeld(entryTime: Date, exitTime: Date): number {
    let tradingDays = 0;
    const current = new Date(entryTime);

    while (current < exitTime) {
      const dayOfWeek = current.getDay();

      // Count weekdays only (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        tradingDays++;
      }

      current.setDate(current.getDate() + 1);
    }

    return tradingDays;
  }

  /**
   * Enable trailing stop for a trade
   */
  async enableTrailingStop(
    tradeId: string,
    trailPercent: number,
    activationPercent: number = 2
  ): Promise<void> {
    // Get the trade
    const query = `SELECT * FROM executed_trades WHERE id = ?`;
    const trade = await this.db.get(query, [tradeId]);

    if (!trade || trade.status !== 'OPEN') {
      throw new Error(`Trade ${tradeId} not found or not open`);
    }

    // Get current price
    const quote = await tradestationService.getQuote(trade.ticker);
    const currentPrice = quote.last || quote.bid;

    // Check if position has reached activation threshold
    const pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;

    if (trade.side === 'LONG' && pnlPercent < activationPercent) {
      throw new Error(`Position not yet at +${activationPercent}% to activate trailing stop (current: ${pnlPercent.toFixed(2)}%)`);
    }

    // Calculate initial trailing stop
    const trailingStop = trade.side === 'LONG'
      ? currentPrice * (1 - trailPercent / 100)
      : currentPrice * (1 + trailPercent / 100);

    // Update trade
    const updateQuery = `
      UPDATE executed_trades
      SET trailing_stop = ?,
          trailing_percent = ?,
          trailing_active = 1,
          high_water_mark = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(updateQuery, [
      trailingStop,
      trailPercent,
      currentPrice,
      tradeId
    ]);

    console.log(`[PositionMonitor] ✅ Trailing stop enabled for ${trade.ticker}: ${trailPercent}% @ $${trailingStop.toFixed(2)}`);

    // Log activity
    await tradingAgentService.logActivity(
      trade.agent_id,
      'STATUS_CHANGE',
      `Trailing stop enabled: ${trailPercent}% @ $${trailingStop.toFixed(2)}`,
      trade.ticker,
      { tradeId, trailPercent, trailingStop }
    );
  }

  /**
   * Get monitoring status for all agents
   */
  getMonitoringStatus(): { agentId: string; monitoring: boolean }[] {
    const agents: string[] = Array.from(this.monitoringIntervals.keys());

    return agents.map(agentId => ({
      agentId,
      monitoring: true
    }));
  }
}
