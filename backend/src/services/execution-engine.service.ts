/**
 * Execution Decision Engine Service
 * Performs risk checks and executes approved trades
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';
import { TradingAgentService } from './trading-agent.service';
import { TradeStationService } from './tradestation.service';
import {
  TradeRecommendation,
  TradingAgent,
  ExecutedTrade,
  RiskCheckResults,
  PortfolioState
} from '../types/trading-agent.types';

interface CheckResult {
  passed: boolean;
  reason?: string;
}

interface ExecutionResult {
  success: boolean;
  trade?: ExecutedTrade;
  recommendation: TradeRecommendation;
  error?: string;
}

export class ExecutionEngineService {
  private db: DatabaseService;
  private tradingAgentService: TradingAgentService;
  private tradeStationService: TradeStationService;

  constructor() {
    this.db = new DatabaseService();
    this.tradingAgentService = new TradingAgentService();
    this.tradeStationService = new TradeStationService();
  }

  /**
   * Main decision entry point
   */
  async processRecommendation(recommendation: TradeRecommendation): Promise<ExecutionResult> {
    try {
      console.log(`[ExecutionEngine] ⚖️ Processing recommendation: ${recommendation.ticker} @ $${recommendation.entryPrice}`);

      // Get agent
      const agent = await this.tradingAgentService.getAgent(recommendation.agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${recommendation.agentId}`);
      }

      // Check if agent is active
      if (!agent.active) {
        console.log(`[ExecutionEngine] ⏸️ Agent ${agent.name} is inactive, skipping execution`);
        await this.rejectRecommendation(recommendation, 'Agent is inactive');
        return { success: false, recommendation, error: 'Agent is inactive' };
      }

      // Run all risk checks
      const riskChecks = await this.runRiskChecks(recommendation, agent);
      recommendation.riskChecks = riskChecks;

      // Update recommendation with risk check results
      await this.updateRecommendationRiskChecks(recommendation.id, riskChecks);

      // Check if all risk checks passed
      const allPassed = Object.values(riskChecks).every(check => check.passed);

      if (!allPassed) {
        // Collect failed reasons
        const failedChecks = Object.entries(riskChecks)
          .filter(([_, check]) => !check.passed)
          .map(([name, check]) => `${name}: ${check.reason}`)
          .join('; ');

        console.log(`[ExecutionEngine] ❌ Risk checks failed: ${failedChecks}`);

        await this.rejectRecommendation(recommendation, failedChecks);

        // Log activity
        await this.tradingAgentService.logActivity(
          agent.id,
          'RISK_LIMIT_HIT',
          `Trade rejected: ${failedChecks}`,
          recommendation.ticker,
          { recommendationId: recommendation.id, failedChecks: riskChecks }
        );

        return { success: false, recommendation, error: failedChecks };
      }

      // All checks passed - check if auto-execution is enabled
      const autoExecutionEnabled = process.env.AUTO_EXECUTION_ENABLED !== 'false';

      if (!autoExecutionEnabled) {
        console.log(`[ExecutionEngine] ✅ All risk checks passed, awaiting manual approval`);
        await this.approveRecommendation(recommendation);
        return { success: true, recommendation };
      }

      // Execute the order
      console.log(`[ExecutionEngine] 🚀 All risk checks passed, executing order`);
      const trade = await this.executeOrder(recommendation, agent);

      // Update recommendation status
      await this.updateRecommendationStatus(recommendation.id, 'EXECUTED');

      // Log activity
      await this.tradingAgentService.logActivity(
        agent.id,
        'ORDER_PLACED',
        `Order placed: ${recommendation.side} ${recommendation.positionSize} ${recommendation.ticker} @ $${recommendation.entryPrice}`,
        recommendation.ticker,
        { recommendationId: recommendation.id, tradeId: trade.id }
      );

      console.log(`[ExecutionEngine] ✅ Trade executed: ${trade.id}`);

      return { success: true, trade, recommendation };

    } catch (error) {
      console.error('[ExecutionEngine] Error processing recommendation:', error);

      // Log error
      await this.tradingAgentService.logActivity(
        recommendation.agentId,
        'ERROR',
        `Execution error: ${error.message}`,
        recommendation.ticker,
        { recommendationId: recommendation.id, error: error.message }
      );

      return {
        success: false,
        recommendation,
        error: error.message
      };
    }
  }

  /**
   * Run all risk checks
   */
  private async runRiskChecks(
    recommendation: TradeRecommendation,
    agent: TradingAgent
  ): Promise<RiskCheckResults> {
    const portfolioState = await this.tradingAgentService.getPortfolioState(agent.id);
    if (!portfolioState) {
      throw new Error(`Portfolio state not found for agent ${agent.id}`);
    }

    // Calculate position value
    const positionValue = recommendation.positionSize * recommendation.entryPrice;

    // Run all 6 risk checks
    const checks: RiskCheckResults = {
      positionSize: this.checkPositionSize(positionValue, agent.riskLimits.maxPositionSize),
      portfolioExposure: this.checkPortfolioExposure(
        portfolioState,
        positionValue,
        agent.riskLimits.maxPortfolioExposure
      ),
      dailyLoss: this.checkDailyLoss(portfolioState, agent.riskLimits.maxDailyLoss),
      concurrentPositions: this.checkConcurrentPositions(
        portfolioState,
        agent.riskLimits.maxConcurrentPositions
      ),
      confidenceScore: this.checkConfidenceScore(
        recommendation.confidenceScore,
        agent.riskLimits.minConfidenceScore
      ),
      correlation: this.checkCorrelation(
        recommendation.ticker,
        portfolioState,
        agent.riskLimits.maxCorrelation
      )
    };

    return checks;
  }

  /**
   * Risk Check 1: Position Size
   */
  private checkPositionSize(positionValue: number, maxPositionSize: number): CheckResult {
    if (positionValue > maxPositionSize) {
      return {
        passed: false,
        reason: `Position value $${positionValue.toFixed(2)} exceeds limit $${maxPositionSize.toFixed(2)}`
      };
    }

    return { passed: true };
  }

  /**
   * Risk Check 2: Portfolio Exposure
   */
  private checkPortfolioExposure(
    portfolioState: PortfolioState,
    newPositionValue: number,
    maxExposurePercent: number
  ): CheckResult {
    const newTotalExposure = portfolioState.totalExposure + newPositionValue;
    const exposurePercent = (newTotalExposure / portfolioState.totalEquity) * 100;

    if (exposurePercent > maxExposurePercent) {
      return {
        passed: false,
        reason: `Portfolio exposure ${exposurePercent.toFixed(1)}% exceeds limit ${maxExposurePercent}%`
      };
    }

    return { passed: true };
  }

  /**
   * Risk Check 3: Daily Loss Limit
   */
  private checkDailyLoss(portfolioState: PortfolioState, maxDailyLoss: number): CheckResult {
    if (portfolioState.dailyPnL < -maxDailyLoss) {
      return {
        passed: false,
        reason: `Daily loss $${Math.abs(portfolioState.dailyPnL).toFixed(2)} hit limit $${maxDailyLoss.toFixed(2)}. Trading halted.`
      };
    }

    return { passed: true };
  }

  /**
   * Risk Check 4: Concurrent Positions
   */
  private checkConcurrentPositions(
    portfolioState: PortfolioState,
    maxConcurrentPositions: number
  ): CheckResult {
    if (portfolioState.openTradeCount >= maxConcurrentPositions) {
      return {
        passed: false,
        reason: `Already at max ${maxConcurrentPositions} positions (current: ${portfolioState.openTradeCount})`
      };
    }

    return { passed: true };
  }

  /**
   * Risk Check 5: Confidence Score
   */
  private checkConfidenceScore(confidenceScore: number, minConfidenceScore: number): CheckResult {
    if (confidenceScore < minConfidenceScore) {
      return {
        passed: false,
        reason: `Confidence ${confidenceScore} below threshold ${minConfidenceScore}`
      };
    }

    return { passed: true };
  }

  /**
   * Risk Check 6: Correlation
   */
  private checkCorrelation(
    ticker: string,
    portfolioState: PortfolioState,
    maxCorrelation: number
  ): CheckResult {
    // Check if already have position in same ticker
    if (portfolioState.positions[ticker]) {
      return {
        passed: false,
        reason: `Already have position in ${ticker} (correlation: 1.0)`
      };
    }

    // For now, allow all other positions (correlation assumed low)
    // TODO: Implement actual correlation calculation using historical price data
    const estimatedCorrelation = 0.3;

    if (estimatedCorrelation > maxCorrelation) {
      return {
        passed: false,
        reason: `Correlation ${estimatedCorrelation.toFixed(2)} exceeds limit ${maxCorrelation}`
      };
    }

    return { passed: true };
  }

  /**
   * Execute order via TradeStation
   */
  private async executeOrder(
    recommendation: TradeRecommendation,
    agent: TradingAgent
  ): Promise<ExecutedTrade> {
    // Place order via TradeStation
    const orderResult = await this.tradeStationService.placeOrder(agent.accountId, {
      symbol: recommendation.ticker,
      quantity: recommendation.positionSize,
      side: recommendation.side === 'LONG' ? 'Buy' : 'Sell',
      orderType: 'Market', // Can be configurable
      timeInForce: 'Day'
    });

    // Create executed trade record
    const trade: ExecutedTrade = {
      id: uuidv4(),
      agentId: agent.id,
      recommendationId: recommendation.id,
      ticker: recommendation.ticker,
      side: recommendation.side,
      entryTime: new Date(),
      entryPrice: recommendation.entryPrice,
      positionSize: recommendation.positionSize,
      entryOrderId: orderResult.orderId || '',
      stopLoss: recommendation.stopLoss,
      takeProfit: recommendation.takeProfit,
      status: 'OPEN',
      patternType: '', // Will be populated from signal
      confidenceScore: recommendation.confidenceScore,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database
    await this.saveExecutedTrade(trade);

    // Update portfolio state
    await this.updatePortfolioStateAfterEntry(agent.id, trade);

    return trade;
  }

  /**
   * Save executed trade to database
   */
  private async saveExecutedTrade(trade: ExecutedTrade): Promise<void> {
    const query = `
      INSERT INTO executed_trades (
        id, agent_id, recommendation_id, ticker, side, entry_time, entry_price,
        position_size, entry_order_id, stop_loss, take_profit, status,
        pattern_type, confidence_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      trade.id,
      trade.agentId,
      trade.recommendationId,
      trade.ticker,
      trade.side,
      trade.entryTime.toISOString(),
      trade.entryPrice,
      trade.positionSize,
      trade.entryOrderId,
      trade.stopLoss,
      trade.takeProfit,
      trade.status,
      trade.patternType,
      trade.confidenceScore,
      trade.createdAt.toISOString(),
      trade.updatedAt.toISOString()
    ]);
  }

  /**
   * Update portfolio state after trade entry
   */
  private async updatePortfolioStateAfterEntry(agentId: string, trade: ExecutedTrade): Promise<void> {
    const portfolioState = await this.tradingAgentService.getPortfolioState(agentId);
    if (!portfolioState) return;

    // Deduct cash
    const positionCost = trade.entryPrice * trade.positionSize;
    portfolioState.cash -= positionCost;

    // Add position
    portfolioState.positions[trade.ticker] = {
      ticker: trade.ticker,
      shares: trade.positionSize,
      avgPrice: trade.entryPrice,
      currentPrice: trade.entryPrice,
      pnl: 0,
      pnlPercent: 0,
      marketValue: positionCost,
      entryTime: trade.entryTime
    };

    // Update metrics
    portfolioState.openTradeCount++;
    portfolioState.totalExposure += positionCost;
    portfolioState.lastUpdated = new Date();

    // Save to database
    const query = `
      UPDATE portfolio_state
      SET cash = ?,
          positions = ?,
          total_equity = ?,
          open_trade_count = ?,
          total_exposure = ?,
          last_updated = ?
      WHERE agent_id = ?
    `;

    await this.db.run(query, [
      portfolioState.cash,
      JSON.stringify(portfolioState.positions),
      portfolioState.totalEquity,
      portfolioState.openTradeCount,
      portfolioState.totalExposure,
      portfolioState.lastUpdated.toISOString(),
      agentId
    ]);
  }

  /**
   * Reject recommendation
   */
  private async rejectRecommendation(recommendation: TradeRecommendation, reason: string): Promise<void> {
    await this.updateRecommendationStatus(recommendation.id, 'REJECTED');

    console.log(`[ExecutionEngine] ❌ Recommendation rejected: ${recommendation.ticker} - ${reason}`);
  }

  /**
   * Approve recommendation (manual approval mode)
   */
  private async approveRecommendation(recommendation: TradeRecommendation): Promise<void> {
    await this.updateRecommendationStatus(recommendation.id, 'APPROVED');

    console.log(`[ExecutionEngine] ✅ Recommendation approved: ${recommendation.ticker} - awaiting manual execution`);
  }

  /**
   * Update recommendation status
   */
  private async updateRecommendationStatus(recommendationId: string, status: string): Promise<void> {
    const query = `
      UPDATE trade_recommendations
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(query, [status, recommendationId]);
  }

  /**
   * Update recommendation risk checks
   */
  private async updateRecommendationRiskChecks(
    recommendationId: string,
    riskChecks: RiskCheckResults
  ): Promise<void> {
    const query = `
      UPDATE trade_recommendations
      SET risk_checks = ?, updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(query, [JSON.stringify(riskChecks), recommendationId]);
  }

  /**
   * Get executed trades for agent
   */
  async getExecutedTrades(agentId: string, status?: string): Promise<ExecutedTrade[]> {
    let query = `SELECT * FROM executed_trades WHERE agent_id = ?`;
    const params: any[] = [agentId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY entry_time DESC`;

    const rows = await this.db.all(query, params);

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      recommendationId: row.recommendation_id,
      ticker: row.ticker,
      side: row.side,
      entryTime: new Date(row.entry_time),
      entryPrice: row.entry_price,
      positionSize: row.position_size,
      entryOrderId: row.entry_order_id,
      exitTime: row.exit_time ? new Date(row.exit_time) : undefined,
      exitPrice: row.exit_price,
      exitOrderId: row.exit_order_id,
      pnl: row.pnl,
      pnlPercent: row.pnl_percent,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      trailingStop: row.trailing_stop,
      exitReason: row.exit_reason,
      status: row.status,
      patternType: row.pattern_type,
      confidenceScore: row.confidence_score,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  /**
   * Get open trades for agent
   */
  async getOpenTrades(agentId: string): Promise<ExecutedTrade[]> {
    return this.getExecutedTrades(agentId, 'OPEN');
  }

  /**
   * Close a trade
   */
  async closeTrade(
    tradeId: string,
    exitPrice: number,
    exitReason: string
  ): Promise<ExecutedTrade> {
    // Get the trade
    const query = `SELECT * FROM executed_trades WHERE id = ?`;
    const row = await this.db.get(query, [tradeId]);

    if (!row) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    // Calculate P&L
    const pnl = row.side === 'LONG'
      ? (exitPrice - row.entry_price) * row.position_size
      : (row.entry_price - exitPrice) * row.position_size;

    const pnlPercent = (pnl / (row.entry_price * row.position_size)) * 100;

    // Update trade
    const updateQuery = `
      UPDATE executed_trades
      SET exit_time = ?,
          exit_price = ?,
          pnl = ?,
          pnl_percent = ?,
          exit_reason = ?,
          status = 'CLOSED',
          updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(updateQuery, [
      new Date().toISOString(),
      exitPrice,
      pnl,
      pnlPercent,
      exitReason,
      tradeId
    ]);

    // Update portfolio state
    await this.updatePortfolioStateAfterExit(row.agent_id, row.ticker, exitPrice, pnl);

    // Log activity
    await this.tradingAgentService.logActivity(
      row.agent_id,
      'POSITION_CLOSED',
      `Position closed: ${row.ticker} @ $${exitPrice} - P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`,
      row.ticker,
      { tradeId, exitReason, pnl, pnlPercent }
    );

    // Return updated trade
    const updatedRow = await this.db.get(query, [tradeId]);
    return this.rowToTrade(updatedRow);
  }

  /**
   * Update portfolio state after trade exit
   */
  private async updatePortfolioStateAfterExit(
    agentId: string,
    ticker: string,
    exitPrice: number,
    pnl: number
  ): Promise<void> {
    const portfolioState = await this.tradingAgentService.getPortfolioState(agentId);
    if (!portfolioState) return;

    const position = portfolioState.positions[ticker];
    if (!position) return;

    // Add proceeds to cash
    const proceeds = position.shares * exitPrice;
    portfolioState.cash += proceeds;

    // Update daily P&L
    portfolioState.dailyPnL += pnl;
    portfolioState.dailyPnLPercent = (portfolioState.dailyPnL / portfolioState.totalEquity) * 100;

    // Remove position
    const positionValue = position.shares * position.avgPrice;
    portfolioState.totalExposure -= positionValue;
    portfolioState.openTradeCount--;
    delete portfolioState.positions[ticker];

    // Recalculate total equity
    portfolioState.totalEquity = portfolioState.cash + Object.values(portfolioState.positions)
      .reduce((sum, pos) => sum + pos.marketValue, 0);

    portfolioState.lastUpdated = new Date();

    // Save to database
    const query = `
      UPDATE portfolio_state
      SET cash = ?,
          positions = ?,
          total_equity = ?,
          daily_pnl = ?,
          daily_pnl_percent = ?,
          open_trade_count = ?,
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
      portfolioState.openTradeCount,
      portfolioState.totalExposure,
      portfolioState.lastUpdated.toISOString(),
      agentId
    ]);
  }

  /**
   * Convert database row to ExecutedTrade
   */
  private rowToTrade(row: any): ExecutedTrade {
    return {
      id: row.id,
      agentId: row.agent_id,
      recommendationId: row.recommendation_id,
      ticker: row.ticker,
      side: row.side,
      entryTime: new Date(row.entry_time),
      entryPrice: row.entry_price,
      positionSize: row.position_size,
      entryOrderId: row.entry_order_id,
      exitTime: row.exit_time ? new Date(row.exit_time) : undefined,
      exitPrice: row.exit_price,
      exitOrderId: row.exit_order_id,
      pnl: row.pnl,
      pnlPercent: row.pnl_percent,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      trailingStop: row.trailing_stop,
      exitReason: row.exit_reason,
      status: row.status,
      patternType: row.pattern_type,
      confidenceScore: row.confidence_score,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
