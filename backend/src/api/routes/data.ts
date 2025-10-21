/**
 * Data API Routes
 * Endpoints for fetching and managing market data
 */

import { Router, Request, Response } from 'express';
import PolygonService from '../../services/polygon.service';

const router = Router();

/**
 * POST /api/data/fetch
 * Fetch and store historical data from Polygon
 */
router.post('/fetch', async (req: Request, res: Response) => {
  try {
    const { ticker, timeframe, from, to } = req.body;

    if (!ticker || !timeframe || !from || !to) {
      return res.status(400).json({
        error: 'Missing required parameters: ticker, timeframe, from, to',
      });
    }

    const count = await PolygonService.fetchAndStore(ticker, timeframe, from, to);

    res.json({
      success: true,
      ticker,
      timeframe,
      from,
      to,
      barsStored: count,
    });
  } catch (error: any) {
    console.error('Error fetching data:', error);
    res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message,
    });
  }
});

/**
 * GET /api/data/:ticker
 * Get stored historical data for a ticker
 */
router.get('/:ticker', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { timeframe, from, to } = req.query;

    if (!timeframe) {
      return res.status(400).json({
        error: 'Missing required parameter: timeframe',
      });
    }

    const fromTimestamp = from ? parseInt(from as string) : undefined;
    const toTimestamp = to ? parseInt(to as string) : undefined;

    const data = await PolygonService.getHistoricalData(
      ticker,
      timeframe as string,
      fromTimestamp,
      toTimestamp
    );

    res.json({
      ticker,
      timeframe,
      bars: data,
      count: data.length,
    });
  } catch (error: any) {
    console.error('Error retrieving data:', error);
    res.status(500).json({
      error: 'Failed to retrieve data',
      message: error.message,
    });
  }
});

/**
 * GET /api/data/:ticker/check
 * Check if data exists for ticker/timeframe
 */
router.get('/:ticker/check', async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params;
    const { timeframe, from, to } = req.query;

    if (!timeframe) {
      return res.status(400).json({
        error: 'Missing required parameter: timeframe',
      });
    }

    const fromTimestamp = from ? parseInt(from as string) : undefined;
    const toTimestamp = to ? parseInt(to as string) : undefined;

    const hasData = await PolygonService.hasData(
      ticker,
      timeframe as string,
      fromTimestamp,
      toTimestamp
    );

    res.json({
      ticker,
      timeframe,
      hasData,
    });
  } catch (error: any) {
    console.error('Error checking data:', error);
    res.status(500).json({
      error: 'Failed to check data',
      message: error.message,
    });
  }
});

export default router;
