# Temp Database Optimization Plan - Phase 3

**Date:** 2025-11-14
**Status:** Planned (not yet implemented)

---

## Current Problem

Phase 3 creates a new temp database for **every single bar** processed:
- 5 tickers × 10 days × ~40 bars/day = **~2,000 temp databases** (with 5 tickers)
- Was: 65 tickers × 10 days × ~40 bars/day = **~26,000 temp databases**

Each temp database:
1. Creates SQLite file in /tmp
2. Creates schema (table + index)
3. Inserts bars (1 to ~40 bars)
4. Runs scanner query
5. Deletes database

This is **extremely inefficient** I/O.

---

## Proposed Solution

Create **ONE temp database per ticker per day** and incrementally add bars:

### Current Flow (Inefficient)
```typescript
for each day:
  for each bar (30 to 78):
    create temp DB                    // ← NEW DB EVERY BAR!
    insert bars[0..currentIndex]
    run scanner
    delete temp DB
```

### Optimized Flow
```typescript
for each day:
  create temp DB once                 // ← ONCE PER DAY
  insert bars[0..warmupBars]          // Initial warmup

  for each bar (warmupBars to end):
    insert new bar into temp DB       // ← JUST ADD ONE BAR
    run scanner
    if (signal) break

  delete temp DB                       // ← CLEANUP ONCE
```

---

## Implementation Steps

### 1. Modify `scanTickerRealtime` Function

Current (lines 155-237 of `realtime-backtest.engine.ts`):
```typescript
for (const [date, dayBars] of Object.entries(barsByDate)) {
  for (let currentBarIndex = warmupBars; currentBarIndex < dayBars.length; currentBarIndex++) {
    const availableBars = dayBars.slice(0, currentBarIndex + 1);
    const signal = await runScannerAtBar(ticker, date, availableBars, ...);  // Creates temp DB
  }
}
```

Optimized:
```typescript
for (const [date, dayBars] of Object.entries(barsByDate)) {
  if (dayBars.length < warmupBars) continue;

  // Create temp DB once per day
  const tempDb = await createIncrementalTempDatabase(ticker, date);

  try {
    // Insert warmup bars
    await tempDb.insertBars(dayBars.slice(0, warmupBars));

    // Process bars incrementally
    for (let i = warmupBars; i < dayBars.length; i++) {
      await tempDb.insertBar(dayBars[i]);  // Add one bar

      const signal = await runScannerWithTempDb(tempDb, ...);
      if (signal) {
        signals.push(signal);
        break;
      }
    }
  } finally {
    await tempDb.cleanup();
  }
}
```

### 2. Create `IncrementalTempDatabase` Class

```typescript
class IncrementalTempDatabase {
  private db: any;
  private dbPath: string;
  private insertStmt: any;

  constructor(ticker: string, date: string) {
    this.dbPath = `/tmp/realtime-db-${ticker}-${date}.db`;
    this.db = new Database(this.dbPath);
    this.createSchema();
    this.prepareStatements();
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE ohlcv_data (
        ticker TEXT, timestamp INTEGER, time_of_day TEXT,
        open REAL, high REAL, low REAL, close REAL, volume INTEGER, timeframe TEXT
      );
      CREATE INDEX idx_ticker_time ON ohlcv_data(ticker, timestamp);
    `);
  }

  private prepareStatements() {
    this.insertStmt = this.db.prepare(`
      INSERT INTO ohlcv_data
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  async insertBar(bar: Bar) {
    this.insertStmt.run(
      bar.ticker, bar.timestamp, bar.time_of_day,
      bar.open, bar.high, bar.low, bar.close, bar.volume, '5min'
    );
  }

  async insertBars(bars: Bar[]) {
    const transaction = this.db.transaction((bars: Bar[]) => {
      for (const bar of bars) {
        this.insertBar(bar);
      }
    });
    transaction(bars);
  }

  getPath(): string {
    return this.dbPath;
  }

  cleanup() {
    this.db.close();
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }
  }
}
```

### 3. Update `runScannerAtBar` to Use Existing DB

Instead of creating a new temp DB, pass the existing one:

```typescript
async function runScannerWithTempDb(
  tempDb: IncrementalTempDatabase,
  ticker: string,
  currentBar: Bar,
  scannerScriptPath: string,
  allTickers: string[]
): Promise<Signal | null> {
  const scriptExecution = new ScriptExecutionService();

  try {
    const result = await scriptExecution.executeScript(
      scannerScriptPath,
      120000,
      undefined,
      {
        DATABASE_PATH: tempDb.getPath(),
        SCAN_TICKERS: allTickers.join(',')
      }
    );

    // ... parse and return signal
  } catch (error) {
    return null;
  }
}
```

---

## Performance Impact

### Current (with 5 tickers)
- Temp DBs created: ~2,000
- File I/O operations: ~10,000 (create, write, delete)
- Time per bar: ~100ms for DB operations + scanner time

### After Optimization
- Temp DBs created: **50** (5 tickers × 10 days)
- File I/O operations: ~250 (create once, incremental inserts, delete once)
- Time per bar: ~5ms for DB insert + scanner time

**Expected improvement: 20x faster database operations**

---

## Testing Plan

1. Run iteration with current code (5 tickers) - baseline time
2. Implement incremental DB optimization
3. Run iteration with optimized code - compare time
4. Verify signals match (same scanner logic)
5. Scale back up to 65 tickers if performance is good

---

## Files to Modify

1. `backend/src/backtesting/realtime-backtest.engine.ts`
   - Add `IncrementalTempDatabase` class
   - Refactor `scanTickerRealtime` to use incremental DB
   - Update `runScannerAtBar` to accept existing DB

---

## Risks

1. **Scanner depends on full day's data at once**: If scanner logic assumes all bars for a day are present, this breaks. (Unlikely - scanners filter by time)
2. **Memory usage**: Keeping DB connection open for ~40 bar iterations vs creating fresh each time
3. **Cleanup on error**: Need proper try/finally to ensure DB cleanup

---

## Current Optimizations Already Applied

1. ✅ Fixed environment variable passing to scanners
2. ✅ Scanner queries only 5 tickers (not 2,046)
3. ✅ Reduced ticker count from 65 to 5 for testing

**Next step: Implement incremental temp DB optimization**
