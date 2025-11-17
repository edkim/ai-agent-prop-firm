/**
 * Scanner Debug API Routes
 * Fast debugging tools for scanner development
 */

import express, { Request, Response } from 'express';
import { ScannerDebugService } from '../../services/scanner-debug.service';

const router = express.Router();
const debugService = new ScannerDebugService();

/**
 * POST /api/scanner-debug
 * Debug a scanner on a specific ticker/date
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { scannerCode, ticker, date, explain } = req.body;

    if (!scannerCode || !ticker || !date) {
      return res.status(400).json({
        error: 'Missing required fields: scannerCode, ticker, date'
      });
    }

    const result = await debugService.debugScanner({
      scannerCode,
      ticker,
      date,
      explain: explain || false
    });

    res.json(result);

  } catch (error: any) {
    console.error('Scanner debug error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /api/scanner-debug/validate
 * Quick validation: Check if scanner finds any signals on sample days
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { scannerCode, tickers, dates, minSignals } = req.body;

    if (!scannerCode) {
      return res.status(400).json({
        error: 'Missing required field: scannerCode'
      });
    }

    // Default test tickers/dates if not provided
    const testTickers = tickers || ['AAPL', 'TSLA', 'NVDA'];
    const testDates = dates || [
      '2025-01-10',
      '2025-01-13',
      '2025-01-14'
    ];

    const result = await debugService.validateScanner(scannerCode, {
      tickers: testTickers,
      dates: testDates,
      minSignals: minSignals || 1
    });

    res.json(result);

  } catch (error: any) {
    console.error('Scanner validation error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

export default router;
