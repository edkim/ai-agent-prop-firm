/**
 * Paper Trading API Routes
 * Routes for monitoring and managing paper trading agents
 */

import express, { Request, Response } from 'express';
import { PaperAccountService } from '../../services/paper-account.service';
import paperTradingStartupService from '../../services/paper-trading-startup.service';
import { getDatabase } from '../../database/db';

const router = express.Router();
const paperAccountService = new PaperAccountService();

/**
 * GET /api/paper-trading/status
 * Get paper trading system status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = paperTradingStartupService.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/agents
 * Get all paper trading agents with their accounts
 */
router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const agents = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.status,
        p.id as account_id,
        p.initial_balance,
        p.current_cash,
        p.equity,
        p.buying_power,
        p.total_pnl,
        p.total_pnl_percent,
        p.total_trades,
        p.winning_trades,
        p.losing_trades,
        p.status as account_status,
        p.created_at as account_created_at
      FROM learning_agents a
      INNER JOIN paper_accounts p ON p.agent_id = a.id
      WHERE a.status = 'paper_trading'
      ORDER BY p.equity DESC
    `).all();

    res.json(agents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/agents/:id/account
 * Get paper account details for an agent
 */
router.get('/agents/:id/account', async (req: Request, res: Response) => {
  try {
    const account = paperAccountService.getAccount(req.params.id);
    res.json(account);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/agents/:id/positions
 * Get current positions for an agent
 */
router.get('/agents/:id/positions', async (req: Request, res: Response) => {
  try {
    const positions = paperAccountService.getPositions(req.params.id);
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/agents/:id/orders
 * Get order history for an agent
 */
router.get('/agents/:id/orders', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const orders = paperAccountService.getOrders(req.params.id, limit);
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/agents/:id/trades
 * Get trade history for an agent
 */
router.get('/agents/:id/trades', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const trades = paperAccountService.getTrades(req.params.id, limit);
    res.json(trades);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/agents/:id/performance
 * Get performance metrics for an agent
 */
router.get('/agents/:id/performance', async (req: Request, res: Response) => {
  try {
    const stats = paperAccountService.getPerformanceStats(req.params.id);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/paper-trading/agents/:id/pause
 * Pause paper trading for an agent
 */
router.post('/agents/:id/pause', async (req: Request, res: Response) => {
  try {
    await paperAccountService.pauseAccount(req.params.id);
    res.json({ success: true, message: 'Paper trading paused' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/paper-trading/agents/:id/resume
 * Resume paper trading for an agent
 */
router.post('/agents/:id/resume', async (req: Request, res: Response) => {
  try {
    await paperAccountService.resumeAccount(req.params.id);
    res.json({ success: true, message: 'Paper trading resumed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/leaderboard
 * Get paper trading leaderboard (sorted by performance)
 */
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const leaderboard = db.prepare(`
      SELECT
        a.id,
        a.name,
        p.equity,
        p.total_pnl,
        p.total_pnl_percent,
        p.total_trades,
        p.winning_trades,
        p.losing_trades,
        CAST(p.winning_trades AS REAL) / NULLIF(p.total_trades, 0) * 100 as win_rate,
        p.sharpe_ratio,
        p.max_drawdown,
        p.created_at
      FROM learning_agents a
      INNER JOIN paper_accounts p ON p.agent_id = a.id
      WHERE a.status = 'paper_trading'
      AND p.status = 'active'
      ORDER BY p.total_pnl_percent DESC
      LIMIT 20
    `).all();

    res.json(leaderboard);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/paper-trading/summary
 * Get overall paper trading summary statistics
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();

    const summary = db.prepare(`
      SELECT
        COUNT(DISTINCT a.id) as total_agents,
        SUM(p.equity) as total_equity,
        AVG(p.total_pnl_percent) as avg_pnl_percent,
        SUM(p.total_trades) as total_trades,
        AVG(CAST(p.winning_trades AS REAL) / NULLIF(p.total_trades, 0) * 100) as avg_win_rate
      FROM learning_agents a
      INNER JOIN paper_accounts p ON p.agent_id = a.id
      WHERE a.status = 'paper_trading'
      AND p.status = 'active'
    `).get();

    const activePositions = db.prepare(`
      SELECT COUNT(*) as count
      FROM paper_positions pp
      INNER JOIN paper_accounts pa ON pp.account_id = pa.id
      WHERE pa.status = 'active'
    `).get() as { count: number };

    const recentTrades = db.prepare(`
      SELECT
        t.ticker,
        t.side,
        t.quantity,
        t.price,
        t.pnl,
        t.pnl_percent,
        t.executed_at,
        a.name as agent_name
      FROM paper_trades t
      INNER JOIN paper_accounts pa ON t.account_id = pa.id
      INNER JOIN learning_agents a ON pa.agent_id = a.id
      WHERE t.executed_at >= datetime('now', '-24 hours')
      ORDER BY t.executed_at DESC
      LIMIT 10
    `).all();

    res.json({
      ...summary,
      active_positions: activePositions.count,
      recent_trades: recentTrades
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/paper-trading/restart
 * Restart paper trading services
 */
router.post('/restart', async (_req: Request, res: Response) => {
  try {
    await paperTradingStartupService.restart();
    res.json({ success: true, message: 'Paper trading services restarted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
