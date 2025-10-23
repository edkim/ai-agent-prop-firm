/**
 * Script Execution Service
 *
 * Executes TypeScript backtest scripts and parses their output
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import {
  ScriptExecutionResult,
  BacktestScriptOutput,
  ScriptTrade,
  ScriptMetrics,
} from '../types/script.types';
import logger from './logger.service';

const execAsync = promisify(exec);

export class ScriptExecutionService {
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly maxBuffer = 10 * 1024 * 1024; // 10MB

  /**
   * Execute a TypeScript script and return parsed results
   */
  async executeScript(scriptPath: string, timeout?: number): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const absolutePath = path.resolve(scriptPath);
    const command = `npx ts-node "${absolutePath}"`;

    await logger.info('Starting script execution', {
      scriptPath: absolutePath,
      command,
      timeout: timeout || this.defaultTimeout,
    });

    try {
      // Verify script exists
      await fs.access(scriptPath);

      // Execute with timeout
      const { stdout, stderr } = await execAsync(
        command,
        {
          cwd: path.join(__dirname, '../..'), // Run from backend directory
          timeout: timeout || this.defaultTimeout,
          maxBuffer: this.maxBuffer,
          env: {
            ...process.env,
            NODE_ENV: 'script-execution',
          },
        }
      );

      const executionTime = Date.now() - startTime;

      if (stderr && stderr.trim().length > 0) {
        console.warn('Script stderr:', stderr);
        await logger.warn('Script execution stderr output', { stderr });
      }

      // Parse output
      const result = this.parseScriptOutput(stdout);

      await logger.info('Script execution completed successfully', {
        executionTime: `${executionTime}ms`,
        stdout: stdout.substring(0, 500), // Log first 500 chars
        resultSummary: result ? {
          trades: result.trades?.length || 0,
          totalPnL: result.metrics?.total_pnl,
          ticker: result.backtest?.ticker,
          date: result.backtest?.date,
        } : 'No result data',
      });

      return {
        success: true,
        data: result,
        stdout,
        stderr,
        executionTime,
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      console.error('Script execution failed:', error.message);

      await logger.error('Script execution failed', {
        error: error.message,
        executionTime: `${executionTime}ms`,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        scriptPath: absolutePath,
      });

      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        executionTime,
      };
    } finally {
      // Clean up temp file (starts with 'backtest-' in backend directory)
      if (scriptPath.includes('backtest-') && scriptPath.endsWith('.ts')) {
        await fs.unlink(scriptPath).catch(() => {
          // Ignore cleanup errors
        });
      }
    }
  }

  /**
   * Parse script output - handle both JSON and console.log format
   */
  private parseScriptOutput(stdout: string): BacktestScriptOutput | undefined {
    if (!stdout || stdout.trim().length === 0) {
      return undefined;
    }

    // Try to parse as JSON first
    const jsonResult = this.tryParseJSON(stdout);
    if (jsonResult) {
      return jsonResult;
    }

    // Fall back to console.log format parsing
    return this.parseConsoleOutput(stdout);
  }

  /**
   * Try to extract and parse JSON from output
   */
  private tryParseJSON(stdout: string): BacktestScriptOutput | null {
    // Look for JSON object in output
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate it has the expected structure
      if (parsed.backtest || parsed.trades || parsed.metrics) {
        return parsed as BacktestScriptOutput;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse console.log formatted output from scripts
   * This handles the format from run-orb-backtest-trailing-stop.ts
   */
  private parseConsoleOutput(stdout: string): BacktestScriptOutput {
    const lines = stdout.split('\n');

    // Extract key information
    let ticker = '';
    let date = '';
    let strategy = 'Unknown';
    const trades: ScriptTrade[] = [];
    const metrics: Partial<ScriptMetrics> = {
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
    };

    // Parse header information
    for (const line of lines) {
      if (line.includes('Ticker:')) {
        ticker = line.split(':')[1].trim();
      }
      if (line.includes('Date:')) {
        const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          date = dateMatch[0];
        }
      }
      if (line.includes('Strategy:')) {
        strategy = line.split('Strategy:')[1].split(/Exit:|Filter:/)[0].trim();
      }
    }

    // Parse trade information
    const trade: Partial<ScriptTrade> = {};

    for (const line of lines) {
      // Entry price
      if (line.includes('ENTERED LONG at')) {
        const priceMatch = line.match(/\$(\d+\.\d+)/);
        if (priceMatch) {
          trade.entry_price = parseFloat(priceMatch[1]);
        }
        const timeMatch = line.match(/\((\d{1,2}:\d{2})\)/);
        if (timeMatch) {
          trade.entry_time = timeMatch[1];
        }
      }

      // Exit information
      if (line.includes('Exit:') && line.includes('$')) {
        const priceMatch = line.match(/\$(\d+\.\d+)/);
        if (priceMatch) {
          trade.exit_price = parseFloat(priceMatch[1]);
        }
      }

      if (line.includes('Time:') && line.match(/\d{1,2}:\d{2}/)) {
        const timeMatch = line.match(/(\d{1,2}:\d{2})/);
        if (timeMatch && !trade.exit_time) {
          trade.exit_time = timeMatch[1];
        }
      }

      if (line.includes('Reason:')) {
        trade.exit_reason = line.split('Reason:')[1].trim();
      }

      // P&L
      if (line.includes('P&L:')) {
        const pnlMatch = line.match(/P&L:\s*\$(-?\d+\.\d+)\s*\(([+-]?\d+\.\d+)%\)/);
        if (pnlMatch) {
          trade.pnl = parseFloat(pnlMatch[1]);
          trade.pnl_percent = parseFloat(pnlMatch[2]);
        }
      }

      // Highest price
      if (line.includes('Highest price:') || line.includes('highest price achieved:')) {
        const priceMatch = line.match(/\$(\d+\.\d+)/);
        if (priceMatch) {
          trade.highest_price = parseFloat(priceMatch[1]);
        }
      }

      // Max Favorable/Adverse Excursion
      if (line.includes('Max Favorable Excursion:')) {
        const mfeMatch = line.match(/\+\$(\d+\.\d+)/);
        if (mfeMatch) {
          trade.max_gain = parseFloat(mfeMatch[1]);
        }
      }

      if (line.includes('Max Adverse Excursion:')) {
        const maeMatch = line.match(/\$(-?\d+\.\d+)/);
        if (maeMatch) {
          trade.max_loss = parseFloat(maeMatch[1]);
        }
      }
    }

    // Create trade object if we have enough data
    if (trade.entry_price && trade.exit_price) {
      trades.push(trade as ScriptTrade);

      // Update metrics
      metrics.total_trades = 1;
      metrics.winning_trades = (trade.pnl || 0) > 0 ? 1 : 0;
      metrics.losing_trades = (trade.pnl || 0) < 0 ? 1 : 0;
      metrics.win_rate = (trade.pnl || 0) > 0 ? 100 : 0;
      metrics.total_pnl = trade.pnl || 0;
      metrics.total_pnl_percent = trade.pnl_percent || 0;
    }

    // Generate summary
    const summary = this.generateSummary(trades, metrics as ScriptMetrics);

    return {
      backtest: {
        ticker,
        date,
        strategy,
        config: {},
      },
      trades,
      metrics: metrics as ScriptMetrics,
      summary,
    };
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(trades: ScriptTrade[], metrics: ScriptMetrics): string {
    if (trades.length === 0) {
      return 'No trades were executed.';
    }

    const lines: string[] = [];

    lines.push(`Executed ${metrics.total_trades} trade(s)`);
    lines.push(`Win Rate: ${metrics.win_rate.toFixed(1)}%`);
    lines.push(`Total P&L: $${metrics.total_pnl.toFixed(2)} (${metrics.total_pnl_percent > 0 ? '+' : ''}${metrics.total_pnl_percent.toFixed(2)}%)`);

    if (trades[0]) {
      const trade = trades[0];
      lines.push(`Entry: $${trade.entry_price.toFixed(2)} at ${trade.entry_time}`);
      lines.push(`Exit: $${trade.exit_price.toFixed(2)} at ${trade.exit_time} (${trade.exit_reason})`);

      if (trade.highest_price) {
        lines.push(`Highest Price: $${trade.highest_price.toFixed(2)}`);
      }
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export default new ScriptExecutionService();
