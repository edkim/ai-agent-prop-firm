/**
 * Trading Agent Management Service
 * Handles CRUD operations for trading agents and their configurations
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../database/db';
import logger from './logger.service';

export interface RiskLimits {
  maxPositionSize: number; // Max $ value per position
  maxDailyLoss: number; // Max $ loss per day before stopping
  maxConcurrentPositions: number; // Max number of open positions
  minConfidenceScore: number; // Min confidence score (0-100) to execute
  maxPortfolioExposure: number; // Max % of capital exposed
  maxCorrelation: number; // Max correlation between positions (0-1)
}

export interface TradingAgent {
  id: string;
  name: string;
  accountId: string;
  timeframe: 'intraday' | 'swing' | 'position';
  strategies: string[]; // Pattern IDs to trade
  riskLimits: RiskLimits;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRequest {
  name: string;
  accountId: string;
  timeframe: 'intraday' | 'swing' | 'position';
  strategies: string[];
  riskLimits: RiskLimits;
}

export interface UpdateAgentRequest {
  name?: string;
  strategies?: string[];
  riskLimits?: Partial<RiskLimits>;
  active?: boolean;
}

class TradingAgentService {
  /**
   * Create a new trading agent
   */
  createAgent(request: CreateAgentRequest): TradingAgent {
    const db = getDatabase();

    const agentId = randomUUID();
    const now = new Date().toISOString();

    // Validate risk limits
    this.validateRiskLimits(request.riskLimits);

    try {
      db.prepare(`
        INSERT INTO learning_agents (
          id, name, account_id, timeframe, strategies, risk_limits, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agentId,
        request.name,
        request.accountId,
        request.timeframe,
        JSON.stringify(request.strategies),
        JSON.stringify(request.riskLimits),
        1, // active by default
        now,
        now
      );

      logger.info(`✅ Created trading agent: ${request.name} (${agentId})`);

      return this.getAgent(agentId)!;

    } catch (error: any) {
      logger.error('Failed to create agent:', error);
      throw new Error(`Failed to create agent: ${error.message}`);
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): TradingAgent | null {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT * FROM learning_agents WHERE id = ?
    `).get(agentId) as any;

    if (!row) {
      return null;
    }

    return this.rowToAgent(row);
  }

  /**
   * Get all agents
   */
  getAllAgents(activeOnly: boolean = false): TradingAgent[] {
    const db = getDatabase();

    const query = activeOnly
      ? `SELECT * FROM learning_agents WHERE active = 1 ORDER BY created_at DESC`
      : `SELECT * FROM learning_agents ORDER BY created_at DESC`;

    const rows = db.prepare(query).all() as any[];

    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Get agents by timeframe
   */
  getAgentsByTimeframe(timeframe: 'intraday' | 'swing' | 'position'): TradingAgent[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT * FROM learning_agents WHERE timeframe = ? AND active = 1
    `).all(timeframe) as any[];

    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Update agent configuration
   */
  updateAgent(agentId: string, updates: UpdateAgentRequest): TradingAgent {
    const db = getDatabase();

    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const now = new Date().toISOString();

    try {
      // Build update query dynamically
      const updateFields: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        updateFields.push('name = ?');
        values.push(updates.name);
      }

      if (updates.strategies !== undefined) {
        updateFields.push('strategies = ?');
        values.push(JSON.stringify(updates.strategies));
      }

      if (updates.riskLimits !== undefined) {
        // Merge with existing risk limits
        const mergedRiskLimits = { ...agent.riskLimits, ...updates.riskLimits };
        this.validateRiskLimits(mergedRiskLimits);

        updateFields.push('risk_limits = ?');
        values.push(JSON.stringify(mergedRiskLimits));
      }

      if (updates.active !== undefined) {
        updateFields.push('active = ?');
        values.push(updates.active ? 1 : 0);
      }

      updateFields.push('updated_at = ?');
      values.push(now);

      values.push(agentId); // For WHERE clause

      if (updateFields.length === 1) {
        // Only updated_at changed
        return agent;
      }

      db.prepare(`
        UPDATE learning_agents
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `).run(...values);

      logger.info(`✅ Updated agent: ${agentId}`);

      return this.getAgent(agentId)!;

    } catch (error: any) {
      logger.error('Failed to update agent:', error);
      throw new Error(`Failed to update agent: ${error.message}`);
    }
  }

  /**
   * Delete an agent
   */
  deleteAgent(agentId: string): void {
    const db = getDatabase();

    const result = db.prepare(`
      DELETE FROM learning_agents WHERE id = ?
    `).run(agentId);

    if (result.changes === 0) {
      throw new Error(`Agent ${agentId} not found`);
    }

    logger.info(`✅ Deleted agent: ${agentId}`);
  }

  /**
   * Activate/deactivate agent
   */
  setAgentActive(agentId: string, active: boolean): void {
    this.updateAgent(agentId, { active });

    const action = active ? 'activated' : 'deactivated';
    logger.info(`✅ Agent ${agentId} ${action}`);
  }

  /**
   * Get agents interested in a specific pattern
   */
  getAgentsForPattern(patternType: string): TradingAgent[] {
    const agents = this.getAllAgents(true); // Active only

    return agents.filter(agent =>
      agent.strategies.includes(patternType)
    );
  }

  /**
   * Validate risk limits
   */
  private validateRiskLimits(limits: RiskLimits): void {
    if (limits.maxPositionSize <= 0) {
      throw new Error('maxPositionSize must be positive');
    }

    if (limits.maxDailyLoss <= 0) {
      throw new Error('maxDailyLoss must be positive');
    }

    if (limits.maxConcurrentPositions <= 0) {
      throw new Error('maxConcurrentPositions must be positive');
    }

    if (limits.minConfidenceScore < 0 || limits.minConfidenceScore > 100) {
      throw new Error('minConfidenceScore must be between 0 and 100');
    }

    if (limits.maxPortfolioExposure <= 0 || limits.maxPortfolioExposure > 100) {
      throw new Error('maxPortfolioExposure must be between 0 and 100');
    }

    if (limits.maxCorrelation < 0 || limits.maxCorrelation > 1) {
      throw new Error('maxCorrelation must be between 0 and 1');
    }
  }

  /**
   * Convert database row to TradingAgent object
   */
  private rowToAgent(row: any): TradingAgent {
    return {
      id: row.id,
      name: row.name,
      accountId: row.account_id,
      timeframe: row.timeframe,
      strategies: JSON.parse(row.strategies),
      riskLimits: JSON.parse(row.risk_limits),
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Initialize default portfolio state for agent
   */
  initializePortfolioState(agentId: string, accountId: string, initialCash: number = 100000): void {
    const db = getDatabase();

    try {
      db.prepare(`
        INSERT OR REPLACE INTO portfolio_state (
          agent_id, account_id, cash, total_equity, last_updated
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(agentId, accountId, initialCash, initialCash);

      logger.info(`✅ Initialized portfolio state for agent ${agentId}`);

    } catch (error: any) {
      logger.error('Failed to initialize portfolio state:', error);
      throw error;
    }
  }

  /**
   * Get portfolio state for agent
   */
  getPortfolioState(agentId: string): {
    cash: number;
    positions: any;
    totalEquity: number;
    dailyPnL: number;
    openTradeCount: number;
    totalExposure: number;
  } | null {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT * FROM portfolio_state WHERE agent_id = ?
    `).get(agentId) as any;

    if (!row) {
      return null;
    }

    return {
      cash: row.cash,
      positions: row.positions ? JSON.parse(row.positions) : {},
      totalEquity: row.total_equity,
      dailyPnL: row.daily_pnl,
      openTradeCount: row.open_trade_count,
      totalExposure: row.total_exposure
    };
  }

  /**
   * Log agent activity
   */
  logActivity(
    agentId: string,
    activityType: string,
    description: string,
    ticker?: string,
    data?: any
  ): void {
    const db = getDatabase();

    const activityId = randomUUID();

    try {
      db.prepare(`
        INSERT INTO learning_agent_activity_log (
          id, learning_agent_id, activity_type, ticker, description, data, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        activityId,
        agentId,
        activityType,
        ticker || null,
        description,
        data ? JSON.stringify(data) : null
      );

    } catch (error: any) {
      logger.error('Failed to log agent activity:', error);
      // Don't throw - logging failures shouldn't break execution
    }
  }

  /**
   * Get recent activity for agent
   */
  getRecentActivity(agentId: string, limit: number = 100): any[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT * FROM learning_agent_activity_log
      WHERE learning_agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(agentId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      activityType: row.activity_type,
      ticker: row.ticker,
      description: row.description,
      data: row.data ? JSON.parse(row.data) : null,
      timestamp: row.timestamp
    }));
  }
}

// Singleton instance
const tradingAgentService = new TradingAgentService();

export default tradingAgentService;
