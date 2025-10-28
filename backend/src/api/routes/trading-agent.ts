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

export default router;
