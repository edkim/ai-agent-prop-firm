/**
 * Charts API Routes
 * Endpoints for generating chart thumbnails
 */

import { Router, Request, Response } from 'express';
import { chartGeneratorService } from '../../services/chart-generator.service';
import universeDataService from '../../services/universe-data.service';

const router = Router();

/**
 * POST /api/charts/thumbnail
 * Generate a chart thumbnail for a ticker and date range
 *
 * Body:
 * - ticker: string (required)
 * - startDate: string (required, YYYY-MM-DD)
 * - endDate: string (required, YYYY-MM-DD)
 *
 * Response:
 * - ticker: string
 * - startDate: string
 * - endDate: string
 * - chartData: string (base64 PNG)
 * - width: number
 * - height: number
 */
router.post('/thumbnail', async (req: Request, res: Response) => {
  try {
    const { ticker, startDate, endDate } = req.body;

    // Validate required fields
    if (!ticker || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters: ticker, startDate, endDate',
      });
    }

    // Validate date format (basic check)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    console.log(`📊 Chart thumbnail request: ${ticker} (${startDate} to ${endDate})`);

    // Fetch daily bars from database
    const bars = await universeDataService.getDailyBarsForChart(ticker, startDate, endDate);

    if (bars.length === 0) {
      return res.status(404).json({
        error: 'No data found for ticker in date range',
        ticker,
        startDate,
        endDate,
      });
    }

    console.log(`✓ Found ${bars.length} bars for ${ticker}`);

    // Generate chart thumbnail
    const result = await chartGeneratorService.generateThumbnail({
      ticker,
      startDate,
      endDate,
      bars,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error generating chart thumbnail:', error);
    res.status(500).json({
      error: 'Failed to generate chart thumbnail',
      message: error.message,
    });
  }
});

/**
 * GET /api/charts/stats
 * Get cache statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = chartGeneratorService.getCacheStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({
      error: 'Failed to get cache stats',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/charts/cache
 * Clear all cached thumbnails
 */
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    const cleared = chartGeneratorService.clearCache();
    res.json({
      success: true,
      cleared,
    });
  } catch (error: any) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message,
    });
  }
});

export default router;
