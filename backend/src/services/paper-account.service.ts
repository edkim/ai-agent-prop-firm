/**
 * Paper Account Service
 * Manages virtual trading accounts for paper trading agents
 */

import { getDatabase } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export interface PaperAccount {
  id: string;
  agent_id: string;
  initial_balance: number;
  current_cash: number;
  equity: number;
  buying_power: number;
  total_pnl: number;
  total_pnl_percent: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  max_drawdown: number;
  sharpe_ratio: number;
  status: 'active' | 'paused' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface PaperPosition {
  id: string;
  account_id: string;
  ticker: string;
  quantity: number;
  avg_entry_price: number;
  current_price: number;
  position_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  signal_id: string | null;
  opened_at: string;
  updated_at: string;
}

export interface PaperOrder {
  id: string;
  account_id: string;
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  order_type: 'market' | 'limit' | 'stop' | 'stop_limit';
  limit_price?: number;
  stop_price?: number;
  status: 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';
  filled_quantity: number;
  avg_fill_price?: number;
  commission: number;
  slippage: number;
  rejection_reason?: string;
  signal_id?: string;
  created_at: string;
  filled_at?: string;
  cancelled_at?: string;
}

export interface PaperTrade {
  id: string;
  account_id: string;
  order_id: string;
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  value: number;
  commission: number;
  slippage: number;
  pnl?: number;
  pnl_percent?: number;
  signal_id?: string;
  executed_at: string;
}

export class PaperAccountService {
  private readonly DEFAULT_INITIAL_BALANCE = 100000;
  private readonly COMMISSION_PER_TRADE = 0.50;
  private readonly SLIPPAGE_PERCENT = 0.0001; // 0.01% slippage

  /**
   * Create a new paper trading account for an agent
   */
  async createAccount(agentId: string, initialBalance?: number): Promise<PaperAccount> {
    const db = getDatabase();
    const balance = initialBalance || this.DEFAULT_INITIAL_BALANCE;
    const now = new Date().toISOString();

    const accountId = uuidv4();

    db.prepare(`
      INSERT INTO paper_accounts (
        id, agent_id, initial_balance, current_cash, equity,
        buying_power, total_pnl, total_pnl_percent, total_trades,
        winning_trades, losing_trades, max_drawdown, sharpe_ratio,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      agentId,
      balance,
      balance,
      balance,
      balance,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      'active',
      now,
      now
    );

    return this.getAccount(agentId);
  }

  /**
   * Get account by agent ID
   */
  getAccount(agentId: string): PaperAccount {
    const db = getDatabase();

    const account = db.prepare(`
      SELECT * FROM paper_accounts WHERE agent_id = ?
    `).get(agentId) as PaperAccount | undefined;

    if (!account) {
      throw new Error(`No paper account found for agent: ${agentId}`);
    }

    return account;
  }

  /**
   * Get account by account ID
   */
  getAccountById(accountId: string): PaperAccount {
    const db = getDatabase();

    const account = db.prepare(`
      SELECT * FROM paper_accounts WHERE id = ?
    `).get(accountId) as PaperAccount | undefined;

    if (!account) {
      throw new Error(`No paper account found with ID: ${accountId}`);
    }

    return account;
  }

  /**
   * Get all positions for an account
   */
  getPositions(agentId: string): PaperPosition[] {
    const db = getDatabase();
    const account = this.getAccount(agentId);

    return db.prepare(`
      SELECT * FROM paper_positions
      WHERE account_id = ?
      ORDER BY opened_at DESC
    `).all(account.id) as PaperPosition[];
  }

  /**
   * Get a specific position by ticker
   */
  getPosition(agentId: string, ticker: string): PaperPosition | null {
    const db = getDatabase();
    const account = this.getAccount(agentId);

    const position = db.prepare(`
      SELECT * FROM paper_positions
      WHERE account_id = ? AND ticker = ?
    `).get(account.id, ticker) as PaperPosition | undefined;

    return position || null;
  }

  /**
   * Update position with current market price
   */
  async updatePositionPrice(accountId: string, ticker: string, currentPrice: number): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const position = db.prepare(`
      SELECT * FROM paper_positions
      WHERE account_id = ? AND ticker = ?
    `).get(accountId, ticker) as PaperPosition | undefined;

    if (!position) {
      return;
    }

    const positionValue = position.quantity * currentPrice;
    const unrealizedPnl = (currentPrice - position.avg_entry_price) * position.quantity;
    const unrealizedPnlPercent = ((currentPrice - position.avg_entry_price) / position.avg_entry_price) * 100;

    db.prepare(`
      UPDATE paper_positions
      SET current_price = ?,
          position_value = ?,
          unrealized_pnl = ?,
          unrealized_pnl_percent = ?,
          updated_at = ?
      WHERE account_id = ? AND ticker = ?
    `).run(currentPrice, positionValue, unrealizedPnl, unrealizedPnlPercent, now, accountId, ticker);
  }

  /**
   * Open or add to a position
   */
  async openPosition(
    agentId: string,
    ticker: string,
    quantity: number,
    price: number,
    signalId?: string
  ): Promise<PaperPosition> {
    const db = getDatabase();
    const account = this.getAccount(agentId);
    const now = new Date().toISOString();

    // Check if position already exists
    const existingPosition = this.getPosition(agentId, ticker);

    if (existingPosition) {
      // Average up/down the position
      const totalQuantity = existingPosition.quantity + quantity;
      const totalCost = (existingPosition.avg_entry_price * existingPosition.quantity) + (price * quantity);
      const newAvgPrice = totalCost / totalQuantity;
      const positionValue = totalQuantity * price;
      const unrealizedPnl = (price - newAvgPrice) * totalQuantity;
      const unrealizedPnlPercent = ((price - newAvgPrice) / newAvgPrice) * 100;

      db.prepare(`
        UPDATE paper_positions
        SET quantity = ?,
            avg_entry_price = ?,
            current_price = ?,
            position_value = ?,
            unrealized_pnl = ?,
            unrealized_pnl_percent = ?,
            updated_at = ?
        WHERE id = ?
      `).run(totalQuantity, newAvgPrice, price, positionValue, unrealizedPnl, unrealizedPnlPercent, now, existingPosition.id);

      return this.getPosition(agentId, ticker)!;
    } else {
      // Create new position
      const positionId = uuidv4();
      const positionValue = quantity * price;

      db.prepare(`
        INSERT INTO paper_positions (
          id, account_id, ticker, quantity, avg_entry_price,
          current_price, position_value, unrealized_pnl, unrealized_pnl_percent,
          signal_id, opened_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        positionId,
        account.id,
        ticker,
        quantity,
        price,
        price,
        positionValue,
        0,
        0,
        signalId || null,
        now,
        now
      );

      return this.getPosition(agentId, ticker)!;
    }
  }

  /**
   * Close or reduce a position
   */
  async closePosition(
    agentId: string,
    ticker: string,
    quantity: number,
    price: number
  ): Promise<{ position: PaperPosition | null, pnl: number }> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const existingPosition = this.getPosition(agentId, ticker);
    if (!existingPosition) {
      throw new Error(`No position found for ${ticker}`);
    }

    if (quantity > existingPosition.quantity) {
      throw new Error(`Cannot close ${quantity} shares. Only ${existingPosition.quantity} shares in position.`);
    }

    // Calculate P&L for closed portion
    const pnl = (price - existingPosition.avg_entry_price) * quantity;
    const pnlPercent = ((price - existingPosition.avg_entry_price) / existingPosition.avg_entry_price) * 100;

    if (quantity === existingPosition.quantity) {
      // Close entire position
      db.prepare(`
        DELETE FROM paper_positions WHERE id = ?
      `).run(existingPosition.id);

      return { position: null, pnl };
    } else {
      // Reduce position
      const newQuantity = existingPosition.quantity - quantity;
      const positionValue = newQuantity * price;
      const unrealizedPnl = (price - existingPosition.avg_entry_price) * newQuantity;
      const unrealizedPnlPercent = ((price - existingPosition.avg_entry_price) / existingPosition.avg_entry_price) * 100;

      db.prepare(`
        UPDATE paper_positions
        SET quantity = ?,
            current_price = ?,
            position_value = ?,
            unrealized_pnl = ?,
            unrealized_pnl_percent = ?,
            updated_at = ?
        WHERE id = ?
      `).run(newQuantity, price, positionValue, unrealizedPnl, unrealizedPnlPercent, now, existingPosition.id);

      return { position: this.getPosition(agentId, ticker)!, pnl };
    }
  }

  /**
   * Calculate total unrealized P&L across all positions
   */
  async calculateUnrealizedPnL(agentId: string): Promise<number> {
    const positions = this.getPositions(agentId);
    return positions.reduce((total, pos) => total + pos.unrealized_pnl, 0);
  }

  /**
   * Update account equity based on current positions
   */
  async updateEquity(agentId: string): Promise<void> {
    const db = getDatabase();
    const account = this.getAccount(agentId);
    const positions = this.getPositions(agentId);
    const now = new Date().toISOString();

    const positionValue = positions.reduce((total, pos) => total + pos.position_value, 0);
    const equity = account.current_cash + positionValue;
    const totalPnl = equity - account.initial_balance;
    const totalPnlPercent = (totalPnl / account.initial_balance) * 100;

    db.prepare(`
      UPDATE paper_accounts
      SET equity = ?,
          total_pnl = ?,
          total_pnl_percent = ?,
          updated_at = ?
      WHERE id = ?
    `).run(equity, totalPnl, totalPnlPercent, now, account.id);
  }

  /**
   * Place a paper trading order
   */
  async placeOrder(
    agentId: string,
    ticker: string,
    side: 'buy' | 'sell',
    quantity: number,
    orderType: 'market' | 'limit' | 'stop' | 'stop_limit' = 'market',
    limitPrice?: number,
    stopPrice?: number,
    signalId?: string
  ): Promise<PaperOrder> {
    const db = getDatabase();
    const account = this.getAccount(agentId);
    const now = new Date().toISOString();

    const orderId = uuidv4();

    db.prepare(`
      INSERT INTO paper_orders (
        id, account_id, ticker, side, quantity, order_type,
        limit_price, stop_price, status, filled_quantity,
        avg_fill_price, commission, slippage, signal_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      account.id,
      ticker,
      side,
      quantity,
      orderType,
      limitPrice || null,
      stopPrice || null,
      'pending',
      0,
      null,
      0,
      0,
      signalId || null,
      now
    );

    return db.prepare(`
      SELECT * FROM paper_orders WHERE id = ?
    `).get(orderId) as PaperOrder;
  }

  /**
   * Fill an order (simulated execution)
   */
  async fillOrder(
    orderId: string,
    fillPrice: number,
    fillQuantity?: number
  ): Promise<{ order: PaperOrder, trade: PaperTrade }> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const order = db.prepare(`
      SELECT * FROM paper_orders WHERE id = ?
    `).get(orderId) as PaperOrder;

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (order.status === 'filled' || order.status === 'cancelled' || order.status === 'rejected') {
      throw new Error(`Cannot fill order with status: ${order.status}`);
    }

    const account = this.getAccountById(order.account_id);
    const quantityToFill = fillQuantity || (order.quantity - order.filled_quantity);

    // Calculate costs
    const commission = this.COMMISSION_PER_TRADE;
    const slippage = fillPrice * this.SLIPPAGE_PERCENT * quantityToFill;
    const totalCost = (fillPrice * quantityToFill) + commission + slippage;

    // Risk check: verify buying power for buy orders
    if (order.side === 'buy' && totalCost > account.buying_power) {
      // Reject order
      db.prepare(`
        UPDATE paper_orders
        SET status = 'rejected',
            rejection_reason = 'Insufficient buying power'
        WHERE id = ?
      `).run(orderId);

      throw new Error(`Order rejected: Insufficient buying power. Required: $${totalCost.toFixed(2)}, Available: $${account.buying_power.toFixed(2)}`);
    }

    const newFilledQuantity = order.filled_quantity + quantityToFill;
    const status = newFilledQuantity >= order.quantity ? 'filled' : 'partially_filled';

    // Calculate average fill price
    const totalFilledValue = (order.avg_fill_price || 0) * order.filled_quantity + fillPrice * quantityToFill;
    const avgFillPrice = totalFilledValue / newFilledQuantity;

    // Update order
    db.prepare(`
      UPDATE paper_orders
      SET filled_quantity = ?,
          avg_fill_price = ?,
          status = ?,
          commission = commission + ?,
          slippage = slippage + ?,
          filled_at = ?
      WHERE id = ?
    `).run(newFilledQuantity, avgFillPrice, status, commission, slippage, now, orderId);

    // Create trade record
    const tradeId = uuidv4();
    const tradeValue = fillPrice * quantityToFill;

    // Calculate P&L if closing position
    let pnl: number | null = null;
    let pnlPercent: number | null = null;

    if (order.side === 'sell') {
      const position = db.prepare(`
        SELECT * FROM paper_positions
        WHERE account_id = ? AND ticker = ?
      `).get(order.account_id, order.ticker) as PaperPosition | undefined;

      if (position) {
        pnl = (fillPrice - position.avg_entry_price) * quantityToFill - commission - slippage;
        pnlPercent = ((fillPrice - position.avg_entry_price) / position.avg_entry_price) * 100;
      }
    }

    db.prepare(`
      INSERT INTO paper_trades (
        id, account_id, order_id, ticker, side, quantity,
        price, value, commission, slippage, pnl, pnl_percent,
        signal_id, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      order.account_id,
      orderId,
      order.ticker,
      order.side,
      quantityToFill,
      fillPrice,
      tradeValue,
      commission,
      slippage,
      pnl,
      pnlPercent,
      order.signal_id || null,
      now
    );

    // Update account cash and positions
    if (order.side === 'buy') {
      // Decrease cash
      db.prepare(`
        UPDATE paper_accounts
        SET current_cash = current_cash - ?,
            buying_power = buying_power - ?,
            total_trades = total_trades + 1,
            updated_at = ?
        WHERE id = ?
      `).run(totalCost, totalCost, now, order.account_id);

      // Update position
      await this.openPosition(
        account.agent_id,
        order.ticker,
        quantityToFill,
        fillPrice,
        order.signal_id
      );
    } else {
      // Increase cash
      const proceeds = tradeValue - commission - slippage;
      db.prepare(`
        UPDATE paper_accounts
        SET current_cash = current_cash + ?,
            buying_power = buying_power + ?,
            total_trades = total_trades + 1,
            winning_trades = winning_trades + ?,
            losing_trades = losing_trades + ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        proceeds,
        proceeds,
        pnl && pnl > 0 ? 1 : 0,
        pnl && pnl < 0 ? 1 : 0,
        now,
        order.account_id
      );

      // Update position
      await this.closePosition(account.agent_id, order.ticker, quantityToFill, fillPrice);
    }

    // Update equity
    await this.updateEquity(account.agent_id);

    const updatedOrder = db.prepare(`
      SELECT * FROM paper_orders WHERE id = ?
    `).get(orderId) as PaperOrder;

    const trade = db.prepare(`
      SELECT * FROM paper_trades WHERE id = ?
    `).get(tradeId) as PaperTrade;

    return { order: updatedOrder, trade };
  }

  /**
   * Cancel a pending order
   */
  async cancelOrder(orderId: string): Promise<PaperOrder> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const order = db.prepare(`
      SELECT * FROM paper_orders WHERE id = ?
    `).get(orderId) as PaperOrder;

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (order.status !== 'pending' && order.status !== 'partially_filled') {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    db.prepare(`
      UPDATE paper_orders
      SET status = 'cancelled',
          cancelled_at = ?
      WHERE id = ?
    `).run(now, orderId);

    return db.prepare(`
      SELECT * FROM paper_orders WHERE id = ?
    `).get(orderId) as PaperOrder;
  }

  /**
   * Get all orders for an account
   */
  getOrders(agentId: string, limit: number = 50): PaperOrder[] {
    const db = getDatabase();
    const account = this.getAccount(agentId);

    return db.prepare(`
      SELECT * FROM paper_orders
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(account.id, limit) as PaperOrder[];
  }

  /**
   * Get all trades for an account
   */
  getTrades(agentId: string, limit: number = 50): PaperTrade[] {
    const db = getDatabase();
    const account = this.getAccount(agentId);

    return db.prepare(`
      SELECT * FROM paper_trades
      WHERE account_id = ?
      ORDER BY executed_at DESC
      LIMIT ?
    `).all(account.id, limit) as PaperTrade[];
  }

  /**
   * Get account performance stats
   */
  getPerformanceStats(agentId: string): {
    equity: number;
    total_pnl: number;
    total_pnl_percent: number;
    win_rate: number;
    total_trades: number;
    avg_win: number;
    avg_loss: number;
  } {
    const db = getDatabase();
    const account = this.getAccount(agentId);

    const trades = this.getTrades(agentId, 1000);
    const closingTrades = trades.filter(t => t.side === 'sell' && t.pnl !== null);

    const wins = closingTrades.filter(t => t.pnl! > 0);
    const losses = closingTrades.filter(t => t.pnl! <= 0);

    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + t.pnl!, 0) / wins.length
      : 0;

    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + Math.abs(t.pnl!), 0) / losses.length
      : 0;

    const winRate = closingTrades.length > 0
      ? (wins.length / closingTrades.length) * 100
      : 0;

    return {
      equity: account.equity,
      total_pnl: account.total_pnl,
      total_pnl_percent: account.total_pnl_percent,
      win_rate: winRate,
      total_trades: account.total_trades,
      avg_win: avgWin,
      avg_loss: avgLoss
    };
  }

  /**
   * Pause paper trading for an account
   */
  async pauseAccount(agentId: string): Promise<void> {
    const db = getDatabase();
    const account = this.getAccount(agentId);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE paper_accounts
      SET status = 'paused',
          updated_at = ?
      WHERE id = ?
    `).run(now, account.id);
  }

  /**
   * Resume paper trading for an account
   */
  async resumeAccount(agentId: string): Promise<void> {
    const db = getDatabase();
    const account = this.getAccount(agentId);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE paper_accounts
      SET status = 'active',
          updated_at = ?
      WHERE id = ?
    `).run(now, account.id);
  }
}
