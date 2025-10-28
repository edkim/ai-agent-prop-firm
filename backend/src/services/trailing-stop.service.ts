/**
 * Trailing Stop Service
 * Dynamic stop loss management to lock in profits
 */

import { DatabaseService } from './database.service';
import { TradingAgentService } from './trading-agent.service';
import { ExecutedTrade } from '../types/trading-agent.types';

interface TrailingStopConfig {
  trailPercent: number;        // Percentage to trail from peak
  activationPercent: number;   // Min profit % to activate
  updateIncrement: number;     // Min price movement to update (optional)
}

interface TrailingStopUpdate {
  newTrailingStop: number;
  newHighWaterMark?: number;
  newLowWaterMark?: number;
  shouldUpdate: boolean;
}

export class TrailingStopService {
  private db: DatabaseService;
  private tradingAgentService: TradingAgentService;

  constructor() {
    this.db = new DatabaseService();
    this.tradingAgentService = new TradingAgentService();
  }

  /**
   * Enable trailing stop for a position
   */
  async enableTrailingStop(
    tradeId: string,
    config: TrailingStopConfig
  ): Promise<void> {
    try {
      // Get the trade
      const trade = await this.getTrade(tradeId);

      if (!trade || trade.status !== 'OPEN') {
        throw new Error(`Trade ${tradeId} not found or not open`);
      }

      // Verify position has reached activation threshold
      const currentPrice = await this.getCurrentPrice(trade.ticker);
      const pnlPercent = this.calculatePnLPercent(
        trade.entryPrice,
        currentPrice,
        trade.side
      );

      if (pnlPercent < config.activationPercent) {
        throw new Error(
          `Position not yet at +${config.activationPercent}% to activate trailing stop ` +
          `(current: ${pnlPercent.toFixed(2)}%)`
        );
      }

      // Calculate initial trailing stop
      const trailingStop = this.calculateTrailingStop(
        trade.entryPrice,
        currentPrice,
        currentPrice, // Initial high/low water mark is current price
        config.trailPercent,
        trade.side
      );

      // Update trade with trailing stop
      await this.updateTradeWithTrailingStop(
        tradeId,
        trailingStop,
        config.trailPercent,
        currentPrice
      );

      console.log(
        `[TrailingStop] ✅ Enabled for ${trade.ticker}: ` +
        `${config.trailPercent}% trail @ $${trailingStop.toFixed(2)}`
      );

      // Log activity
      await this.tradingAgentService.logActivity(
        trade.agentId,
        'STATUS_CHANGE',
        `Trailing stop enabled: ${config.trailPercent}% @ $${trailingStop.toFixed(2)}`,
        trade.ticker,
        {
          tradeId,
          trailPercent: config.trailPercent,
          activationPercent: config.activationPercent,
          trailingStop,
          currentPrice
        }
      );

    } catch (error) {
      console.error('[TrailingStop] Error enabling trailing stop:', error);
      throw error;
    }
  }

  /**
   * Update trailing stop based on new price
   */
  async updateTrailingStop(
    trade: ExecutedTrade,
    currentPrice: number
  ): Promise<TrailingStopUpdate> {
    if (!trade.trailingStop) {
      return { shouldUpdate: false, newTrailingStop: trade.stopLoss };
    }

    const trailPercent = 5; // Default 5%, should be stored in trade
    const highWaterMark = trade.entryPrice; // Should be stored in database
    const lowWaterMark = trade.entryPrice;  // Should be stored in database

    // Calculate new trailing stop
    const update = this.calculateTrailingStopUpdate(
      trade.entryPrice,
      currentPrice,
      trade.side === 'LONG' ? highWaterMark : lowWaterMark,
      trailPercent,
      trade.side,
      trade.trailingStop
    );

    if (update.shouldUpdate) {
      // Update database
      await this.saveTrailingStopUpdate(trade.id, update);

      console.log(
        `[TrailingStop] 📈 Updated ${trade.ticker}: ` +
        `$${trade.trailingStop.toFixed(2)} → $${update.newTrailingStop.toFixed(2)}`
      );
    }

    return update;
  }

  /**
   * Calculate trailing stop level
   */
  calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    waterMark: number,
    trailPercent: number,
    side: 'LONG' | 'SHORT'
  ): number {
    if (side === 'LONG') {
      // Trail below high water mark
      const highWaterMark = Math.max(waterMark, currentPrice);
      return highWaterMark * (1 - trailPercent / 100);
    } else {
      // Trail above low water mark
      const lowWaterMark = Math.min(waterMark, currentPrice);
      return lowWaterMark * (1 + trailPercent / 100);
    }
  }

  /**
   * Calculate trailing stop update
   */
  private calculateTrailingStopUpdate(
    entryPrice: number,
    currentPrice: number,
    waterMark: number,
    trailPercent: number,
    side: 'LONG' | 'SHORT',
    currentTrailingStop: number
  ): TrailingStopUpdate {
    if (side === 'LONG') {
      // Check if price made new high
      const newHighWaterMark = Math.max(waterMark, currentPrice);
      const newTrailingStop = newHighWaterMark * (1 - trailPercent / 100);

      // Only update if new stop is higher (tighter)
      if (newTrailingStop > currentTrailingStop) {
        return {
          shouldUpdate: true,
          newTrailingStop,
          newHighWaterMark
        };
      }
    } else {
      // SHORT position - check if price made new low
      const newLowWaterMark = Math.min(waterMark, currentPrice);
      const newTrailingStop = newLowWaterMark * (1 + trailPercent / 100);

      // Only update if new stop is lower (tighter)
      if (newTrailingStop < currentTrailingStop) {
        return {
          shouldUpdate: true,
          newTrailingStop,
          newLowWaterMark
        };
      }
    }

    return {
      shouldUpdate: false,
      newTrailingStop: currentTrailingStop
    };
  }

  /**
   * Check if trailing stop should be updated
   */
  shouldUpdateTrail(
    currentPrice: number,
    waterMark: number,
    side: 'LONG' | 'SHORT'
  ): boolean {
    if (side === 'LONG') {
      return currentPrice > waterMark; // New high
    } else {
      return currentPrice < waterMark; // New low
    }
  }

  /**
   * Disable trailing stop (revert to fixed stop)
   */
  async disableTrailingStop(tradeId: string): Promise<void> {
    const query = `
      UPDATE executed_trades
      SET trailing_stop = NULL,
          trailing_percent = NULL,
          trailing_active = 0,
          updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(query, [tradeId]);

    console.log(`[TrailingStop] ⏹️ Disabled for trade ${tradeId}`);
  }

  /**
   * Get trailing stop status for a trade
   */
  async getTrailingStopStatus(tradeId: string): Promise<{
    active: boolean;
    trailingStop?: number;
    trailPercent?: number;
    highWaterMark?: number;
    lowWaterMark?: number;
  }> {
    const trade = await this.getTrade(tradeId);

    if (!trade || !trade.trailingStop) {
      return { active: false };
    }

    return {
      active: true,
      trailingStop: trade.trailingStop,
      trailPercent: 5, // Should be stored in database
      highWaterMark: trade.entryPrice, // Should be stored in database
      lowWaterMark: trade.entryPrice   // Should be stored in database
    };
  }

  /**
   * Calculate profit factor for trailing stop activation
   */
  private calculatePnLPercent(
    entryPrice: number,
    currentPrice: number,
    side: 'LONG' | 'SHORT'
  ): number {
    if (side === 'LONG') {
      return ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - currentPrice) / entryPrice) * 100;
    }
  }

  /**
   * Get current price for ticker
   */
  private async getCurrentPrice(ticker: string): Promise<number> {
    // TODO: Integrate with TradeStation quote service
    // For now, return mock price
    return 100;
  }

  /**
   * Get trade from database
   */
  private async getTrade(tradeId: string): Promise<ExecutedTrade | null> {
    const query = `SELECT * FROM executed_trades WHERE id = ?`;
    const row = await this.db.get(query, [tradeId]);

    if (!row) return null;

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

  /**
   * Update trade with trailing stop data
   */
  private async updateTradeWithTrailingStop(
    tradeId: string,
    trailingStop: number,
    trailPercent: number,
    waterMark: number
  ): Promise<void> {
    const query = `
      UPDATE executed_trades
      SET trailing_stop = ?,
          trailing_percent = ?,
          trailing_active = 1,
          high_water_mark = ?,
          low_water_mark = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(query, [
      trailingStop,
      trailPercent,
      waterMark,
      waterMark,
      tradeId
    ]);
  }

  /**
   * Save trailing stop update to database
   */
  private async saveTrailingStopUpdate(
    tradeId: string,
    update: TrailingStopUpdate
  ): Promise<void> {
    let query = `
      UPDATE executed_trades
      SET trailing_stop = ?,
          updated_at = datetime('now')
    `;

    const params: any[] = [update.newTrailingStop];

    if (update.newHighWaterMark !== undefined) {
      query += `, high_water_mark = ?`;
      params.push(update.newHighWaterMark);
    }

    if (update.newLowWaterMark !== undefined) {
      query += `, low_water_mark = ?`;
      params.push(update.newLowWaterMark);
    }

    query += ` WHERE id = ?`;
    params.push(tradeId);

    await this.db.run(query, params);
  }

  /**
   * Get all trades with active trailing stops
   */
  async getTrailingStopTrades(agentId: string): Promise<ExecutedTrade[]> {
    const query = `
      SELECT * FROM executed_trades
      WHERE agent_id = ?
        AND status = 'OPEN'
        AND trailing_active = 1
      ORDER BY entry_time DESC
    `;

    const rows = await this.db.all(query, [agentId]);

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
   * Calculate optimal trailing stop percentage based on volatility
   */
  calculateOptimalTrailPercent(atr: number, price: number): number {
    // Trailing stop should be wide enough to avoid whipsaws
    // but tight enough to protect profits

    // Use 2-3x ATR as baseline
    const atrPercent = (atr / price) * 100;
    const trailPercent = Math.max(3, Math.min(10, atrPercent * 2.5));

    return Math.round(trailPercent * 10) / 10; // Round to 1 decimal
  }

  /**
   * Get trailing stop statistics
   */
  async getTrailingStopStats(agentId: string): Promise<{
    totalTrailing: number;
    avgTrailPercent: number;
    avgProfitAtActivation: number;
  }> {
    const query = `
      SELECT
        COUNT(*) as total_trailing,
        AVG(trailing_percent) as avg_trail_percent,
        AVG((high_water_mark - entry_price) / entry_price * 100) as avg_profit_at_activation
      FROM executed_trades
      WHERE agent_id = ?
        AND trailing_active = 1
    `;

    const result = await this.db.get(query, [agentId]);

    return {
      totalTrailing: result.total_trailing || 0,
      avgTrailPercent: result.avg_trail_percent || 0,
      avgProfitAtActivation: result.avg_profit_at_activation || 0
    };
  }
}
