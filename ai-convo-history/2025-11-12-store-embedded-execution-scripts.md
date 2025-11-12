# Store Embedded Execution Scripts in Database

**Date:** 2025-11-12
**Branch:** lookahead-bias-fix
**Status:** ✅ Completed

## Problem

The database was storing the pre-embedding execution script (with `const signals = []`), but the actual script that runs has signals embedded as data. This meant:
- Frontend displayed empty signals array
- Couldn't reproduce what actually executed
- Lost the actual executed artifact

## Solution: Option C - Store Post-Embedding Version Only

We chose to store only the post-embedding version (with signals embedded) because:

### Pros
- Stores the actual code that was executed (most important for reproducibility)
- Simpler implementation - no extra fields or file path dependencies
- Signals are already stored separately in the database
- Pre-embedding version is trivial to infer (only signals array differs)

### Other Options Considered
- **Option A:** Store file path and read from disk - Rejected due to disk dependency
- **Option B:** Store both versions - Rejected as unnecessarily complex

## Implementation

### Changes Made

**File:** `backend/src/services/agent-learning.service.ts`

1. **Track embedded script** (line 613-614):
   - Added `let embeddedExecutionScript: string | null = null;`
   - Captures the script after signal embedding but before path-specific fixes

2. **Capture embedded version** (line 651-652):
   - After embedding signals: `embeddedExecutionScript = scriptWithSignals;`
   - Before directory-specific import path fixes

3. **Return embedded script** (lines 752, 780, 503):
   - Added `embeddedExecutionScript` to all return objects from `runBacktests()`
   - Handles cases: no signals, templates disabled, normal execution

4. **Update strategy before saving** (lines 144-149):
   ```typescript
   if (backtestResults.embeddedExecutionScript) {
     strategy.executionScript = backtestResults.embeddedExecutionScript;
     logger.info('Updated strategy with signal-embedded execution script');
   }
   ```

### Why Capture Before Path Fixes?

The embedded script is captured AFTER signal embedding but BEFORE these directory-specific fixes:
- Import path adjustments (`../../src/` → `../../../src/`)
- Database initialization code injection

These path fixes are only needed for the generated-scripts directory structure. The database version should have:
- ✅ Signals embedded
- ✅ Original import paths Claude generated
- ❌ NOT directory-specific path fixes

## Result

- **Database now stores:** Execution script with actual signals embedded
- **Frontend displays:** Real executed code with data
- **Reproducibility:** Can see exactly what ran
- **File system:** Still saves path-adjusted version to disk

## Testing

To verify this works, run a new learning iteration and check:
```bash
# Start iteration
curl -X POST http://localhost:3000/api/agents/{agent-id}/iterations/start

# Check database
sqlite3 backend/backtesting.db "SELECT execution_script FROM agent_iterations ORDER BY created_at DESC LIMIT 1"
```

Expected: Should see `const signals = [...]` with actual signal data, not empty array.

## Related Work

This completes the trilogy of improvements:
1. ✅ Git commit tracking (stores which commit generated each iteration)
2. ✅ Better file naming (iter{N}-{agent}-{uuid}-custom-execution.ts)
3. ✅ Store embedded scripts (database has actual executed code)
