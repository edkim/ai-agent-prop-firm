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
            scanTickerRealtime(ticker, startDate, endDate, warmupBars, timeframe, scannerScriptPath, tickers, startDate, endDate)
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
          tickers,
          startDate,
          endDate
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
  allTickers: string[], // Pass full ticker list for scanner env var
  scanStartDate: string,
  scanEndDate: string
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

    // Performance metrics
    const perfMetrics = {
      totalBarsProcessed: 0,
      totalDbCreations: 0,
      totalBarAppends: 0,
      totalDbCreationTime: 0,
      totalBarAppendTime: 0,
      totalScannerTime: 0,
      startTime: Date.now()
    };

    // Process each trading day
    for (const [date, dayBars] of Object.entries(barsByDate)) {
      // Skip if insufficient warmup data
      if (dayBars.length < warmupBars) {
        continue;
      }

      // PERFORMANCE OPTIMIZATION: Create temp DB once per day, reuse with incremental updates
      const tempDbPath = path.join('/tmp', `realtime-db-${ticker}-${date}-${Date.now()}.db`);
      let tempDbInitialized = false;
      const dayStartTime = Date.now();
      // Minimum quality threshold for signals (realistic - you can set a quality bar)
      // In real trading, you'd only take signals above a certain quality threshold
      const MIN_PATTERN_STRENGTH = 0; // Set to 0 to take first signal, or higher (e.g., 70) for quality filter

      try {
        // Simulate real-time bar arrival for this day
        for (let currentBarIndex = warmupBars; currentBarIndex < dayBars.length; currentBarIndex++) {
          const currentBar = dayBars[currentBarIndex];
          const barStartTime = Date.now();

          // Initialize temp DB on first bar (with warmup bars)
          if (!tempDbInitialized) {
            const warmupBarsForDb = dayBars.slice(0, warmupBars);
            const dbCreationStart = Date.now();
            await createTempDatabase(tempDbPath, ticker, warmupBarsForDb, timeframe);
            const dbCreationTime = Date.now() - dbCreationStart;
            perfMetrics.totalDbCreations++;
            perfMetrics.totalDbCreationTime += dbCreationTime;
            tempDbInitialized = true;
          }

          // Append current bar to temp DB (incremental update)
          const appendStart = Date.now();
          await appendBarToTempDatabase(tempDbPath, ticker, currentBar, timeframe);
          const appendTime = Date.now() - appendStart;
          perfMetrics.totalBarAppends++;
          perfMetrics.totalBarAppendTime += appendTime;

          // CRITICAL: Only provide bars UP TO current moment
          const availableBars = dayBars.slice(0, currentBarIndex + 1);

          // Run scanner with limited context (no future bars!)
          const scannerStart = Date.now();
          const signal = await runScannerAtBarPersistentOptimized(
            ticker,
            date,
            tempDbPath,
            availableBars,
            currentBarIndex,
            persistentScanner,
            allTickers,
            startDate,
            endDate
          );
          const scannerTime = Date.now() - scannerStart;
          perfMetrics.totalScannerTime += scannerTime;
          perfMetrics.totalBarsProcessed++;

          // REALISTIC: Take first signal that meets quality threshold, then stop
          // In real trading, you can't wait to see all signals - you act on the first good one
          if (signal) {
            const patternStrength = (signal as any).pattern_strength || 0;
            
            // Only take signal if it meets minimum quality threshold
            if (patternStrength >= MIN_PATTERN_STRENGTH) {
              signals.push({
                ...signal,
                ticker,
                signal_date: date,
                signal_time: currentBar.time_of_day
              });

              // Early termination: One signal per ticker/date
              // (simulates "I took a trade, now I'm done for the day")
              // This is REALISTIC - in real trading, you can't wait for better signals
              break;
            }
          }
        }

        const dayTime = Date.now() - dayStartTime;
        const barsProcessedThisDay = dayBars.length - warmupBars;
        if (barsProcessedThisDay > 0) {
          console.log(`   ⚡ ${ticker}/${date}: ${barsProcessedThisDay} bars processed in ${dayTime}ms`);
        }
      } finally {
        // Clean up temp DB for this day
        if (tempDbInitialized && fs.existsSync(tempDbPath)) {
          fs.unlinkSync(tempDbPath);
        }
      }

      // Early termination: Stop if we found a signal for this ticker
      if (signals.length > 0) {
        break;
      }
    }

    // Log performance summary
    const totalTime = Date.now() - perfMetrics.startTime;
    if (perfMetrics.totalBarsProcessed > 0) {
      const avgDbCreationTime = perfMetrics.totalDbCreations > 0 
        ? (perfMetrics.totalDbCreationTime / perfMetrics.totalDbCreations).toFixed(2)
        : '0';
      const avgAppendTime = perfMetrics.totalBarAppends > 0
        ? (perfMetrics.totalBarAppendTime / perfMetrics.totalBarAppends).toFixed(2)
        : '0';
      const avgScannerTime = (perfMetrics.totalScannerTime / perfMetrics.totalBarsProcessed).toFixed(2);
      
      console.log(`   📊 ${ticker} Performance: ${perfMetrics.totalBarsProcessed} bars in ${totalTime}ms`);
      console.log(`      - DB Creations: ${perfMetrics.totalDbCreations} (avg ${avgDbCreationTime}ms each)`);
      console.log(`      - Bar Appends: ${perfMetrics.totalBarAppends} (avg ${avgAppendTime}ms each)`);
      console.log(`      - Scanner Calls: ${perfMetrics.totalBarsProcessed} (avg ${avgScannerTime}ms each)`);
      console.log(`      - Time Saved: ~${(perfMetrics.totalBarsProcessed * 30 - totalTime).toFixed(0)}ms vs old approach (estimated)`);
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
    await createTempDatabase(tempDbPath, ticker, availableBars, '5min');

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
 * Run scanner at a specific bar index using persistent scanner process (OPTIMIZED)
 *
 * This is the OPTIMIZED version that:
 * 1. Reuses a persistent scanner process (saves ~300ms per bar)
 * 2. Uses pre-existing temp DB (saves ~10-50ms per bar)
 *
 * Performance: Saves ~310-350ms per bar total
 */
async function runScannerAtBarPersistentOptimized(
  ticker: string,
  date: string,
  tempDbPath: string, // Pre-created temp DB path
  availableBars: Bar[],
  currentIndex: number,
  persistentScanner: PersistentScannerProcess,
  allTickers: string[],
  startDate: string,
  endDate: string
): Promise<Signal | null> {
  try {
    // Execute scanner using persistent process with existing temp DB
    // Temp DB already contains all available bars (maintained incrementally)
    const response = await persistentScanner.scan(tempDbPath, allTickers, startDate, endDate);

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
  }
}

/**
 * Run scanner at a specific bar index using persistent scanner process (LEGACY)
 *
 * @deprecated Use runScannerAtBarPersistentOptimized instead
 * This version creates a new temp DB for every bar (slow).
 */
async function runScannerAtBarPersistent(
  ticker: string,
  date: string,
  availableBars: Bar[],
  currentIndex: number,
  persistentScanner: PersistentScannerProcess,
  allTickers: string[],
  startDate: string,
  endDate: string
): Promise<Signal | null> {
  const tempDbPath = path.join('/tmp', `realtime-db-${ticker}-${date}-${Date.now()}.db`);

  try {
    // Create temp database with ONLY available bars
    await createTempDatabase(tempDbPath, ticker, availableBars, '5min');

    // Execute scanner using persistent process (NO process spawn!)
    const response = await persistentScanner.scan(tempDbPath, allTickers, startDate, endDate);

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
 * Create temporary database with initial bars
 *
 * This is the KEY to preventing lookahead bias!
 * Scanner queries this temp DB, which only has bars up to current moment.
 *
 * PERFORMANCE: Create DB once per day, then append bars incrementally.
 */
async function createTempDatabase(
  dbPath: string,
  ticker: string,
  initialBars: Bar[],
  timeframe: string = '5min'
): Promise<void> {
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

    // Insert initial bars (warmup bars)
    if (initialBars.length > 0) {
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
            timeframe
          );
        }
      });

      insertMany(initialBars);
    }

  } finally {
    tempDb.close();
  }
}

/**
 * Append a single bar to existing temp database
 *
 * PERFORMANCE: Incremental update instead of recreating entire DB.
 * This provides 5-10x speedup by avoiding full DB recreation for each bar.
 */
async function appendBarToTempDatabase(
  dbPath: string,
  ticker: string,
  bar: Bar,
  timeframe: string = '5min'
): Promise<void> {
  const Database = require('better-sqlite3');
  const tempDb = new Database(dbPath);

  try {
    // Check if bar already exists (idempotent)
    const existing = tempDb.prepare(`
      SELECT COUNT(*) as count FROM ohlcv_data
      WHERE ticker = ? AND timestamp = ?
    `).get(ticker, bar.timestamp) as { count: number };

    if (existing.count > 0) {
      // Bar already exists, skip (shouldn't happen but safe)
      return;
    }

    // Insert new bar
    const insertStmt = tempDb.prepare(`
      INSERT INTO ohlcv_data (ticker, timestamp, time_of_day, open, high, low, close, volume, timeframe)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      ticker,
      bar.timestamp,
      bar.time_of_day,
      bar.open,
      bar.high,
      bar.low,
      bar.close,
      bar.volume,
      timeframe
    );

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

  // Strip 'export' keywords - they're invalid when code is wrapped in a function
  // This fixes: "error TS1184: Modifiers cannot appear here"
  fixedCode = fixedCode.replace(/^export\s+/gm, '');

  // Extract imports (everything else stays together as executable code)
  const lines = fixedCode.split('\n');
  const imports: string[] = [];
  const nonImportCode: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith('require(')) {
      imports.push(line);
    } else {
      nonImportCode.push(line);
    }
  }

  // Join non-import code back together preserving multi-line structures
  let executableCode = nonImportCode.join('\n');

  // CRITICAL FIX: Convert console.log output pattern to return statement
  // Claude-generated scanners use: runScan().then(results => { console.log(JSON.stringify(...)); })
  // We need: return await runScan().then(results => { return ...; })
  
  // Pattern 1: Detect runScan().then(...).catch(...) pattern with console.log
  // This handles the most common Claude-generated pattern
  const runScanThenCatchPattern = /runScan\(\)\s*\.then\s*\(([\s\S]*?)\)\s*\.catch\s*\(([\s\S]*?)\)/;
  const match = executableCode.match(runScanThenCatchPattern);
  
  if (match) {
    let thenBody = match[1];
    const catchBody = match[2];
    
    // Check if thenBody contains console.log(JSON.stringify(...))
    // Handle both single-line and multi-line patterns
    const consoleLogPattern = /console\.log\s*\(\s*JSON\.stringify\s*\(\s*([^)]+)\s*\)\s*\)/g;
    
    if (consoleLogPattern.test(thenBody)) {
      // Replace console.log(JSON.stringify(x)) with return x
      thenBody = thenBody.replace(
        /console\.log\s*\(\s*JSON\.stringify\s*\(\s*([^)]+)\s*\)\s*\)/g,
        'return $1'
      );
      
      // Reconstruct as return await runScan()...
      executableCode = executableCode.replace(
        runScanThenCatchPattern,
        `return await runScan().then(${thenBody}).catch(${catchBody})`
      );
      
      console.log('   ✅ Converted console.log pattern to return statement');
    }
  }
  
  // Pattern 2: Handle runScan().then(...) without catch
  const runScanThenPattern = /runScan\(\)\s*\.then\s*\(([\s\S]*?)\)\s*;?\s*$/;
  const match2 = executableCode.match(runScanThenPattern);
  
  if (match2 && !executableCode.includes('return await runScan()')) {
    let thenBody = match2[1];
    
    // Check if thenBody contains console.log(JSON.stringify(...))
    if (/console\.log\s*\(\s*JSON\.stringify/.test(thenBody)) {
      // Replace console.log with return
      thenBody = thenBody.replace(
        /console\.log\s*\(\s*JSON\.stringify\s*\(\s*([^)]+)\s*\)\s*\)/g,
        'return $1'
      );
      
      executableCode = executableCode.replace(
        runScanThenPattern,
        `return await runScan().then(${thenBody});`
      );
      
      console.log('   ✅ Converted console.log pattern to return statement (no catch)');
    }
  }
  
  // Pattern 3: If scanner ends with just runScan() without return, add return
  // This handles cases where scanner has: runScan(); at the end
  if (!executableCode.includes('return await runScan()') && 
      !executableCode.includes('return runScan()')) {
    // Check if code ends with runScan() call
    const runScanEndPattern = /(\s*)runScan\(\)\s*;?\s*$/;
    if (runScanEndPattern.test(executableCode)) {
      executableCode = executableCode.replace(
        runScanEndPattern,
        '$1return await runScan();'
      );
      console.log('   ✅ Added return await to runScan() call');
    }
  }

  // Note: Scanner code should end with "return await runScan();" to work with the wrapper
  // The wrapper will capture this return value and send it via stdout in persistent mode

  // Wrap scanner code with persistent mode handler
  const wrappedCode = `
import * as readline from 'readline';
${imports.join('\n')}

// ========== ORIGINAL SCANNER CODE (wrapped as async function) ==========
async function executeScannerLogic(): Promise<any> {
${executableCode.split('\n').map(line => '  ' + line).join('\n')}
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
        const { databasePath, tickers, startDate, endDate, requestId } = request;

        // Set environment variables for scanner
        process.env.DATABASE_PATH = databasePath;
        process.env.SCAN_TICKERS = tickers.join(',');
        process.env.SCAN_START_DATE = startDate;
        process.env.SCAN_END_DATE = endDate;

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
