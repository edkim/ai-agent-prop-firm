# Investigation: Scanner vs Execution Script Generation

## Date
2025-11-01

## Objective
Understand why the learning agent system is generating scanner scripts instead of execution scripts for the General Day Trader agent.

## Investigation Summary

### The Problem
The learning agent system is generating **scanner-like execution scripts** that have the structure of backtest execution scripts but are being labeled as "scanner" scripts in the metadata. This is causing confusion and likely preventing proper integration with the learning workflow.

---

## Root Cause Analysis

### 1. Agent Configuration
**Location:** Database query results for agent `570261bf-bb9a-4f99-98cd-6ddec0ae7caa`

```
Name: General Day Trader
Trading Style: day_trader
Risk Tolerance: moderate
Instructions: "Intraday scalper that fades overextended moves in both directions. 
Look for stocks that have moved too far intraday (2%+ in first hour) and fade 
them back to VWAP or previous support/resistance. Trade both long (fade downs) 
and short (fade ups) with tight stops. Focus on high-volume tech stocks in 
trending or ranging markets."
```

**Finding:** The agent has custom instructions that clearly define an execution strategy, NOT a scanning strategy. The instructions describe WHEN and HOW to trade, not WHAT to scan for.

---

### 2. Learning Workflow Code Analysis

**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`

#### Key Method: `generateStrategy()` (lines 181-269)

The workflow generates TWO scripts:

1. **Scanner Script** (lines 196-227):
   - Uses `claude.generateScannerScript()` 
   - Purpose: Find pattern matches across universe of stocks
   - Output: Array of `ScanMatch` objects with ticker, date, time, pattern_strength

2. **Execution Script** (lines 229-268):
   - Uses `claude.generateScript()` with `strategyType: 'signal_based'`
   - Purpose: Execute trades based on scanner signals
   - Should receive SCANNER_SIGNALS as input

**The Critical Code (lines 252-258):**
```typescript
console.log(`   Generating signal-based execution script with Claude...`);
const executionResult = await this.claude.generateScript(executionPrompt, {
  strategyType: 'signal_based',  // ← THIS IS THE KEY PARAMETER
  ticker: 'TEMPLATE_TICKER',
  timeframe: agent.timeframe || '5min',
  specificDates: [this.getDateDaysAgo(5)],
  config: config
});
```

---

### 3. Claude Service Analysis

**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`

#### Method: `generateScript()` (lines 42-85)

**The Issue:** This method receives `params: ScriptGenerationParams` which includes:
```typescript
interface ScriptGenerationParams {
  strategyType: 'orb' | 'momentum' | 'mean-reversion' | 'custom';  // ← NO 'signal_based'!
  ticker: string;
  date?: string;
  dateRange?: { from: string; to: string };
  specificDates?: string[];
  timeframe: string;
  config: ORBScriptConfig | Record<string, any>;
}
```

**PROBLEM IDENTIFIED:** 
- `agent-learning.service.ts` passes `strategyType: 'signal_based'`
- But `ScriptGenerationParams` type only allows: `'orb' | 'momentum' | 'mean-reversion' | 'custom'`
- TypeScript should have caught this, but it's being passed as `any` or being coerced

#### The System Prompt (lines 224-520)

The system prompt for `generateScript()` is designed for **EXECUTION scripts**, not scanner scripts. It includes:
- Signal-based execution patterns (lines 388-458)
- `SCANNER_SIGNALS` interface and usage
- Next-bar entry logic
- Trade execution and exit rules

**But:** The prompt doesn't explicitly handle `strategyType: 'signal_based'` as a distinct case.

---

### 4. Metadata Labeling Issue

**File:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/failed/2025-10-31/078faf7a-613e-45f6-b7b8-caf663a12677-metadata.json`

```json
{
  "scriptType": "scanner",  // ← WHY IS THIS "scanner"?
  "status": "failed",
  ...
}
```

**Finding:** The generated script has backtest execution code (with `TradeResult`, `Bar`, signal processing), but the metadata labels it as "scanner". This suggests:
1. The script preservation system is mislabeling execution scripts
2. OR the Claude service is generating hybrid scripts that don't match expectations

---

### 5. Generated Script Analysis

**File:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/failed/2025-10-31/078faf7a-613e-45f6-b7b8-caf663a12677-scanner.ts`

The script contains:
```typescript
interface TradeResult { ... }  // Execution script interface
interface ScannerSignal { ... } // Scanner signal interface  
declare const SCANNER_SIGNALS: ScannerSignal[] | undefined;  // Signal-based execution

async function runBacktest() { ... }  // Backtest execution logic
```

**This is clearly an EXECUTION script**, not a scanner script!

**The TypeScript errors:**
1. `Type 'null' is not assignable to type 'string'` - Null handling issue
2. `Property 'volume_ratio' does not exist` - Scanner signal metrics mismatch
3. Syntax error - Incomplete code generation

---

## WHY Scanner Scripts Are Being Generated Instead of Execution Scripts

### The Answer: **They're NOT!**

The system IS generating execution scripts correctly, but:

1. **Mislabeling Issue:** The script preservation system or metadata generator is incorrectly labeling execution scripts as "scanner" scripts in the filename and metadata.

2. **Type System Issue:** The `strategyType: 'signal_based'` parameter being passed doesn't match the `ScriptGenerationParams` type definition, creating a type mismatch that may affect prompt construction.

3. **Prompt Ambiguity:** The Claude system prompt doesn't explicitly distinguish between scanner and execution script generation when `strategyType: 'signal_based'` is used.

---

## WHAT Code/Config Determines Script Type

### Script Type Determination Flow:

1. **Agent Learning Service** (`agent-learning.service.ts:generateStrategy()`):
   - Explicitly calls TWO methods:
     - `claude.generateScannerScript()` → Scanner script
     - `claude.generateScript()` → Execution script
   
2. **Claude Service** (`claude.service.ts`):
   - `generateScannerScript()` → Uses `buildScannerSystemPrompt()` → Outputs scanner scripts
   - `generateScript()` → Uses `buildSystemPrompt()` → Outputs execution scripts

3. **Script Preservation** (likely in `script-execution.service.ts` or similar):
   - Labels scripts based on... unknown criteria
   - **BUG:** Is labeling execution scripts as "scanner" scripts

---

## HOW to Fix It

### Fix 1: Update ScriptGenerationParams Type
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/types/script.types.ts`

```typescript
export interface ScriptGenerationParams {
  strategyType: 'orb' | 'momentum' | 'mean-reversion' | 'custom' | 'signal_based';  // Add 'signal_based'
  ticker: string;
  date?: string;
  dateRange?: { from: string; to: string };
  specificDates?: string[];
  timeframe: string;
  config: ORBScriptConfig | Record<string, any>;
}
```

### Fix 2: Investigate Script Preservation Labeling
**Next Steps:**
1. Find where script metadata is generated (likely `script-execution.service.ts`)
2. Identify why execution scripts are being labeled as "scanner"
3. Fix the labeling logic to correctly identify:
   - Scanner scripts: Output `ScanMatch[]`, query database for patterns
   - Execution scripts: Output `TradeResult[]`, execute trades based on signals

### Fix 3: Enhance Claude Prompt Clarity
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`

Add explicit handling for `signal_based` strategy type in the user message builder:

```typescript
private buildUserMessage(userPrompt: string, params: ScriptGenerationParams): string {
  let strategyNote = '';
  if (params.strategyType === 'signal_based') {
    strategyNote = `
IMPORTANT: This is a SIGNAL-BASED EXECUTION script.
- It MUST declare and check for SCANNER_SIGNALS
- It should enter trades at the next bar after signal detection
- Include proper exit rules and risk management
`;
  }
  
  return `Generate a backtest script for the following strategy:

USER STRATEGY: ${userPrompt}
${strategyNote}
PARAMETERS:
- Ticker: ${params.ticker}
- Timeframe: ${params.timeframe}
- Strategy Type: ${params.strategyType}

Please generate a complete, runnable TypeScript backtest script following the structure and guidelines provided.`;
}
```

### Fix 4: Verify Two-Script Architecture
**Confirm that:**
1. Scanner scripts are being generated and executed first
2. Scanner results are being passed to execution scripts
3. Both scripts are being saved with correct labels
4. The learning workflow properly chains them together

---

## Recommended Action Plan

1. **Immediate:** Search for script preservation/metadata code to find mislabeling bug
2. **Quick Fix:** Add `'signal_based'` to `ScriptGenerationParams.strategyType` union type
3. **Medium Term:** Audit script generation → execution → preservation flow
4. **Long Term:** Add validation/tests to ensure correct script type labeling

---

## Additional Observations

### TypeScript Compilation Errors in Generated Scripts
The failed scripts show common issues:
1. Null handling: `Type 'null' is not assignable to type 'string'`
2. Metrics interface mismatches between scanner and execution
3. Incomplete code generation (syntax errors)

These suggest the Claude prompt needs refinement to ensure:
- Proper TypeScript null handling (`string | null` or initialize with `''`)
- Consistent interfaces between scanner signal metrics and execution script expectations
- Complete code generation without truncation

---

## Conclusion

**Root Cause:** The system IS generating execution scripts, but they're being incorrectly labeled as "scanner" scripts in the preservation metadata. The underlying issue is a combination of:
1. Type system mismatch (`'signal_based'` not in allowed types)
2. Script preservation labeling bug
3. Insufficient prompt clarity for signal-based execution

**Next Steps:** 
1. Find and fix script labeling bug in preservation system
2. Update type definitions to include `'signal_based'`
3. Enhance Claude prompts for clearer distinction
4. Add validation tests for script type detection

---

## UPDATE: ROOT CAUSE IDENTIFIED

### The Exact Bug Location
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/script-execution.service.ts`
**Method:** `detectScriptType()` (lines 142-156)

```typescript
private detectScriptType(fileName: string, content: string): 'scanner' | 'execution' | 'unknown' {
  // Check filename first
  if (fileName.includes('scanner')) return 'scanner';
  if (fileName.includes('execution')) return 'execution';

  // Check content for indicators
  if (content.includes('SCANNER_SIGNALS') || content.includes('// Scanner script')) {
    return 'scanner';  // ← BUG: This is WRONG!
  }
  if (content.includes('TradeResult') || content.includes('// Execution script')) {
    return 'execution';
  }

  return 'unknown';
}
```

### The Bug Explanation

**The Problem:**
Line 148-149 checks if the script content includes `SCANNER_SIGNALS` and labels it as a "scanner" script. This is INCORRECT logic because:

1. **Scanner scripts OUTPUT scanner signals** - They query the database and return `ScanMatch[]` arrays
2. **Execution scripts CONSUME scanner signals** - They declare `SCANNER_SIGNALS` as input and execute trades

The condition is backwards! Scripts that DECLARE `SCANNER_SIGNALS` are **execution scripts** that receive signals, not scanner scripts that generate them.

### Current (Broken) Logic:
```
Has "SCANNER_SIGNALS" in content → Label as "scanner" ❌ WRONG
```

### Correct Logic Should Be:
```
Has "SCANNER_SIGNALS" in content → Label as "execution" ✅ CORRECT
Has "ScanMatch" interface → Label as "scanner" ✅ CORRECT
```

### Why This Causes the Observed Behavior

1. Agent learning service generates execution scripts with `declare const SCANNER_SIGNALS: ScannerSignal[] | undefined;`
2. Script execution service reads the script content
3. `detectScriptType()` finds "SCANNER_SIGNALS" in the content
4. **Incorrectly labels it as "scanner"** (line 149)
5. Saves with filename pattern: `{uuid}-scanner.ts`
6. Saves metadata with: `"scriptType": "scanner"`

Result: Execution scripts are mislabeled as scanner scripts in the preservation system!

---

## THE FIX

### Fix the detectScriptType() method:

```typescript
private detectScriptType(fileName: string, content: string): 'scanner' | 'execution' | 'unknown' {
  // Check filename first
  if (fileName.includes('scanner') || fileName.includes('scan-')) return 'scanner';
  if (fileName.includes('execution') || fileName.includes('backtest-')) return 'execution';

  // Check content for indicators
  // Scanner scripts OUTPUT ScanMatch results
  if (content.includes('interface ScanMatch') || 
      content.includes('// Scanner script') ||
      content.includes('ScanMatch[]')) {
    return 'scanner';
  }
  
  // Execution scripts CONSUME SCANNER_SIGNALS and OUTPUT TradeResult
  if (content.includes('SCANNER_SIGNALS') || 
      content.includes('interface TradeResult') || 
      content.includes('// Execution script') ||
      content.includes('TradeResult[]')) {
    return 'execution';
  }

  return 'unknown';
}
```

### Key Changes:
1. **Remove** the incorrect `SCANNER_SIGNALS` → scanner logic
2. **Add** check for `interface ScanMatch` to identify true scanner scripts
3. **Move** `SCANNER_SIGNALS` check to execution script detection
4. **Add** filename pattern checks for `scan-` and `backtest-` prefixes
5. **Prioritize** filename checks before content analysis

---

## Verification

### Check filename patterns used by agent learning service:
- **Scanner scripts:** `agent-scan-{uuid}.ts` (line 276 in agent-learning.service.ts)
- **Execution scripts:** `agent-backtest-{uuid}.ts` (line 355 in agent-learning.service.ts)

With the fix:
- Files named `agent-scan-*.ts` → Correctly labeled "scanner"
- Files named `agent-backtest-*.ts` → Correctly labeled "execution" (currently mislabeled)
- Content with `SCANNER_SIGNALS` → Correctly labeled "execution" (currently mislabeled)

---

## Summary

**Root Cause:** Logic inversion in `detectScriptType()` - it labels scripts that CONSUME signals as scanners, when they should be labeled as execution scripts.

**Impact:** All signal-based execution scripts generated by the learning agent are mislabeled as "scanner" scripts in the preservation system.

**Fix:** Reverse the logic to check for `ScanMatch` interface for scanners and `SCANNER_SIGNALS` declaration for execution scripts.

**Additional Fixes Needed:**
1. Update `ScriptGenerationParams` type to include `'signal_based'`
2. Enhance Claude prompt to be more explicit about signal-based execution
3. Add validation tests to prevent future logic inversions
