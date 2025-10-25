/**
 * Portfolio Backtests API Routes
 *
 * Enables pattern discovery + automated validation at scale by integrating scanner and backtest services
 */

import express from 'express';
import portfolioBacktestService from '../../services/portfolio-backtest.service';
import { PortfolioBacktestRequest } from '../../types/portfolio-backtest.types';

const router = express.Router();

/**
 * POST /api/portfolio-backtests/scan-and-test
 *
 * Scan for patterns and backtest strategy on all matches
 *
 * Body:
 * {
 *   "scanQuery": "find capitulatory moves with high volume",
 *   "strategyPrompt": "buy at close on signal day, hold 5 days",
 *   "universe": "russell2000",
 *   "sampleSize": 20  // optional, defaults to 20
 * }
 */
router.post('/scan-and-test', async (req, res) => {
  try {
    const { scanQuery, strategyPrompt, universe, sampleSize, dateRange } = req.body;

    // Validate required fields
    if (!scanQuery || typeof scanQuery !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'scanQuery is required and must be a string'
      });
    }

    if (!strategyPrompt || typeof strategyPrompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'strategyPrompt is required and must be a string'
      });
    }

    if (!universe || typeof universe !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'universe is required and must be a string'
      });
    }

    // Build request object
    const request: PortfolioBacktestRequest = {
      scanQuery,
      strategyPrompt,
      universe,
      sampleSize: sampleSize || 20,
      dateRange
    };

    // Execute portfolio backtest
    const result = await portfolioBacktestService.scanAndBacktest(request);

    res.json(result);

  } catch (error: any) {
    console.error('Portfolio backtest error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Portfolio backtest failed'
    });
  }
});

export default router;
