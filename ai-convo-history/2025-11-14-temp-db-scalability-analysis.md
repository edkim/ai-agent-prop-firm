# Temp Database Scalability Analysis

**Date:** 2025-11-14
**Question:** How well does the temp db scale for comparing against other tickers (SPY) and using support/resistance levels for real-time paper trading?

---

## Current Architecture Summary

### How Temp DB Works (Phase 3)

**Purpose:** Prevent lookahead bias by creating isolated databases with ONLY historical data available up to the current moment.

**Current Implementation:**
```typescript
// For EACH bar being scanned:
1. Create new SQLite database in /tmp
2. Create schema (table + index)
3. Insert bars[0..currentIndex] for ONE ticker
4. Run scanner against this temp DB
5. Delete temp DB
```

**Location:** `backend/src/backtesting/realtime-backtest.engine.ts:311-358`

**Key Constraint:** Temp DB contains **only ONE ticker** at a time (see line 354-360).

---

## Scalability Assessment

### ❌ **Current Design Does NOT Scale for Your Use Cases**

#### Problem 1: Single-Ticker Limitation

**Your Need:** Compare against SPY for relative strength/weakness

**Current Reality:**
```typescript
// Temp DB creation (line 311-358)
async function createTempDatabase(dbPath: string, ticker: string, availableBars: Bar[]) {
  // Only inserts ONE ticker's bars
  insertStmt.run(ticker, bar.timestamp, ...);  // ← Single ticker only
}
```

**What Happens If Scanner Tries to Query SPY:**
```sql
-- Scanner code:
SELECT * FROM ohlcv_data WHERE ticker = 'SPY'  -- Returns EMPTY!

-- Temp DB only has:
SELECT * FROM ohlcv_data WHERE ticker = 'AAPL'  -- Has data
```

**Result:** Scanner can't compare against SPY because SPY data doesn't exist in temp DB.

---

#### Problem 2: Support/Resistance Levels Need Historical Context

**Your Need:** Calculate S/R levels for real-time paper trading

**Typical S/R Calculation Requirements:**
- Last 20 days of daily highs/lows (swing points)
- Last 50-200 bars of intraday pivots
- Previous session's high/low/close
- Pre-market levels from extended hours

**Current Temp DB Contains:**
- ONLY bars from start of current day up to current bar
- NO previous days' data
- NO multi-day context

**Example Scenario:**
```
Trading day: 2025-11-14 10:30 AM
Temp DB contains:
  ✅ 2025-11-14 09:30:00 (market open)
  ✅ 2025-11-14 09:35:00
  ...
  ✅ 2025-11-14 10:30:00 (current bar)

Temp DB DOES NOT contain:
  ❌ 2025-11-13 (yesterday's high/low for S/R)
  ❌ 2025-11-12 (previous days for swing levels)
  ❌ 2025-11-14 08:00-09:30 (pre-market for gap levels)
```

**Result:** Can't calculate meaningful S/R levels without multi-day context.

---

## Performance Issues at Scale

### Current Performance Characteristics

**With 5 Tickers (Current Testing):**
- Temp DBs created per iteration: **~2,000**
- Process spawns: **~2,000** (one per bar)
- Estimated time: **~14.6 minutes**

**Extrapolated to 65 Tickers (Original Plan):**
- Temp DBs created: **~26,000**
- Process spawns: **~26,000**
- Estimated time: **~3-4 hours** (UNACCEPTABLE!)

**Breakdown per bar (from temp-db-optimization-plan.md:264-272):**
| Operation | Time | Percentage |
|-----------|------|------------|
| Process spawn | 300ms | 68% |
| Scanner logic | 100ms | 23% |
| Temp DB create | 20ms | 5% |
| Temp DB insert | 10ms | 2% |
| Temp DB cleanup | 10ms | 2% |
| **TOTAL** | 440ms | 100% |

**Key Insight:** Process spawning is the biggest bottleneck (68%), not temp DB I/O.

---

## Solutions for Your Use Cases

### Solution 1: Multi-Ticker Temp DB (For SPY Comparison)

**Modification Required:**
```typescript
// Instead of creating temp DB for ONE ticker:
async function createMultiTickerTempDatabase(
  dbPath: string,
  primaryTicker: string,
  referenceTickers: string[],  // ['SPY', 'QQQ']
  currentTimestamp: number
): Promise<void> {
  const allTickers = [primaryTicker, ...referenceTickers];

  for (const ticker of allTickers) {
    // Load bars up to currentTimestamp for ALL tickers
    const bars = db.prepare(`
      SELECT * FROM ohlcv_data
      WHERE ticker = ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(ticker, currentTimestamp);

    // Insert into temp DB
    for (const bar of bars) {
      insertStmt.run(ticker, bar.timestamp, ...);
    }
  }
}
```

**Impact:**
- ✅ Scanner can now query SPY for comparison
- ✅ Can calculate relative strength/weakness
- ⚠️ Temp DB size grows by 3-5x (primary + 2-4 reference tickers)
- ⚠️ Temp DB creation time increases proportionally

**Files to Modify:**
- `backend/src/backtesting/realtime-backtest.engine.ts:311-358`

---

### Solution 2: Extended Historical Context (For S/R Levels)

**Modification Required:**
```typescript
async function createTempDatabaseWithHistory(
  dbPath: string,
  ticker: string,
  currentTimestamp: number,
  lookbackDays: number = 20  // For S/R calculations
): Promise<void> {
  // Calculate date range
  const startDate = new Date(currentTimestamp);
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Load all bars from lookback period up to current moment
  const bars = db.prepare(`
    SELECT * FROM ohlcv_data
    WHERE ticker = ?
      AND timestamp >= ?
      AND timestamp <= ?
    ORDER BY timestamp ASC
  `).all(ticker, startDate.getTime(), currentTimestamp);

  // Insert all historical bars
  insertMany(bars);
}
```

**Impact:**
- ✅ Scanner can calculate multi-day S/R levels
- ✅ Access to previous highs/lows, swing points
- ⚠️ Temp DB size grows significantly (20 days × 78 bars/day = 1,560 bars vs ~40 bars)
- ⚠️ Temp DB creation time increases by ~40x

---

### Solution 3: Pre-Computed S/R Table (Recommended)

**Better Approach:** Instead of recalculating S/R every bar, pre-compute once per day.

**Schema Addition:**
```sql
CREATE TABLE support_resistance_levels (
  ticker TEXT,
  date TEXT,
  timeframe TEXT,
  level_type TEXT,  -- 'support', 'resistance', 'pivot'
  price REAL,
  strength INTEGER,  -- How many touches
  calculated_at INTEGER  -- Timestamp
);
```

**Usage in Temp DB:**
```typescript
async function createTempDbWithPrecomputedLevels(
  dbPath: string,
  ticker: string,
  currentDate: string,
  availableBars: Bar[]
): Promise<void> {
  // Create temp DB with bars
  insertBars(availableBars);

  // Copy S/R levels from main DB
  const levels = mainDb.prepare(`
    SELECT * FROM support_resistance_levels
    WHERE ticker = ?
      AND date = ?
  `).all(ticker, currentDate);

  // Insert S/R levels into temp DB
  for (const level of levels) {
    insertLevel(level);
  }
}
```

**Scanner can now:**
```typescript
// Query pre-computed levels instead of calculating
const resistance = await db.prepare(`
  SELECT price FROM support_resistance_levels
  WHERE ticker = ?
    AND level_type = 'resistance'
    AND price > ?
  ORDER BY price ASC
  LIMIT 1
`).get(ticker, currentPrice);
```

**Impact:**
- ✅ Fast (no recalculation)
- ✅ Temp DB stays small (just copy levels)
- ✅ Consistent S/R across all bars
- ⚠️ Requires one-time batch computation of S/R levels

---

## Recommended Architecture for Real-Time Paper Trading

### Phase 3.5: Optimized Temp DB

**Key Changes:**

#### 1. Incremental Temp DB (Already Planned)
- Create ONE temp DB per ticker per day
- Add bars incrementally instead of recreating
- **Savings:** 20x reduction in DB operations

#### 2. Persistent Scanner Process (Critical)
- Keep scanner process alive, reuse for all bars
- Communicate via stdin/stdout
- **Savings:** 66% reduction in execution time

#### 3. Multi-Ticker Support (For Your Use Case)
- Include reference tickers (SPY, QQQ, etc.) in temp DB
- Load their bars up to current timestamp
- **Cost:** 3-5x larger temp DB, but enables comparison

#### 4. Pre-Computed Indicators (For S/R)
- Calculate S/R levels once at market close
- Store in main DB table
- Copy into temp DB as needed
- **Benefit:** Fast, consistent, no recalculation overhead

---

## Implementation Roadmap

### Phase 1: Fix Current Performance Issues (Priority: HIGH)
**Goal:** Make Phase 3 usable at scale

1. ✅ Batch processing (5 tickers at a time) - DONE
2. ⏳ Persistent scanner process - PLANNED
3. ⏳ Incremental temp DB - PLANNED

**Expected Result:** ~3.5 minutes per iteration (down from 14.6 minutes)

---

### Phase 2: Add Multi-Ticker Support (Priority: HIGH for SPY comparison)
**Goal:** Enable relative strength/weakness strategies

1. Modify `createTempDatabase` to accept ticker list
2. Load all tickers' bars up to current timestamp
3. Update tests to verify multi-ticker queries work

**Files to Modify:**
- `backend/src/backtesting/realtime-backtest.engine.ts:311-358`

**Estimated Work:** 2-3 hours

---

### Phase 3: Add S/R Level Support (Priority: MEDIUM)
**Goal:** Enable support/resistance strategies

**Option A: Pre-Computed Levels (Recommended)**
1. Create `support_resistance_levels` table
2. Build batch job to calculate S/R nightly
3. Copy levels into temp DB during creation

**Option B: Extended Historical Context**
1. Modify temp DB to include 20 days of history
2. Accept 40x slower temp DB creation
3. Let scanners calculate S/R on-the-fly

**Recommendation:** Option A (much faster)

**Estimated Work:**
- Option A: 4-6 hours
- Option B: 2 hours (but slow at runtime)

---

### Phase 4: Paper Trading Integration (Priority: HIGH)
**Goal:** Apply same bias-free approach to live trading

**Key Insight:** Paper trading ALREADY runs bar-by-bar in real-time!
- No temp DB needed (no future data exists)
- Just need multi-ticker support
- Just need S/R level lookup

**Implementation:**
```typescript
async function scanForPaperTrading(
  ticker: string,
  currentTimestamp: number
): Promise<Signal | null> {
  // Query main DB with time constraint (no temp DB needed!)
  const bars = mainDb.prepare(`
    SELECT * FROM ohlcv_data
    WHERE ticker IN (?, 'SPY', 'QQQ')  -- Multi-ticker
      AND timestamp <= ?  -- Only past data
    ORDER BY timestamp ASC
  `).all(ticker, currentTimestamp);

  // Query pre-computed S/R levels
  const srLevels = mainDb.prepare(`
    SELECT * FROM support_resistance_levels
    WHERE ticker = ?
      AND date = ?
  `).all(ticker, currentDate);

  // Run scanner with constrained data
  return await runScanner(bars, srLevels);
}
```

**No temp DB needed for paper trading!** Just time-based filtering.

---

## Performance Projections with Solutions

### Current (5 tickers, no optimizations)
- Time: **14.6 minutes**
- Temp DBs: 2,000
- Single ticker only
- No S/R support

### After Phase 1 (Performance fixes)
- Time: **3.5 minutes**
- Temp DBs: 50 (incremental)
- Single ticker only
- No S/R support

### After Phase 2 (Multi-ticker)
- Time: **5 minutes** (slightly slower due to larger temp DBs)
- Temp DBs: 50 (incremental)
- Multi-ticker: ✅ (SPY, QQQ, etc.)
- No S/R support

### After Phase 3 (S/R levels - Option A)
- Time: **5.5 minutes**
- Temp DBs: 50 (incremental)
- Multi-ticker: ✅
- S/R support: ✅ (pre-computed)

### After Phase 3 (S/R levels - Option B)
- Time: **45+ minutes** (❌ TOO SLOW)
- Temp DBs: 50 (incremental, but HUGE)
- Multi-ticker: ✅
- S/R support: ✅ (on-the-fly calculation)

---

## Answer to Original Question

### Q: How well does temp db scale for comparing against SPY?

**A: Poorly with current design, but fixable.**

**Current State:**
- ❌ Cannot compare against SPY (single ticker temp DB)
- ❌ Would require architecture change

**After Multi-Ticker Support (Phase 2):**
- ✅ Can compare against SPY, QQQ, sector ETFs
- ⚠️ ~40% slower (larger temp DBs)
- ✅ Worth the trade-off for accurate relative strength/weakness

**Estimated Implementation Time:** 2-3 hours

---

### Q: How well does temp db scale for S/R levels in real-time paper trading?

**A: Doesn't scale well with current design, but pre-computation solves it.**

**Current State:**
- ❌ Cannot calculate multi-day S/R (only current day's bars)
- ❌ Extending history would make temp DB 40x slower

**After Pre-Computed S/R (Phase 3 - Option A):**
- ✅ Fast S/R lookups (just copy pre-computed levels)
- ✅ Consistent S/R across all strategies
- ✅ Minimal performance impact (~10% slower)

**For Real-Time Paper Trading:**
- ✅ **No temp DB needed!** (no future data exists in live trading)
- ✅ Just query main DB with timestamp constraint
- ✅ Use pre-computed S/R levels

**Estimated Implementation Time:** 4-6 hours

---

## Critical Insights

### 1. Process Spawning is the Real Bottleneck
- Temp DB I/O: Only 9% of total time
- Process spawning: 68% of total time
- **Fix process spawning first, worry about DB optimization second**

### 2. Paper Trading Doesn't Need Temp DB
- Real-time = no future data exists
- Just use time-based filtering on main DB
- Simpler and faster than backtesting

### 3. Pre-Computation > On-the-Fly Calculation
- S/R levels rarely change intraday
- Calculate once, reuse all day
- 40x faster than recalculating per bar

---

## Next Steps

### Immediate (This Week)
1. ✅ Document scalability concerns (THIS FILE)
2. ⏳ Implement persistent scanner process (biggest win)
3. ⏳ Implement incremental temp DB (easy win)

### Short-Term (Next Week)
4. ⏳ Add multi-ticker support to temp DB
5. ⏳ Test SPY comparison strategies

### Medium-Term (Next 2 Weeks)
6. ⏳ Design S/R pre-computation system
7. ⏳ Build S/R calculation batch job
8. ⏳ Integrate S/R levels into temp DB

### Long-Term (Next Month)
9. ⏳ Apply learnings to paper trading system
10. ⏳ Remove temp DB from paper trading (use time-based filtering)
11. ⏳ Scale to 65+ tickers with full features

---

## Files Referenced

- `backend/src/backtesting/realtime-backtest.engine.ts` - Main temp DB implementation
- `/ai-convo-history/2025-11-14-temp-db-optimization-plan.md` - Optimization roadmap
- `/ai-convo-history/2025-11-14-phase3-performance-optimization.md` - Performance tuning

---

**Last Updated:** 2025-11-14
**Status:** Analysis Complete
**Conclusion:** Current temp DB doesn't scale for your use cases, but solutions are well-defined and achievable.
