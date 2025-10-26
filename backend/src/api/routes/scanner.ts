/**
 * Scanner API Routes
 * Endpoints for scanning stock universe, managing sample sets, and pattern analysis
 */

import { Router, Request, Response } from 'express';
import ScannerService from '../../services/scanner.service';
import BacktestSetService from '../../services/backtest-set.service';
import UniverseDataService from '../../services/universe-data.service';
import logger from '../../services/logger.service';

const router = Router();

// ============================================================================
// SCANNER ENDPOINTS
// ============================================================================

/**
 * POST /api/scanner/scan
 * Scan universe for patterns matching criteria
 *
 * Request body: ScanCriteria
 * {
 *   universe?: string;
 *   tickers?: string[];
 *   start_date?: string;
 *   end_date?: string;
 *   min_change_percent?: number;
 *   max_change_percent?: number;
 *   min_volume_ratio?: number;
 *   max_volume_ratio?: number;
 *   min_consecutive_up_days?: number;
 *   min_consecutive_down_days?: number;
 *   price_above_sma20?: boolean;
 *   price_below_sma20?: boolean;
 *   price_above_sma50?: boolean;
 *   price_below_sma50?: boolean;
 *   min_rsi?: number;
 *   max_rsi?: number;
 *   min_high_low_range_percent?: number;
 *   limit?: number;
 * }
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const criteria = req.body;

    logger.info('Running scan with criteria', criteria);

    const result = await ScannerService.scan(criteria);

    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error('Error running scan', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run scan',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/scan/natural
 * Scan using natural language query
 *
 * Request body:
 * {
 *   query: string;          // e.g., "find capitulatory moves with high volume"
 *   universe?: string;      // default: 'russell2000'
 *   dateRange?: {
 *     start: string;
 *     end: string;
 *   }
 * }
 */
router.post('/scan/natural', async (req: Request, res: Response) => {
  try {
    const { query, universe, dateRange } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: query'
      });
    }

    logger.info('Natural language scan', { query });

    const result = await ScannerService.naturalLanguageScan(
      query,
      universe || 'russell2000',
      dateRange
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error('Error running natural language scan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run natural language scan',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/similar
 * Find patterns similar to a given ticker/date
 *
 * Request body:
 * {
 *   ticker: string;
 *   date: string;         // YYYY-MM-DD
 *   universe?: string;    // default: 'russell2000'
 *   limit?: number;       // default: 20
 * }
 */
router.post('/similar', async (req: Request, res: Response) => {
  try {
    const { ticker, date, universe, limit } = req.body;

    if (!ticker || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ticker, date'
      });
    }

    logger.info('Finding similar patterns', { ticker, date });

    const result = await ScannerService.findSimilar(
      ticker,
      date,
      universe || 'russell2000',
      limit || 20
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error('Error finding similar patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find similar patterns',
      message: error.message
    });
  }
});

// ============================================================================
// SAMPLE SET ENDPOINTS
// ============================================================================

/**
 * GET /api/scanner/backtest-sets
 * Get all sample sets
 */
router.get('/backtest-sets', async (_req: Request, res: Response) => {
  try {
    const backtestSets = await BacktestSetService.getBacktestSets();

    res.json({
      success: true,
      backtestSets
    });
  } catch (error: any) {
    logger.error('Error fetching sample sets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sample sets',
      message: error.message
    });
  }
});

/**
 * GET /api/scanner/backtest-sets/:id
 * Get a specific sample set by ID
 */
router.get('/backtest-sets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const backtestSet = await BacktestSetService.getBacktestSet(id);

    if (!backtestSet) {
      return res.status(404).json({
        success: false,
        error: 'Sample set not found'
      });
    }

    res.json({
      success: true,
      backtestSet
    });
  } catch (error: any) {
    logger.error('Error fetching sample set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sample set',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/backtest-sets
 * Create a new sample set
 *
 * Request body:
 * {
 *   name: string;
 *   description?: string;
 *   pattern_type?: string;
 * }
 */
router.post('/backtest-sets', async (req: Request, res: Response) => {
  try {
    const { name, description, pattern_type } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: name'
      });
    }

    const backtestSet = await BacktestSetService.createBacktestSet({
      name,
      description,
      pattern_type
    });

    res.status(201).json({
      success: true,
      backtestSet
    });
  } catch (error: any) {
    logger.error('Error creating sample set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sample set',
      message: error.message
    });
  }
});

/**
 * PUT /api/scanner/backtest-sets/:id
 * Update a sample set
 *
 * Request body:
 * {
 *   name?: string;
 *   description?: string;
 *   pattern_type?: string;
 * }
 */
router.put('/backtest-sets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, pattern_type } = req.body;

    const backtestSet = await BacktestSetService.updateBacktestSet(id, {
      name,
      description,
      pattern_type
    });

    if (!backtestSet) {
      return res.status(404).json({
        success: false,
        error: 'Sample set not found'
      });
    }

    res.json({
      success: true,
      backtestSet
    });
  } catch (error: any) {
    logger.error('Error updating sample set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sample set',
      message: error.message
    });
  }
});

/**
 * DELETE /api/scanner/backtest-sets/:id
 * Delete a sample set and all its scan results
 */
router.delete('/backtest-sets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await BacktestSetService.deleteBacktestSet(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Sample set not found'
      });
    }

    res.json({
      success: true,
      message: 'Sample set deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error deleting sample set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete sample set',
      message: error.message
    });
  }
});

// ============================================================================
// SCAN RESULT ENDPOINTS
// ============================================================================

/**
 * GET /api/scanner/backtest-sets/:id/results
 * Get all scan results for a sample set
 */
router.get('/backtest-sets/:id/results', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const results = await BacktestSetService.getScanResults(id);

    res.json({
      success: true,
      results
    });
  } catch (error: any) {
    logger.error('Error fetching scan results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scan results',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/backtest-sets/:id/results
 * Add a scan result to a sample set
 *
 * Request body:
 * {
 *   ticker: string;
 *   start_date: string;   // YYYY-MM-DD
 *   end_date: string;     // YYYY-MM-DD
 *   peak_date?: string;   // YYYY-MM-DD
 *   notes?: string;
 *   tags?: string[];
 * }
 */
router.post('/backtest-sets/:id/results', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ticker, start_date, end_date, peak_date, notes, tags } = req.body;

    if (!ticker || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ticker, start_date, end_date'
      });
    }

    const result = await BacktestSetService.addScanResult({
      backtest_set_id: id,
      ticker,
      start_date,
      end_date,
      peak_date,
      notes,
      tags
    });

    res.status(201).json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Error adding scan result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add scan result',
      message: error.message
    });
  }
});

/**
 * GET /api/scanner/results/:id
 * Get a specific scan result
 */
router.get('/results/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await BacktestSetService.getScanResult(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Scan result not found'
      });
    }

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Error fetching scan result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scan result',
      message: error.message
    });
  }
});

/**
 * PUT /api/scanner/results/:id
 * Update a scan result
 *
 * Request body:
 * {
 *   peak_date?: string;
 *   notes?: string;
 *   tags?: string[];
 * }
 */
router.put('/results/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { peak_date, notes, tags } = req.body;

    const result = await BacktestSetService.updateScanResult(id, {
      peak_date,
      notes,
      tags
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Scan result not found'
      });
    }

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Error updating scan result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update scan result',
      message: error.message
    });
  }
});

/**
 * DELETE /api/scanner/results/:id
 * Delete a scan result
 */
router.delete('/results/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await BacktestSetService.deleteScanResult(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Scan result not found'
      });
    }

    res.json({
      success: true,
      message: 'Scan result deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error deleting scan result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete scan result',
      message: error.message
    });
  }
});

// ============================================================================
// UNIVERSE ENDPOINTS
// ============================================================================

/**
 * GET /api/scanner/universes
 * Get all universes
 */
router.get('/universes', async (_req: Request, res: Response) => {
  try {
    const universes = await UniverseDataService.getUniverses();

    res.json({
      success: true,
      universes
    });
  } catch (error: any) {
    logger.error('Error fetching universes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch universes',
      message: error.message
    });
  }
});

/**
 * GET /api/scanner/universes/:name
 * Get a specific universe by name
 */
router.get('/universes/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const universe = await UniverseDataService.getUniverseByName(name);

    if (!universe) {
      return res.status(404).json({
        success: false,
        error: 'Universe not found'
      });
    }

    res.json({
      success: true,
      universe
    });
  } catch (error: any) {
    logger.error('Error fetching universe:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch universe',
      message: error.message
    });
  }
});

/**
 * GET /api/scanner/universes/:name/tickers
 * Get all tickers in a universe
 */
router.get('/universes/:name/tickers', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const universe = await UniverseDataService.getUniverseByName(name);

    if (!universe) {
      return res.status(404).json({
        success: false,
        error: 'Universe not found'
      });
    }

    const tickers = await UniverseDataService.getUniverseTickers(universe.id);

    res.json({
      success: true,
      universe: {
        id: universe.id,
        name: universe.name,
        description: universe.description
      },
      tickers
    });
  } catch (error: any) {
    logger.error('Error fetching universe tickers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch universe tickers',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/universes/:name/backfill
 * Backfill daily data for a universe
 *
 * Request body:
 * {
 *   start_date: string;   // YYYY-MM-DD
 *   end_date: string;     // YYYY-MM-DD
 *   batch_size?: number;  // default: 10
 * }
 */
router.post('/universes/:name/backfill', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { start_date, end_date, batch_size } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: start_date, end_date'
      });
    }

    logger.info('Starting backfill', { universe: name, start_date, end_date });

    // Run backfill asynchronously (don't wait for it to complete)
    UniverseDataService.backfillUniverseData(
      name,
      start_date,
      end_date,
      batch_size || 10
    ).then(() => {
      logger.info('Backfill completed', { universe: name });
    }).catch((error) => {
      logger.error('Backfill failed', { universe: name, error });
    });

    res.json({
      success: true,
      message: `Backfill started for ${name}. This may take several minutes.`,
      universe: name,
      date_range: { start_date, end_date }
    });
  } catch (error: any) {
    logger.error('Error starting backfill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start backfill',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/universes/:name/intraday
 * Fetch intraday data on-demand (with caching)
 *
 * Request body:
 * {
 *   ticker: string;
 *   start_date: string;   // YYYY-MM-DD
 *   end_date: string;     // YYYY-MM-DD
 *   timeframe?: '1min' | '5min' | '15min' | '30min';  // default: '5min'
 * }
 */
router.post('/universes/:name/intraday', async (req: Request, res: Response) => {
  try {
    const { ticker, start_date, end_date, timeframe } = req.body;

    if (!ticker || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ticker, start_date, end_date'
      });
    }

    logger.info('Fetching intraday data', { ticker, start_date, end_date, timeframe: timeframe || '5min' });

    const bars = await UniverseDataService.fetchIntradayDataOnDemand(
      ticker,
      start_date,
      end_date,
      timeframe || '5min'
    );

    res.json({
      success: true,
      ticker,
      timeframe: timeframe || '5min',
      date_range: { start_date, end_date },
      bars,
      total_bars: bars.length
    });
  } catch (error: any) {
    logger.error('Error fetching intraday data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch intraday data',
      message: error.message
    });
  }
});

// ============================================================================
// SCAN HISTORY ENDPOINTS
// ============================================================================

/**
 * GET /api/scanner/history
 * Get recent scan history with cached results
 *
 * Query params:
 * - limit?: number (default: 20, max: 50)
 *
 * Response:
 * {
 *   history: Array<{
 *     id: string;
 *     user_prompt: string;
 *     universe_id?: string;
 *     date_range_start?: string;
 *     date_range_end?: string;
 *     matches_found: number;
 *     results: ScanMatch[]; // Parsed from results_json
 *     execution_time_ms: number;
 *     created_at: string;
 *   }>
 * }
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const { getDatabase } = await import('../../database/db');
    const db = getDatabase();

    // Only return natural language scans (user_prompt doesn't start with '{')
    // and only those with saved results (results_json is not null)
    const stmt = db.prepare(`
      SELECT
        id,
        user_prompt,
        universe_id,
        date_range_start,
        date_range_end,
        matches_found,
        results_json,
        execution_time_ms,
        created_at
      FROM scan_history
      WHERE results_json IS NOT NULL
        AND substr(user_prompt, 1, 1) != '{'
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: string;
      user_prompt: string;
      universe_id: string | null;
      date_range_start: string | null;
      date_range_end: string | null;
      matches_found: number;
      results_json: string | null;
      execution_time_ms: number;
      created_at: string;
    }>;

    // Parse results_json for each scan
    const history = rows.map(row => ({
      id: row.id,
      user_prompt: row.user_prompt,
      universe_id: row.universe_id || undefined,
      date_range_start: row.date_range_start || undefined,
      date_range_end: row.date_range_end || undefined,
      matches_found: row.matches_found,
      results: row.results_json ? JSON.parse(row.results_json) : [],
      execution_time_ms: row.execution_time_ms,
      created_at: row.created_at,
    }));

    res.json({
      history,
      total: history.length,
    });

  } catch (error: any) {
    logger.error('Error fetching scan history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scan history',
      message: error.message,
    });
  }
});

export default router;
