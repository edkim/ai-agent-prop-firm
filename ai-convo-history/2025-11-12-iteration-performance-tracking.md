# 2025-11-12: Iteration Performance Tracking Implementation

## Summary

Implemented comprehensive performance tracking for learning iterations to monitor execution time and Claude API token usage across different phases. This enables:
- Performance optimization by identifying bottlenecks
- Future multi-model support (e.g., Haiku for faster phases)
- Better user visibility into iteration progress
- Cost tracking for API usage

## Changes Made

### 1. Database Schema
- Created new `iteration_performance` table with fields for:
  - Time tracking per phase (scanner generation, scan execution, backtest execution, analysis)
  - Token usage per phase (scanner, execution, analysis)
  - Model tracking (for future multi-model support)
  - Status tracking (current phase, error messages)
  - Total time and token calculations

### 2. Backend Services

#### New Service: `IterationPerformanceService`
Located: `/backend/src/services/iteration-performance.service.ts`

Key methods:
- `createPerformanceRecord()` - Initialize tracking for new iteration
- `updatePhase()` - Update current phase status
- `updateMetrics()` - Record time and token usage for phases
- `getPerformanceMetrics()` - Retrieve metrics for an iteration
- `getInProgressIteration()` - Check for running iterations

#### Updated Service: `LearningIterationService`
Location: `/backend/src/services/learning-iteration.service.ts`

Changes:
- Generate iteration ID upfront for performance tracking
- Wrap each phase (1-5) with timing measurements
- Track Claude API token usage from responses
- Update phase status as iteration progresses
- Mark iteration as completed or failed
- Pass iteration ID to `saveIteration()`

### 3. Performance Tracking Per Phase

**Phase 1: Scanner Generation**
- Tracks: `scanner_generation_time_ms`, `scanner_generation_tokens`
- Includes both scanner and initial execution script generation

**Phase 2: Scan Execution**
- Tracks: `scan_execution_time_ms`
- Measures TypeScript script execution time

**Phase 2.5: Execution Script Regeneration** (when applicable)
- Tracks: `execution_generation_time_ms`
- Only runs for iteration 2+ with signals

**Phase 3: Backtest Execution**
- Tracks: `backtest_execution_time_ms`
- Measures template testing and custom execution

**Phase 4-5: Analysis**
- Tracks: `analysis_time_ms`, `analysis_tokens`
- Includes result analysis, knowledge extraction, and refinement proposals

### 4. API Integration
Location: `/backend/src/api/routes/learning-agents.ts`

Changes to GET `/api/learning-agents/:id/iterations`:
- Returns `inProgressIteration` field for currently running iterations
- Adds `performance` field to each completed iteration
- Performance data includes time/tokens per phase and current status

### 5. Frontend Integration
Location: `/frontend/src/services/learningAgentApi.ts`

New Types:
- `PerformanceMetrics` interface for tracking data
- Updated `AgentIteration` to include `performance` and `git_commit_hash`
- Updated `getIterations()` to return both iterations and inProgressIteration

Location: `/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`

UI Enhancements:
1. **In-Progress Indicator**
   - Yellow highlighted card at top of iteration list
   - Shows current phase with spinner animation
   - Real-time elapsed time display
   - Pulsing "IN PROGRESS" badge

2. **Performance Tracking Section** (in Summary tab)
   - Time breakdown by phase (scanner, execution, scan, backtest, analysis)
   - Token usage breakdown by phase
   - Total time and total tokens with visual separators
   - All times shown in seconds with 1 decimal precision
   - Token counts formatted with thousand separators

3. **Version Information Section**
   - Displays git commit hash (first 8 characters)
   - Monospace font for better readability
   - Only shown when git_commit_hash is available

### 6. Git Integration
- Updated `saveIteration()` to accept pre-generated iteration ID
- Maintains existing git commit hash tracking

## All Features Completed ✅

1. ✅ **Backend tracking** - Time and token usage tracked for all phases
2. ✅ **API Updates** - Performance metrics and in-progress status returned
3. ✅ **Frontend Display** - In-progress iterations shown with live updates
4. ✅ **Frontend Metrics** - Performance data and git commit hash displayed

## Technical Details

### Database Table Schema
```sql
CREATE TABLE iteration_performance (
  id TEXT PRIMARY KEY,
  iteration_id TEXT NOT NULL,
  learning_agent_id TEXT NOT NULL,
  iteration_number INTEGER NOT NULL,

  -- Phase timing (milliseconds)
  scanner_generation_time_ms INTEGER,
  execution_generation_time_ms INTEGER,
  scan_execution_time_ms INTEGER,
  backtest_execution_time_ms INTEGER,
  analysis_time_ms INTEGER,
  total_time_ms INTEGER,

  -- Token usage per phase
  scanner_generation_tokens INTEGER,
  execution_generation_tokens INTEGER,
  analysis_tokens INTEGER,
  total_tokens INTEGER,

  -- Model tracking
  scanner_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  execution_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  analysis_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',

  -- Status
  current_phase TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,

  FOREIGN KEY (iteration_id) REFERENCES agent_iterations(id) ON DELETE CASCADE
);
```

### Files Modified

**Backend:**
1. `/backend/src/database/schema.sql` - Added iteration_performance table
2. `/backend/src/services/iteration-performance.service.ts` - New service (created)
3. `/backend/src/services/learning-iteration.service.ts` - Integrated tracking
4. `/backend/src/services/claude.service.ts` - Added token usage return
5. `/backend/src/api/routes/learning-agents.ts` - Added performance metrics to API

**Frontend:**
6. `/frontend/src/services/learningAgentApi.ts` - Added performance types and updated API calls
7. `/frontend/src/components/LearningLaboratory/AgentIterationView.tsx` - Added performance UI

**Documentation:**
8. `/.claude/CLAUDE.md` - Added server startup instructions
9. `/ai-convo-history/2025-11-12-iteration-performance-tracking.md` - This document

## Branch
`feat/iteration-performance-tracking`

## Testing Notes

### Backend Testing
- Database table created successfully
- Backend server auto-reloaded with changes
- **Bug fixes applied:**
  1. Fixed `this.claudeService` → `this.claude` on line 230
  2. Removed `FOREIGN KEY` constraint on `iteration_id` (iteration created after performance record)
  3. Fixed token tracking in `analyzeBacktestResults()` and `generateExecutionScript()`
- **Iteration 7 results:**
  - Total time: 244.9s (~4.1 minutes)
  - Scanner Generation: 121.9s, 12,055 tokens
  - Execution Regeneration: 44.8s, tokens now tracked correctly
  - Scan Execution: 1.3s
  - Backtest Execution: 1.0s
  - Analysis: 75.8s, tokens now tracked correctly

### Frontend Testing
- TypeScript compilation successful (no errors)
- Hot module reloading working correctly
- All components updated with performance tracking
- UI displays:
  - ✅ In-progress iterations with live phase updates
  - ✅ Performance metrics breakdown (time & tokens)
  - ✅ Git commit hash display
  - ✅ Real-time elapsed time counter

### API Testing
- GET `/api/learning-agents/:id/iterations` returns:
  - `iterations` array with performance data
  - `inProgressIteration` for running iterations
- Performance metrics properly attached to completed iterations
- Current phase tracking works during iteration execution
