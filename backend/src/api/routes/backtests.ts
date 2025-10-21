/**
 * Backtest API Routes
 * Endpoints for running and managing backtests
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../database/db';
import { Strategy } from '../../types/strategy.types';
import { BacktestConfig } from '../../types/backtest.types';
import { ScriptExecutionRequest } from '../../types/script.types';
import BacktestService from '../../services/backtest.service';
import ScriptGeneratorService from '../../services/script-generator.service';
import ScriptExecutionService from '../../services/script-execution.service';
import crypto from 'crypto';

const router = Router();

/**
 * POST /api/backtests
 * Run a backtest for a strategy
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { strategyId, startDate, endDate, initialCapital, commission, slippage } = req.body;

    if (!strategyId || !startDate || !endDate || !initialCapital) {
      return res.status(400).json({
        error: 'Missing required fields: strategyId, startDate, endDate, initialCapital',
      });
    }

    // Fetch strategy
    const db = getDatabase();
    const strategyStmt = db.prepare('SELECT * FROM strategies WHERE id = ?');
    const strategyRow = strategyStmt.get(strategyId) as any;

    if (!strategyRow) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    const strategy: Strategy = {
      id: strategyRow.id,
      name: strategyRow.name,
      description: strategyRow.description,
      strategyType: strategyRow.strategy_type || 'rule-based',
      customStrategyType: strategyRow.custom_strategy_type,
      ticker: strategyRow.ticker,
      timeframe: strategyRow.timeframe,
      ...JSON.parse(strategyRow.config),
    };

    const config: BacktestConfig = {
      strategyId,
      startDate,
      endDate,
      initialCapital,
      commission: commission || 0,
      slippage: slippage || 0,
    };

    // Create backtest record
    const insertStmt = db.prepare(`
      INSERT INTO backtests (strategy_id, config, status)
      VALUES (?, ?, 'RUNNING')
    `);

    const result = insertStmt.run(strategyId, JSON.stringify(config));
    const backtestId = result.lastInsertRowid;

    // Run backtest asynchronously
    BacktestService.runBacktest(strategy, config).then((backtestResult) => {
      // Update backtest record
      const updateStmt = db.prepare(`
        UPDATE backtests
        SET status = ?, metrics = ?, equity_curve = ?, error = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateStmt.run(
        backtestResult.status,
        JSON.stringify(backtestResult.metrics),
        JSON.stringify(backtestResult.equityCurve),
        backtestResult.error || null,
        backtestId
      );

      // Store trades
      if (backtestResult.trades.length > 0) {
        const tradeStmt = db.prepare(`
          INSERT INTO trades
            (backtest_id, ticker, side, entry_timestamp, entry_price, exit_timestamp, exit_price,
             quantity, commission, pnl, pnl_percent, exit_reason, bars)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertTrades = db.transaction((trades: any[]) => {
          for (const trade of trades) {
            tradeStmt.run(
              backtestId,
              trade.ticker,
              trade.side,
              trade.entryTimestamp,
              trade.entryPrice,
              trade.exitTimestamp,
              trade.exitPrice,
              trade.quantity,
              trade.commission,
              trade.pnl,
              trade.pnlPercent,
              trade.exitReason,
              trade.bars
            );
          }
        });

        insertTrades(backtestResult.trades);
      }
    }).catch((error) => {
      console.error('Backtest execution error:', error);
      const updateStmt = db.prepare(`
        UPDATE backtests
        SET status = 'FAILED', error = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(error.message, backtestId);
    });

    res.status(202).json({
      success: true,
      backtestId,
      message: 'Backtest started',
    });
  } catch (error: any) {
    console.error('Error starting backtest:', error);
    res.status(500).json({
      error: 'Failed to start backtest',
      message: error.message,
    });
  }
});

/**
 * GET /api/backtests
 * Get all backtests
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT b.*, s.name as strategy_name
      FROM backtests b
      JOIN strategies s ON b.strategy_id = s.id
      ORDER BY b.created_at DESC
    `);

    const rows = stmt.all() as any[];

    const backtests = rows.map((row) => ({
      id: row.id,
      strategyId: row.strategy_id,
      strategyName: row.strategy_name,
      config: JSON.parse(row.config),
      status: row.status,
      metrics: row.metrics ? JSON.parse(row.metrics) : null,
      error: row.error,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));

    res.json({ backtests });
  } catch (error: any) {
    console.error('Error fetching backtests:', error);
    res.status(500).json({
      error: 'Failed to fetch backtests',
      message: error.message,
    });
  }
});

/**
 * GET /api/backtests/:id
 * Get a specific backtest with full results
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Get backtest
    const backtestStmt = db.prepare(`
      SELECT b.*, s.name as strategy_name
      FROM backtests b
      JOIN strategies s ON b.strategy_id = s.id
      WHERE b.id = ?
    `);

    const backtestRow = backtestStmt.get(id) as any;

    if (!backtestRow) {
      return res.status(404).json({ error: 'Backtest not found' });
    }

    // Get trades
    const tradesStmt = db.prepare('SELECT * FROM trades WHERE backtest_id = ? ORDER BY entry_timestamp');
    const trades = tradesStmt.all(id);

    const backtest = {
      id: backtestRow.id,
      strategyId: backtestRow.strategy_id,
      strategyName: backtestRow.strategy_name,
      config: JSON.parse(backtestRow.config),
      status: backtestRow.status,
      metrics: backtestRow.metrics ? JSON.parse(backtestRow.metrics) : null,
      equityCurve: backtestRow.equity_curve ? JSON.parse(backtestRow.equity_curve) : [],
      trades,
      error: backtestRow.error,
      createdAt: backtestRow.created_at,
      completedAt: backtestRow.completed_at,
    };

    res.json({ backtest });
  } catch (error: any) {
    console.error('Error fetching backtest:', error);
    res.status(500).json({
      error: 'Failed to fetch backtest',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/backtests/:id
 * Delete a backtest
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const stmt = db.prepare('DELETE FROM backtests WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Backtest not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting backtest:', error);
    res.status(500).json({
      error: 'Failed to delete backtest',
      message: error.message,
    });
  }
});

/**
 * POST /api/backtests/execute-script
 * Execute a backtest script dynamically
 * This endpoint is used internally by Claude to run complex backtests
 */
router.post('/execute-script', async (req: Request, res: Response) => {
  try {
    const { scriptTemplate, parameters }: ScriptExecutionRequest = req.body;

    if (!scriptTemplate || !parameters) {
      return res.status(400).json({
        error: 'Missing required fields: scriptTemplate, parameters',
      });
    }

    const { ticker, date, timeframe = '5min', ...config } = parameters;

    // Validate parameters
    const validation = ScriptGeneratorService.validateParams({
      strategyType: scriptTemplate,
      ticker,
      date,
      timeframe,
      config,
    });

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid parameters',
        validationErrors: validation.errors,
      });
    }

    // Generate script
    const script = await ScriptGeneratorService.generateScript({
      strategyType: scriptTemplate,
      ticker,
      date,
      timeframe,
      config,
    });

    // Write to temp file
    const scriptPath = await ScriptGeneratorService.writeScriptToFile(script);

    console.log(`Generated script: ${scriptPath}`);
    console.log(`Running backtest for ${ticker} on ${date}...`);

    // Execute script
    const startTime = Date.now();
    const result = await ScriptExecutionService.executeScript(scriptPath);
    const executionTime = Date.now() - startTime;

    if (!result.success) {
      console.error('Script execution failed:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error,
        stderr: result.stderr,
        executionId: crypto.randomUUID(),
      });
    }

    console.log(`Script completed in ${executionTime}ms`);

    res.json({
      success: true,
      executionId: crypto.randomUUID(),
      results: result.data,
      executionTime,
      scriptPath: scriptPath, // For debugging
    });

  } catch (error: any) {
    console.error('Error executing script:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute script',
      message: error.message,
      executionId: crypto.randomUUID(),
    });
  }
});

export default router;
