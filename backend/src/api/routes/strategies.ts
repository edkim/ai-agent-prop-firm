/**
 * Strategy API Routes
 * Endpoints for managing trading strategies
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../database/db';
import { Strategy } from '../../types/strategy.types';
import { StrategyRegistry } from '../../strategies/registry';

const router = Router();

/**
 * GET /api/strategies
 * Get all strategies
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM strategies ORDER BY created_at DESC');
    const rows = stmt.all();

    const strategies = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      strategyType: row.strategy_type || 'rule-based',
      customStrategyType: row.custom_strategy_type,
      ticker: row.ticker,
      timeframe: row.timeframe,
      ...JSON.parse(row.config),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({ strategies });
  } catch (error: any) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({
      error: 'Failed to fetch strategies',
      message: error.message,
    });
  }
});

/**
 * GET /api/strategies/:id
 * Get a specific strategy
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM strategies WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const strategy = {
      id: row.id,
      name: row.name,
      description: row.description,
      strategyType: row.strategy_type || 'rule-based',
      customStrategyType: row.custom_strategy_type,
      ticker: row.ticker,
      timeframe: row.timeframe,
      ...JSON.parse(row.config),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    res.json({ strategy });
  } catch (error: any) {
    console.error('Error fetching strategy:', error);
    res.status(500).json({
      error: 'Failed to fetch strategy',
      message: error.message,
    });
  }
});

/**
 * POST /api/strategies
 * Create a new strategy
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const strategy: Strategy = req.body;

    if (!strategy.name || !strategy.ticker || !strategy.timeframe) {
      return res.status(400).json({
        error: 'Missing required fields: name, ticker, timeframe',
      });
    }

    const strategyType = strategy.strategyType || 'rule-based';
    const customStrategyType = strategy.customStrategyType;

    // Validate custom strategy type
    if (strategyType === 'custom') {
      if (!customStrategyType) {
        return res.status(400).json({
          error: 'customStrategyType is required for custom strategies',
        });
      }

      if (!StrategyRegistry.has(customStrategyType)) {
        return res.status(400).json({
          error: `Unknown custom strategy type: ${customStrategyType}`,
          availableTypes: StrategyRegistry.getTypes(),
        });
      }

      // Validate custom strategy configuration
      try {
        const tempStrategy = StrategyRegistry.create(customStrategyType, {
          ticker: strategy.ticker,
          timeframe: strategy.timeframe,
          ...(strategy.customConfig || {}),
        });
        const validation = tempStrategy.validate();
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid custom strategy configuration',
            validationErrors: validation.errors,
          });
        }
      } catch (validationError: any) {
        return res.status(400).json({
          error: 'Custom strategy validation failed',
          message: validationError.message,
        });
      }
    }

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO strategies (name, description, strategy_type, custom_strategy_type, ticker, timeframe, config)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const config = JSON.stringify({
      indicators: strategy.indicators || [],
      entryRules: strategy.entryRules,
      exitRules: strategy.exitRules,
      positionSizing: strategy.positionSizing,
      riskManagement: strategy.riskManagement,
      allowShort: strategy.allowShort,
      dependencies: strategy.dependencies,
      requireEarnings: strategy.requireEarnings,
      customConfig: strategy.customConfig,
    });

    const result = stmt.run(
      strategy.name,
      strategy.description || null,
      strategyType,
      customStrategyType || null,
      strategy.ticker,
      strategy.timeframe,
      config
    );

    res.status(201).json({
      success: true,
      strategyId: result.lastInsertRowid,
    });
  } catch (error: any) {
    console.error('Error creating strategy:', error);
    res.status(500).json({
      error: 'Failed to create strategy',
      message: error.message,
    });
  }
});

/**
 * PUT /api/strategies/:id
 * Update a strategy
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const strategy: Strategy = req.body;

    const db = getDatabase();

    // Check if strategy exists
    const checkStmt = db.prepare('SELECT id FROM strategies WHERE id = ?');
    if (!checkStmt.get(id)) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const strategyType = strategy.strategyType || 'rule-based';
    const customStrategyType = strategy.customStrategyType;

    // Validate custom strategy type
    if (strategyType === 'custom') {
      if (!customStrategyType) {
        return res.status(400).json({
          error: 'customStrategyType is required for custom strategies',
        });
      }

      if (!StrategyRegistry.has(customStrategyType)) {
        return res.status(400).json({
          error: `Unknown custom strategy type: ${customStrategyType}`,
          availableTypes: StrategyRegistry.getTypes(),
        });
      }

      // Validate custom strategy configuration
      try {
        const tempStrategy = StrategyRegistry.create(customStrategyType, {
          ticker: strategy.ticker,
          timeframe: strategy.timeframe,
          ...(strategy.customConfig || {}),
        });
        const validation = tempStrategy.validate();
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid custom strategy configuration',
            validationErrors: validation.errors,
          });
        }
      } catch (validationError: any) {
        return res.status(400).json({
          error: 'Custom strategy validation failed',
          message: validationError.message,
        });
      }
    }

    const config = JSON.stringify({
      indicators: strategy.indicators || [],
      entryRules: strategy.entryRules,
      exitRules: strategy.exitRules,
      positionSizing: strategy.positionSizing,
      riskManagement: strategy.riskManagement,
      allowShort: strategy.allowShort,
      dependencies: strategy.dependencies,
      requireEarnings: strategy.requireEarnings,
      customConfig: strategy.customConfig,
    });

    const stmt = db.prepare(`
      UPDATE strategies
      SET name = ?, description = ?, strategy_type = ?, custom_strategy_type = ?,
          ticker = ?, timeframe = ?, config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      strategy.name,
      strategy.description || null,
      strategyType,
      customStrategyType || null,
      strategy.ticker,
      strategy.timeframe,
      config,
      id
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating strategy:', error);
    res.status(500).json({
      error: 'Failed to update strategy',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/strategies/:id
 * Delete a strategy
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const stmt = db.prepare('DELETE FROM strategies WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting strategy:', error);
    res.status(500).json({
      error: 'Failed to delete strategy',
      message: error.message,
    });
  }
});

/**
 * GET /api/strategies/types/custom
 * Get available custom strategy types with metadata
 */
router.get('/types/custom', (_req: Request, res: Response) => {
  try {
    const types = StrategyRegistry.getTypes();
    const metadata = StrategyRegistry.getAllMetadata();

    res.json({
      types,
      strategies: metadata,
    });
  } catch (error: any) {
    console.error('Error fetching custom strategy types:', error);
    res.status(500).json({
      error: 'Failed to fetch custom strategy types',
      message: error.message,
    });
  }
});

export default router;
