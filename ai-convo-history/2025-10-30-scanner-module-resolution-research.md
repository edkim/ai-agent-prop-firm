# Scanner Module Resolution Research - 2025-10-30

## Executive Summary

**Root Cause Identified**: Scanner scripts saved to `/tmp` cannot resolve relative imports like `'./src/database/db'` and `'dotenv'` because:
1. TypeScript module resolution is relative to the script's location
2. Scripts in `/tmp` look for `./src/database/db` relative to `/tmp`, not `/Users/edwardkim/Code/ai-backtest/backend`
3. Node modules (dotenv) are looked up from script's directory, not backend's node_modules

**Current Behavior**:
- Scanner scripts: Saved to backend directory (`scanner-{timestamp}.ts`) ✅ WORKS
- Agent execution scripts: Saved to `/tmp` (`agent-backtest-{uuid}.ts`) ❌ BROKEN

**Recommended Solution**: Option A - Ensure all scripts execute from backend directory

---

## 1. How ScriptExecutionService Works

### Script Execution Flow
```typescript
// File: backend/src/services/script-execution.service.ts

async executeScript(scriptPath: string, timeout?: number) {
  const absolutePath = path.resolve(scriptPath);
  const command = `npx ts-node "${absolutePath}"`;
  
  // KEY: Sets cwd to backend directory
  const { stdout, stderr } = await execAsync(command, {
    cwd: path.join(__dirname, '../..'), // backend directory
    timeout: timeout || 30000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'script-execution' }
  });
}
```

### Critical Insight
- **cwd is set to backend directory** (`path.join(__dirname, '../..')`)
- This allows ts-node to find node_modules
- BUT relative imports in the script are still resolved from the **script's file location**, not cwd

---

## 2. Why Scripts Can't Resolve Modules from /tmp

### Test Results

**Test 1: Script in /tmp**
```bash
# Script location: /tmp/test-scanner-imports.ts
# Import: import { getDatabase } from './src/database/db'
# Result: ❌ ERROR

TSError: Cannot find module './src/database/db' or its corresponding type declarations.
TSError: Cannot find module 'dotenv' or its corresponding type declarations.
```

**Test 2: Script in backend directory**
```bash
# Script location: backend/test-scanner-backend.ts
# Import: import { getDatabase } from './src/database/db'
# Result: ✅ SUCCESS

Module imports successful from backend directory!
```

### Why This Happens

1. **Relative imports** (`'./src/database/db'`):
   - Resolved relative to the script's file location
   - `/tmp/test.ts` looks for `/tmp/src/database/db` ❌
   - `backend/test.ts` looks for `backend/src/database/db` ✅

2. **Node modules** (`'dotenv'`):
   - Node walks up from script directory looking for node_modules
   - `/tmp/` has no node_modules, walks to `/private/tmp/`, then `/private/`, etc. ❌
   - `backend/` finds `backend/node_modules/` ✅

---

## 3. Current Scanner Script Format

### Generated Script Structure
```typescript
// Example: backend/claude-generated-scripts/scanner-2025-10-30T01-17-35.ts

import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  date: string;
  opening_range_time: string;
  cross_type: 'bullish' | 'bearish';
  pattern_strength: number;
  metrics: { ... }
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();
  
  // Scanner logic here...
  
  return results.sort((a, b) => b.pattern_strength - a.pattern_strength);
}

runScan().then(results => {
  console.log(JSON.stringify(results, null, 2));
}).catch(console.error);
```

### Key Dependencies
- `./src/database/db` - Relative import ⚠️
- `dotenv` - npm package
- `path` - Node.js built-in ✅
- `../.env` - Relative to __dirname ⚠️

---

## 4. Current Implementation Patterns

### Scanner Service (naturalLanguageScan)
```typescript
// File: backend/src/services/scanner.service.ts:192

// ✅ CORRECT: Saves to backend directory
const scriptPath = path.join(__dirname, '../../', `scanner-${Date.now()}.ts`);
await fs.writeFile(scriptPath, script);

// Executes successfully
const executionResult = await scriptExecutionService.executeScript(scriptPath, 60000);
```

**Location**: `backend/scanner-{timestamp}.ts`  
**Status**: ✅ Works correctly

### Agent Learning Service (runBacktests)
```typescript
// File: backend/src/services/agent-learning.service.ts:256

// ❌ BROKEN: Saves to /tmp
const scriptPath = path.join('/tmp', `agent-backtest-${scriptId}.ts`);
fs.writeFileSync(scriptPath, customizedScript);

// This will fail if script has relative imports
const result = await this.scriptExecution.executeScript(scriptPath, 120000);
```

**Location**: `/tmp/agent-backtest-{uuid}.ts`  
**Status**: ❌ Module resolution fails

### Batch Backtest Service
```typescript
// File: backend/src/services/batch-backtest.service.ts:73

// ✅ CORRECT: Uses claude-generated-scripts directory
this.scriptsDir = path.join(process.cwd(), 'claude-generated-scripts');
```

**Location**: `backend/claude-generated-scripts/`  
**Status**: ✅ Works correctly

---

## 5. Solution Options Analysis

### Option A: Execute from Backend Directory ⭐ RECOMMENDED

**Implementation**:
```typescript
// Change agent-learning.service.ts line 256 from:
const scriptPath = path.join('/tmp', `agent-backtest-${scriptId}.ts`);

// To:
const scriptPath = path.join(__dirname, '../../', `agent-backtest-${scriptId}.ts`);
```

**Pros**:
- ✅ Simple one-line change
- ✅ Consistent with scanner scripts
- ✅ No script generation changes needed
- ✅ Works with existing codebase patterns
- ✅ Automatic cleanup already implemented (line 107-112 in script-execution.service.ts)

**Cons**:
- ⚠️ Multiple concurrent executions create files in backend root (mitigated by UUIDs)
- ⚠️ Need to ensure cleanup on errors

**Risk**: Low  
**Effort**: Minimal  
**Compatibility**: 100%

---

### Option B: Fix Import Paths to Use Absolute Paths

**Implementation**:
```typescript
// Modify Claude prompt to generate scripts with absolute imports
import { getDatabase } from '/Users/edwardkim/Code/ai-backtest/backend/src/database/db';

// Or use tsconfig paths
import { getDatabase } from '@backend/database/db';
```

**Pros**:
- ✅ Scripts can run from anywhere
- ✅ More portable

**Cons**:
- ❌ Requires changing Claude generation prompt
- ❌ Hard-coded absolute paths break across environments
- ❌ tsconfig paths require additional ts-node configuration
- ❌ Complex to implement and maintain
- ❌ Still doesn't solve node_modules resolution

**Risk**: High  
**Effort**: Significant  
**Compatibility**: May break existing scripts

---

### Option C: Copy Dependencies to /tmp

**Implementation**:
```typescript
// Before execution, copy necessary files
await fs.cp('backend/src', '/tmp/src', { recursive: true });
await fs.cp('backend/node_modules', '/tmp/node_modules', { recursive: true });
```

**Pros**:
- ✅ Scripts run in isolation

**Cons**:
- ❌ Extremely slow (copying 100s of MB for each execution)
- ❌ Wasteful of disk space
- ❌ Complex cleanup required
- ❌ May fail due to disk permissions
- ❌ Still need to handle .env file

**Risk**: High  
**Effort**: High  
**Compatibility**: Low

---

### Option D: Use eval/vm in Same Process

**Implementation**:
```typescript
// Compile and evaluate TypeScript in-process
const ts = require('typescript');
const compiled = ts.transpileModule(script, { ... });
const result = eval(compiled.outputText);
```

**Pros**:
- ✅ No file system operations
- ✅ Fast execution

**Cons**:
- ❌ Major security risk (arbitrary code execution)
- ❌ Difficult to sandbox properly
- ❌ Hard to timeout/kill
- ❌ Shares process memory/state
- ❌ Complex error handling
- ❌ Can't easily capture stdout/stderr

**Risk**: Critical (Security)  
**Effort**: Very High  
**Compatibility**: Requires major refactor

---

## 6. Similar Issues in Codebase

### Grep Analysis Results

**Files Using /tmp**: 1
- `agent-learning.service.ts:256` ❌ NEEDS FIX

**Files Using Backend Directory**: 3
- `scanner.service.ts:192` ✅ Works
- `batch-backtest.service.ts:73` ✅ Works  
- `script-execution.service.ts` cleanup logic ✅ Works

**Conclusion**: Agent learning service is the ONLY service with this problem.

---

## 7. How Other Parts Execute TypeScript Successfully

### Helper Scripts Pattern
```typescript
// All helper scripts run from backend directory
// Example: helper-scripts/backfill-russell2000-intraday.ts

import dotenv from 'dotenv';
import { getDatabase } from '../src/database/db';

dotenv.config();
// Works because script is in backend hierarchy
```

### Server Startup Pattern
```typescript
// backend/src/api/server.ts
import dotenv from 'dotenv';
dotenv.config();

// Works because server.ts is in src/
```

### Pattern Recognition
All successful TypeScript executions share:
1. Script file is within backend directory structure
2. Imports are relative to backend root
3. node_modules is accessible from script location

---

## 8. Recommended Solution: Option A Details

### Changes Required

**File**: `backend/src/services/agent-learning.service.ts`

**Change 1** (Line 256):
```typescript
// Before:
const scriptPath = path.join('/tmp', `agent-backtest-${scriptId}.ts`);

// After:
const scriptPath = path.join(__dirname, '../../', `agent-backtest-${scriptId}.ts`);
```

**Existing Cleanup** (Already implemented in script-execution.service.ts:107-112):
```typescript
// Cleanup temp file (starts with 'backtest-' in backend directory)
if (scriptPath.includes('backtest-') && scriptPath.endsWith('.ts')) {
  await fs.unlink(scriptPath).catch(() => {
    // Ignore cleanup errors
  });
}
```

### Why This Works

1. **Module Resolution**:
   - Script at `backend/agent-backtest-{id}.ts`
   - Import `./src/database/db` resolves to `backend/src/database/db` ✅
   - Import `dotenv` finds `backend/node_modules/dotenv` ✅

2. **Environment**:
   - `.env` at `backend/.env`
   - `dotenv.config({ path: path.resolve(__dirname, '../.env') })` works ✅

3. **Database**:
   - `DATABASE_PATH` env var or default `./backtesting.db`
   - Resolves relative to backend directory ✅

4. **Cleanup**:
   - Automatic via script-execution.service.ts
   - Pattern match on 'backtest-*.ts' ✅

### Additional Safety Measures

**Error Handling** (Already in agent-learning.service.ts:276-287):
```typescript
} catch (error: any) {
  console.error(`Error backtesting ${ticker} on ${date}: ${error.message}`);
  // Clean up on error
  try {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  } catch {}
}
```

### Testing Plan

1. Create test script in backend directory
2. Verify imports resolve correctly
3. Run agent learning iteration
4. Verify cleanup occurs
5. Test concurrent executions (UUID prevents conflicts)

---

## 9. Implementation Steps

### Step 1: Update agent-learning.service.ts
```typescript
// Line 256
const scriptPath = path.join(__dirname, '../../', `agent-backtest-${scriptId}.ts`);
```

### Step 2: Verify Cleanup Pattern
- Ensure script-execution.service.ts cleanup matches agent script names
- Current pattern: `scriptPath.includes('backtest-')` ✅ Matches

### Step 3: Test
```bash
# Run a learning iteration
npm run test-learning-iteration

# Verify no leftover files
ls backend/agent-backtest-*.ts  # Should be empty
```

### Step 4: Monitor
- Check logs for module resolution errors
- Verify scripts execute successfully
- Confirm cleanup occurs

---

## 10. Conclusion

**Problem**: Agent execution scripts saved to `/tmp` cannot resolve relative imports because TypeScript module resolution is relative to the script file location, not the execution cwd.

**Solution**: Change agent-learning.service.ts to save scripts to backend directory instead of /tmp.

**Impact**:
- ✅ Fixes module resolution issues
- ✅ Consistent with scanner scripts
- ✅ Minimal code change (1 line)
- ✅ Existing cleanup handles temp files
- ✅ No script generation changes needed

**Next Steps**:
1. Apply the one-line fix to agent-learning.service.ts
2. Test with an agent learning iteration
3. Verify cleanup occurs
4. Monitor for any issues

---

## Appendix: File Locations Reference

### Scripts Storage
```
backend/
├── scanner-{timestamp}.ts           # Scanner scripts (temp, cleaned up)
├── agent-backtest-{uuid}.ts         # SHOULD BE HERE (currently in /tmp)
└── claude-generated-scripts/
    ├── scanner-{timestamp}.ts       # Permanent scanner scripts
    └── scanner-{timestamp}.json     # Scanner metadata
```

### Module Locations
```
backend/
├── node_modules/
│   └── dotenv/                      # npm packages
├── src/
│   └── database/
│       └── db.ts                    # Database module
└── .env                             # Environment config
```

### Service Files
```
backend/src/services/
├── script-execution.service.ts      # Executes scripts (cwd: backend)
├── scanner.service.ts               # ✅ Saves to backend directory
├── agent-learning.service.ts        # ❌ Saves to /tmp (NEEDS FIX)
└── batch-backtest.service.ts        # ✅ Saves to claude-generated-scripts/
```
