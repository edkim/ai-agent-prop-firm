/**
 * Batch Backtest Service
 * Handles batch execution of multiple strategies across multiple samples
 */

import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getDatabase } from '../database/db';
import logger from './logger.service';
import { ScriptExecutionService } from './script-execution.service';
import polygonService from './polygon.service';
import UniverseDataService from './universe-data.service';

interface StrategyRecommendation {
  id: string;
  analysis_id: string;
  name: string;
  side: 'long' | 'short';
  entry_conditions: any;
  exit_conditions: any;
  confidence_score?: number;
}

interface Sample {
  id: string;
  ticker: string;
  start_date: string;
  end_date: string;
}

interface BatchBacktestRequest {
  analysisId: string;
  backtestSetId: string;
}

interface BatchBacktestStatus {
  batchRunId: string;
  status: string;
  totalTests: number;
  completedTests: number;
  failedTests: number;
  strategies: StrategyPerformanceSummary[];
}

interface StrategyPerformanceSummary {
  strategyId: string;
  strategyName: string;
  winRate: number;
  totalTests: number;
  successfulTests: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  avgPnlPercent: number;
}

export class BatchBacktestService {
  private anthropic: Anthropic;
  private scriptExecutor: ScriptExecutionService;
  private scriptsDir: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY required for batch backtesting');
    }
    this.anthropic = new Anthropic({ apiKey });
    this.scriptExecutor = new ScriptExecutionService();
    this.scriptsDir = path.join(process.cwd(), 'claude-generated-scripts');
  }

  /**
   * Start a batch backtest run
   */
  async startBatchBacktest(request: BatchBacktestRequest): Promise<{ batchRunId: string }> {
    const db = getDatabase();
    const batchRunId = randomUUID();

    logger.info(`🚀 Starting batch backtest run ${batchRunId}`);

    // Get strategies from analysis
    const strategies = db.prepare(`
      SELECT * FROM strategy_recommendations
      WHERE analysis_id = ?
    `).all(request.analysisId) as StrategyRecommendation[];

    if (strategies.length === 0) {
      throw new Error(`No strategies found for analysis ${request.analysisId}`);
    }

    // Get samples from backtest set
    const samples = db.prepare(`
      SELECT * FROM scan_results
      WHERE backtest_set_id = ?
    `).all(request.backtestSetId) as Sample[];

    if (samples.length === 0) {
      throw new Error(`No samples found in backtest set ${request.backtestSetId}`);
    }

    const totalTests = strategies.length * samples.length;

    logger.info(`📊 Batch backtest: ${strategies.length} strategies × ${samples.length} samples = ${totalTests} tests`);

    // Create batch run record
    db.prepare(`
      INSERT INTO batch_backtest_runs
      (id, analysis_id, backtest_set_id, status, total_strategies, total_samples, total_tests)
      VALUES (?, ?, ?, 'RUNNING', ?, ?, ?)
    `).run(batchRunId, request.analysisId, request.backtestSetId, strategies.length, samples.length, totalTests);

    // Run batch asynchronously
    this.executeBatchBacktest(batchRunId, strategies, samples).catch(error => {
      logger.error(`Batch backtest ${batchRunId} failed:`, error);
      db.prepare(`
        UPDATE batch_backtest_runs
        SET status = 'FAILED', error_message = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error.message, batchRunId);
    });

    return { batchRunId };
  }

  /**
   * Execute the batch backtest (runs in background)
   */
  private async executeBatchBacktest(
    batchRunId: string,
    strategies: StrategyRecommendation[],
    samples: Sample[]
  ): Promise<void> {
    const db = getDatabase();
    const startTime = Date.now();

    try {
      // Step 1: Generate backtest scripts for all strategies
      logger.info(`📝 Generating backtest scripts for ${strategies.length} strategies...`);
      await this.generateStrategyScripts(strategies);

      // Step 1.5: Ensure intraday data is available for all samples
      logger.info(`📊 Checking intraday data availability for ${samples.length} samples...`);
      await this.ensureIntradayData(samples);

      // Step 2: Execute each strategy on each sample
      let completedTests = 0;
      let failedTests = 0;

      for (const strategy of strategies) {
        logger.info(`🧪 Testing strategy: ${strategy.name} (${strategy.side})`);

        const strategyResults: any[] = [];

        for (const sample of samples) {
          const resultId = randomUUID();

          // Create result record
          db.prepare(`
            INSERT INTO batch_backtest_results
            (id, batch_run_id, strategy_recommendation_id, sample_id, ticker, status)
            VALUES (?, ?, ?, ?, ?, 'RUNNING')
          `).run(resultId, batchRunId, strategy.id, sample.id, sample.ticker);

          try {
            // Get script path
            const script = db.prepare(`
              SELECT script_path FROM strategy_backtest_scripts
              WHERE strategy_recommendation_id = ? AND generation_status = 'COMPLETED'
            `).get(strategy.id) as { script_path: string } | undefined;

            if (!script) {
              throw new Error(`No generated script found for strategy ${strategy.id}`);
            }

            // Execute backtest
            const testStartTime = Date.now();
            // Pass parameters as environment variables
            process.env.BACKTEST_TICKER = sample.ticker;
            process.env.BACKTEST_START_DATE = sample.start_date;
            process.env.BACKTEST_END_DATE = sample.end_date;

            const result = await this.scriptExecutor.executeScript(script.script_path);

            const executionTime = Date.now() - testStartTime;

            if (result.success && result.data) {
              // Extract metrics
              const metrics = result.data.metrics;
              const trades = result.data.trades || [];

              const winningTrades = trades.filter((t: any) => (t.pnl || 0) > 0).length;
              const losingTrades = trades.filter((t: any) => (t.pnl || 0) <= 0).length;

              // Update result
              db.prepare(`
                UPDATE batch_backtest_results
                SET status = 'COMPLETED',
                    total_trades = ?,
                    winning_trades = ?,
                    losing_trades = ?,
                    total_pnl = ?,
                    total_pnl_percent = ?,
                    max_drawdown_percent = ?,
                    trades_json = ?,
                    metrics_json = ?,
                    execution_time_ms = ?,
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(
                trades.length,
                winningTrades,
                losingTrades,
                metrics.total_pnl || 0,
                metrics.total_pnl_percent || 0,
                metrics.max_drawdown_percent || 0,
                JSON.stringify(trades),
                JSON.stringify(metrics),
                executionTime,
                resultId
              );

              strategyResults.push({
                sampleId: sample.id,
                pnlPercent: metrics.total_pnl_percent || 0,
                winningTrades,
                losingTrades,
              });

              completedTests++;
              logger.info(`  ✓ ${sample.ticker}: ${trades.length} trades, P&L: ${(metrics.total_pnl_percent || 0).toFixed(2)}%`);
            } else {
              throw new Error(result.error || 'Script execution failed');
            }
          } catch (error: any) {
            logger.error(`  ✗ ${sample.ticker}: ${error.message}`);

            db.prepare(`
              UPDATE batch_backtest_results
              SET status = 'FAILED',
                  error_message = ?,
                  completed_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(error.message, resultId);

            failedTests++;
          }

          // Update progress
          db.prepare(`
            UPDATE batch_backtest_runs
            SET completed_tests = ?, failed_tests = ?
            WHERE id = ?
          `).run(completedTests, failedTests, batchRunId);
        }

        // Calculate strategy performance summary
        await this.calculateStrategyPerformance(batchRunId, strategy, strategyResults);
      }

      // Mark batch as completed
      const executionTime = Date.now() - startTime;
      db.prepare(`
        UPDATE batch_backtest_runs
        SET status = 'COMPLETED',
            execution_time_ms = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(executionTime, batchRunId);

      logger.info(`✅ Batch backtest completed in ${(executionTime / 1000).toFixed(1)}s`);
    } catch (error: any) {
      logger.error(`Batch backtest execution failed:`, error);
      throw error;
    }
  }

  /**
   * Generate backtest scripts for strategies
   */
  private async generateStrategyScripts(strategies: StrategyRecommendation[]): Promise<void> {
    const db = getDatabase();

    for (const strategy of strategies) {
      // Check if script already exists
      const existing = db.prepare(`
        SELECT * FROM strategy_backtest_scripts
        WHERE strategy_recommendation_id = ?
      `).get(strategy.id);

      if (existing) {
        logger.info(`  ⏭️  Script already exists for ${strategy.name}`);
        continue;
      }

      const scriptId = randomUUID();
      const scriptPath = path.join(this.scriptsDir, `batch-strategy-${scriptId}.ts`);

      // Create record
      db.prepare(`
        INSERT INTO strategy_backtest_scripts
        (id, strategy_recommendation_id, script_path, generation_status)
        VALUES (?, ?, ?, 'GENERATING')
      `).run(scriptId, strategy.id, scriptPath);

      try {
        logger.info(`  📝 Generating script for ${strategy.name}...`);

        // Generate script with Claude
        const script = await this.generateStrategyScript(strategy);

        // Save script file
        await fs.writeFile(scriptPath, script);

        // Calculate hash
        const scriptHash = crypto.createHash('sha256').update(script).digest('hex');

        // Update record
        db.prepare(`
          UPDATE strategy_backtest_scripts
          SET generation_status = 'COMPLETED', script_hash = ?
          WHERE id = ?
        `).run(scriptHash, scriptId);

        logger.info(`  ✓ Generated: ${scriptPath}`);
      } catch (error: any) {
        logger.error(`  ✗ Failed to generate script: ${error.message}`);

        db.prepare(`
          UPDATE strategy_backtest_scripts
          SET generation_status = 'FAILED', error_message = ?
          WHERE id = ?
        `).run(error.message, scriptId);

        throw error;
      }
    }
  }

  /**
   * Generate backtest script from strategy recommendation using Claude
   */
  private async generateStrategyScript(strategy: StrategyRecommendation): Promise<string> {
    const prompt = this.buildStrategyScriptPrompt(strategy);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      temperature: 0,
      system: `You are an expert TypeScript developer specializing in trading backtests. Generate clean, executable TypeScript code based on the strategy description provided.`,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Extract code from response
    const codeMatch = textContent.text.match(/```typescript\n([\s\S]*?)\n```/);
    if (!codeMatch) {
      // Try without language specifier
      const altMatch = textContent.text.match(/```\n([\s\S]*?)\n```/);
      if (!altMatch) {
        throw new Error('No code block found in Claude response');
      }
      return altMatch[1];
    }

    return codeMatch[1];
  }

  /**
   * Build prompt for strategy script generation
   */
  private buildStrategyScriptPrompt(strategy: StrategyRecommendation): string {
    return `Generate a TypeScript backtest script for the following trading strategy:

**Strategy Name:** ${strategy.name}
**Side:** ${strategy.side}

**Entry Conditions:**
${JSON.stringify(strategy.entry_conditions, null, 2)}

**Exit Conditions:**
${JSON.stringify(strategy.exit_conditions, null, 2)}

The script should:
1. Read parameters from environment variables: BACKTEST_TICKER, BACKTEST_START_DATE, BACKTEST_END_DATE
2. Load 5-minute intraday OHLCV data from the database for the given ticker and date range
3. Implement the entry logic based on the visual/specific conditions described
4. Implement the exit logic (stop loss, take profit, max hold period)
5. Track all trades and calculate P&L
6. Execute the backtest at the end and print results to stdout in JSON format:

\`\`\`json
{
  "trades": [
    {
      "entry_timestamp": number,
      "entry_price": number,
      "exit_timestamp": number,
      "exit_price": number,
      "pnl": number,
      "pnl_percent": number,
      "exit_reason": string
    }
  ],
  "metrics": {
    "total_trades": number,
    "winning_trades": number,
    "losing_trades": number,
    "total_pnl": number,
    "total_pnl_percent": number,
    "max_drawdown_percent": number
  }
}
\`\`\`

Important notes:
- Use \`better-sqlite3\` for database access
- Database path: './backtesting.db'
- Table: \`ohlcv_data\` with columns: ticker, timestamp, open, high, low, close, volume, timeframe
- Timeframe is '5min' for intraday data
- Implement visual conditions as code (e.g., "large green candle" = close > open && (close - open) / open > 0.02)
- Implement volume conditions (e.g., "volume >3x avg" = check 20-period moving average)
- Handle edge cases (no data, no trades triggered)
- At the end of the script, add code to execute the backtest and print results:
  \`\`\`typescript
  const ticker = process.env.BACKTEST_TICKER!;
  const startDate = process.env.BACKTEST_START_DATE!;
  const endDate = process.env.BACKTEST_END_DATE!;
  const result = runBacktest(ticker, startDate, endDate);
  console.log(JSON.stringify(result, null, 2));
  \`\`\`

Generate the complete, executable script now:`;
  }

  /**
   * Calculate strategy performance summary
   */
  private async calculateStrategyPerformance(
    batchRunId: string,
    strategy: StrategyRecommendation,
    results: any[]
  ): Promise<void> {
    const db = getDatabase();

    const successfulTests = results.length;
    const winningTrades = results.reduce((sum, r) => sum + r.winningTrades, 0);
    const losingTrades = results.reduce((sum, r) => sum + r.losingTrades, 0);
    const totalTrades = winningTrades + losingTrades;

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const pnlPercents = results.map(r => r.pnlPercent);
    const totalPnl = pnlPercents.reduce((sum, p) => sum + p, 0);
    const avgPnlPercent = successfulTests > 0 ? totalPnl / successfulTests : 0;

    const sortedPnl = [...pnlPercents].sort((a, b) => a - b);
    const medianPnlPercent = sortedPnl[Math.floor(sortedPnl.length / 2)] || 0;
    const bestPnlPercent = sortedPnl[sortedPnl.length - 1] || 0;
    const worstPnlPercent = sortedPnl[0] || 0;

    const bestResult = results.reduce((best, r) => r.pnlPercent > best.pnlPercent ? r : best, results[0]);
    const worstResult = results.reduce((worst, r) => r.pnlPercent < worst.pnlPercent ? r : worst, results[0]);

    const perfId = randomUUID();

    db.prepare(`
      INSERT INTO batch_strategy_performance
      (id, batch_run_id, strategy_recommendation_id, strategy_name,
       total_tests, successful_tests, failed_tests,
       winning_trades, losing_trades, win_rate,
       total_pnl, avg_pnl_per_trade, avg_pnl_percent_per_trade,
       median_pnl_percent, best_pnl_percent, worst_pnl_percent,
       best_sample_id, best_sample_pnl_percent,
       worst_sample_id, worst_sample_pnl_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      perfId,
      batchRunId,
      strategy.id,
      strategy.name,
      successfulTests,
      successfulTests,
      0,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      totalTrades > 0 ? totalPnl / totalTrades : 0,
      avgPnlPercent,
      medianPnlPercent,
      bestPnlPercent,
      worstPnlPercent,
      bestResult?.sampleId || null,
      bestResult?.pnlPercent || 0,
      worstResult?.sampleId || null,
      worstResult?.pnlPercent || 0
    );

    logger.info(`  📊 ${strategy.name}: ${winRate.toFixed(1)}% win rate, ${avgPnlPercent.toFixed(2)}% avg P&L`);
  }

  /**
   * Get batch backtest status and results
   */
  async getBatchBacktestStatus(batchRunId: string): Promise<BatchBacktestStatus> {
    const db = getDatabase();

    const run = db.prepare(`
      SELECT * FROM batch_backtest_runs WHERE id = ?
    `).get(batchRunId) as any;

    if (!run) {
      throw new Error(`Batch run ${batchRunId} not found`);
    }

    const strategies = db.prepare(`
      SELECT * FROM batch_strategy_performance WHERE batch_run_id = ?
      ORDER BY win_rate DESC
    `).all(batchRunId) as any[];

    return {
      batchRunId,
      status: run.status,
      totalTests: run.total_tests,
      completedTests: run.completed_tests,
      failedTests: run.failed_tests,
      strategies: strategies.map(s => ({
        strategyId: s.strategy_recommendation_id,
        strategyName: s.strategy_name,
        winRate: s.win_rate || 0,
        totalTests: s.total_tests,
        successfulTests: s.successful_tests,
        winningTrades: s.winning_trades,
        losingTrades: s.losing_trades,
        totalPnl: s.total_pnl,
        avgPnlPercent: s.avg_pnl_percent_per_trade || 0,
      }))
    };
  }

  /**
   * Get detailed results for a specific strategy
   */
  async getStrategyResults(batchRunId: string, strategyId: string): Promise<any[]> {
    const db = getDatabase();

    const results = db.prepare(`
      SELECT
        r.*,
        sr.ticker,
        sr.start_date,
        sr.end_date
      FROM batch_backtest_results r
      JOIN scan_results sr ON r.sample_id = sr.id
      WHERE r.batch_run_id = ? AND r.strategy_recommendation_id = ?
      ORDER BY r.total_pnl_percent DESC
    `).all(batchRunId, strategyId);

    return results;
  }

  /**
   * Ensure intraday data is available for all samples
   * Automatically fetches missing data from Polygon API
   */
  private async ensureIntradayData(samples: Sample[]): Promise<void> {
    const uniqueTickers = new Map<string, Sample>();

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Deduplicate by ticker (use widest date range if duplicates)
    for (const sample of samples) {
      const existing = uniqueTickers.get(sample.ticker);
      if (!existing) {
        uniqueTickers.set(sample.ticker, sample);
      } else {
        // Use widest date range
        const startDate = new Date(sample.start_date) < new Date(existing.start_date)
          ? sample.start_date
          : existing.start_date;
        const endDate = new Date(sample.end_date) > new Date(existing.end_date)
          ? sample.end_date
          : existing.end_date;
        uniqueTickers.set(sample.ticker, { ...sample, start_date: startDate, end_date: endDate });
      }
    }

    let fetchedCount = 0;
    let cachedCount = 0;
    let cappedCount = 0;

    for (const sample of uniqueTickers.values()) {
      // Cap end date at today to prevent requesting future data
      let effectiveEndDate = sample.end_date;
      if (new Date(sample.end_date) > today) {
        effectiveEndDate = todayStr;
        cappedCount++;
      }

      const startTimestamp = new Date(sample.start_date).getTime();
      const endTimestamp = new Date(effectiveEndDate).getTime();

      // Check if 5-minute data exists
      const hasData = await polygonService.hasData(
        sample.ticker,
        '5min',
        startTimestamp,
        endTimestamp
      );

      if (!hasData) {
        if (effectiveEndDate !== sample.end_date) {
          logger.info(`  📥 Fetching 5-min data for ${sample.ticker} (${sample.start_date} to ${effectiveEndDate}, capped from ${sample.end_date})...`);
        } else {
          logger.info(`  📥 Fetching 5-min data for ${sample.ticker} (${sample.start_date} to ${effectiveEndDate})...`);
        }
        try {
          await UniverseDataService.fetchIntradayDataOnDemand(
            sample.ticker,
            sample.start_date,
            effectiveEndDate,
            '5min'
          );
          fetchedCount++;
        } catch (error: any) {
          logger.error(`  ❌ Failed to fetch data for ${sample.ticker}: ${error.message}`);
          // Continue with other samples even if one fails
        }
      } else {
        logger.info(`  ✓ ${sample.ticker}: Data already cached`);
        cachedCount++;
      }

      // Small delay between fetches to respect API rate limits
      if (fetchedCount > 0 && uniqueTickers.size > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (cappedCount > 0) {
      logger.info(`⚠️  Capped ${cappedCount} ticker(s) end date to today (${todayStr}) to avoid future dates`);
    }
    if (fetchedCount > 0) {
      logger.info(`✅ Fetched 5-min data for ${fetchedCount} ticker(s)`);
    }
    if (cachedCount > 0) {
      logger.info(`✅ Using cached data for ${cachedCount} ticker(s)`);
    }
  }
}

export default new BatchBacktestService();
