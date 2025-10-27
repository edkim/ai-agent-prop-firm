# Batch Backtesting Implementation

**Date:** 2025-10-27
**Feature:** Batch Backtesting (Phase 6 completion)
**Branch:** `feature/batch-backtesting`

## Overview

Implemented end-to-end batch backtesting functionality that allows users to test multiple Claude-generated strategies across multiple samples with one click.

## User Workflow

1. **Scan & Curate**: User runs scanner, saves matches to backtest set
2. **Visual Analysis**: User selects 1-3 samples, analyzes with Claude AI
3. **Batch Backtest**: User clicks "Backtest All Strategies" button
4. **View Results**: System tests all strategies × all samples, displays results sorted by win rate

## Implementation Details

### Backend

#### Database Schema (`schema.sql`)

Added 4 new tables:

1. **`batch_backtest_runs`** - Top-level batch execution tracking
   - Tracks total strategies, samples, and tests
   - Status: PENDING, RUNNING, COMPLETED, FAILED
   - Execution time tracking

2. **`strategy_backtest_scripts`** - Generated scripts for each strategy
   - Maps strategy recommendations to TypeScript files
   - Tracks generation status and script hash
   - One script per strategy (reusable across samples)

3. **`batch_backtest_results`** - Individual test results
   - One record per strategy × sample combination
   - Stores trades, P&L, metrics as JSON
   - Execution time and error tracking

4. **`batch_strategy_performance`** - Aggregated strategy metrics
   - Win rate, P&L statistics
   - Best/worst sample tracking
   - Sorted ranking for comparison

#### Services

**`batch-backtest.service.ts`** - Main orchestrator service

Key methods:
- `startBatchBacktest()` - Initiates batch run, returns batchRunId
- `executeBatchBacktest()` - Runs asynchronously in background
- `generateStrategyScripts()` - Converts Claude insights → TypeScript
- `generateStrategyScript()` - Calls Claude to generate executable code
- `calculateStrategyPerformance()` - Aggregates results per strategy
- `getBatchBacktestStatus()` - Returns progress and results
- `getStrategyResults()` - Returns detailed per-sample results

**Strategy Script Generation:**
- Uses Claude Sonnet 4.5 with temperature=0 for deterministic output
- Converts visual conditions (e.g., "large green candle") into code checks
- Implements entry/exit logic, stop loss, take profit
- Returns trades and metrics in standard format

#### API Routes

**`batch-backtest.ts`** - RESTful endpoints

- `POST /api/batch-backtest` - Start new batch run
- `GET /api/batch-backtest/:id` - Get status and results
- `GET /api/batch-backtest/:id/strategy/:strategyId` - Detailed strategy results

### Frontend

#### API Client

**`batchBacktestApi.ts`** - TypeScript client for batch backtest endpoints

Interfaces:
- `StartBatchBacktestRequest` - analysisId + backtestSetId
- `BatchBacktestStatus` - progress tracking
- `StrategyPerformance` - aggregated metrics
- `StrategyResult` - individual test result

#### UI Components

**`AnalysisModal.tsx`** - Enhanced with batch backtest section

Added features:
- "Backtest All Strategies" button in RESULTS state
- Progress indicator with test counts
- Results table sorted by win rate
- Best strategy highlight (🏆)
- Win rate color coding (green ≥ 60%)
- Grid layout: Tests | Trades | Avg P&L

**State management:**
- `batchBacktesting` - boolean for loading state
- `batchBacktestStatus` - current status and results
- `handleBatchBacktest()` - initiates batch test
- `pollBatchBacktestStatus()` - polls every 1s until complete

## Technical Architecture

### Execution Flow

```
1. User clicks "Backtest All Strategies"
   ↓
2. Frontend: POST /api/batch-backtest
   ↓
3. Backend: Create batch_run record (RUNNING)
   ↓
4. For each strategy:
   - Check if script exists
   - If not, generate with Claude
   - Save to claude-generated-scripts/
   ↓
5. For each strategy × sample:
   - Load script
   - Execute with scriptExecutor.executeScript()
   - Parse trades and metrics
   - Save to batch_backtest_results
   ↓
6. For each strategy:
   - Aggregate results across samples
   - Calculate win rate, avg P&L, etc.
   - Save to batch_strategy_performance
   ↓
7. Mark batch_run as COMPLETED
   ↓
8. Frontend: Poll GET /api/batch-backtest/:id
   - Display progress during execution
   - Show results when complete
```

### Script Generation Prompt

Key elements:
- Strategy name, side (long/short)
- Entry/exit conditions from Claude analysis
- Requirements:
  - Accept ticker, startDate, endDate parameters
  - Load 5-min OHLCV data from database
  - Implement visual conditions as code
  - Track trades with entry/exit timestamps
  - Calculate P&L and metrics
  - Return standardized JSON format

### Parallel Execution

Currently sequential (one strategy → all samples → next strategy).

**Future optimization:** Run strategies in parallel with Promise.all()

## Example Output

```
Batch Backtest Results
┌─────────────────────────────────────────┐
│ 🏆 Volume Confirmation Entry            │
│ 82.5% Win Rate                          │
│ Tests: 40/40 | Trades: 33W/7L          │
│ Avg: +2.45%                             │
├─────────────────────────────────────────┤
│ Pullback Entry                          │
│ 75.0% Win Rate                          │
│ Tests: 40/40 | Trades: 30W/10L         │
│ Avg: +1.89%                             │
├─────────────────────────────────────────┤
│ Exhaustion Doji Short                   │
│ 65.0% Win Rate                          │
│ Tests: 40/40 | Trades: 26W/14L         │
│ Avg: +0.92%                             │
└─────────────────────────────────────────┘

Best Strategy: Volume Confirmation Entry
with 82.5% win rate
```

## Testing Plan

### Manual Testing

1. **Create backtest set** with 3-5 samples
2. **Run Claude analysis** on 2-3 samples
3. **Click "Backtest All Strategies"**
4. **Verify:**
   - Progress indicator updates
   - Results display after completion
   - Win rates calculated correctly
   - Strategies sorted by performance
   - Best strategy highlighted

### Edge Cases

- [ ] Empty backtest set
- [ ] Script generation failure
- [ ] Script execution failure (no data, syntax error)
- [ ] Zero trades generated
- [ ] All strategies fail
- [ ] Network timeout during polling

## Performance Considerations

**Typical execution time:**
- 5 strategies × 40 samples = 200 backtests
- Script generation: ~30s (one-time per strategy)
- Script execution: ~500ms per test
- Total: ~2-3 minutes

**Optimizations:**
1. Script caching (already implemented)
2. Parallel strategy execution (future)
3. Database indexing (already implemented)
4. Result streaming (future)

## Database Queries

**Most important indexes:**
- `idx_batch_results_run` - Fast retrieval by batch run
- `idx_batch_results_strategy` - Fast aggregation by strategy
- `idx_strategy_performance_run` - Fast summary retrieval
- `idx_strategy_scripts_recommendation` - Fast script lookup

## Files Changed

### Backend
- `backend/src/database/schema.sql` - 4 new tables
- `backend/src/services/batch-backtest.service.ts` - NEW (598 lines)
- `backend/src/api/routes/batch-backtest.ts` - NEW (106 lines)
- `backend/src/api/server.ts` - Added route registration

### Frontend
- `frontend/src/services/batchBacktestApi.ts` - NEW (102 lines)
- `frontend/src/components/AnalysisModal.tsx` - Enhanced (120+ lines added)

## Future Enhancements

### Phase 6.1: Advanced Features
- Strategy refinement based on failures
- Parameter optimization (grid search)
- Walk-forward testing
- Out-of-sample validation

### Phase 6.2: UI Improvements
- Drill-down to individual trades
- Chart overlays showing entry/exit points
- Export results to CSV/PDF
- Strategy comparison matrix

### Phase 6.3: Performance
- Parallel strategy execution
- WebSocket for real-time progress
- Incremental result streaming
- Background job queue

## Success Metrics

**Before batch backtesting:**
- Claude suggests 5 strategies
- User manually tests each one (tedious)
- No easy comparison
- Takes hours

**After batch backtesting:**
- One click: "Backtest All Strategies"
- Automated testing of all combinations
- Sorted results with win rates
- Takes 2-3 minutes
- Clear winner identification

## Known Limitations

1. **Sequential execution** - Strategies run one at a time (future: parallel)
2. **No progress updates during script generation** - User sees "Running..." without detail
3. **No result caching** - Re-running same batch generates new scripts
4. **Limited error detail** - Failed tests show error message but not code context

## Update 2025-10-27: Automatic Intraday Data Fetching

### Problem Solved
Previously, batch backtests would silently fail with 0 trades when 5-minute intraday data was missing from the database.

### Solution Implemented
Added automatic data availability checking and fetching in `batch-backtest.service.ts`:

**New Method**: `ensureIntradayData(samples: Sample[])`
- Runs after script generation, before test execution
- Checks if 5-minute data exists for each sample
- Automatically fetches missing data via `UniverseDataService.fetchIntradayDataOnDemand()`
- Deduplicates by ticker (uses widest date range)
- Logs clearly: "📥 Fetching..." vs "✓ Data already cached"
- Respects API rate limits with 500ms delays
- Continues on individual failures

**Benefits**:
- ✅ Zero configuration - works automatically
- ✅ Data is cached for future runs
- ✅ No more silent failures with 0 trades
- ✅ Clear logging shows fetch progress
- ✅ Handles partial data availability gracefully

**Code Location**:
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/batch-backtest.service.ts`
  - Lines 144-146: Call to `ensureIntradayData()`
  - Lines 576-642: Implementation of `ensureIntradayData()` method

## Next Steps

1. Test with real data (current task)
2. Handle edge cases gracefully
3. Add error recovery (retry failed tests)
4. Implement parallel execution
5. Add detailed logging for debugging

---

*Implementation completed: 2025-10-27*
*Branch: feature/batch-backtesting*
*Ready for testing*
