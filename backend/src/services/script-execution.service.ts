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

interface TokenUsageMetadata {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  max_tokens: number;
  utilization_percent: string;
  stop_reason: string;
  truncated: boolean;
}

interface ScriptMetadata {
  scriptId: string;
  agentId?: string;
  timestamp: string;
  scriptType: 'scanner' | 'execution' | 'unknown';
  status: 'success' | 'failed';
  language: 'typescript' | 'javascript';
  compilationErrors?: string[];
  runtimeErrors?: string;
  executionTime: number;
  trades?: number;
  signals?: number;
  stdout?: string;
  stderr?: string;
  tokenUsage?: TokenUsageMetadata;
}

const execAsync = promisify(exec);

export class ScriptExecutionService {
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly maxBuffer = 100 * 1024 * 1024; // 100MB (increased for large scan results)
  private readonly generatedScriptsDir = path.join(__dirname, '../../generated-scripts');

  /**
   * Save a generated script with metadata for analysis
   */
  private async saveScriptWithMetadata(
    scriptPath: string,
    result: ScriptExecutionResult,
    agentId?: string,
    tokenUsage?: TokenUsageMetadata
  ): Promise<void> {
    try {
      // Read the script content
      const scriptContent = await fs.readFile(scriptPath, 'utf-8');

      // Extract script metadata from path and result
      const fileName = path.basename(scriptPath);
      const scriptId = this.extractScriptId(fileName);
      const scriptType = this.detectScriptType(fileName, scriptContent);
      const language = fileName.endsWith('.ts') ? 'typescript' : 'javascript';
      const status = result.success ? 'success' : 'failed';

      // Parse compilation errors from stderr
      const compilationErrors = this.extractCompilationErrors(result.stderr || '');

      // Parse trade/signal counts from data
      let trades = 0;
      let signals = 0;
      if (result.success && result.data) {
        if (Array.isArray(result.data)) {
          // Scanner result
          signals = result.data.length;
        } else if (result.data.trades) {
          trades = result.data.trades.length;
        }
      }

      // Create metadata object
      const metadata: ScriptMetadata = {
        scriptId,
        agentId,
        timestamp: new Date().toISOString(),
        scriptType,
        status,
        language,
        compilationErrors: compilationErrors.length > 0 ? compilationErrors : undefined,
        runtimeErrors: result.success ? undefined : result.error,
        executionTime: result.executionTime || 0,
        trades: trades > 0 ? trades : undefined,
        signals: signals > 0 ? signals : undefined,
        stdout: result.stdout?.substring(0, 1000), // First 1000 chars
        stderr: result.stderr?.substring(0, 1000),
        tokenUsage: tokenUsage ? {
          ...tokenUsage,
          truncated: tokenUsage.stop_reason === 'max_tokens'
        } : undefined,
      };

      // Create date-based directory structure
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const statusDir = path.join(this.generatedScriptsDir, status, today);
      await fs.mkdir(statusDir, { recursive: true });

      // Save script file
      const scriptFileName = `${scriptId}-${scriptType}.${language === 'typescript' ? 'ts' : 'js'}`;
      const savedScriptPath = path.join(statusDir, scriptFileName);
      await fs.writeFile(savedScriptPath, scriptContent);

      // Save metadata
      const metadataPath = path.join(statusDir, `${scriptId}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Save errors log if failed
      if (!result.success && result.stderr) {
        const errorsPath = path.join(statusDir, `${scriptId}-errors.log`);
        await fs.writeFile(errorsPath, result.stderr);
      }

      await logger.info('Script preserved with metadata', {
        scriptId,
        scriptType,
        status,
        savedPath: savedScriptPath,
      });
    } catch (error: any) {
      // Don't fail execution if preservation fails
      await logger.error('Failed to save script with metadata', {
        error: error.message,
        scriptPath,
      });
    }
  }

  /**
   * Extract script ID from filename (UUID)
   */
  private extractScriptId(fileName: string): string {
    // Extract UUID from patterns like:
    // - agent-backtest-079c39fc-e941-42a0-a665-052c13524373.ts
    // - backtest-5597410e-944b-495f-be50-e8fb7ab68184.ts
    const uuidMatch = fileName.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    return uuidMatch ? uuidMatch[1] : 'unknown';
  }

  /**
   * Detect script type from filename and content
   */
  private detectScriptType(fileName: string, content: string): 'scanner' | 'execution' | 'unknown' {
    // Check filename patterns (but don't trust them completely - verify with content)
    const filenameHint = fileName.includes('scan-') || fileName.includes('scanner') ? 'scanner'
      : fileName.includes('backtest') || fileName.includes('execution') ? 'execution'
      : null;

    // Check content for definitive indicators
    // Scanner scripts OUTPUT ScanMatch results
    const hasScanMatch = content.includes('interface ScanMatch') || content.includes('ScanMatch[]');
    const hasRunScan = content.includes('function runScan(');

    // Execution scripts CONSUME SCANNER_SIGNALS and OUTPUT TradeResult
    const hasScannerSignals = content.includes('SCANNER_SIGNALS');
    const hasTradeResult = content.includes('interface TradeResult') || content.includes('TradeResult[]');
    const hasRunBacktest = content.includes('function runBacktest(');

    // Prioritize content-based detection over filename
    if ((hasScanMatch || hasRunScan) && !hasScannerSignals) {
      return 'scanner';
    }
    if (hasScannerSignals || hasTradeResult || hasRunBacktest) {
      return 'execution';
    }

    // Fall back to filename hint if content is ambiguous
    if (filenameHint) {
      return filenameHint;
    }

    return 'unknown';
  }

  /**
   * Extract TypeScript compilation errors from stderr
   */
  private extractCompilationErrors(stderr: string): string[] {
    if (!stderr) return [];

    const errors: string[] = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      // Match TypeScript error patterns
      if (line.includes('error TS')) {
        errors.push(line.trim());
      }
    }

    return errors;
  }

  /**
   * Execute a TypeScript script and return parsed results
   */
  async executeScript(
    scriptPath: string,
    timeout?: number,
    tokenUsage?: TokenUsageMetadata,
    customEnv?: Record<string, string>
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const absolutePath = path.resolve(scriptPath);
    const command = `npx ts-node "${absolutePath}"`;

    await logger.info('Starting script execution', {
      scriptPath: absolutePath,
      command,
      timeout: timeout || this.defaultTimeout,
      customEnv: customEnv ? Object.keys(customEnv) : undefined,
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
            ...customEnv, // Merge custom environment variables
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

      const successResult = {
        success: true,
        data: result,
        stdout,
        stderr,
        executionTime,
      };

      // Preserve successful script before cleanup
      await this.saveScriptWithMetadata(scriptPath, successResult, undefined, tokenUsage);

      return successResult;

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

      const failedResult = {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        executionTime,
      };

      // Preserve failed script before cleanup
      await this.saveScriptWithMetadata(scriptPath, failedResult, undefined, tokenUsage);

      return failedResult;
    } finally {
      // Clean up temp file (starts with 'backtest-', 'agent-backtest-', or 'agent-scan-' in backend directory)
      if ((scriptPath.includes('backtest-') || scriptPath.includes('agent-backtest-') || scriptPath.includes('agent-scan-')) &&
          (scriptPath.endsWith('.ts') || scriptPath.endsWith('.js'))) {
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
    console.log('[DEBUG] Attempting to parse JSON from stdout (length:', stdout.length, ')');

    // Try to find JSON array first (Claude-generated format)
    const arrayMatch = stdout.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);

        // If it's a scanner result array (has signal_date), return it directly
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].signal_date) {
          console.log('[DEBUG] Found JSON array with', parsed.length, 'scanner signals');
          // Scanner results are returned as-is (not wrapped in BacktestScriptOutput)
          return parsed as any;
        }

        // If it's an array of trades, convert to expected format
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].date) {
          console.log('[DEBUG] Found JSON array with', parsed.length, 'trades');

          // Calculate metrics from trades
          const trades = parsed;
          const winningTrades = trades.filter(t => t.pnl > 0);
          const losingTrades = trades.filter(t => t.pnl < 0);
          const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          const totalPnlPercent = trades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0);

          const result: BacktestScriptOutput = {
            backtest: {
              ticker: trades[0].ticker || '',
              date: trades[0].date || '',
              strategy: 'Custom Strategy',
              config: {},
            },
            trades: trades.map(t => ({
              date: t.date,
              ticker: t.ticker,
              side: t.side,
              entry_time: t.entry_time || t.entryTime,
              entry_price: t.entry_price || t.entryPrice,
              exit_time: t.exit_time || t.exitTime,
              exit_price: t.exit_price || t.exitPrice,
              pnl: t.pnl,
              pnl_percent: t.pnl_percent || t.pnlPercent,
              exit_reason: t.exit_reason || t.exitReason,
              highest_price: t.highest_price || t.highestPrice,
              lowest_price: t.lowest_price || t.lowestPrice,
              noTrade: t.noTrade,
              noTradeReason: t.noTradeReason,
            })),
            metrics: {
              total_trades: trades.length,
              winning_trades: winningTrades.length,
              losing_trades: losingTrades.length,
              win_rate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
              total_pnl: totalPnl,
              total_pnl_percent: totalPnlPercent,
              avg_pnl: trades.length > 0 ? totalPnl / trades.length : 0,
              avg_winner: winningTrades.length > 0
                ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
                : 0,
              avg_loser: losingTrades.length > 0
                ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length
                : 0,
            },
            summary: this.generateSummaryFromTrades(trades),
          };

          console.log('[DEBUG] Converted array to BacktestScriptOutput with', result.trades.length, 'trades');
          return result;
        }
      } catch (error: any) {
        console.error('[DEBUG] Failed to parse JSON array:', error.message);
      }
    }

    // Try to find JSON object (template format)
    const objectMatch = stdout.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);

        // Validate it has the expected structure
        if (parsed.backtest || parsed.trades || parsed.metrics) {
          console.log('[DEBUG] Found JSON object with expected structure');
          return parsed as BacktestScriptOutput;
        }
      } catch (error: any) {
        console.error('[DEBUG] Failed to parse JSON object:', error.message);
      }
    }

    console.log('[DEBUG] No valid JSON found in output');
    return null;
  }

  /**
   * Generate summary from array of trades
   */
  private generateSummaryFromTrades(trades: any[]): string {
    if (trades.length === 0) {
      return 'No trades were executed.';
    }

    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = (winningTrades.length / trades.length) * 100;

    const lines: string[] = [];
    lines.push(`Executed ${trades.length} trade(s)`);
    lines.push(`Winning: ${winningTrades.length} | Losing: ${losingTrades.length}`);
    lines.push(`Win Rate: ${winRate.toFixed(1)}%`);
    lines.push(`Total P&L: $${totalPnl.toFixed(2)}`);

    return lines.join('\n');
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
