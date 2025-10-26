/**
 * Backtest Sets API Routes (Phase 3)
 *
 * Endpoints for managing sample sets and scan results
 */

import express, { Request, Response } from 'express';
import backtestSetService from '../../services/backtest-set.service';

const router = express.Router();

// ============ Backtest Sets ============

/**
 * GET /api/backtest-sets
 * Get all sample sets
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const backtestSets = await backtestSetService.getBacktestSets();
    res.json({ backtest_sets: backtestSets, total: backtestSets.length });
  } catch (error: any) {
    console.error('Error getting sample sets:', error);
    res.status(500).json({ error: 'Failed to get sample sets', message: error.message });
  }
});

/**
 * GET /api/backtest-sets/:id
 * Get a specific sample set
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const backtestSet = await backtestSetService.getBacktestSet(req.params.id);

    if (!backtestSet) {
      return res.status(404).json({ error: 'Sample set not found' });
    }

    res.json(backtestSet);
  } catch (error: any) {
    console.error('Error getting sample set:', error);
    res.status(500).json({ error: 'Failed to get sample set', message: error.message });
  }
});

/**
 * POST /api/backtest-sets
 * Create a new sample set
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, pattern_type } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const backtestSet = await backtestSetService.createBacktestSet({
      name,
      description,
      pattern_type
    });

    res.status(201).json(backtestSet);
  } catch (error: any) {
    console.error('Error creating sample set:', error);
    res.status(500).json({ error: 'Failed to create sample set', message: error.message });
  }
});

/**
 * PATCH /api/backtest-sets/:id
 * Update a sample set
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, pattern_type } = req.body;

    const backtestSet = await backtestSetService.updateBacktestSet(req.params.id, {
      name,
      description,
      pattern_type
    });

    if (!backtestSet) {
      return res.status(404).json({ error: 'Sample set not found' });
    }

    res.json(backtestSet);
  } catch (error: any) {
    console.error('Error updating sample set:', error);
    res.status(500).json({ error: 'Failed to update sample set', message: error.message });
  }
});

/**
 * DELETE /api/backtest-sets/:id
 * Delete a sample set
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await backtestSetService.deleteBacktestSet(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Sample set not found' });
    }

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting sample set:', error);
    res.status(500).json({ error: 'Failed to delete sample set', message: error.message });
  }
});

// ============ Scan Results (Samples) ============

/**
 * GET /api/backtest-sets/:setId/samples
 * Get all scan results for a sample set
 */
router.get('/:setId/samples', async (req: Request, res: Response) => {
  try {
    const samples = await backtestSetService.getScanResults(req.params.setId);
    res.json({ samples, total: samples.length });
  } catch (error: any) {
    console.error('Error getting scan results:', error);
    res.status(500).json({ error: 'Failed to get scan results', message: error.message });
  }
});

/**
 * GET /api/backtest-sets/:setId/samples/:sampleId
 * Get a specific scan result
 */
router.get('/:setId/samples/:sampleId', async (req: Request, res: Response) => {
  try {
    const sample = await backtestSetService.getScanResult(req.params.sampleId);

    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    // Verify the sample belongs to the specified sample set
    if (sample.backtest_set_id !== req.params.setId) {
      return res.status(404).json({ error: 'Sample not found in this sample set' });
    }

    res.json(sample);
  } catch (error: any) {
    console.error('Error getting scan result:', error);
    res.status(500).json({ error: 'Failed to get scan result', message: error.message });
  }
});

/**
 * POST /api/backtest-sets/:setId/samples
 * Add a scan result to a sample set
 */
router.post('/:setId/samples', async (req: Request, res: Response) => {
  try {
    const { ticker, start_date, end_date, peak_date, notes, tags } = req.body;

    if (!ticker || !start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['ticker', 'start_date', 'end_date']
      });
    }

    const sample = await backtestSetService.addScanResult({
      backtest_set_id: req.params.setId,
      ticker,
      start_date,
      end_date,
      peak_date,
      notes,
      tags
    });

    res.status(201).json(sample);
  } catch (error: any) {
    console.error('Error adding scan result:', error);
    res.status(500).json({ error: 'Failed to add scan result', message: error.message });
  }
});

/**
 * PATCH /api/backtest-sets/:setId/samples/:sampleId
 * Update a scan result
 */
router.patch('/:setId/samples/:sampleId', async (req: Request, res: Response) => {
  try {
    const { notes, tags, peak_date } = req.body;

    const sample = await backtestSetService.updateScanResult(req.params.sampleId, {
      notes,
      tags,
      peak_date
    });

    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    // Verify the sample belongs to the specified sample set
    if (sample.backtest_set_id !== req.params.setId) {
      return res.status(404).json({ error: 'Sample not found in this sample set' });
    }

    res.json(sample);
  } catch (error: any) {
    console.error('Error updating scan result:', error);
    res.status(500).json({ error: 'Failed to update scan result', message: error.message });
  }
});

/**
 * DELETE /api/backtest-sets/:setId/samples/:sampleId
 * Delete a scan result
 */
router.delete('/:setId/samples/:sampleId', async (req: Request, res: Response) => {
  try {
    // Verify the sample exists and belongs to this sample set
    const sample = await backtestSetService.getScanResult(req.params.sampleId);

    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    if (sample.backtest_set_id !== req.params.setId) {
      return res.status(404).json({ error: 'Sample not found in this sample set' });
    }

    const deleted = await backtestSetService.deleteScanResult(req.params.sampleId);

    if (!deleted) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting scan result:', error);
    res.status(500).json({ error: 'Failed to delete scan result', message: error.message });
  }
});

export default router;
