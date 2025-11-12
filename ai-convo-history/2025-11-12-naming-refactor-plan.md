# Agent Naming Refactor Plan

**Date:** 2025-11-12
**Status:** Planning
**Complexity:** Medium (Database + Code Changes)
**Estimated Time:** 2-3 hours

---

## Executive Summary

Refactor the codebase to fix confusing naming conventions between "learning agents" (laboratory environment) and "live trading agents" (production environment). The current naming is backwards and creates significant cognitive overhead.

### Current Problems
1. File `agents.ts` contains learning agent routes, not general agents
2. File `trading-agent.ts` contains live trading agents
3. Database table `trading_agents` stores learning laboratory agents
4. Import variable names don't match their purposes
5. Easy to confuse which agent type you're working with

### Goals
- Create clear distinction between learning laboratory and production trading
- Make file names match their contents
- Align database table names with their actual purpose
- Reduce cognitive overhead for developers
- Prevent bugs from confusion

---

## Current State Analysis

### API Routes
```
/api/agents              → routes/trading-agent.ts    → Live trading agents (production)
/api/learning-agents     → routes/agents.ts           → Learning laboratory agents
```

### Database Tables
```
trading_agents           → Stores learning laboratory agents (CONFUSING!)
agent_iterations         → Foreign key: agent_id
agent_knowledge          → Foreign key: agent_id
agent_strategies         → Foreign key: agent_id
agent_activity_log       → Foreign key: agent_id
agent_alerts             → Foreign key: agent_id
```

### Service Files
```
backend/src/services/agent-management.service.ts     → Manages learning agents
backend/src/services/agent-learning.service.ts       → Manages learning iterations
backend/src/services/trading-agent.service.ts        → Manages live trading agents
```

### Import Names in server.ts
```typescript
import tradingAgentRoutes from './routes/trading-agent';      // Live trading
import learningAgentRoutes from './routes/agents';            // Learning lab (CONFUSING!)
```

---

## Proposed Changes

### Phase 1: File Renaming (No Breaking Changes)

#### Route Files
```
routes/agents.ts              →  routes/learning-agents.ts
routes/trading-agent.ts       →  routes/live-trading-agents.ts
```

#### Service Files (Optional - for consistency)
```
services/agent-management.service.ts  →  services/learning-agent-management.service.ts
services/agent-learning.service.ts    →  services/learning-iteration.service.ts
services/trading-agent.service.ts     →  services/live-trading-agent.service.ts
```

### Phase 2: Import Updates

Update `server.ts`:
```typescript
// BEFORE
import tradingAgentRoutes from './routes/trading-agent';
import learningAgentRoutes from './routes/agents';

// AFTER
import liveTradingAgentRoutes from './routes/live-trading-agents';
import learningAgentRoutes from './routes/learning-agents';
```

### Phase 3: Database Schema Migration

#### Table Renames
```sql
-- Main table
ALTER TABLE trading_agents RENAME TO learning_agents;

-- Activity tables
ALTER TABLE agent_activity_log RENAME TO learning_agent_activity_log;
ALTER TABLE agent_alerts RENAME TO learning_agent_alerts;
```

#### Column Renames
```sql
-- agent_iterations
ALTER TABLE agent_iterations RENAME COLUMN agent_id TO learning_agent_id;

-- agent_knowledge
ALTER TABLE agent_knowledge RENAME COLUMN agent_id TO learning_agent_id;

-- agent_strategies
ALTER TABLE agent_strategies RENAME COLUMN agent_id TO learning_agent_id;

-- agent_activity_log (now learning_agent_activity_log)
ALTER TABLE learning_agent_activity_log RENAME COLUMN agent_id TO learning_agent_id;

-- agent_alerts (now learning_agent_alerts)
ALTER TABLE learning_agent_alerts RENAME COLUMN agent_id TO learning_agent_id;
```

### Phase 4: Code Updates

Update all references from `agent_id` to `learning_agent_id` in:
- All SQL queries
- All TypeScript interfaces
- All service methods
- All API response objects

---

## Step-by-Step Migration Plan

### Step 1: Create Git Branch
```bash
git checkout -b refactor/agent-naming-clarity
```

### Step 2: File Renames (Use Git)

```bash
# Route files
git mv backend/src/api/routes/agents.ts backend/src/api/routes/learning-agents.ts
git mv backend/src/api/routes/trading-agent.ts backend/src/api/routes/live-trading-agents.ts

# Optional: Service files
git mv backend/src/services/agent-management.service.ts backend/src/services/learning-agent-management.service.ts
git mv backend/src/services/agent-learning.service.ts backend/src/services/learning-iteration.service.ts
git mv backend/src/services/trading-agent.service.ts backend/src/services/live-trading-agent.service.ts
```

### Step 3: Update Imports in server.ts

**File:** `backend/src/api/server.ts`

```typescript
// Update imports (lines 26-28)
import liveTradingAgentRoutes from './routes/live-trading-agents';
import learningAgentRoutes from './routes/learning-agents';
import paperTradingRoutes from './routes/paper-trading';

// Update route mounting (lines 60-62)
app.use('/api/agents', liveTradingAgentRoutes);        // Live trading agents (production)
app.use('/api/learning-agents', learningAgentRoutes);  // Learning laboratory agents
app.use('/api/paper-trading', paperTradingRoutes);     // Paper trading
```

### Step 4: Update Service Imports

**Files to update:**
- `backend/src/api/routes/learning-agents.ts` (formerly agents.ts)
- `backend/src/services/continuous-learning.service.ts`
- `backend/src/services/scheduler.service.ts`
- `backend/src/services/graduation.service.ts`
- `backend/src/services/performance-monitor.service.ts`

**Search and replace pattern:**
```typescript
// OLD
import { AgentManagementService } from '../../services/agent-management.service';
import { AgentLearningService } from '../../services/agent-learning.service';

// NEW
import { LearningAgentManagementService } from '../../services/learning-agent-management.service';
import { LearningIterationService } from '../../services/learning-iteration.service';
```

### Step 5: Update Service Class Names

**In each renamed service file, update:**
```typescript
// BEFORE: agent-management.service.ts → learning-agent-management.service.ts
export class AgentManagementService { ... }

// AFTER
export class LearningAgentManagementService { ... }
```

**Files to update:**
1. `learning-agent-management.service.ts` - AgentManagementService → LearningAgentManagementService
2. `learning-iteration.service.ts` - AgentLearningService → LearningIterationService
3. `live-trading-agent.service.ts` - TradingAgentService → LiveTradingAgentService

### Step 6: Database Migration Script

**Create:** `backend/src/database/migrations/2025-11-12-rename-learning-agents.sql`

```sql
-- ===================================================
-- Migration: Rename agent tables for clarity
-- Date: 2025-11-12
-- Purpose: Distinguish learning agents from live trading agents
-- ===================================================

BEGIN TRANSACTION;

-- Step 1: Rename main tables
ALTER TABLE trading_agents RENAME TO learning_agents;
ALTER TABLE agent_activity_log RENAME TO learning_agent_activity_log;
ALTER TABLE agent_alerts RENAME TO learning_agent_alerts;

-- Step 2: Rename foreign key columns in related tables
-- agent_iterations
ALTER TABLE agent_iterations RENAME COLUMN agent_id TO learning_agent_id;

-- agent_knowledge
ALTER TABLE agent_knowledge RENAME COLUMN agent_id TO learning_agent_id;

-- agent_strategies
ALTER TABLE agent_strategies RENAME COLUMN agent_id TO learning_agent_id;

-- learning_agent_activity_log (renamed from agent_activity_log)
ALTER TABLE learning_agent_activity_log RENAME COLUMN agent_id TO learning_agent_id;

-- learning_agent_alerts (renamed from agent_alerts)
ALTER TABLE learning_agent_alerts RENAME COLUMN agent_id TO learning_agent_id;

COMMIT;

-- ===================================================
-- Verification Queries
-- ===================================================

-- Check table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='learning_agents';

-- Check column exists
PRAGMA table_info(agent_iterations);
PRAGMA table_info(agent_knowledge);
PRAGMA table_info(agent_strategies);

-- Check data integrity
SELECT COUNT(*) FROM learning_agents;
SELECT COUNT(*) FROM agent_iterations;
```

### Step 7: Run Database Migration

```bash
# Backup database first!
cp backtesting.db backtesting.db.backup-2025-11-12

# Run migration
sqlite3 backtesting.db < backend/src/database/migrations/2025-11-12-rename-learning-agents.sql

# Verify
sqlite3 backtesting.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%agent%';"
```

### Step 8: Update All SQL Queries

**Search for and replace in all files:**

```typescript
// Pattern 1: Table name
FROM trading_agents    →    FROM learning_agents
INTO trading_agents    →    INTO learning_agents
UPDATE trading_agents  →    UPDATE learning_agents

// Pattern 2: Column name
WHERE agent_id = ?     →    WHERE learning_agent_id = ?
agent_id TEXT          →    learning_agent_id TEXT
SET agent_id = ?       →    SET learning_agent_id = ?
```

**Files likely to contain these patterns:**
- `backend/src/api/routes/learning-agents.ts`
- `backend/src/services/learning-agent-management.service.ts`
- `backend/src/services/learning-iteration.service.ts`
- `backend/src/services/continuous-learning.service.ts`
- `backend/src/services/scheduler.service.ts`
- `backend/src/services/refinement-approval.service.ts`
- `backend/src/services/performance-monitor.service.ts`
- `backend/src/services/graduation.service.ts`
- `backend/src/services/agent-activity-log.service.ts`

**Important:** Use case-sensitive search to avoid replacing things like `pageIndex` or `imageId`.

### Step 9: Update TypeScript Interfaces

**Search for interface definitions:**

```typescript
// BEFORE
interface AgentIteration {
  id: string;
  agent_id: string;  // ← Change this
  iteration_number: number;
  // ...
}

// AFTER
interface AgentIteration {
  id: string;
  learning_agent_id: string;  // ← Changed
  iteration_number: number;
  // ...
}
```

**Common interface locations:**
- `backend/src/types/agent.types.ts`
- Any inline interfaces in service files

### Step 10: Update Reference Documentation

**File:** `DATABASE-SCHEMA-REFERENCE.md`

```markdown
# BEFORE
### 1. `trading_agents` - Agent Definitions

# AFTER
### 1. `learning_agents` - Agent Definitions

Main table for learning laboratory agents.
```

**File:** `API-ENDPOINTS-REFERENCE.md`

Add clarifying notes:
```markdown
## Architecture Notes

- **Learning Agents** (`/api/learning-agents`): Agents in the learning laboratory that evolve strategies through backtesting
- **Live Trading Agents** (`/api/agents`): Production agents that execute trades with real/paper money
```

---

## Testing Checklist

### Unit Tests
- [ ] All imports resolve correctly
- [ ] All service instantiations work
- [ ] No compilation errors

### Integration Tests

#### Test Learning Agent CRUD
```bash
# Create agent
curl -X POST http://localhost:3000/api/learning-agents/create \
  -H "Content-Type: application/json" \
  -d '{"instructions": "Test strategy"}'

# List agents
curl http://localhost:3000/api/learning-agents

# Get specific agent (use ID from create)
curl http://localhost:3000/api/learning-agents/{id}
```

#### Test Learning Iteration
```bash
# Start iteration
curl -X POST http://localhost:3000/api/learning-agents/{id}/iterations/start \
  -H "Content-Type: application/json" \
  -d '{}'

# Get iterations
curl http://localhost:3000/api/learning-agents/{id}/iterations
```

#### Test Knowledge Retrieval
```bash
curl http://localhost:3000/api/learning-agents/{id}/knowledge
```

#### Test Live Trading Agents (should still work)
```bash
curl http://localhost:3000/api/agents
curl http://localhost:3000/api/agents/auth/status
```

### Database Verification
```sql
-- Verify table structure
PRAGMA table_info(learning_agents);
PRAGMA table_info(agent_iterations);

-- Verify foreign keys still work
SELECT
  la.id,
  la.name,
  COUNT(ai.id) as iteration_count
FROM learning_agents la
LEFT JOIN agent_iterations ai ON la.id = ai.learning_agent_id
GROUP BY la.id;

-- Verify data integrity
SELECT COUNT(*) FROM learning_agents;
SELECT COUNT(*) FROM agent_iterations;
SELECT COUNT(*) FROM agent_knowledge;
```

### Functional Tests
- [ ] Create a new learning agent via API
- [ ] Run an iteration on existing agent
- [ ] View agent knowledge
- [ ] Start continuous learning
- [ ] Check scheduler status
- [ ] View activity logs
- [ ] Live trading agent endpoints still work

---

## Rollback Plan

If something goes wrong:

### Quick Rollback (Before Database Migration)
```bash
git checkout main
npm run dev:backend
```

### Full Rollback (After Database Migration)
```bash
# Restore database backup
cp backtesting.db.backup-2025-11-12 backtesting.db

# Restore code
git checkout main
npm run dev:backend
```

### Partial Rollback (Keep Code, Restore DB)
```bash
# Restore database
cp backtesting.db.backup-2025-11-12 backtesting.db

# Revert just the SQL query changes
git checkout main -- backend/src/services/
git checkout main -- backend/src/api/routes/
```

---

## File-by-File Change Summary

### High Priority (Required for functionality)

#### 1. `backend/src/api/server.ts`
- **Change:** Update import paths and variable names
- **Lines:** 26-28, 60-62
- **Risk:** Medium - Server won't start if imports fail

#### 2. `backend/src/api/routes/learning-agents.ts` (renamed from agents.ts)
- **Change:** Update service imports and all SQL queries
- **Risk:** High - All learning agent endpoints will fail
- **Search for:** `agent_id`, `trading_agents`, `agent_activity_log`, `agent_alerts`

#### 3. `backend/src/services/learning-agent-management.service.ts` (renamed)
- **Change:** Update class name and all SQL queries
- **Risk:** High - Core service for learning agents
- **Search for:** `agent_id`, `trading_agents`

#### 4. `backend/src/services/learning-iteration.service.ts` (renamed)
- **Change:** Update class name and all SQL queries
- **Risk:** High - Learning iterations will fail
- **Search for:** `agent_id`, `agent_iterations`

#### 5. Database Migration
- **File:** Create new SQL migration file
- **Risk:** High - Must backup first
- **Rollback:** Restore from backup

### Medium Priority (Supporting services)

#### 6. `backend/src/services/continuous-learning.service.ts`
- **Change:** Update imports and SQL queries
- **Search for:** `agent_id`, `AgentLearningService`

#### 7. `backend/src/services/scheduler.service.ts`
- **Change:** Update imports and SQL queries
- **Search for:** `agent_id`, `trading_agents`

#### 8. `backend/src/services/refinement-approval.service.ts`
- **Change:** Update SQL queries
- **Search for:** `agent_id`

#### 9. `backend/src/services/performance-monitor.service.ts`
- **Change:** Update SQL queries and alert table names
- **Search for:** `agent_id`, `agent_alerts`

#### 10. `backend/src/services/graduation.service.ts`
- **Change:** Update SQL queries
- **Search for:** `agent_id`, `trading_agents`

#### 11. `backend/src/services/agent-activity-log.service.ts`
- **Change:** Update SQL queries and table names
- **Search for:** `agent_id`, `agent_activity_log`

### Low Priority (Documentation & Types)

#### 12. `backend/src/types/agent.types.ts`
- **Change:** Update interface definitions
- **Search for:** `agent_id` in interface properties

#### 13. `DATABASE-SCHEMA-REFERENCE.md`
- **Change:** Update table and column names throughout
- **Search for:** `trading_agents`, `agent_id`

#### 14. `API-ENDPOINTS-REFERENCE.md`
- **Change:** Add architectural clarity notes
- **Risk:** None - documentation only

#### 15. `.claude/CLAUDE.md`
- **Change:** Update any references to table/file names
- **Risk:** None - documentation only

---

## Verification Steps

After completing all changes:

### 1. Compilation Check
```bash
cd backend
npx tsc --noEmit
```
Should complete with no errors.

### 2. Server Startup
```bash
npm run dev:backend
```
Should start without errors. Look for:
- ✅ Server running on port 3000
- ✅ Learning Agent Scheduler started
- No import errors
- No database errors

### 3. API Smoke Tests
```bash
# Test learning agents
curl http://localhost:3000/api/learning-agents
curl http://localhost:3000/api/learning-agents/{existing-agent-id}

# Test live trading agents
curl http://localhost:3000/api/agents
```

### 4. Database Integrity
```bash
sqlite3 backtesting.db << EOF
-- Check table exists
SELECT COUNT(*) FROM learning_agents;

-- Check foreign keys work
SELECT la.name, COUNT(ai.id)
FROM learning_agents la
LEFT JOIN agent_iterations ai ON la.id = ai.learning_agent_id
GROUP BY la.id;

-- Check no orphaned records
SELECT COUNT(*) FROM agent_iterations
WHERE learning_agent_id NOT IN (SELECT id FROM learning_agents);
EOF
```

Should show:
- learning_agents has same count as before (9 agents)
- Foreign key joins work
- Zero orphaned records

### 5. Full Integration Test
```bash
# Create new agent
AGENT_ID=$(curl -X POST http://localhost:3000/api/learning-agents/create \
  -H "Content-Type: application/json" \
  -d '{"instructions": "Test refactor: scalp AAPL"}' \
  | jq -r '.agent.id')

echo "Created agent: $AGENT_ID"

# Run iteration
curl -X POST http://localhost:3000/api/learning-agents/$AGENT_ID/iterations/start \
  -H "Content-Type: application/json" \
  -d '{}'

# Verify iteration was created
curl http://localhost:3000/api/learning-agents/$AGENT_ID/iterations | jq
```

---

## Success Criteria

- [ ] All TypeScript compiles without errors
- [ ] Backend server starts without errors
- [ ] All existing learning agents are accessible via API
- [ ] Can create new learning agents
- [ ] Can run iterations on learning agents
- [ ] Can query agent knowledge
- [ ] Live trading agent endpoints still work
- [ ] Database foreign keys are intact
- [ ] No orphaned records in database
- [ ] All tests pass
- [ ] Documentation is updated

---

## Post-Migration Tasks

1. **Update README.md** with new architecture clarity
2. **Create migration notes** in ai-convo-history
3. **Update any scripts** that reference old table/file names
4. **Notify team** about naming changes (if applicable)
5. **Monitor production** for any missed references

---

## Common Issues & Solutions

### Issue: Import not found after file rename
**Solution:** Make sure to update the import path exactly:
```typescript
// If you renamed routes/agents.ts → routes/learning-agents.ts
import x from './routes/agents';       // ❌ Won't work
import x from './routes/learning-agents';  // ✅ Correct
```

### Issue: SQL error "no such table: trading_agents"
**Solution:** Database migration didn't run. Check:
```bash
sqlite3 backtesting.db "SELECT name FROM sqlite_master WHERE type='table';"
```
Should see `learning_agents`, not `trading_agents`.

### Issue: Foreign key constraint failed
**Solution:** Column rename didn't complete. Verify:
```bash
sqlite3 backtesting.db "PRAGMA table_info(agent_iterations);"
```
Should see `learning_agent_id`, not `agent_id`.

### Issue: Some queries still reference agent_id
**Solution:** Do a global search:
```bash
cd backend
grep -r "agent_id" src/ --include="*.ts" | grep -v "learning_agent_id"
```
This will show any remaining references to fix.

---

## Estimated Timeline

- **File renames:** 10 minutes
- **Import updates:** 20 minutes
- **Service class renames:** 15 minutes
- **Database migration (with backup):** 15 minutes
- **SQL query updates:** 45 minutes (most time-consuming)
- **Interface updates:** 20 minutes
- **Documentation updates:** 15 minutes
- **Testing & verification:** 30 minutes
- **Buffer for issues:** 30 minutes

**Total:** ~3 hours

---

## Notes for Claude Code Web Interface

When executing this plan:

1. **Work in order** - The steps are sequenced to minimize breakage
2. **Test frequently** - After each major step, try to compile/run
3. **Use git mv** - Preserves file history better than delete/create
4. **Backup database** - Do this BEFORE Step 7
5. **Search carefully** - Use case-sensitive search for `agent_id` to avoid false matches
6. **Read the error messages** - If TypeScript complains, it's usually an import path issue

Good luck! This refactor will make the codebase much clearer.
