import { ExecutionTemplate, ScannerSignal } from '../templates/execution/template.interface';

/**
 * Template Renderer Service
 *
 * Renders execution templates into complete, executable backtest scripts.
 * Handles signal injection and parameter customization.
 */
export class TemplateRendererService {
  /**
   * Render a complete backtest script from a template
   *
   * @param template - The execution template to render
   * @param signals - Scanner signals to inject
   * @param ticker - Ticker symbol for this execution
   * @param paramOverrides - Optional parameter overrides
   */
  renderScript(
    template: ExecutionTemplate,
    signals: ScannerSignal[],
    ticker: string,
    paramOverrides?: Record<string, any>
  ): string {
    // Apply parameter overrides
    const effectiveParams = { ...template.parameters, ...paramOverrides };

    // Create a temporary template with overridden parameters
    const templateWithOverrides = {
      ...template,
      parameters: effectiveParams
    };

    // Generate the execution code
    const executionCode = templateWithOverrides.generateExecutionCode();

    // Build complete script with imports, interfaces, and execution logic
    // Note: Scripts are saved in backend/generated-scripts/success/YYYY-MM-DD/
    // So imports need to go up 3 levels to reach backend/, then into src/
    const fullScript = `
import { initializeDatabase, getDatabase } from '../../../src/database/db';
import * as helpers from '../../../src/utils/backtest-helpers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay: string;
}

interface TradeResult {
  date: string;
  ticker: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  quantity?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}

interface ScannerSignal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength?: number;
  direction?: 'LONG' | 'SHORT';
  metrics?: { [key: string]: any };
}

// SCANNER_SIGNALS: Injected from scan results
const SCANNER_SIGNALS: ScannerSignal[] = ${JSON.stringify(signals, null, 2)};

async function runBacktest() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  const ticker = '${ticker}';
  const timeframe = '5min';

  const results: TradeResult[] = [];

  ${executionCode}

  console.log(JSON.stringify(results, null, 2));
}

runBacktest().catch(console.error);
`;

    return fullScript;
  }

  /**
   * Render multiple scripts for different tickers
   *
   * Groups signals by ticker and generates one script per ticker
   */
  renderScriptsForSignals(
    template: ExecutionTemplate,
    signals: ScannerSignal[],
    paramOverrides?: Record<string, any>
  ): Map<string, string> {
    const scripts = new Map<string, string>();

    // Group signals by ticker
    const signalsByTicker = this.groupSignalsByTicker(signals);

    // Generate one script per ticker
    for (const [ticker, tickerSignals] of signalsByTicker) {
      const script = this.renderScript(template, tickerSignals, ticker, paramOverrides);
      scripts.set(ticker, script);
    }

    return scripts;
  }

  /**
   * Group scanner signals by ticker
   */
  private groupSignalsByTicker(signals: ScannerSignal[]): Map<string, ScannerSignal[]> {
    const grouped = new Map<string, ScannerSignal[]>();

    for (const signal of signals) {
      const ticker = signal.ticker;
      if (!grouped.has(ticker)) {
        grouped.set(ticker, []);
      }
      grouped.get(ticker)!.push(signal);
    }

    return grouped;
  }

  /**
   * Validate that a script can be safely executed
   */
  validateScript(script: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required imports
    if (!script.includes('initializeDatabase')) {
      errors.push('Missing database initialization');
    }

    // Check for SCANNER_SIGNALS
    if (!script.includes('SCANNER_SIGNALS')) {
      errors.push('Missing SCANNER_SIGNALS constant');
    }

    // Check for results output
    if (!script.includes('console.log(JSON.stringify(results')) {
      errors.push('Missing results output');
    }

    // Check for dangerous patterns
    if (script.includes('process.exit') && !script.includes('catch')) {
      errors.push('Unsafe process.exit usage');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
