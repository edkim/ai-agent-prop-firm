/**
 * Batch Backtest API Routes
 * Endpoints for running batch backtests across multiple strategies and samples
 */

import { Router, Request, Response } from 'express';
import batchBacktestService from '../../services/batch-backtest.service';
import logger from '../../services/logger.service';

const router = Router();

/**
 * POST /api/batch-backtest
 * Start a new batch backtest run
 *
 * Body:
 * - analysisId: string (required) - Claude analysis ID with strategy recommendations
 * - backtestSetId: string (required) - Backtest set ID with samples to test
 *
 * Response:
 * - batchRunId: string
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { analysisId, backtestSetId, strategyIds } = req.body;

    if (!analysisId || !backtestSetId) {
      return res.status(400).json({
        error: 'analysisId and backtestSetId are required'
      });
    }

    if (strategyIds && strategyIds.length > 0) {
      logger.info(`🚀 Starting batch backtest: analysis=${analysisId}, set=${backtestSetId}, strategies=${strategyIds.length}`);
    } else {
      logger.info(`🚀 Starting batch backtest: analysis=${analysisId}, set=${backtestSetId}`);
    }

    const result = await batchBacktestService.startBatchBacktest({
      analysisId,
      backtestSetId,
      strategyIds
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Error starting batch backtest:', error);
    res.status(500).json({
      error: 'Failed to start batch backtest',
      message: error.message
    });
  }
});

/**
 * GET /api/batch-backtest/:id
 * Get batch backtest status and results
 *
 * Response:
 * - batchRunId: string
 * - status: string
 * - totalTests: number
 * - completedTests: number
 * - failedTests: number
 * - strategies: array of strategy performance summaries
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const status = await batchBacktestService.getBatchBacktestStatus(id);

    res.json(status);
  } catch (error: any) {
    logger.error('Error getting batch backtest status:', error);
    res.status(500).json({
      error: 'Failed to get batch backtest status',
      message: error.message
    });
  }
});

/**
 * GET /api/batch-backtest/:batchRunId/strategy/:strategyId
 * Get detailed results for a specific strategy
 *
 * Response:
 * - array of individual test results (one per sample)
 */
router.get('/:batchRunId/strategy/:strategyId', async (req: Request, res: Response) => {
  try {
    const { batchRunId, strategyId } = req.params;

    const results = await batchBacktestService.getStrategyResults(batchRunId, strategyId);

    res.json({ results });
  } catch (error: any) {
    logger.error('Error getting strategy results:', error);
    res.status(500).json({
      error: 'Failed to get strategy results',
      message: error.message
    });
  }
});

export default router;
