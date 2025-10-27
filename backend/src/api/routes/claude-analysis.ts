/**
 * Claude Analysis API Routes
 * Endpoints for visual AI analysis of stock patterns
 */

import { Router, Request, Response } from 'express';
import claudeAnalysisService from '../../services/claude-analysis.service';
import logger from '../../services/logger.service';

const router = Router();

/**
 * POST /api/analysis
 * Start a new Claude analysis
 *
 * Body:
 * - backtestSetId: string (required)
 * - sampleIds: string[] (required, 1-3 samples)
 *
 * Response:
 * - analysisId: string
 * - status: string
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { backtestSetId, sampleIds } = req.body;

    // Validate required fields
    if (!backtestSetId || !sampleIds || !Array.isArray(sampleIds)) {
      return res.status(400).json({
        error: 'Missing required parameters: backtestSetId, sampleIds (array)'
      });
    }

    // Validate sample count
    if (sampleIds.length === 0 || sampleIds.length > 3) {
      return res.status(400).json({
        error: 'Must select 1-3 samples for analysis'
      });
    }

    logger.info(`📊 Analysis request: ${sampleIds.length} samples from set ${backtestSetId}`);

    // Start analysis (runs asynchronously)
    const result = await claudeAnalysisService.analyzeCharts({
      backtestSetId,
      sampleIds
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Error starting analysis:', error);
    res.status(500).json({
      error: 'Failed to start analysis',
      message: error.message
    });
  }
});

/**
 * GET /api/analysis/:id
 * Get analysis results
 *
 * Response:
 * - analysisId: string
 * - status: string
 * - visual_insights: object (if completed)
 * - strategies: array (if completed)
 * - error: string (if failed)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const analysis = await claudeAnalysisService.getAnalysis(id);

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }

    res.json(analysis);
  } catch (error: any) {
    logger.error('Error getting analysis:', error);
    res.status(500).json({
      error: 'Failed to get analysis',
      message: error.message
    });
  }
});

/**
 * GET /api/analysis/:id/status
 * Poll for analysis status (lightweight endpoint)
 *
 * Response:
 * - status: string
 * - error: string (if failed)
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const analysis = await claudeAnalysisService.getAnalysis(id);

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found'
      });
    }

    res.json({
      status: analysis.status,
      error: analysis.error
    });
  } catch (error: any) {
    logger.error('Error getting analysis status:', error);
    res.status(500).json({
      error: 'Failed to get analysis status',
      message: error.message
    });
  }
});

export default router;
