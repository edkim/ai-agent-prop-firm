# Strategy Versions vs Iterations: Complete Explanation

**Date**: 2025-11-03
**Topic**: Understanding the difference between Strategy Versions and Iterations in the Learning Laboratory

---

## QUICK SUMMARY

| Aspect | Iterations | Strategy Versions |
|--------|-----------|-------------------|
| **Purpose** | Learning experiments to test new strategies | Approved, refined strategies ready for deployment |
| **When Created** | Every time an agent runs a learning cycle | Only when refinements from an iteration are approved |
| **Data Stored** | Raw scripts, backtest results, expert analysis, proposed refinements | Polished scripts, performance metrics, version history |
| **Status** | completed, approved, rejected, improved_upon | Current or historical versions |
| **Count per Agent** | Many (every iteration) | Few (only approved ones) |
| **Use Case** | Tracking agent learning progress | Tracking strategy evolution and deployment |
| **Still Active** | YES - actively used in learning loop | YES - actively used to track approved strategies |

---

## DETAILED BREAKDOWN

### 1. ITERATIONS (Agent Learning Experiments)

**What It Is:**
An iteration represents a single learning cycle where the agent:
1. Generates a new strategy (scan + execution scripts)
2. Executes the scan to find trading signals
3. Backtests the signals using template library
4. Analyzes results with Claude AI
5. Proposes refinements for improvement

**Database Table:** `agent_iterations`

**Key Fields:**
```sql
id TEXT PRIMARY KEY                        -- UUID
agent_id TEXT                              -- Which agent is learning
iteration_number INTEGER                   -- Chronological sequence (1, 2, 3...)
scan_script TEXT                           -- Generated scan TypeScript
execution_script TEXT                      -- Legacy (now uses template library)
version_notes TEXT                         -- "Iteration 5: Applied learnings"
signals_found INTEGER                      -- How many trades were found
backtest_results JSON                      -- Full backtest data
win_rate REAL                              -- % of trades that were profitable
sharpe_ratio REAL                          -- Risk-adjusted return metric
total_return REAL                          -- Total P&L
expert_analysis JSON                       -- Claude's detailed breakdown
refinements_suggested JSON                 -- Array of proposed improvements
iteration_status TEXT                      -- 'completed', 'approved', 'rejected', 'improved_upon'
created_at TEXT
```

**When Created:**
- Every time you click "Start New Iteration" button
- Part of continuous learning loop (can run multiple per day)
- Used for A/B testing different strategy approaches

**Example Iteration Data Structure:**
```typescript
{
  id: "uuid-123",
  agent_id: "agent-456",
  iteration_number: 3,
  scan_script: "// Find gap-and-go patterns...",
  signals_found: 42,
  win_rate: 0.62,
  sharpe_ratio: 1.85,
  total_return: 0.0847,  // 8.47%
  expert_analysis: {
    summary: "Strong performance with consistent entries...",
    working_elements: [...],
    failure_points: [...],
    parameter_recommendations: [
      {
        parameter: "rsi_threshold",
        currentValue: 70,
        recommendedValue: 65
      }
    ]
  },
  refinements_suggested: [
    {
      type: "parameter_adjustment",
      description: "Adjust RSI threshold from 70 to 65",
      reasoning: "Tighter entry would reduce whipsaws",
      projected_improvement: "Expected +2% win rate"
    }
  ],
  iteration_status: "completed"
}
```

---

### 2. STRATEGY VERSIONS (Approved, Refined Strategies)

**What It Is:**
A strategy version represents an approved iteration that has been refined and is ready for deployment or comparison. It's created only when an iteration's refinements are accepted.

**Database Table:** `agent_strategies`

**Key Fields:**
```sql
id TEXT PRIMARY KEY                        -- UUID
agent_id TEXT                              -- Which agent owns this
version TEXT                               -- "v1.0", "v1.1", "v2.0"
scan_script TEXT                           -- Clean scan script
execution_script TEXT                      -- Clean execution script
backtest_sharpe REAL                       -- Verified Sharpe ratio
backtest_win_rate REAL                     -- Verified win rate
backtest_total_return REAL                 -- Verified total return
is_current_version INTEGER (boolean)       -- 1 if this is the active version
parent_version TEXT                        -- "v1.0" (which version was refined)
changes_from_parent TEXT                   -- "Adjusted RSI; added volume filter"
created_at TEXT
```

**When Created:**
- Only when user clicks "Apply Refinements" on an iteration
- Creates a new numbered version (v1.0 → v1.1 → v2.0)
- Increments minor version when refining current version
- Increments major version for significant rewrites

**Example Strategy Version:**
```typescript
{
  id: "uuid-789",
  agent_id: "agent-456",
  version: "v1.1",
  scan_script: "// Improved gap-and-go scanner...",
  execution_script: "// Template-based executor...",
  backtest_sharpe: 1.87,      // Post-refinement metrics
  backtest_win_rate: 0.64,
  backtest_total_return: 0.0912,
  is_current_version: 1,      // This is the active version
  parent_version: "v1.0",     // Refined from v1.0
  changes_from_parent: "Adjusted RSI threshold from 70 to 65; Added volume filter; Tightened stop loss",
  created_at: "2025-11-03"
}
```

---

### 3. DATA FLOW & RELATIONSHIP

```
Agent Learning Loop:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. USER STARTS ITERATION
   └─> runIteration() called with agentId

2. GENERATE STRATEGY
   └─> Claude creates scan + execution scripts

3. EXECUTE & BACKTEST
   └─> Run 5 execution templates on scan results
   └─> Select winning template

4. ANALYZE RESULTS
   └─> Claude provides expert analysis
   └─> Proposes refinements

5. SAVE ITERATION
   └─> Create record in agent_iterations table
   └─> Status = 'completed'
   └─> Contains all raw data (scripts, analysis, refinements)

6. USER REVIEWS ITERATION
   └─> Sees expert analysis
   └─> Sees proposed refinements
   └─> Can accept or reject

7. USER CLICKS "APPLY REFINEMENTS"
   └─> Load iteration record
   └─> Create NEW version in agent_strategies table
   └─> Status = 'approved'
   └─> Version number increments
   └─> Mark old version as is_current_version = 0
   └─> Mark new version as is_current_version = 1

8. NEXT ITERATION STARTS
   └─> Agent's knowledge extraction learns from this version
   └─> Next iteration uses learnings to refine further
```

---

### 4. FRONTEND DISPLAY

**Iterations View** (`AgentIterationView.tsx`):
- Shows list of all learning experiments
- Displays iteration number, date, win rate, sharpe ratio
- Shows expert analysis and refinements
- Allows user to start new iteration with optional manual guidance
- Shows "Apply Refinements" button to create a strategy version

**Strategy Versions View** (`StrategyVersions.tsx`):
- Shows version history (v1.0, v1.1, v2.0, etc.)
- Highlights which version is "Current" (is_current_version = 1)
- Shows performance metrics (win rate, sharpe, total return)
- Shows "Changes from Parent" description
- Displays the scripts for that version
- Used for comparing strategy evolution

---

### 5. RELATIONSHIP & DEPENDENCIES

```
One Iteration → Zero or One Strategy Version

Iteration #1 (completed)
    ↓ User applies refinements
    └─→ Strategy Version v1.0 created (is_current_version = 1)

Iteration #2 (completed)
    ↓ User applies refinements
    └─→ Strategy Version v1.1 created (is_current_version = 1)
    │                          ↑
    │                    (Parent: v1.0)
    │
    └─→ v1.0 automatically set to is_current_version = 0

Iteration #3 (rejected)
    ↓ No version created - refinements not approved
```

---

### 6. PURPOSE & USE CASES

**Iterations Are For:**
- Tracking every learning experiment
- Storing Claude's analysis and recommendations
- Testing multiple refinement options
- Understanding agent learning progress
- Learning loop: refine → test → analyze → refine
- Building agent's accumulated knowledge base

**Strategy Versions Are For:**
- Tracking approved, production-ready strategies
- Version control (v1.0 → v1.1 → v2.0)
- Comparing strategy evolution over time
- Deploying to paper/live trading
- Rollback capability (switch back to previous version)
- Audit trail of what was deployed

---

### 7. ACTIVE STATUS

**Both are actively used:**

#### Iterations
- Created every learning cycle
- Backend: `agent-learning.service.ts` line 68 (`runIteration()`)
- Frontend: `AgentIterationView.tsx` shows iteration history
- Still core to learning loop

#### Strategy Versions
- Created only when refinements approved
- Backend: `agent-learning.service.ts` line 644 (`applyRefinements()`)
- Frontend: `StrategyVersions.tsx` shows version history
- Actively used for deployment tracking

**They are NOT legacy** - both serve different purposes in the learning laboratory system.

---

### 8. CODE REFERENCES

**Backend Implementation:**
- Type definitions: `/backend/src/types/agent.types.ts` (lines 114-212)
- Learning service: `/backend/src/services/agent-learning.service.ts`
  - `runIteration()` creates iterations
  - `applyRefinements()` creates strategy versions
  - `saveIteration()` stores iteration data
  - `saveStrategyVersion()` stores version data
- Database: `/backend/src/database/schema.sql` (lines 809-836)

**Frontend Implementation:**
- Iteration view: `/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`
- Version view: `/frontend/src/components/LearningLaboratory/StrategyVersions.tsx`
- API service: `/frontend/src/services/learningAgentApi.ts`

---

### 9. KEY INSIGHTS

1. **Iterations are experiments**, Strategy Versions are results
2. **Every approved iteration creates exactly one version** (one-to-one mapping)
3. **Multiple rejected/incomplete iterations create zero versions**
4. **Version numbering shows refinement path**: v1.0 (first approved) → v1.1 (refined) → v2.0 (major change)
5. **Only one version is "current"** at any time (is_current_version = 1)
6. **Iterations feed agent's knowledge base** which helps next iteration improve
7. **Both tables are essential** - iterations track learning, versions track deployment

---

## Conclusion

This comprehensive analysis shows that both concepts are **not legacy** but serve complementary purposes in the agent learning lifecycle:

- **Iterations** = The learning experiments (all attempts, successes and failures)
- **Strategy Versions** = The approved results ready for deployment

Together they provide a complete audit trail from experimentation to production deployment.

---

**Documentation Date**: 2025-11-03
**Status**: Active features in Learning Laboratory
**Related Files**: See section 8 for complete code references
