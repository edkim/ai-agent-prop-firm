/**
 * Scanner Debug Service
 *
 * Fast debugging tools to understand why scanners find zero signals.
 * Provides dry-run mode with detailed visibility into scanner execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../database/db';
import { runRealtimeBacktest } from '../backtesting/realtime-backtest.engine';

export interface DebugRequest {
  scannerCode: string;
  ticker: string;
  date: string; // YYYY-MM-DD
  explain?: boolean; // If true, adds detailed condition logging
}

export interface ConditionCheck {
  condition: string;
  passed: boolean;
  value?: any;
  expected?: any;
  details?: string;
}

export interface DebugResponse {
  ticker: string;
  date: string;
  barsScanned: number;
  signalsFound: number;

  // Sample of data the scanner saw
  sampleBars: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;

  // Detailed explanation (if explain=true)
  conditions?: ConditionCheck[];

  // Debug logs from scanner execution
  debugLogs: string[];

  // Signals found (if any)
  signals?: any[];

  // Error information (if any)
  error?: string;
}

export class ScannerDebugService {
  /**
   * Run scanner in debug mode on a specific ticker/date
   */
  async debugScanner(request: DebugRequest): Promise<DebugResponse> {
    const { scannerCode, ticker, date, explain } = request;

    console.log(`🔍 Debug mode: Running scanner on ${ticker} for ${date}`);

    try {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }

      // Get sample bars for this ticker/date
      const sampleBars = await this.getSampleBars(ticker, date);

      if (sampleBars.length === 0) {
        return {
          ticker,
          date,
          barsScanned: 0,
          signalsFound: 0,
          sampleBars: [],
          debugLogs: [`No bars found for ${ticker} on ${date}. Check if data exists.`],
          error: `No OHLCV data found for ${ticker} on ${date}`
        };
      }

      // Run scanner directly using ScriptExecutionService
      // Use backend directory so ts-node can find node_modules
      const scriptId = `debug-${ticker}-${date}-${Date.now()}`;
      const scannerScriptPath = path.join(__dirname, '../../', `scanner-${scriptId}.ts`);

      try {
        // Write scanner to temp file
        fs.writeFileSync(scannerScriptPath, scannerCode);

        const debugLogs: string[] = [];

        // Execute scanner directly with environment variables
        const { ScriptExecutionService } = await import('./script-execution.service');
        const scriptExecution = new ScriptExecutionService();

        const result = await scriptExecution.executeScript(
          scannerScriptPath,
          30000, // 30 second timeout
          undefined,
          {
            SCAN_TICKERS: ticker,
            SCAN_START_DATE: date,
            SCAN_END_DATE: date
          }
        );

        // Parse results
        let signals: any[] = [];
        if (result.success && result.data) {
          if (Array.isArray(result.data)) {
            signals = result.data;
          } else if (typeof result.data === 'object') {
            signals = (result.data as any).signals || (result.data as any).matches || [];
          }
        }

        // Extract conditions from debug logs if explain mode
        const conditions = explain ? this.extractConditions(debugLogs) : undefined;

        return {
          ticker,
          date,
          barsScanned: sampleBars.length,
          signalsFound: signals.length,
          sampleBars: sampleBars.slice(0, 10), // First 10 bars
          conditions,
          debugLogs: result.error ? [result.error] : ['Scanner executed successfully'],
          signals: signals.length > 0 ? signals : undefined,
          error: result.error
        };

      } finally {
        // Clean up temp file
        if (fs.existsSync(scannerScriptPath)) {
          fs.unlinkSync(scannerScriptPath);
        }
      }

    } catch (error: any) {
      return {
        ticker,
        date,
        barsScanned: 0,
        signalsFound: 0,
        sampleBars: [],
        debugLogs: [error.message],
        error: error.message
      };
    }
  }

  /**
   * Get sample bars for a ticker on a specific date
   */
  private async getSampleBars(ticker: string, date: string): Promise<any[]> {
    const db = getDatabase();

    // Get bars for this date (market hours: 9:30 AM - 4:00 PM ET)
    const startOfDay = new Date(date + 'T09:30:00-05:00').getTime();
    const endOfDay = new Date(date + 'T16:00:00-05:00').getTime();

    const bars = db.prepare(`
      SELECT
        ticker,
        timestamp,
        strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time_of_day,
        open,
        high,
        low,
        close,
        volume
      FROM ohlcv_data
      WHERE ticker = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(ticker, startOfDay, endOfDay);

    return bars;
  }

  /**
   * Create a debug version of the scanner with enhanced logging
   */
  private async createDebugScanner(scannerCode: string, explain?: boolean): Promise<string> {
    // Add debug logging wrapper if explain mode is enabled
    let enhancedCode = scannerCode;

    if (explain) {
      // This would add logging statements to track condition checks
      // For now, just use the original code
      // TODO: Add instrumentation to track condition checks
    }

    const tempPath = path.join('/tmp', `debug-scanner-${Date.now()}.ts`);
    fs.writeFileSync(tempPath, enhancedCode);

    return tempPath;
  }

  /**
   * Extract condition checks from debug logs
   */
  private extractConditions(logs: string[]): ConditionCheck[] {
    const conditions: ConditionCheck[] = [];

    // Parse logs for condition patterns
    // TODO: Implement parsing logic based on scanner log format
    // For now, return empty array

    return conditions;
  }

  /**
   * Quick validation: Check if scanner finds ANY signals on sample days
   */
  async validateScanner(
    scannerCode: string,
    options: {
      tickers: string[];
      dates: string[];
      minSignals?: number;
    }
  ): Promise<{
    valid: boolean;
    signalsFound: number;
    message: string;
    details: Array<{ ticker: string; date: string; signals: number }>;
  }> {
    const { tickers, dates, minSignals = 1 } = options;

    console.log(`⚡ Quick validation: Testing scanner on ${tickers.length} tickers × ${dates.length} dates`);

    const details: Array<{ ticker: string; date: string; signals: number }> = [];
    let totalSignals = 0;

    // Test each ticker/date combination
    for (const ticker of tickers) {
      for (const date of dates) {
        try {
          const result = await this.debugScanner({
            scannerCode,
            ticker,
            date,
            explain: false
          });

          details.push({
            ticker,
            date,
            signals: result.signalsFound
          });

          totalSignals += result.signalsFound;

        } catch (error: any) {
          console.error(`Error testing ${ticker} on ${date}:`, error.message);
        }
      }
    }

    const valid = totalSignals >= minSignals;

    return {
      valid,
      signalsFound: totalSignals,
      message: valid
        ? `✅ Found ${totalSignals} signals in quick check`
        : `⚠️ Found only ${totalSignals} signals (expected at least ${minSignals}). Scanner may need adjustment.`,
      details
    };
  }
}
