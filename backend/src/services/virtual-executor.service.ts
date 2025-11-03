/**
 * Virtual Executor Service
 * Simulates order fills for paper trading based on real-time market data
 */

import { getDatabase } from '../database/db';
import { PaperAccountService, PaperOrder, PaperAccount } from './paper-account.service';
import logger from './logger.service';

interface Bar {
  ticker: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
}

export class VirtualExecutorService {
  private paperAccountService: PaperAccountService;
  private readonly SLIPPAGE_PERCENT = 0.0001; // 0.01%
  private readonly MAX_POSITION_PERCENT = 0.20; // 20% of equity per position
  private readonly MAX_POSITIONS = 10; // Max concurrent positions
  private readonly MIN_BUYING_POWER_PERCENT = 0.05; // Keep 5% cash reserve

  constructor() {
    this.paperAccountService = new PaperAccountService();
  }

  /**
   * Process a new bar and check for order fills
   * This is called by RealtimeDataService when a new bar arrives
   */
  async processBar(bar: Bar): Promise<void> {
    try {
      // Get all pending orders for this ticker
      const pendingOrders = this.getPendingOrdersForTicker(bar.ticker);

      if (pendingOrders.length === 0) {
        return;
      }

      logger.info(`🎯 VirtualExecutor: Processing ${pendingOrders.length} pending orders for ${bar.ticker}`);

      // Process each pending order
      for (const order of pendingOrders) {
        await this.checkAndFillOrder(order, bar);
      }
    } catch (error: any) {
      logger.error(`Error processing bar for ${bar.ticker}:`, error.message);
    }
  }

  /**
   * Get all pending orders for a specific ticker
   */
  private getPendingOrdersForTicker(ticker: string): PaperOrder[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT * FROM paper_orders
      WHERE ticker = ?
      AND status IN ('pending', 'partially_filled')
      ORDER BY created_at ASC
    `).all(ticker) as PaperOrder[];
  }

  /**
   * Check if an order should fill based on bar data
   */
  private async checkAndFillOrder(order: PaperOrder, bar: Bar): Promise<void> {
    try {
      // Get account to check risk limits
      const account = this.paperAccountService.getAccountById(order.account_id);

      // Skip if account is not active
      if (account.status !== 'active') {
        logger.info(`⏸️  Account ${account.id} is not active, skipping order`);
        return;
      }

      // Apply risk checks before filling
      const riskCheckPassed = await this.checkRiskLimits(order, account, bar);
      if (!riskCheckPassed) {
        await this.rejectOrder(order.id, 'Risk limits exceeded');
        return;
      }

      // Determine if order should fill and at what price
      const fillPrice = this.determineFillPrice(order, bar);

      if (fillPrice === null) {
        // Order conditions not met yet
        return;
      }

      // Calculate fill quantity (remaining quantity for this order)
      const remainingQuantity = order.quantity - order.filled_quantity;

      // Fill the order
      logger.info(`✅ Filling ${order.side} order for ${order.ticker}: ${remainingQuantity} shares @ $${fillPrice.toFixed(2)}`);

      await this.paperAccountService.fillOrder(order.id, fillPrice, remainingQuantity);

    } catch (error: any) {
      logger.error(`Error checking/filling order ${order.id}:`, error.message);

      // If fill failed, check if it was a risk check failure
      if (error.message.includes('Insufficient buying power') || error.message.includes('rejected')) {
        // Order already rejected by PaperAccountService
        return;
      }

      // Otherwise, it's an unexpected error
      throw error;
    }
  }

  /**
   * Determine the fill price for an order based on bar data
   * Returns null if order should not fill yet
   */
  private determineFillPrice(order: PaperOrder, bar: Bar): number | null {
    let basePrice: number | null = null;

    switch (order.order_type) {
      case 'market':
        // Market orders fill at the open of the next bar
        basePrice = bar.open;
        break;

      case 'limit':
        if (!order.limit_price) {
          logger.error(`Limit order ${order.id} missing limit_price`);
          return null;
        }

        if (order.side === 'buy') {
          // Buy limit: fill if bar went low enough
          if (bar.low <= order.limit_price) {
            // Fill at the limit price (or better)
            basePrice = Math.min(order.limit_price, bar.open);
          }
        } else {
          // Sell limit: fill if bar went high enough
          if (bar.high >= order.limit_price) {
            // Fill at the limit price (or better)
            basePrice = Math.max(order.limit_price, bar.open);
          }
        }
        break;

      case 'stop':
        if (!order.stop_price) {
          logger.error(`Stop order ${order.id} missing stop_price`);
          return null;
        }

        if (order.side === 'buy') {
          // Buy stop: triggers when price goes above stop price
          if (bar.high >= order.stop_price) {
            // Fill at worse of stop price or open (simulate slippage on stop trigger)
            basePrice = Math.max(order.stop_price, bar.open);
          }
        } else {
          // Sell stop: triggers when price goes below stop price
          if (bar.low <= order.stop_price) {
            // Fill at worse of stop price or open
            basePrice = Math.min(order.stop_price, bar.open);
          }
        }
        break;

      case 'stop_limit':
        // Simplified: treat as stop order for now
        // In reality, this would trigger a limit order at the stop price
        if (!order.stop_price || !order.limit_price) {
          logger.error(`Stop-limit order ${order.id} missing stop_price or limit_price`);
          return null;
        }

        // Check if stop triggered
        if (order.side === 'buy' && bar.high >= order.stop_price) {
          // Stop triggered, now check if limit can fill
          if (bar.low <= order.limit_price) {
            basePrice = order.limit_price;
          }
        } else if (order.side === 'sell' && bar.low <= order.stop_price) {
          if (bar.high >= order.limit_price) {
            basePrice = order.limit_price;
          }
        }
        break;
    }

    if (basePrice === null) {
      return null;
    }

    // Apply slippage
    const slippage = basePrice * this.SLIPPAGE_PERCENT;
    const fillPrice = order.side === 'buy'
      ? basePrice + slippage  // Buy at slightly higher price
      : basePrice - slippage; // Sell at slightly lower price

    return fillPrice;
  }

  /**
   * Check if order passes risk limits
   */
  private async checkRiskLimits(order: PaperOrder, account: PaperAccount, bar: Bar): Promise<boolean> {
    // For buy orders, check various risk limits
    if (order.side === 'buy') {
      // 1. Check buying power
      const orderValue = order.quantity * bar.close;
      if (orderValue > account.buying_power) {
        logger.warn(`⚠️  Order exceeds buying power: $${orderValue.toFixed(2)} > $${account.buying_power.toFixed(2)}`);
        return false;
      }

      // 2. Check position size limit (max 20% of equity per position)
      const maxPositionSize = account.equity * this.MAX_POSITION_PERCENT;
      if (orderValue > maxPositionSize) {
        logger.warn(`⚠️  Order exceeds max position size: $${orderValue.toFixed(2)} > $${maxPositionSize.toFixed(2)}`);
        return false;
      }

      // 3. Check max positions limit
      const currentPositions = this.paperAccountService.getPositions(account.agent_id);
      const existingPosition = currentPositions.find(p => p.ticker === order.ticker);

      if (!existingPosition && currentPositions.length >= this.MAX_POSITIONS) {
        logger.warn(`⚠️  Max positions reached: ${currentPositions.length}/${this.MAX_POSITIONS}`);
        return false;
      }

      // 4. Check minimum buying power reserve
      const minBuyingPower = account.equity * this.MIN_BUYING_POWER_PERCENT;
      if (account.buying_power - orderValue < minBuyingPower) {
        logger.warn(`⚠️  Order would violate minimum cash reserve: ${minBuyingPower.toFixed(2)}`);
        return false;
      }
    }

    // For sell orders, check if we have the position
    if (order.side === 'sell') {
      const position = this.paperAccountService.getPosition(account.agent_id, order.ticker);

      if (!position) {
        logger.warn(`⚠️  Cannot sell ${order.ticker}: no position exists`);
        return false;
      }

      if (position.quantity < order.quantity) {
        logger.warn(`⚠️  Cannot sell ${order.quantity} shares of ${order.ticker}: only ${position.quantity} shares available`);
        return false;
      }
    }

    return true;
  }

  /**
   * Reject an order with a reason
   */
  private async rejectOrder(orderId: string, reason: string): Promise<void> {
    const db = getDatabase();

    db.prepare(`
      UPDATE paper_orders
      SET status = 'rejected',
          rejection_reason = ?
      WHERE id = ?
    `).run(reason, orderId);

    logger.info(`❌ Order ${orderId} rejected: ${reason}`);
  }

  /**
   * Execute a market order immediately at current price
   * Used when orchestrator wants instant execution
   */
  async executeMarketOrder(
    agentId: string,
    ticker: string,
    side: 'buy' | 'sell',
    quantity: number,
    currentPrice: number,
    signalId?: string
  ): Promise<void> {
    try {
      // Place market order
      const order = await this.paperAccountService.placeOrder(
        agentId,
        ticker,
        side,
        quantity,
        'market',
        undefined,
        undefined,
        signalId
      );

      // Calculate fill price with slippage
      const slippage = currentPrice * this.SLIPPAGE_PERCENT;
      const fillPrice = side === 'buy'
        ? currentPrice + slippage
        : currentPrice - slippage;

      // Immediate fill
      await this.paperAccountService.fillOrder(order.id, fillPrice, quantity);

      logger.info(`✅ Market ${side} executed: ${ticker} ${quantity} shares @ $${fillPrice.toFixed(2)}`);

    } catch (error: any) {
      logger.error(`Failed to execute market order for ${ticker}:`, error.message);
      throw error;
    }
  }

  /**
   * Place a limit order (will be filled when bar data allows)
   */
  async placeLimitOrder(
    agentId: string,
    ticker: string,
    side: 'buy' | 'sell',
    quantity: number,
    limitPrice: number,
    signalId?: string
  ): Promise<PaperOrder> {
    const order = await this.paperAccountService.placeOrder(
      agentId,
      ticker,
      side,
      quantity,
      'limit',
      limitPrice,
      undefined,
      signalId
    );

    logger.info(`📋 Limit ${side} placed: ${ticker} ${quantity} shares @ $${limitPrice.toFixed(2)}`);

    return order;
  }

  /**
   * Place a stop order (will be filled when stop is triggered)
   */
  async placeStopOrder(
    agentId: string,
    ticker: string,
    side: 'buy' | 'sell',
    quantity: number,
    stopPrice: number,
    signalId?: string
  ): Promise<PaperOrder> {
    const order = await this.paperAccountService.placeOrder(
      agentId,
      ticker,
      side,
      quantity,
      'stop',
      undefined,
      stopPrice,
      signalId
    );

    logger.info(`🛑 Stop ${side} placed: ${ticker} ${quantity} shares @ $${stopPrice.toFixed(2)}`);

    return order;
  }

  /**
   * Get all active accounts' pending orders for a ticker
   * Used to query orders across all paper trading agents
   */
  async getAllPendingOrdersForTicker(ticker: string): Promise<PaperOrder[]> {
    return this.getPendingOrdersForTicker(ticker);
  }

  /**
   * Cancel all pending orders for a ticker (emergency stop)
   */
  async cancelAllOrdersForTicker(ticker: string): Promise<number> {
    const pendingOrders = this.getPendingOrdersForTicker(ticker);

    let cancelledCount = 0;
    for (const order of pendingOrders) {
      try {
        await this.paperAccountService.cancelOrder(order.id);
        cancelledCount++;
      } catch (error: any) {
        logger.error(`Failed to cancel order ${order.id}:`, error.message);
      }
    }

    logger.info(`🚫 Cancelled ${cancelledCount} orders for ${ticker}`);
    return cancelledCount;
  }

  /**
   * Get executor statistics
   */
  getStats(): {
    pending_orders: number;
    active_accounts: number;
  } {
    const db = getDatabase();

    const pendingOrders = db.prepare(`
      SELECT COUNT(*) as count
      FROM paper_orders
      WHERE status IN ('pending', 'partially_filled')
    `).get() as { count: number };

    const activeAccounts = db.prepare(`
      SELECT COUNT(*) as count
      FROM paper_accounts
      WHERE status = 'active'
    `).get() as { count: number };

    return {
      pending_orders: pendingOrders.count,
      active_accounts: activeAccounts.count
    };
  }
}
