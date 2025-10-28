/**
 * Trading Agent API Routes
 * Endpoints for managing trading agents and their configurations
 */

import { Router, Request, Response } from 'express';
import tradingAgentService from '../../services/trading-agent.service';
import tradestationService from '../../services/tradestation.service';
import logger from '../../services/logger.service';

const router = Router();

/**
 * POST /api/agents
 * Create a new trading agent
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, accountId, timeframe, strategies, riskLimits } = req.body;

    // Validation
    if (!name || !accountId || !timeframe || !strategies || !riskLimits) {
      return res.status(400).json({
        error: 'Missing required fields: name, accountId, timeframe, strategies, riskLimits'
      });
    }

    const agent = tradingAgentService.createAgent({
      name,
      accountId,
      timeframe,
      strategies,
      riskLimits
    });

    // Initialize portfolio state
    tradingAgentService.initializePortfolioState(agent.id, accountId);

    res.status(201).json(agent);

  } catch (error: any) {
    logger.error('Error creating agent:', error);
    res.status(500).json({
      error: 'Failed to create agent',
      message: error.message
    });
  }
});

/**
 * GET /api/agents
 * Get all trading agents
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { active } = req.query;

    const agents = tradingAgentService.getAllAgents(active === 'true');

    res.json({ agents });

  } catch (error: any) {
    logger.error('Error getting agents:', error);
    res.status(500).json({
      error: 'Failed to get agents',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/auth/status
 * Get TradeStation authentication status
 */
router.get('/auth/status', async (req: Request, res: Response) => {
  try {
    const status = tradestationService.getAuthStatus();

    res.json(status);

  } catch (error: any) {
    logger.error('Error getting auth status:', error);
    res.status(500).json({
      error: 'Failed to get auth status',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/auth/url
 * Get TradeStation authorization URL
 */
router.get('/auth/url', async (req: Request, res: Response) => {
  try {
    const state = Math.random().toString(36).substring(7);
    const authUrl = tradestationService.getAuthorizationUrl(state);

    res.json({
      authUrl,
      state
    });

  } catch (error: any) {
    logger.error('Error generating auth URL:', error);
    res.status(500).json({
      error: 'Failed to generate auth URL',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/auth/callback
 * Handle TradeStation OAuth callback
 */
router.post('/auth/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Authorization code required'
      });
    }

    await tradestationService.authenticate(code);

    res.json({
      message: 'Authentication successful'
    });

  } catch (error: any) {
    logger.error('Error handling auth callback:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/accounts
 * Get all TradeStation accounts
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const accounts = await tradestationService.getAccounts();
    res.json({ accounts });
  } catch (error: any) {
    logger.error('Error getting accounts:', error);
    res.status(500).json({
      error: 'Failed to get accounts',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/account
 * Get TradeStation account information
 */
router.get('/account', async (req: Request, res: Response) => {
  try {
    const account = await tradestationService.getAccount();
    res.json({ account });
  } catch (error: any) {
    logger.error('Error getting account info:', error);
    res.status(500).json({
      error: 'Failed to get account info',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/positions
 * Get current positions
 */
router.get('/positions', async (req: Request, res: Response) => {
  try {
    const positions = await tradestationService.getPositions();
    res.json({ positions });
  } catch (error: any) {
    logger.error('Error getting positions:', error);
    res.status(500).json({
      error: 'Failed to get positions',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/orders
 * Place a new order
 */
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const { symbol, quantity, side, orderType, limitPrice, stopPrice, timeInForce } = req.body;

    // Validation
    if (!symbol || !quantity || !side) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, quantity, side'
      });
    }

    const order = await tradestationService.placeOrder({
      symbol,
      quantity,
      side,
      orderType: orderType || 'Market',
      limitPrice,
      stopPrice,
      timeInForce: timeInForce || 'DAY'
    });

    res.json({
      success: true,
      order
    });

  } catch (error: any) {
    logger.error('Error placing order:', error);
    res.status(500).json({
      error: 'Failed to place order',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/orders
 * Get orders for account
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const orders = await tradestationService.getOrders();
    res.json({ orders });
  } catch (error: any) {
    logger.error('Error getting orders:', error);
    res.status(500).json({
      error: 'Failed to get orders',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id
 * Get specific agent by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const agent = tradingAgentService.getAgent(id);

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Include portfolio state
    const portfolioState = tradingAgentService.getPortfolioState(id);

    res.json({
      agent,
      portfolioState
    });

  } catch (error: any) {
    logger.error('Error getting agent:', error);
    res.status(500).json({
      error: 'Failed to get agent',
      message: error.message
    });
  }
});

/**
 * PATCH /api/agents/:id
 * Update agent configuration
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const agent = tradingAgentService.updateAgent(id, updates);

    res.json(agent);

  } catch (error: any) {
    logger.error('Error updating agent:', error);
    res.status(500).json({
      error: 'Failed to update agent',
      message: error.message
    });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete an agent
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    tradingAgentService.deleteAgent(id);

    res.json({ message: 'Agent deleted successfully' });

  } catch (error: any) {
    logger.error('Error deleting agent:', error);
    res.status(500).json({
      error: 'Failed to delete agent',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/activate
 * Activate an agent
 */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    tradingAgentService.setAgentActive(id, true);

    res.json({ message: 'Agent activated' });

  } catch (error: any) {
    logger.error('Error activating agent:', error);
    res.status(500).json({
      error: 'Failed to activate agent',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/deactivate
 * Deactivate an agent
 */
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    tradingAgentService.setAgentActive(id, false);

    res.json({ message: 'Agent deactivated' });

  } catch (error: any) {
    logger.error('Error deactivating agent:', error);
    res.status(500).json({
      error: 'Failed to deactivate agent',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/activity
 * Get agent activity log
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    const activity = tradingAgentService.getRecentActivity(id, limit);

    res.json({ activity });

  } catch (error: any) {
    logger.error('Error getting agent activity:', error);
    res.status(500).json({
      error: 'Failed to get agent activity',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/portfolio
 * Get agent portfolio state
 */
router.get('/:id/portfolio', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const portfolioState = tradingAgentService.getPortfolioState(id);

    if (!portfolioState) {
      return res.status(404).json({
        error: 'Portfolio state not found'
      });
    }

    res.json(portfolioState);

  } catch (error: any) {
    logger.error('Error getting portfolio state:', error);
    res.status(500).json({
      error: 'Failed to get portfolio state',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/signals
 * Get live signals for agent
 */
router.get('/:id/signals', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let query = `SELECT * FROM live_signals WHERE agent_id = ?`;
    const params: any[] = [id];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY detection_time DESC LIMIT 100`;

    const db = await import('../../services/database.service');
    const signals = await db.DatabaseService.prototype.all(query, params);

    res.json({ signals });

  } catch (error: any) {
    logger.error('Error getting signals:', error);
    res.status(500).json({
      error: 'Failed to get signals',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/recommendations
 * Get trade recommendations for agent
 */
router.get('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let query = `SELECT * FROM trade_recommendations WHERE agent_id = ?`;
    const params: any[] = [id];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const db = await import('../../services/database.service');
    const recommendations = await db.DatabaseService.prototype.all(query, params);

    res.json({ recommendations });

  } catch (error: any) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/recommendations/:recommendationId/approve
 * Manually approve a recommendation
 */
router.post('/:id/recommendations/:recommendationId/approve', async (req: Request, res: Response) => {
  try {
    const { recommendationId } = req.params;

    const db = await import('../../services/database.service');
    await db.DatabaseService.prototype.run(
      `UPDATE trade_recommendations SET status = 'APPROVED', updated_at = datetime('now') WHERE id = ?`,
      [recommendationId]
    );

    res.json({ message: 'Recommendation approved' });

  } catch (error: any) {
    logger.error('Error approving recommendation:', error);
    res.status(500).json({
      error: 'Failed to approve recommendation',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/recommendations/:recommendationId/reject
 * Manually reject a recommendation
 */
router.post('/:id/recommendations/:recommendationId/reject', async (req: Request, res: Response) => {
  try {
    const { recommendationId } = req.params;
    const { reason } = req.body;

    const db = await import('../../services/database.service');
    await db.DatabaseService.prototype.run(
      `UPDATE trade_recommendations SET status = 'REJECTED', updated_at = datetime('now') WHERE id = ?`,
      [recommendationId]
    );

    // Log rejection reason
    if (reason) {
      const { id } = req.params;
      tradingAgentService.logActivity(
        id,
        'RISK_LIMIT_HIT',
        `Recommendation manually rejected: ${reason}`,
        undefined,
        { recommendationId, reason }
      );
    }

    res.json({ message: 'Recommendation rejected' });

  } catch (error: any) {
    logger.error('Error rejecting recommendation:', error);
    res.status(500).json({
      error: 'Failed to reject recommendation',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/trades
 * Get executed trades for agent
 */
router.get('/:id/trades', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    let query = `SELECT * FROM executed_trades WHERE agent_id = ?`;
    const params: any[] = [id];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY entry_time DESC LIMIT 100`;

    const db = await import('../../services/database.service');
    const trades = await db.DatabaseService.prototype.all(query, params);

    res.json({ trades });

  } catch (error: any) {
    logger.error('Error getting trades:', error);
    res.status(500).json({
      error: 'Failed to get trades',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/trades/:tradeId/close
 * Close an open trade
 */
router.post('/:id/trades/:tradeId/close', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const { exitPrice, exitReason } = req.body;

    if (!exitPrice) {
      return res.status(400).json({
        error: 'Exit price required'
      });
    }

    const ExecutionEngineService = await import('../../services/execution-engine.service');
    const executionEngine = new ExecutionEngineService.ExecutionEngineService();

    const trade = await executionEngine.closeTrade(
      tradeId,
      exitPrice,
      exitReason || 'MANUAL_EXIT'
    );

    res.json({ trade });

  } catch (error: any) {
    logger.error('Error closing trade:', error);
    res.status(500).json({
      error: 'Failed to close trade',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/monitor/start
 * Start position monitoring for agent
 */
router.post('/:id/monitor/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const PositionMonitorService = await import('../../services/position-monitor.service');
    const positionMonitor = new PositionMonitorService.PositionMonitorService();

    positionMonitor.startMonitoring(id);

    res.json({ message: 'Position monitoring started' });

  } catch (error: any) {
    logger.error('Error starting monitoring:', error);
    res.status(500).json({
      error: 'Failed to start monitoring',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/monitor/stop
 * Stop position monitoring for agent
 */
router.post('/:id/monitor/stop', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const PositionMonitorService = await import('../../services/position-monitor.service');
    const positionMonitor = new PositionMonitorService.PositionMonitorService();

    positionMonitor.stopMonitoring(id);

    res.json({ message: 'Position monitoring stopped' });

  } catch (error: any) {
    logger.error('Error stopping monitoring:', error);
    res.status(500).json({
      error: 'Failed to stop monitoring',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/trades/:tradeId/trailing-stop
 * Enable trailing stop for a position
 */
router.post('/:id/trades/:tradeId/trailing-stop', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const { trailPercent, activationPercent } = req.body;

    if (!trailPercent) {
      return res.status(400).json({
        error: 'Trail percent required'
      });
    }

    const TrailingStopService = await import('../../services/trailing-stop.service');
    const trailingStopService = new TrailingStopService.TrailingStopService();

    await trailingStopService.enableTrailingStop(tradeId, {
      trailPercent,
      activationPercent: activationPercent || 2,
      updateIncrement: 0
    });

    res.json({
      message: 'Trailing stop enabled',
      trailPercent,
      activationPercent: activationPercent || 2
    });

  } catch (error: any) {
    logger.error('Error enabling trailing stop:', error);
    res.status(500).json({
      error: 'Failed to enable trailing stop',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/metrics
 * Get risk metrics for date range
 */
router.get('/:id/metrics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const RiskMetricsService = await import('../../services/risk-metrics.service');
    const riskMetricsService = new RiskMetricsService.RiskMetricsService();

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const metrics = await riskMetricsService.getMetrics(id, start, end);

    res.json({ metrics });

  } catch (error: any) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/metrics/latest
 * Get latest risk metrics
 */
router.get('/:id/metrics/latest', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const RiskMetricsService = await import('../../services/risk-metrics.service');
    const riskMetricsService = new RiskMetricsService.RiskMetricsService();

    const metrics = await riskMetricsService.getLatestMetrics(id);

    if (!metrics) {
      // Return default zero metrics for new agents without trade history
      const defaultMetrics = {
        id: 'default',
        agentId: id,
        metricDate: new Date(),
        totalExposure: 0,
        maxPositionSize: 0,
        avgPositionSize: 0,
        dailyPnL: 0,
        dailyPnLPercent: 0,
        cumulativePnL: 0,
        maxDrawdown: 0,
        currentDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0,
        createdAt: new Date()
      };
      return res.json(defaultMetrics);
    }

    res.json(metrics);

  } catch (error: any) {
    logger.error('Error getting latest metrics:', error);
    res.status(500).json({
      error: 'Failed to get latest metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/equity-curve
 * Get equity curve data for charting
 */
router.get('/:id/equity-curve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const RiskMetricsService = await import('../../services/risk-metrics.service');
    const riskMetricsService = new RiskMetricsService.RiskMetricsService();

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const equityCurve = await riskMetricsService.getEquityCurve(id, start, end);

    res.json({ equityCurve });

  } catch (error: any) {
    logger.error('Error getting equity curve:', error);
    res.status(500).json({
      error: 'Failed to get equity curve',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/metrics/calculate
 * Manually trigger daily metrics calculation
 */
router.post('/:id/metrics/calculate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    const RiskMetricsService = await import('../../services/risk-metrics.service');
    const riskMetricsService = new RiskMetricsService.RiskMetricsService();

    const targetDate = date ? new Date(date) : new Date();
    const metrics = await riskMetricsService.calculateDailyMetrics(id, targetDate);

    res.json(metrics);

  } catch (error: any) {
    logger.error('Error calculating metrics:', error);
    res.status(500).json({
      error: 'Failed to calculate metrics',
      message: error.message
    });
  }
});

export default router;
