# Lookahead Bias Prevention Analysis & Improvement Plan
**Date:** 2025-11-15
**Status:** Analysis Complete

## Executive Summary

✅ **The system DOES prevent lookahead bias architecturally** through:
1. **Temp Database Isolation** - Scanner only sees bars[0..currentIndex]
2. **Sequential Bar Processing** - One bar at a time, no batch processing
3. **Static Code Validation** - Detects common lookahead patterns

⚠️ **However, there are areas for improvement** in performance, signal quality, and validation.

---

## Current Lookahead Bias Prevention Mechanisms

### 1. **Architectural Prevention (Primary Defense)** ✅

**Location:** `realtime-backtest.engine.ts`

**Mechanism:**
```typescript
// Line 214: Only provide bars up to current moment
const availableBars = dayBars.slice(0, currentBarIndex + 1);

// Line 381-424: Create temp DB with ONLY available bars
async function createTempDatabase(dbPath: string, ticker: string, availableBars: Bar[])
```

**How It Works:**
- For each bar at index `i`, scanner receives `dayBars.slice(0, i + 1)`
- Temp database is created with ONLY these bars
- Scanner queries temp DB - physically cannot access future bars
- **This is architecturally sound** - lookahead bias is impossible

**Strengths:**
- ✅ Physically prevents access to future data
- ✅ Works regardless of scanner code quality
- ✅ No way for scanner to "cheat"

**Weaknesses:**
- ⚠️ Performance: Creates new temp DB for every bar (expensive)
- ⚠️ No runtime validation that scanner respects the constraint
- ⚠️ No logging of which bars scanner actually accessed

### 2. **Static Code Validation** ⚠️

**Location:** `utils/validate-scanner.ts`

**Mechanism:**
- Detects 8 common lookahead bias patterns in scanner code
- Runs before scanner execution
- Warns but doesn't prevent execution

**Patterns Detected:**
1. Finding peak/trough before processing
2. Math.max/min on entire arrays
3. Slicing entire arrays (0 to length)
4. Processing bars after finding signal
5. Filtering time windows all at once
6. Two-pass algorithms
7. Missing sequential processing
8. Missing lookback windows

**Strengths:**
- ✅ Catches common mistakes early
- ✅ Provides helpful warnings
- ✅ Educational for developers

**Weaknesses:**
- ⚠️ Only static analysis - can't catch all patterns
- ⚠️ Doesn't prevent execution (just warns)
- ⚠️ False positives/negatives possible

### 3. **Prompt Engineering** ✅

**Location:** `claude.service.ts` - `buildScannerSystemPrompt()`

**Mechanism:**
- Extensive instructions on preventing lookahead bias
- Examples of correct vs incorrect patterns
- Emphasized in scanner generation prompt

**Strengths:**
- ✅ Prevents bias at generation time
- ✅ Teaches Claude correct patterns
- ✅ Reduces need for validation

**Weaknesses:**
- ⚠️ Claude might still generate incorrect code
- ⚠️ No enforcement - just guidance

---

## Potential Issues & Edge Cases

### 1. **Cross-Day Lookahead** ⚠️

**Issue:** Does the system prevent scanners from accessing next day's data?

**Current Behavior:**
- Bars are grouped by date: `barsByDate = groupBarsByDate(allBars)`
- Each day is processed separately
- Temp DB only contains current day's bars up to current index

**Verdict:** ✅ **Protected** - Each day is isolated, scanner can't access next day

**However:**
- Scanner could theoretically query main DB if it had access
- Temp DB isolation prevents this, but worth explicit validation

### 2. **Early Termination** ⚠️

**Issue:** System stops after first signal per ticker/date

**Current Behavior:**
```typescript
// Line 235-237: Early termination after first signal
if (signal) {
  signals.push(...);
  break; // Stops processing remaining bars
}
```

**Impact:**
- ✅ Simulates "I took a trade, now I'm done" (realistic)
- ⚠️ Might miss better signals later in the day
- ⚠️ Could bias results toward early-day signals

**Verdict:** **Design choice** - Realistic but potentially suboptimal

### 3. **Performance Overhead** ⚠️

**Issue:** Creating temp DB for every bar is expensive

**Current Behavior:**
- For 20 tickers × 10 days × 78 bars/day = 15,600 temp DB creations
- Each creation: ~10-50ms (file I/O, SQL setup)
- Total overhead: ~2-13 minutes just for DB creation

**Impact:**
- ⚠️ Slows down iterations significantly
- ⚠️ Disk I/O bottleneck
- ⚠️ Could be optimized

### 4. **No Runtime Validation** ⚠️

**Issue:** System doesn't verify scanner actually respects constraints

**Current Behavior:**
- Temp DB prevents access, but no logging/validation
- Can't detect if scanner tries to access future data
- No metrics on scanner behavior

**Impact:**
- ⚠️ Can't verify scanner is working correctly
- ⚠️ Hard to debug scanner issues
- ⚠️ No confidence metrics

### 5. **Scanner Code Quality** ⚠️

**Issue:** Even with temp DB, bad scanner code might not work correctly

**Current Behavior:**
- Scanner could use incorrect logic (e.g., wrong VWAP calculation)
- Temp DB prevents lookahead but doesn't ensure correctness
- Static validation helps but isn't perfect

**Impact:**
- ⚠️ Scanners might generate wrong signals
- ⚠️ Need better testing/validation

---

## Improvement Recommendations

### Priority 1: Performance Optimization (High Impact, Medium Effort)

**Problem:** Temp DB creation is the bottleneck

**Solutions:**

1. **Reuse Temp DB with Updates** (Recommended)
   ```typescript
   // Instead of creating new DB each time:
   // 1. Create temp DB once per ticker/day
   // 2. Append new bar on each iteration
   // 3. Much faster than full recreation
   ```

2. **In-Memory Filtering** (Alternative)
   ```typescript
   // Use SQLite in-memory database
   // Or filter results in application layer
   // Faster but less isolated
   ```

3. **Batch Processing** (Partial)
   ```typescript
   // Process multiple bars before checking for signals
   // Reduces DB creation overhead
   // Still maintains lookahead prevention
   ```

**Expected Impact:**
- 5-10x speedup in real-time backtest
- Reduces iteration time from minutes to seconds

### Priority 2: Signal Quality Improvements (Medium Impact, Low Effort)

**Problem:** Early termination might miss better signals

**Solutions:**

1. **Collect All Signals, Rank Later**
   ```typescript
   // Don't break after first signal
   // Collect all signals for the day
   // Rank by pattern_strength
   // Take top N or best one
   ```

2. **Multiple Signals Per Day** (Optional)
   ```typescript
   // Allow configurable max signals per day
   // Better for strategies that trade multiple times
   ```

**Expected Impact:**
- Better signal quality
- More realistic backtesting
- Slightly slower (but worth it)

### Priority 3: Runtime Validation (Medium Impact, Medium Effort)

**Problem:** No way to verify scanner respects constraints

**Solutions:**

1. **Query Logging**
   ```typescript
   // Log all SQL queries scanner makes
   // Verify they don't exceed available bars
   // Track max timestamp accessed
   ```

2. **Bar Access Tracking**
   ```typescript
   // Track which bars scanner actually reads
   // Verify no future bars accessed
   // Generate validation report
   ```

3. **Assertion Checks**
   ```typescript
   // Add runtime checks in temp DB wrapper
   // Reject queries that access future data
   // Fail fast with clear error messages
   ```

**Expected Impact:**
- Confidence that system works correctly
- Better debugging
- Catches edge cases

### Priority 4: Enhanced Static Validation (Low Impact, Low Effort)

**Problem:** Static validation could be more comprehensive

**Solutions:**

1. **Add More Patterns**
   - Detect date comparisons that might access future
   - Check for timestamp-based queries
   - Validate time_of_day usage

2. **Better False Positive Handling**
   - Reduce false positives
   - More context-aware detection
   - Whitelist known-good patterns

**Expected Impact:**
- Better code quality
- Fewer false warnings
- More accurate validation

### Priority 5: Cross-Day Protection (Low Impact, Low Effort)

**Problem:** Should explicitly prevent next-day access

**Solutions:**

1. **Explicit Date Filtering**
   ```typescript
   // Add WHERE date = ? clause to temp DB
   // Prevent any cross-day queries
   // Fail queries that try to access other dates
   ```

2. **Date Validation in Queries**
   ```typescript
   // Validate all queries only access current date
   // Log violations
   // Reject cross-day queries
   ```

**Expected Impact:**
- Extra safety layer
- Clearer error messages
- Better debugging

---

## Recommended Priority Order

### Phase 1: Quick Wins (1-2 days)
1. ✅ **Signal Quality** - Collect all signals, rank later
2. ✅ **Cross-Day Protection** - Explicit date filtering
3. ✅ **Better Logging** - Track which bars accessed

### Phase 2: Performance (3-5 days)
1. ✅ **Temp DB Reuse** - Append bars instead of recreating
2. ✅ **Batch Processing** - Process multiple bars efficiently
3. ✅ **In-Memory Option** - Fast path for simple scanners

### Phase 3: Validation (5-7 days)
1. ✅ **Runtime Validation** - Query logging and verification
2. ✅ **Bar Access Tracking** - Detailed metrics
3. ✅ **Enhanced Static Validation** - More patterns, better accuracy

---

## Verification Checklist

To confirm lookahead bias prevention:

- [x] Temp DB only contains bars[0..currentIndex]
- [x] Scanner queries temp DB, not main DB
- [x] Each day processed separately
- [x] No access to next day's data
- [x] Sequential bar-by-bar processing
- [ ] Runtime validation confirms no future access
- [ ] Performance is acceptable
- [ ] Signal quality is optimal

---

## Conclusion

**Current Status:** ✅ **Lookahead bias is architecturally prevented**

The temp database isolation mechanism is sound and prevents lookahead bias by construction. However, there are opportunities to improve:

1. **Performance** - Temp DB creation is the bottleneck
2. **Signal Quality** - Early termination might miss better signals
3. **Validation** - Need runtime checks for confidence
4. **Monitoring** - Better logging and metrics

**Recommendation:** Start with Priority 1 (Performance) and Priority 2 (Signal Quality) for immediate impact, then add validation in Phase 3.

