# 2025-11-12: Unified Execution Script Generation

## Summary

Merged two separate execution script generation paths into a single unified approach that works consistently across all iterations. This fixes the recurring "first-iteration field name bug" and simplifies the codebase by removing obsolete template-based logic.

## Problem Statement

The system previously used two different prompt functions for execution script generation:
1. **Iteration 1**: `generateExecutionScriptFromStrategy()` - Missing `results.push()` example
2. **Iteration 2+**: `generateExecutionScript()` - Had complete `results.push()` example with correct field names

### The Bug

Iteration 1 scripts consistently failed with TypeScript errors like:
```typescript
error TS2353: Object literal may only specify known properties, and 'date' does not exist in type 'TradeResult'.
```

**Root Cause**:
- Iteration 1 prompt showed signal destructuring but NO example of `results.push()`
- Claude would correctly extract `signal_date` from signals
- But then incorrectly shorten it to `date` when pushing to results
- TypeScript compilation failed because TradeResult expects `signal_date` not `date`

Iteration 2+ worked because:
- Execution script was regenerated in Step 2.5 with actual scanner signals
- `inferSignalInterface()` analyzed the actual signal structure
- Prompt included complete `results.push()` example with correct field names

## The Solution

### 1. Created Unified Function

**Location**: `/backend/src/services/claude.service.ts:1824`

```typescript
async generateExecutionScript(params: {
  agentInstructions: string;
  agentPersonality: string;
  patternFocus: string[];
  tradingStyle: string;
  riskTolerance: string;
  marketConditions: string[];
  scannerContext: string;
  actualScannerSignals: any[];  // Sample signals from actual scanner output
  // Optional: learnings from previous iterations
  previousIterationData?: {
    executionAnalysis?: any;
    agentKnowledge?: string;
  };
}): Promise<{ script: string; rationale: string; prompt: string; tokenUsage: any }>
```

**Key Features**:
- Accepts both iteration 1 parameters (agent config) AND iteration 2+ parameters (learnings)
- Makes learnings optional (undefined for iteration 1)
- **Always** uses `inferSignalInterface()` with actual scanner signals
- **Always** includes complete `results.push()` example
- Removed obsolete template references (winningTemplate, templatePerformances)
- Returns token usage for performance tracking

### 2. Simplified Learning Iteration Service

**Location**: `/backend/src/services/learning-iteration.service.ts`

**Changes**:
1. **Removed branching in `generateStrategy()`** (lines 478-483):
   - No longer generates execution script in Step 1
   - Sets placeholder that will be regenerated in Step 2.5

2. **Updated Step 2.5 to run for ALL iterations** (lines 141-181):
   - Removed `if (iterationNumber > 1)` check
   - Now runs for iteration 1, 2, 3, ... all iterations
   - Calls unified `generateExecutionScript()` function
   - Passes `previousIterationData` only for iteration 2+

### 3. Removed Duplicate Function

**Deleted**: `generateExecutionScriptFromStrategy()` - no longer needed!

## Benefits

✅ **Fixes First-Iteration Bug**: All iterations now use the same signal interface inference logic
✅ **Eliminates Code Duplication**: Single prompt function instead of two
✅ **Consistent Behavior**: Same execution logic for iteration 1, 2, 3, ...
✅ **Cleaner Codebase**: Removed 170 lines of obsolete code
✅ **Better Maintainability**: Only one place to update prompts
✅ **Removed Template References**: Cleaned up obsolete winningTemplate, templatePerformances logic

## Architecture Changes

### Before

```
Iteration 1:
  Step 1 → generateExecutionScriptFromStrategy() ❌ No signal interface, no results.push() example
  Step 2 → Run scan
  Step 2.5 → SKIPPED

Iteration 2+:
  Step 1 → generateExecutionScript() ⚠️ Uses templates, no actual signals yet
  Step 2 → Run scan
  Step 2.5 → generateExecutionScript() ✅ Has actual signals, has results.push() example
```

### After

```
All Iterations:
  Step 1 → Placeholder (will regenerate later)
  Step 2 → Run scan
  Step 2.5 → generateExecutionScript() ✅ ALWAYS has actual signals, always has results.push() example
```

## Files Modified

1. `/backend/src/services/claude.service.ts`
   - Lines 1651-1819: Deleted `generateExecutionScriptFromStrategy()`
   - Lines 1824-2086: Replaced `generateExecutionScript()` with unified version

2. `/backend/src/services/learning-iteration.service.ts`
   - Lines 478-483: Simplified execution script generation in `generateStrategy()`
   - Lines 141-181: Updated Step 2.5 to always run for all iterations

## Testing

**Test Case**: VWAP Drifter iteration 2
- Previously: Iteration 1 had field name errors (0 trades)
- After fix: Will regenerate iteration 2 to verify correct field names and successful trades

**Status**: ✅ Backend compiled successfully, no TypeScript errors
**Next**: Waiting for VWAP Drifter iteration 2 to complete to verify fix

## Technical Details

### Signal Interface Inference

The unified function always calls `inferSignalInterface()` which:
1. Analyzes actual scanner output (first 5 signals)
2. Detects field names like `signal_date`, `signal_time`, `direction`, `metrics`
3. Generates TypeScript interface string
4. Shows example signal as JSON

### Results.Push() Example

The prompt now ALWAYS includes:
```typescript
results.push({
  ticker,
  signal_date,           // ✅ Correct field name
  entry_time: entryBar.timeOfDay,
  exit_time: exitTime,
  direction: tradeDirection,
  entry_price: entryPrice,
  exit_price: exitPrice,
  shares: positionSize,
  pnl: pnl,
  pnl_percent: pnlPercent,
  exit_reason: exitReason,
  hold_time_minutes: holdTime
});
```

This gives Claude a concrete reference for the exact field names to use.

## Impact

- **Learning Iterations**: All iterations now use consistent, reliable execution script generation
- **Bug Fixes**: Eliminates recurring first-iteration TypeScript errors
- **Performance**: Same token usage, slightly cleaner code path
- **Maintenance**: Much easier to update prompts (single location)
- **Future**: Foundation for potential multi-model support (Haiku for faster phases)
