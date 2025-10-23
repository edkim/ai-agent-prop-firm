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
import BacktestRouterService from '../../services/backtest-router.service';
import PolygonService from '../../services/polygon.service';
import logger from '../../services/logger.service';
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
 * Helper function to check and fetch missing data
 */
async function ensureDataExists(
  ticker: string,
  timeframe: string,
  dates: string[]
): Promise<{ success: boolean; message?: string; fetchedDates?: string[] }> {
  const fetchedDates: string[] = [];

  for (const date of dates) {
    // Check if data exists for this date
    const dateStart = new Date(`${date}T00:00:00Z`).getTime();
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateEnd = nextDate.getTime();

    const hasData = await PolygonService.hasData(ticker, timeframe, dateStart, dateEnd);

    if (!hasData) {
      console.log(`📥 Fetching missing data for ${ticker} on ${date}...`);

      try {
        // Fetch data for this specific date
        // Add a buffer to ensure we get pre-market and after-hours data
        const fetchFrom = date; // Polygon uses date strings
        const fetchTo = date;

        const count = await PolygonService.fetchAndStore(ticker, timeframe as any, fetchFrom, fetchTo);

        if (count > 0) {
          fetchedDates.push(date);
          console.log(`✅ Fetched ${count} bars for ${ticker} on ${date}`);
        } else {
          console.log(`⚠️  No data available for ${ticker} on ${date} (likely non-trading day)`);
        }
      } catch (error: any) {
        console.error(`❌ Failed to fetch data for ${ticker} on ${date}:`, error.message);
        return {
          success: false,
          message: `Failed to fetch data for ${date}: ${error.message}`
        };
      }
    } else {
      console.log(`✓ Data already exists for ${ticker} on ${date}`);
    }
  }

  return {
    success: true,
    fetchedDates
  };
}

/**
 * POST /api/backtests/execute-intelligent
 * Execute a backtest using intelligent routing
 * This endpoint analyzes the request and automatically decides whether to use
 * template API or custom script generation
 */
router.post('/execute-intelligent', async (req: Request, res: Response) => {
  try {
    const { prompt, ticker, strategyType = 'orb', timeframe = '5min', config = {} } = req.body;

    if (!prompt || !ticker) {
      return res.status(400).json({
        error: 'Missing required fields: prompt, ticker',
      });
    }

    await logger.info('Intelligent backtest request received', {
      prompt,
      ticker,
      timeframe,
      strategyType,
    });

    console.log(`Analyzing request: "${prompt}"`);

    // Use router to analyze request
    const decision = await BacktestRouterService.analyzeRequest(prompt, {
      ticker,
      strategyType,
      timeframe,
      config,
    });

    console.log(`Routing decision: ${decision.strategy} - ${decision.reason}`);

    await logger.info('Routing decision made', {
      strategy: decision.strategy,
      reason: decision.reason,
      dates: decision.dates,
      assumptions: decision.assumptions,
      confidence: decision.confidence,
    });

    // Build script generation params
    const params: any = {
      strategyType,
      ticker,
      timeframe,
      config: { ...config },
    };

    // Add date information based on routing decision
    if (decision.dates && decision.dates.length > 0) {
      if (decision.dates.length === 1) {
        params.date = decision.dates[0];
      } else {
        params.specificDates = decision.dates;
      }
    }

    // Extract exit time from prompt if specified
    const lowercasePrompt = prompt.toLowerCase();
    if (lowercasePrompt.includes('noon') || lowercasePrompt.includes('12:00')) {
      params.config.exitTime = '12:00';
    } else {
      const timeMatch = prompt.match(/(?:exit|close)(?:\s+at)?\s+(\d{1,2}):?(\d{2})/i);
      if (timeMatch) {
        const hours = timeMatch[1].padStart(2, '0');
        const minutes = timeMatch[2] || '00';
        params.config.exitTime = `${hours}:${minutes}`;
      }
    }

    // Extract position direction (long, short, or both) from prompt
    const hasShortKeywords = /\b(short|shorts|short position|short positions|breakdown|breakdowns|shorting)\b/i.test(prompt);
    const hasLongKeywords = /\b(long|longs|long position|long positions|breakout|breakouts)\b/i.test(prompt);
    const hasIncludingShort = /including\s+(short|shorts)/i.test(prompt);
    const hasOnlyShort = /\b(only short|shorts only|short only)\b/i.test(prompt);
    const hasBothKeywords = /\b(both|long and short|short and long)\b/i.test(prompt);

    if (hasOnlyShort) {
      // Only short positions
      params.config.allowLong = false;
      params.config.allowShort = true;
    } else if (hasIncludingShort || hasBothKeywords || (hasShortKeywords && hasLongKeywords)) {
      // Both long and short
      params.config.allowLong = true;
      params.config.allowShort = true;
    } else if (hasShortKeywords) {
      // Short mentioned but not "including" - still enable both to be safe
      params.config.allowLong = true;
      params.config.allowShort = true;
    } else {
      // Default: long only
      params.config.allowLong = true;
      params.config.allowShort = false;
    }

    // Extract take profit from prompt (e.g., "take profit at +2%", "TP +3%", "target 2%")
    const takeProfitMatch = prompt.match(/(?:take profit|tp|target)(?:\s+at)?\s+\+?(\d+(?:\.\d+)?)%/i);
    if (takeProfitMatch) {
      params.config.takeProfitPct = parseFloat(takeProfitMatch[1]);
      console.log(`Detected take profit: ${params.config.takeProfitPct}%`);
    }

    // Extract stop loss from prompt (e.g., "stop loss at -1%", "SL -2%", "stop at 1%")
    const stopLossMatch = prompt.match(/(?:stop loss|sl|stop)(?:\s+at)?\s+-?(\d+(?:\.\d+)?)%/i);
    if (stopLossMatch) {
      params.config.stopLossPct = parseFloat(stopLossMatch[1]);
      console.log(`Detected stop loss: ${params.config.stopLossPct}%`);
    }

    // Extract opening range duration from prompt (e.g., "5 minute opening range", "15 min ORB")
    const orbDurationMatch = prompt.match(/(\d+)[\s-]?(?:minute|min|m)(?:\s+opening\s+range|\s+orb)?/i);
    if (orbDurationMatch) {
      params.config.openingRangeMinutes = parseInt(orbDurationMatch[1]);
      console.log(`Detected opening range duration: ${params.config.openingRangeMinutes} minutes`);
    } else {
      // Default to 5 minutes
      params.config.openingRangeMinutes = 5;
    }

    // Ensure data exists before running backtest
    if (decision.dates && decision.dates.length > 0) {
      console.log(`\n📊 Checking data availability for ${decision.dates.length} date(s)...`);
      const dataCheck = await ensureDataExists(ticker, timeframe, decision.dates);

      if (!dataCheck.success) {
        return res.status(500).json({
          success: false,
          error: 'Data fetch failed',
          message: dataCheck.message,
          routing: decision,
          executionId: crypto.randomUUID(),
        });
      }

      if (dataCheck.fetchedDates && dataCheck.fetchedDates.length > 0) {
        console.log(`✅ Fetched data for ${dataCheck.fetchedDates.length} date(s)`);
      }
    } else {
      // If no specific dates provided, try to infer from params
      const datesToCheck: string[] = [];
      if (params.date) {
        datesToCheck.push(params.date);
      } else if (params.dateRange) {
        // Generate dates from range
        const current = new Date(params.dateRange.from);
        const end = new Date(params.dateRange.to);
        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            datesToCheck.push(current.toISOString().split('T')[0]);
          }
          current.setDate(current.getDate() + 1);
        }
      }

      if (datesToCheck.length > 0) {
        console.log(`\n📊 Checking data availability for ${datesToCheck.length} date(s)...`);
        const dataCheck = await ensureDataExists(ticker, timeframe, datesToCheck);

        if (!dataCheck.success) {
          return res.status(500).json({
            success: false,
            error: 'Data fetch failed',
            message: dataCheck.message,
            routing: decision,
            executionId: crypto.randomUUID(),
          });
        }
      }
    }

    // Execute the routing decision
    const scriptResult = await BacktestRouterService.executeDecision(decision, params);

    console.log(`Generated script: ${scriptResult.filepath}`);

    // Fetch data for Claude-selected dates before running the script
    if (scriptResult.dates && scriptResult.dates.length > 0) {
      console.log(`\n📊 Fetching data for ${scriptResult.dates.length} Claude-selected date(s)...`);
      const dataCheck = await ensureDataExists(ticker, timeframe, scriptResult.dates);

      if (!dataCheck.success) {
        return res.status(500).json({
          success: false,
          error: 'Data fetch failed',
          message: dataCheck.message,
          routing: decision,
          executionId: crypto.randomUUID(),
        });
      }

      if (dataCheck.fetchedDates && dataCheck.fetchedDates.length > 0) {
        console.log(`✅ Fetched data for ${dataCheck.fetchedDates.length} new date(s)`);
      }
    }

    console.log(`Running backtest...`);

    await logger.info('Script generated successfully', {
      filepath: scriptResult.filepath,
      strategy: decision.strategy,
      scriptLength: scriptResult.script.length,
    });

    // Execute script
    const startTime = Date.now();
    const result = await ScriptExecutionService.executeScript(scriptResult.filepath);
    const executionTime = Date.now() - startTime;

    if (!result.success) {
      console.error('Script execution failed:', result.error);
      await logger.error('Backtest execution failed', {
        error: result.error,
        stderr: result.stderr,
        filepath: scriptResult.filepath,
      });
      return res.status(500).json({
        success: false,
        error: result.error,
        stderr: result.stderr,
        routing: decision,
        executionId: crypto.randomUUID(),
      });
    }

    console.log(`Script completed in ${executionTime}ms`);

    // Build detailed execution metadata for UI
    const metadata = {
      routing: {
        strategy: decision.strategy,
        reason: decision.reason,
      },
      dates: decision.dates || [],
      parameters: {
        ticker,
        timeframe,
        allowLong: params.config.allowLong,
        allowShort: params.config.allowShort,
        takeProfitPct: params.config.takeProfitPct,
        stopLossPct: params.config.stopLossPct,
        exitTime: params.config.exitTime,
        openingRangeMinutes: params.config.openingRangeMinutes,
      },
      claude: decision.strategy === 'claude-generated' ? {
        assumptions: decision.assumptions || [],
        confidence: decision.confidence || 0,
      } : undefined,
    };

    await logger.info('Backtest completed successfully', {
      ticker,
      executionTime: `${executionTime}ms`,
      totalTrades: result.data?.metrics?.total_trades || 0,
      totalPnL: result.data?.metrics?.total_pnl || 0,
      strategy: decision.strategy,
      dates: decision.dates?.length || 0,
    });

    res.json({
      success: true,
      executionId: crypto.randomUUID(),
      results: result.data,
      executionTime,
      metadata,
      scriptPath: scriptResult.filepath, // For debugging
    });

  } catch (error: any) {
    console.error('Error executing intelligent backtest:', error);
    await logger.error('Intelligent backtest execution failed with exception', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to execute backtest',
      message: error.message,
      executionId: crypto.randomUUID(),
    });
  }
});

export default router;
