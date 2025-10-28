/**
 * Risk Metrics Service
 * Calculate and track performance metrics for trading agents
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';
import { TradingAgentService } from './trading-agent.service';
import { RiskMetrics, ExecutedTrade } from '../types/trading-agent.types';

interface DailyReturn {
  date: Date;
  pnl: number;
  pnlPercent: number;
  equity: number;
}

export class RiskMetricsService {
  private db: DatabaseService;
  private tradingAgentService: TradingAgentService;

  constructor() {
    this.db = new DatabaseService();
    this.tradingAgentService = new TradingAgentService();
  }

  /**
   * Calculate daily risk metrics for an agent
   */
  async calculateDailyMetrics(agentId: string, date: Date): Promise<RiskMetrics> {
    try {
      const dateStr = date.toISOString().split('T')[0];

      // Get all trades closed on this date
      const closedTrades = await this.getClosedTradesForDate(agentId, dateStr);

      // Get portfolio state for this date
      const portfolioState = await this.tradingAgentService.getPortfolioState(agentId);

      if (!portfolioState) {
        throw new Error(`Portfolio state not found for agent ${agentId}`);
      }

      // Calculate exposure metrics
      const exposureMetrics = this.calculateExposureMetrics(closedTrades, portfolioState);

      // Calculate P&L metrics
      const pnlMetrics = this.calculatePnLMetrics(closedTrades, portfolioState);

      // Calculate risk metrics
      const riskMetricsData = await this.calculateRiskMetrics(agentId, dateStr);

      // Calculate trade statistics
      const tradeStats = this.calculateTradeStatistics(closedTrades);

      // Build risk metrics object
      const metrics: RiskMetrics = {
        id: uuidv4(),
        agentId,
        metricDate: date,

        // Exposure
        totalExposure: exposureMetrics.totalExposure,
        maxPositionSize: exposureMetrics.maxPositionSize,
        avgPositionSize: exposureMetrics.avgPositionSize,

        // P&L
        dailyPnL: pnlMetrics.dailyPnL,
        dailyPnLPercent: pnlMetrics.dailyPnLPercent,
        cumulativePnL: pnlMetrics.cumulativePnL,

        // Risk
        maxDrawdown: riskMetricsData.maxDrawdown,
        currentDrawdown: riskMetricsData.currentDrawdown,
        sharpeRatio: riskMetricsData.sharpeRatio,
        sortinoRatio: riskMetricsData.sortinoRatio,

        // Trade statistics
        totalTrades: tradeStats.totalTrades,
        winningTrades: tradeStats.winningTrades,
        losingTrades: tradeStats.losingTrades,
        winRate: tradeStats.winRate,
        avgWin: tradeStats.avgWin,
        avgLoss: tradeStats.avgLoss,
        largestWin: tradeStats.largestWin,
        largestLoss: tradeStats.largestLoss,
        profitFactor: tradeStats.profitFactor,

        createdAt: new Date()
      };

      // Save to database
      await this.saveMetrics(metrics);

      console.log(`[RiskMetrics] 📊 Calculated daily metrics for ${agentId} on ${dateStr}`);

      return metrics;

    } catch (error) {
      console.error('[RiskMetrics] Error calculating daily metrics:', error);
      throw error;
    }
  }

  /**
   * Update metrics after a trade closes
   */
  async updateMetricsAfterTrade(agentId: string, trade: ExecutedTrade): Promise<void> {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      // Check if metrics exist for today
      const existingMetrics = await this.getMetricsByDate(agentId, dateStr);

      if (existingMetrics) {
        // Recalculate metrics for the day
        await this.calculateDailyMetrics(agentId, today);
      } else {
        // Create new metrics
        await this.calculateDailyMetrics(agentId, today);
      }

      console.log(`[RiskMetrics] ✅ Updated metrics after trade close: ${trade.ticker}`);

    } catch (error) {
      console.error('[RiskMetrics] Error updating metrics:', error);
    }
  }

  /**
   * Get metrics for a date range
   */
  async getMetrics(
    agentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RiskMetrics[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const query = `
      SELECT * FROM risk_metrics
      WHERE agent_id = ?
        AND metric_date >= ?
        AND metric_date <= ?
      ORDER BY metric_date DESC
    `;

    const rows = await this.db.all(query, [agentId, startStr, endStr]);

    return rows.map(row => this.rowToMetrics(row));
  }

  /**
   * Get latest metrics for an agent
   */
  async getLatestMetrics(agentId: string): Promise<RiskMetrics | null> {
    const query = `
      SELECT * FROM risk_metrics
      WHERE agent_id = ?
      ORDER BY metric_date DESC
      LIMIT 1
    `;

    const row = await this.db.get(query, [agentId]);

    return row ? this.rowToMetrics(row) : null;
  }

  /**
   * Get equity curve data for charting
   */
  async getEquityCurve(
    agentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyReturn[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const query = `
      SELECT
        metric_date as date,
        daily_pnl as pnl,
        daily_pnl_percent as pnl_percent,
        (SELECT SUM(pnl) FROM executed_trades WHERE agent_id = ? AND DATE(exit_time) <= metric_date) as equity
      FROM risk_metrics
      WHERE agent_id = ?
        AND metric_date >= ?
        AND metric_date <= ?
      ORDER BY metric_date ASC
    `;

    const rows = await this.db.all(query, [agentId, agentId, startStr, endStr]);

    return rows.map(row => ({
      date: new Date(row.date),
      pnl: row.pnl || 0,
      pnlPercent: row.pnl_percent || 0,
      equity: row.equity || 0
    }));
  }

  // ===== PRIVATE CALCULATION METHODS =====

  /**
   * Calculate exposure metrics
   */
  private calculateExposureMetrics(
    closedTrades: ExecutedTrade[],
    portfolioState: any
  ): {
    totalExposure: number;
    maxPositionSize: number;
    avgPositionSize: number;
  } {
    const totalExposure = portfolioState.totalExposure || 0;

    if (closedTrades.length === 0) {
      return {
        totalExposure,
        maxPositionSize: 0,
        avgPositionSize: 0
      };
    }

    const positionSizes = closedTrades.map(t => t.entryPrice * t.positionSize);
    const maxPositionSize = Math.max(...positionSizes);
    const avgPositionSize = positionSizes.reduce((a, b) => a + b, 0) / positionSizes.length;

    return {
      totalExposure,
      maxPositionSize,
      avgPositionSize
    };
  }

  /**
   * Calculate P&L metrics
   */
  private calculatePnLMetrics(
    closedTrades: ExecutedTrade[],
    portfolioState: any
  ): {
    dailyPnL: number;
    dailyPnLPercent: number;
    cumulativePnL: number;
  } {
    const dailyPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const dailyPnLPercent = portfolioState.dailyPnLPercent || 0;

    // Cumulative P&L is calculated from all closed trades
    const cumulativePnL = portfolioState.totalEquity - portfolioState.cash;

    return {
      dailyPnL,
      dailyPnLPercent,
      cumulativePnL
    };
  }

  /**
   * Calculate risk metrics (Sharpe, Sortino, Drawdown)
   */
  private async calculateRiskMetrics(
    agentId: string,
    currentDate: string
  ): Promise<{
    maxDrawdown: number;
    currentDrawdown: number;
    sharpeRatio: number;
    sortinoRatio: number;
  }> {
    // Get historical equity curve
    const equityCurve = await this.getHistoricalEquity(agentId, currentDate);

    if (equityCurve.length < 2) {
      return {
        maxDrawdown: 0,
        currentDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0
      };
    }

    // Calculate returns
    const returns = this.calculateReturns(equityCurve);

    // Calculate max drawdown
    const { maxDrawdown, currentDrawdown } = this.calculateDrawdowns(equityCurve);

    // Calculate Sharpe ratio
    const sharpeRatio = this.calculateSharpeRatio(returns, 0); // Risk-free rate = 0

    // Calculate Sortino ratio
    const sortinoRatio = this.calculateSortinoRatio(returns, 0); // Target return = 0

    return {
      maxDrawdown,
      currentDrawdown,
      sharpeRatio,
      sortinoRatio
    };
  }

  /**
   * Calculate trade statistics
   */
  private calculateTradeStatistics(closedTrades: ExecutedTrade[]): {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    profitFactor: number;
  } {
    if (closedTrades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0
      };
    }

    const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl || 0) < 0);

    const winPnLs = wins.map(t => t.pnl || 0);
    const lossPnLs = losses.map(t => Math.abs(t.pnl || 0));

    const totalWinPnL = winPnLs.reduce((a, b) => a + b, 0);
    const totalLossPnL = lossPnLs.reduce((a, b) => a + b, 0);

    const avgWin = wins.length > 0 ? totalWinPnL / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossPnL / losses.length : 0;

    const largestWin = winPnLs.length > 0 ? Math.max(...winPnLs) : 0;
    const largestLoss = lossPnLs.length > 0 ? Math.max(...lossPnLs) : 0;

    const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : 0;

    return {
      totalTrades: closedTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: (wins.length / closedTrades.length) * 100,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      profitFactor
    };
  }

  /**
   * Calculate Sharpe Ratio
   * (Average Return / Standard Deviation of Returns) * sqrt(252)
   */
  private calculateSharpeRatio(returns: number[], riskFreeRate: number): number {
    if (returns.length < 2) return 0;

    const excessReturns = returns.map(r => r - riskFreeRate);
    const avgReturn = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const variance = excessReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / excessReturns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (assuming 252 trading days)
    const sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252);

    return sharpeRatio;
  }

  /**
   * Calculate Sortino Ratio
   * (Average Return / Downside Deviation) * sqrt(252)
   */
  private calculateSortinoRatio(returns: number[], targetReturn: number): number {
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Only consider returns below target (downside)
    const downsideReturns = returns.filter(r => r < targetReturn);

    if (downsideReturns.length === 0) return 0;

    const downsideVariance = downsideReturns.reduce(
      (sum, r) => sum + Math.pow(r - targetReturn, 2),
      0
    ) / downsideReturns.length;

    const downsideStdDev = Math.sqrt(downsideVariance);

    if (downsideStdDev === 0) return 0;

    // Annualize
    const sortinoRatio = (avgReturn / downsideStdDev) * Math.sqrt(252);

    return sortinoRatio;
  }

  /**
   * Calculate drawdowns
   */
  private calculateDrawdowns(equityCurve: number[]): {
    maxDrawdown: number;
    currentDrawdown: number;
  } {
    let maxEquity = equityCurve[0];
    let maxDrawdown = 0;
    let currentDrawdown = 0;

    for (let i = 1; i < equityCurve.length; i++) {
      const equity = equityCurve[i];

      if (equity > maxEquity) {
        maxEquity = equity;
      }

      const drawdown = ((maxEquity - equity) / maxEquity) * 100;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Current drawdown is from the most recent peak
      if (i === equityCurve.length - 1) {
        currentDrawdown = drawdown;
      }
    }

    return { maxDrawdown, currentDrawdown };
  }

  /**
   * Calculate returns from equity curve
   */
  private calculateReturns(equityCurve: number[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1];
      returns.push(ret);
    }

    return returns;
  }

  /**
   * Get historical equity curve
   */
  private async getHistoricalEquity(
    agentId: string,
    endDate: string
  ): Promise<number[]> {
    const query = `
      SELECT
        metric_date,
        (SELECT total_equity FROM portfolio_state WHERE agent_id = ?) as equity
      FROM risk_metrics
      WHERE agent_id = ?
        AND metric_date <= ?
      ORDER BY metric_date ASC
    `;

    const rows = await this.db.all(query, [agentId, agentId, endDate]);

    return rows.map(row => row.equity || 0);
  }

  /**
   * Get closed trades for a specific date
   */
  private async getClosedTradesForDate(
    agentId: string,
    dateStr: string
  ): Promise<ExecutedTrade[]> {
    const query = `
      SELECT * FROM executed_trades
      WHERE agent_id = ?
        AND status = 'CLOSED'
        AND DATE(exit_time) = ?
      ORDER BY exit_time ASC
    `;

    const rows = await this.db.all(query, [agentId, dateStr]);

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
   * Get metrics by date
   */
  private async getMetricsByDate(agentId: string, dateStr: string): Promise<RiskMetrics | null> {
    const query = `
      SELECT * FROM risk_metrics
      WHERE agent_id = ?
        AND metric_date = ?
    `;

    const row = await this.db.get(query, [agentId, dateStr]);

    return row ? this.rowToMetrics(row) : null;
  }

  /**
   * Save metrics to database
   */
  private async saveMetrics(metrics: RiskMetrics): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO risk_metrics (
        id, agent_id, metric_date,
        total_exposure, max_position_size, avg_position_size,
        daily_pnl, daily_pnl_percent, cumulative_pnl,
        max_drawdown, current_drawdown, sharpe_ratio, sortino_ratio,
        total_trades, winning_trades, losing_trades, win_rate,
        avg_win, avg_loss, largest_win, largest_loss, profit_factor,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      metrics.id,
      metrics.agentId,
      metrics.metricDate.toISOString().split('T')[0],
      metrics.totalExposure,
      metrics.maxPositionSize,
      metrics.avgPositionSize,
      metrics.dailyPnL,
      metrics.dailyPnLPercent,
      metrics.cumulativePnL,
      metrics.maxDrawdown,
      metrics.currentDrawdown,
      metrics.sharpeRatio,
      metrics.sortinoRatio,
      metrics.totalTrades,
      metrics.winningTrades,
      metrics.losingTrades,
      metrics.winRate,
      metrics.avgWin,
      metrics.avgLoss,
      metrics.largestWin,
      metrics.largestLoss,
      metrics.profitFactor,
      metrics.createdAt.toISOString()
    ]);
  }

  /**
   * Convert database row to RiskMetrics object
   */
  private rowToMetrics(row: any): RiskMetrics {
    return {
      id: row.id,
      agentId: row.agent_id,
      metricDate: new Date(row.metric_date),
      totalExposure: row.total_exposure,
      maxPositionSize: row.max_position_size,
      avgPositionSize: row.avg_position_size,
      dailyPnL: row.daily_pnl,
      dailyPnLPercent: row.daily_pnl_percent,
      cumulativePnL: row.cumulative_pnl,
      maxDrawdown: row.max_drawdown,
      currentDrawdown: row.current_drawdown,
      sharpeRatio: row.sharpe_ratio,
      sortinoRatio: row.sortino_ratio,
      totalTrades: row.total_trades,
      winningTrades: row.winning_trades,
      losingTrades: row.losing_trades,
      winRate: row.win_rate,
      avgWin: row.avg_win,
      avgLoss: row.avg_loss,
      largestWin: row.largest_win,
      largestLoss: row.largest_loss,
      profitFactor: row.profit_factor,
      createdAt: new Date(row.created_at)
    };
  }
}
