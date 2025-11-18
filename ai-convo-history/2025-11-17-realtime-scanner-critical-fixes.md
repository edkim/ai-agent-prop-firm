# Real-Time Scanner: Critical Fixes Applied

**Date:** 2025-11-17
**Status:** ✅ Core issues addressed, remaining tasks pending

## Issues Identified by Code Review

A colleague reviewed the real-time scanner code and identified several critical issues that could lead to incorrect signals and data corruption. This document tracks the fixes applied.

## ✅ FIXED: RTH vs Extended Hours Tagging

### Problem
- No distinction between Regular Trading Hours (09:30-16:00 ET) and extended hours
- Extended hours bars polluted RTH calculations (VWAP, todayOpen, prevDayClose)
- Patterns expecting RTH data would get incorrect values

### Solution
1. **Added `isRTH` boolean to Bar interface**
   ```typescript
   export interface Bar {
     timestamp: number;     // Milliseconds UTC
     time: string;          // HH:MM:SS format (ET)
     date: string;          // YYYY-MM-DD in ET timezone
     open: number;
     high: number;
     low: number;
     close: number;
     volume: number;
     isRTH: boolean;        // true = RTH, false = Extended Hours
   }
   ```

2. **All bars tagged on ingestion**
   - `polygon-stream.ts` uses `isRTH()` utility to tag each bar
   - Extended hours bars logged for debugging

3. **Patterns can filter as needed**
   - Default: Use RTH-only for metadata/VWAP
   - Advanced: Patterns can explicitly include extended hours if desired

**Files Modified:**
- `src/realtime/patterns/types.ts`
- `src/realtime/data/polygon-stream.ts`

---

## ✅ FIXED: Timezone Handling

### Problem
- Used `Date.toDateString()` which uses **local machine timezone**
- On non-ET hosts or across DST transitions, day boundaries would be wrong
- VWAP, prevDayClose, todayOpen would group bars incorrectly

### Solution
1. **Created timezone utilities** (`utils/timezone.ts`)
   ```typescript
   getETDate(timestamp): string      // YYYY-MM-DD in ET
   getETTime(timestamp): string      // HH:MM:SS in ET
   isRTH(timestamp): boolean         // Check if timestamp is RTH
   isWeekday(timestamp): boolean     // Check if trading day
   ```

2. **All date operations use ET timezone**
   - Bar.date field stores YYYY-MM-DD in ET (not local TZ)
   - Bar.time stores HH:MM:SS in ET
   - Day grouping uses Bar.date field instead of Date object

3. **Consistent across all hosts**
   - Works correctly regardless of server location
   - Handles EDT/EST transitions automatically (Intl API)

**Files Created:**
- `src/realtime/utils/timezone.ts`

**Files Modified:**
- `src/realtime/data/polygon-stream.ts` (uses ET utilities)
- `src/realtime/data/market-state.ts` (groups by Bar.date, not local TZ)

---

## ✅ FIXED: Metadata Pollution from Extended Hours

### Problem
- `prevDayClose` could be from post-market (20:00 ET)
- `todayOpen` could be from pre-market (04:00 ET)
- `todayHigh/Low` included extended hours extremes
- Patterns expecting RTH values would get incorrect data

### Solution
1. **Filter for RTH-only bars in metadata calculation**
   ```typescript
   // Previous day close: Last RTH bar (16:00 ET)
   const yesterdayRTHBars = getYesterdayBars(bars).filter(b => b.isRTH);
   prevDayClose = yesterdayRTHBars[yesterdayRTHBars.length - 1].close;

   // Today's open: First RTH bar (09:30 ET)
   const todayRTHBars = getTodayBars(bars).filter(b => b.isRTH);
   todayOpen = todayRTHBars[0].open;
   ```

2. **VWAP calculated from RTH bars only**
   - Session VWAP: 09:30-16:00 ET
   - Ignores pre-market and post-market volume

3. **Patterns can trust metadata values**
   - `prevDayClose` = previous RTH close
   - `todayOpen` = today's RTH open (09:30 ET)
   - `todayHigh/Low` = RTH extremes only

**Files Modified:**
- `src/realtime/data/market-state.ts`

---

## ✅ FIXED: Pattern Threshold Misalignment

### Problem
- Gap and Hold pattern had misaligned thresholds:
  - `shouldScan()`: gap >= 1.5%
  - `scan()`: gap >= 2.0%
- Would pre-filter stocks that would never generate signals

### Solution
- Aligned both to 2.0%
- Added comment explaining RTH requirement

**Files Modified:**
- `src/realtime/patterns/gap-and-hold.ts`

---

## ⏭️ TODO: Startup Backfill

### Problem
- No intraday backfill on startup
- Starting mid-session = almost no bars
- Patterns need ~20-50 bars to function
- Metadata (prevDayClose) unavailable until next bar arrives

### Proposed Solution
1. On startup, backfill current session via Polygon REST API
2. Fetch today's 5-min bars (09:30 to current time)
3. Populate market state before starting websocket
4. Document: "Start before market open for full data" if backfill unavailable

**Status:** Not yet implemented (market closed, can't test)

---

## ⏭️ TODO: Scan on Bar Updates

### Problem
- Scanner runs on 5-minute timer
- Can miss intra-bar pattern formations
- Alert latency: up to 5 minutes

### Proposed Solution
1. Trigger scan when new bar arrives (event-driven)
2. Keep timer as fallback (in case websocket pauses)
3. Add guard to prevent concurrent scans

**Status:** Not yet implemented

---

## ⏭️ TODO: Rate Limiting & Backoff

### Problem
- No retry logic for Polygon API failures
- No backoff on rate limit errors
- No logging of throttling

### Proposed Solution
1. Add exponential backoff on connection failures
2. Handle 429 (rate limit) responses
3. Log all rate limit events

**Status:** Not yet implemented

---

## ⏭️ TODO: Persistence

### Problem
- All state is in-memory
- Crash = lose all bars, signals, metadata
- No recovery mechanism

### Options
1. **Accept in-memory**: Document clearly, restart after crash
2. **Optional persistence**: Save sliding window to SQLite periodically
3. **Hybrid**: Persist only critical data (prev day close, etc.)

**Status:** Not yet implemented (documenting in-memory nature for now)

---

## Summary of Changes

### Critical Fixes Applied ✅
1. **RTH tagging** - All bars tagged with `isRTH` boolean
2. **Timezone normalization** - All dates/times in ET, works on any host
3. **Metadata filtering** - RTH-only bars for prevDayClose, todayOpen, VWAP
4. **Pattern threshold alignment** - Gap and Hold thresholds aligned

### Remaining Tasks ⏭️
1. Startup backfill (current session)
2. Bar-triggered scanning (reduce latency)
3. Rate limiting & backoff
4. Persistence (or documentation of in-memory limitations)

## Testing Required

Once market opens:
1. Verify RTH bars tagged correctly
2. Verify extended hours bars filtered from metadata
3. Verify prevDayClose matches previous 16:00 ET close
4. Verify todayOpen matches today's 09:30 ET open
5. Verify VWAP calculation is RTH-only

## Files Modified

```
src/realtime/
├── patterns/
│   ├── types.ts              # Added isRTH, date fields
│   └── gap-and-hold.ts       # Aligned thresholds
├── data/
│   ├── polygon-stream.ts     # Tag bars with isRTH
│   └── market-state.ts       # Filter RTH for metadata/VWAP
└── utils/
    └── timezone.ts           # NEW: ET timezone utilities
```

## Documentation Updates Needed

**README.md additions:**
- State clearly: RTH-only by default
- Warn about mid-session startup (no backfill yet)
- Explain timezone handling (always ET)
- Note in-memory state (no persistence)

---

**Next Steps:**
1. Test fixes when market opens
2. Implement startup backfill
3. Add bar-triggered scanning
4. Update README with warnings/requirements
