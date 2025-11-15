/**
 * Real-Time Backtest Engine
 *
 * PHASE 3: Bar-by-bar simulation to eliminate lookahead bias by construction
 *
 * This module implements sequential bar processing where scanners only receive
 * bars available up to the current moment, making lookahead bias architecturally
 * impossible.
 *
 * Key Design Principles:
 * - Scanner sees ONLY bars[0..currentIndex] (no future data)
 * - Process one bar at a time (simulate real-time arrival)
 * - Early termination (stop after first signal per ticker/date)
 * - Parallel processing across tickers for performance
 *
 * @see /ai-convo-history/2025-11-14-phase3-realtime-simulation-plan.md
 */

import { getDatabase } from '../database/db';
import { ScriptExecutionService } from '../services/script-execution.service';
import { PersistentScannerProcess } from './persistent-scanner.process';
import * as fs from 'fs';
import * as path from 'path';

export interface RealtimeBacktestOptions {
  startDate: string;
  endDate: string;
  tickers: string[];
  warmupBars: number; // Minimum bars before scanning (e.g., 30 for SMA calculations)
  timeframe: string;  // '5min', '1min', etc.
  maxSignalsPerIteration?: number; // Cap total signals (default: 200)
  enableParallelProcessing?: boolean; // Process tickers in parallel (default: true)
}

export interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string; // HH:MM:SS when signal detected
  pattern_strength?: number;
  metrics?: Record<string, any>;
  [key: string]: any;
}

interface Bar {
  ticker: string;
  timestamp: number;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Run a backtest in real-time simulation mode
 *
 * This is the core Phase 3 implementation. Instead of giving scanners
 * all bars at once, we feed them sequentially to prevent lookahead bias.
 */
export async function runRealtimeBacktest(
  scannerCode: string,
  options: RealtimeBacktestOptions
): Promise<Signal[]> {
  const {
    startDate,
    endDate,
    tickers,
    warmupBars = 30,
    timeframe = '5min',
    maxSignalsPerIteration = 200,
    enableParallelProcessing = true
  } = options;

  console.log('🚀 Starting Real-Time Backtest (Phase 3)');
  console.log(`   Tickers: ${tickers.length}`);
  console.log(`   Date Range: ${startDate} to ${endDate}`);
  console.log(`   Warmup: ${warmupBars} bars`);
  console.log(`   Max Signals: ${maxSignalsPerIteration}`);

  // Create scanner script file (adapted for real-time execution)
  const scannerScriptPath = await createRealtimeScannerScript(scannerCode);

  try {
    let allSignals: Signal[] = [];

    if (enableParallelProcessing) {
      // Process tickers in BATCHES to avoid overwhelming the CPU
      // Instead of 65 parallel processes, do 5 at a time
      const BATCH_SIZE = 5;
      console.log(`   Processing ${tickers.length} tickers in batches of ${BATCH_SIZE}...`);

      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        console.log(`   📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tickers.length / BATCH_SIZE)}: ${batch.join(', ')}`);

        const signalArrays = await Promise.all(
          batch.map(ticker =>
            scanTickerRealtime(ticker, startDate, endDate, warmupBars, timeframe, scannerScriptPath, tickers)
          )
        );

        allSignals.push(...signalArrays.flat());

        // Early termination if we've hit max signals
        if (allSignals.length >= maxSignalsPerIteration) {
          console.log(`   ⚠️  Reached max signals (${maxSignalsPerIteration}), stopping early`);
          break;
        }
      }
    } else {
      // Process tickers sequentially (for debugging)
      for (const ticker of tickers) {
        const signals = await scanTickerRealtime(
          ticker,
          startDate,
          endDate,
          warmupBars,
          timeframe,
          scannerScriptPath,
          tickers
        );
        allSignals.push(...signals);

        // Early termination if we've hit max signals
        if (allSignals.length >= maxSignalsPerIteration) {
          console.log(`   ⚠️  Reached max signals (${maxSignalsPerIteration}), stopping early`);
          break;
        }
      }
    }

    // Cap at max signals
    if (allSignals.length > maxSignalsPerIteration) {
      console.log(`   ℹ️  Capping signals from ${allSignals.length} to ${maxSignalsPerIteration}`);
      allSignals = allSignals.slice(0, maxSignalsPerIteration);
    }

    console.log(`✅ Real-Time Backtest Complete: ${allSignals.length} signals found`);

    return allSignals;

  } finally {
    // Clean up scanner script
    if (fs.existsSync(scannerScriptPath)) {
      fs.unlinkSync(scannerScriptPath);
    }
  }
}

/**
 * Scan a single ticker in real-time mode with persistent scanner process
 *
 * This simulates bar-by-bar arrival for one ticker across the date range.
 *
 * OPTIMIZATION: Uses persistent scanner process to avoid spawning a new
 * Node.js process for every bar (saves ~300ms per bar).
 */
async function scanTickerRealtime(
  ticker: string,
  startDate: string,
  endDate: string,
  warmupBars: number,
  timeframe: string,
  scannerScriptPath: string,
  allTickers: string[] // Pass full ticker list for scanner env var
): Promise<Signal[]> {
  const db = getDatabase();
  const signals: Signal[] = [];

  // Load all bars for this ticker in the date range
  const allBars = db.prepare(`
    SELECT
      ticker,
      timestamp,
      time_of_day,
      open,
      high,
      low,
      close,
      volume
    FROM ohlcv_data
    WHERE ticker = ?
      AND timeframe = ?
      AND date(timestamp / 1000, 'unixepoch') >= date(?)
      AND date(timestamp / 1000, 'unixepoch') <= date(?)
    ORDER BY timestamp ASC
  `).all(ticker, timeframe, startDate, endDate) as Bar[];

  if (allBars.length === 0) {
    return signals;
  }

  // Initialize persistent scanner process ONCE for this ticker
  const persistentScanner = new PersistentScannerProcess();

  try {
    await persistentScanner.initialize(scannerScriptPath);
    console.log(`   🔄 Persistent scanner initialized for ${ticker}`);

    // Group bars by date for day-by-day processing
    const barsByDate = groupBarsByDate(allBars);

    // Process each trading day
    for (const [date, dayBars] of Object.entries(barsByDate)) {
      // Skip if insufficient warmup data
      if (dayBars.length < warmupBars) {
        continue;
      }

      // Simulate real-time bar arrival for this day
      for (let currentBarIndex = warmupBars; currentBarIndex < dayBars.length; currentBarIndex++) {
        // CRITICAL: Only provide bars UP TO current moment
        const availableBars = dayBars.slice(0, currentBarIndex + 1);
        const currentBar = dayBars[currentBarIndex];

        // Run scanner with limited context (no future bars!)
        const signal = await runScannerAtBarPersistent(
          ticker,
          date,
          availableBars,
          currentBarIndex,
          persistentScanner,
          allTickers
        );

        if (signal) {
          signals.push({
            ...signal,
            ticker,
            signal_date: date,
            signal_time: currentBar.time_of_day
          });

          // Early termination: One signal per ticker/date
          // (simulates "I took a trade, now I'm done for the day")
          break;
        }
      }

      // Early termination: Stop if we found a signal for this ticker
      if (signals.length > 0) {
        break;
      }
    }

    return signals;

  } finally {
    // Clean up persistent scanner process
    persistentScanner.cleanup();
    console.log(`   ✅ Persistent scanner cleaned up for ${ticker}`);
  }
}

/**
 * Run scanner at a specific bar index
 *
 * This is the key function that enforces the real-time constraint.
 * Scanner ONLY receives bars[0..currentIndex], not the entire day.
 *
 * Strategy: Create temp database with ONLY available bars, scanner queries that.
 * This way scanner code doesn't need modification!
 */
async function runScannerAtBar(
  ticker: string,
  date: string,
  availableBars: Bar[],
  currentIndex: number,
  scannerScriptPath: string,
  allTickers: string[]
): Promise<Signal | null> {
  const tempDbPath = path.join('/tmp', `realtime-db-${ticker}-${Date.now()}.db`);
  const scriptExecution = new ScriptExecutionService();

  try {
    // Create temp database with ONLY available bars
    await createTempDatabase(tempDbPath, ticker, availableBars);

    // Execute scanner with temp database and ticker list
    // Scanner will query temp DB instead of main DB
    // Scanner will filter by specific tickers instead of querying all tickers
    // Increased timeout to 120s to handle complex scanners on slow machines
    const result = await scriptExecution.executeScript(
      scannerScriptPath,
      120000,
      undefined,
      {
        DATABASE_PATH: tempDbPath,
        SCAN_TICKERS: allTickers.join(',')  // Pass ticker list for efficient querying
      }
    );

    if (!result.success || !result.data) {
      return null;
    }

    // Parse scanner output
    const scannerOutput = Array.isArray(result.data) ? result.data : [result.data];

    // Filter for signals at current bar time
    const currentBar = availableBars[currentIndex];
    const relevantSignals = scannerOutput.filter((s: any) => {
      // Signal should be for current time or earlier (not future)
      return s.signal_time <= currentBar.time_of_day;
    });

    // Return first relevant signal
    return relevantSignals.length > 0 ? relevantSignals[0] : null;

  } catch (error: any) {
    // Scanner execution errors are expected (no signal, pattern not matched, etc.)
    return null;
  } finally {
    // Clean up temp database
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  }
}

/**
 * Run scanner at a specific bar index using persistent scanner process
 *
 * This is the OPTIMIZED version that reuses a persistent scanner process
 * instead of spawning a new Node.js process for every bar.
 *
 * Performance: Saves ~300ms per bar (process spawn overhead eliminated)
 */
async function runScannerAtBarPersistent(
  ticker: string,
  date: string,
  availableBars: Bar[],
  currentIndex: number,
  persistentScanner: PersistentScannerProcess,
  allTickers: string[]
): Promise<Signal | null> {
  const tempDbPath = path.join('/tmp', `realtime-db-${ticker}-${date}-${Date.now()}.db`);

  try {
    // Create temp database with ONLY available bars
    await createTempDatabase(tempDbPath, ticker, availableBars);

    // Execute scanner using persistent process (NO process spawn!)
    const response = await persistentScanner.scan(tempDbPath, allTickers);

    if (!response.success || !response.data) {
      return null;
    }

    // Parse scanner output
    const scannerOutput = Array.isArray(response.data) ? response.data : [response.data];

    // Filter for signals at current bar time
    const currentBar = availableBars[currentIndex];
    const relevantSignals = scannerOutput.filter((s: any) => {
      // Signal should be for current time or earlier (not future)
      return s.signal_time <= currentBar.time_of_day;
    });

    // Return first relevant signal
    return relevantSignals.length > 0 ? relevantSignals[0] : null;

  } catch (error: any) {
    // Scanner execution errors are expected (no signal, pattern not matched, etc.)
    return null;
  } finally {
    // Clean up temp database
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  }
}

/**
 * Create temporary database with only available bars
 *
 * This is the KEY to preventing lookahead bias!
 * Scanner queries this temp DB, which only has bars[0..currentIndex].
 */
async function createTempDatabase(dbPath: string, ticker: string, availableBars: Bar[]): Promise<void> {
  const Database = require('better-sqlite3');
  const tempDb = new Database(dbPath);

  try {
    // Create minimal schema (just what scanners need)
    tempDb.exec(`
      CREATE TABLE ohlcv_data (
        ticker TEXT,
        timestamp INTEGER,
        time_of_day TEXT,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER,
        timeframe TEXT
      );
      CREATE INDEX idx_ticker_time ON ohlcv_data(ticker, timestamp);
    `);

    // Insert ONLY available bars (no future data!)
    const insertStmt = tempDb.prepare(`
      INSERT INTO ohlcv_data (ticker, timestamp, time_of_day, open, high, low, close, volume, timeframe)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = tempDb.transaction((bars: Bar[]) => {
      for (const bar of bars) {
        insertStmt.run(
          ticker,
          bar.timestamp,
          bar.time_of_day,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          '5min' // Assume 5min for now
        );
      }
    });

    insertMany(availableBars);

  } finally {
    tempDb.close();
  }
}

/**
 * Create scanner script for real-time execution with persistent mode support
 *
 * The scanner can run in two modes:
 * 1. PERSISTENT_MODE=true: Reads scan requests from stdin, executes, writes to stdout (reusable)
 * 2. PERSISTENT_MODE=false: Runs once with env vars and exits (legacy mode)
 */
async function createRealtimeScannerScript(originalScannerCode: string): Promise<string> {
  // Write to backend directory so ts-node can find node_modules
  const backendPath = path.resolve(__dirname, '../..');
  const scriptDir = path.join(backendPath, 'generated-scripts');

  // Create directory if it doesn't exist
  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
  }

  const scriptPath = path.join(scriptDir, `realtime-scanner-${Date.now()}.ts`);

  // Fix relative imports to work from generated-scripts directory
  let fixedCode = originalScannerCode;

  // Replace './src/' with '../src/' since we're in backend/generated-scripts/
  fixedCode = fixedCode.replace(
    /from\s+['"]\.\/src\//g,
    "from '../src/"
  );

  // Fix dotenv config path
  fixedCode = fixedCode.replace(
    /path\.resolve\(__dirname,\s*['"]\.\.\/\.env['"]\)/g,
    `path.resolve(__dirname, '../.env')`
  );

  // Extract imports and separate them from executable code
  const lines = fixedCode.split('\n');
  const imports: string[] = [];
  const executableCode: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith('require(')) {
      imports.push(line);
    } else {
      executableCode.push(line);
    }
  }

  // Wrap scanner code with persistent mode handler
  const wrappedCode = `
import * as readline from 'readline';
${imports.join('\n')}

// ========== ORIGINAL SCANNER CODE (wrapped as async function) ==========
async function executeScannerLogic(): Promise<any> {
${executableCode.map(line => '  ' + line).join('\n')}
}

// ========== PERSISTENT MODE HANDLER ==========
async function main() {
  const isPersistentMode = process.env.PERSISTENT_MODE === 'true';

  if (!isPersistentMode) {
    // Legacy mode: Execute once with environment variables
    try {
      await executeScannerLogic();
      process.exit(0);
    } catch (error: any) {
      console.error('Scanner error:', error.message);
      process.exit(1);
    }
  } else {
    // Persistent mode: Read requests from stdin, execute, write to stdout
    console.log('READY'); // Signal ready for first request

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line: string) => {
      try {
        // Parse scan request
        const request = JSON.parse(line);
        const { databasePath, tickers, requestId } = request;

        // Set environment variables for scanner
        process.env.DATABASE_PATH = databasePath;
        process.env.SCAN_TICKERS = tickers.join(',');

        // Execute scanner logic
        const result = await executeScannerLogic();

        // Write response
        const response = {
          success: true,
          data: result,
          requestId
        };
        console.log(JSON.stringify(response));
        console.log('READY'); // Signal ready for next request

      } catch (error: any) {
        // Write error response
        const response = {
          success: false,
          error: error.message,
          requestId: 'unknown'
        };
        console.log(JSON.stringify(response));
        console.log('READY'); // Signal ready for next request
      }
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      rl.close();
      process.exit(0);
    });
  }
}

// Start the scanner
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
`;

  fs.writeFileSync(scriptPath, wrappedCode);

  return scriptPath;
}

/**
 * Group bars by date for day-by-day processing
 */
function groupBarsByDate(bars: Bar[]): Record<string, Bar[]> {
  const grouped: Record<string, Bar[]> = {};

  for (const bar of bars) {
    const date = new Date(bar.timestamp).toISOString().split('T')[0];
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(bar);
  }

  return grouped;
}
