# Signal Embedding Analysis - AI Backtest Platform

## Overview
This document details how scanner signals are embedded/injected into custom execution scripts before they are run.

## Key Finding: The Embedding Flow

### 1. Scanner Execution & Signal Collection
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Method:** `executeScan()` (lines 445-487)
**Process:**
- Scanner script is executed via `scriptExecution.executeScript()`
- Returns raw scan results (array of signal objects)
- Example: Iteration 6 found 500 signals

### 2. Signal Filtering (CRITICAL FOR 200 CAP)
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Method:** `runBacktests()` (lines 493-772)
**Location:** Lines 507-508
**Code:**
```typescript
const filteredResults = this.applySignalFiltering(scanResults, DEFAULT_BACKTEST_CONFIG);
```

**Configuration:** Lines 34-40
```typescript
const DEFAULT_BACKTEST_CONFIG: AgentBacktestConfig = {
  max_signals_per_iteration: 200,     // CAP at 200 signals for statistical significance
  max_signals_per_ticker_date: 2,     // Max 2 signals per ticker per day
  max_signals_per_date: 200,          // Max 200 signals per unique date
  min_pattern_strength: 0,            // Minimum quality score (0 = accept all)
  backtest_timeout_ms: 120000,        // 2 minute timeout per backtest
};
```

**Filtering Logic:** Lines 1144-1220
The `applySignalFiltering()` method:
1. **Quality Filter:** Removes signals below min_pattern_strength (default: 0)
2. **Diversification:** Limits signals per ticker+date combination
3. **Per-Date Limit:** Ensures no single date dominates the signal set
4. **Sorting & Cap:** Sorts by pattern_strength and takes top 200

### 3. Signal Embedding INTO Execution Script
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Method:** `runBacktests()` continuation
**Location:** Lines 629-678
**This is where iteration 6's empty signals problem likely occurs!**

**The Embedding Code:**
```typescript
// Line 632: Prepare signals as JSON
const signalsJson = JSON.stringify(filteredResults, null, 2);

// Lines 635-638: Replace stdin-based signal loading
let scriptWithSignals = executionScript.replace(
  /const input = require\('fs'\)\.readFileSync\(0, 'utf-8'\);?\s*const signals = JSON\.parse\(input\);?/g,
  `const signals = ${signalsJson};`
);

// Lines 641-644: Replace empty placeholder (const signals = [];)
scriptWithSignals = scriptWithSignals.replace(
  /const signals\s*=\s*\[\s*\];?/g,
  `const signals = ${signalsJson};`
);
```

**Issues with Large Signal Arrays:**
When embedding 200 signals as JSON:
- Creates a massive JavaScript array literal in the generated script
- Example: `const signals = [{ ticker: "AAPL", ... }, { ticker: "GOOGL", ... }, ... × 200];`
- This embedded JSON could exceed reasonable TypeScript file sizes
- String replacement is naive - may miss edge cases

### 4. Additional Script Modifications
**Lines 646-675: Import Path & Database Fixes**
```typescript
// Fix relative imports for nested directory
scriptWithSignals = scriptWithSignals.replace(
  /from ['"]\.\.\/\.\.\/src\//g,
  `from '../../../src/`
);

// Add database initialization if missing
if (!scriptWithSignals.includes('initializeDatabase')) {
  scriptWithSignals = scriptWithSignals.replace(
    /import \{ getDatabase \} from ['"]\.\.\/\.\.\/\.\.\/src\/database\/db['"]/,
    `import { initializeDatabase, getDatabase } from '../../../src/database/db'`
  );
}

// Initialize database before execution
if (!scriptWithSignals.includes('initializeDatabase(')) {
  scriptWithSignals = scriptWithSignals.replace(
    /async function executeSignals\(signals: Signal\[\]\): Promise<Trade\[\]> \{[\s\S]*?const db = getDatabase\(\);/,
    (match) => {
      return match.replace(
        'const db = getDatabase();',
        `const dbPath = process.env.DATABASE_PATH || './backtesting.db';\n  initializeDatabase(dbPath);\n  const db = getDatabase();`
      );
    }
  );
}
```

### 5. Custom Execution Script Generation
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`
**Methods:** 
- `generateExecutionScriptFromStrategy()` (lines 1646-1796) - Iteration 1
- `generateExecutionScript()` (lines 1801+) - Iterations 2+

**Key prompt instruction (line 1676-1679):**
```
The code will receive:
- `SCANNER_SIGNALS`: Array of signals with fields: ticker, signal_date, signal_time, direction, metrics
- `results`: Array to push TradeResult objects
- Access to database via `helpers.getIntradayData(db, ticker, signal_date, timeframe)`
```

**However, the generated scripts expect:**
```typescript
const signals = [];  // Empty placeholder - gets replaced with actual signals later
```

## Root Cause Analysis: Why Iteration 6 Has Empty Signals

### The Problem Flow:
1. **Scanner finds 500 signals** ✓
2. **Signals are filtered to 200** ✓
3. **Custom execution script is generated with `const signals = [];`** ✓
4. **Signals SHOULD be embedded via regex replacement** 
5. **BUT execution script might be missing if:**
   - Custom script generation failed in step 2
   - Regex patterns don't match the generated script format
   - Script file not being written correctly

### Potential Issues:

1. **Missing `const signals = [];` placeholder in generated script**
   - Claude might generate code without this placeholder
   - Regex replacement (lines 641-644) would fail silently
   - Result: Script runs with undefined `signals` variable

2. **Script generation disabled or failed**
   - Line 105-127 regenerates execution script on iteration 2+
   - But only if `previousIteration` exists and has data
   - If generation fails, empty script gets used

3. **Regex replacement edge cases**
   - Regex expects specific format: `/const signals\s*=\s*\[\s*\];?/g`
   - Generated code might use different whitespace/formatting
   - Example: `const signals=[];` (no spaces) might match
   - Example: `const signals = [ ];` (extra space) might not match

## Configuration Issue: Signal Cap Changed 20 → 200

**Evidence in code:**
- Line 35: `max_signals_per_iteration: 200`
- This is compared to the recent change mentioned in context
- Increased from 20 to 200 signals per iteration
- Creates larger JSON embedded in scripts (40KB+ JSON possible)

**Potential Impact:**
- Larger signal JSON may cause TypeScript compilation issues
- Browser/Node.js memory constraints with inline arrays
- String replacement might be unreliable with massive data

## Files and Line Numbers Summary

| File | Location | Purpose |
|------|----------|---------|
| agent-learning.service.ts | 35-40 | Signal cap configuration (200) |
| agent-learning.service.ts | 105-127 | Execution script regeneration for iter 2+ |
| agent-learning.service.ts | 507-508 | Signal filtering call |
| agent-learning.service.ts | 1144-1220 | Signal filtering implementation |
| agent-learning.service.ts | 629-678 | **SIGNAL EMBEDDING** (critical) |
| agent-learning.service.ts | 493-772 | runBacktests() - overall flow |
| claude.service.ts | 1646-1796 | generateExecutionScriptFromStrategy() |
| claude.service.ts | 1801+ | generateExecutionScript() |

## Recommendations

1. **Add logging to debug signal embedding:**
   - Log signals before JSON.stringify()
   - Log script before/after replacement
   - Log regex match results

2. **Improve signal injection approach:**
   - Instead of regex replacement, use a proper script templating system
   - Consider passing signals via command-line args or env vars
   - Or write signals to a temporary JSON file and import it

3. **Add validation:**
   - Verify `const signals = []` exists in generated script
   - Verify signals were actually embedded post-replacement
   - Check for syntax errors before execution

4. **Monitor large signal arrays:**
   - Current 200-signal cap could create 40-60KB JSON
   - Consider alternative: pass signals via stdin (already supported in code comments)
   - Or split execution into batches

## Related Code References

**Signal Interface Expected:**
```typescript
interface Signal {
  ticker: string;
  signal_date: string;  // YYYY-MM-DD
  signal_time: string;  // HH:MM:SS
  direction: 'LONG' | 'SHORT';
  metrics: Record<string, any>;
  pattern_strength?: number;
  [key: string]: any;
}
```

**Template Configuration (line 45):**
```typescript
const ENABLE_TEMPLATE_EXECUTION = false;  // Currently disabled, only custom execution runs
```

