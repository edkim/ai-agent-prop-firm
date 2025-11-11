# Iteration 4: Zero Trades Analysis

**Date:** 2025-11-11
**Agent:** Gap and Go v2 (ID: 701ea2b4-082d-4562-8e89-308f686d538c)
**Branch:** fix-signal-direction-interface
**Status:** Investigation Complete

## Problem

Iteration 4 found 14 signals but executed 0 trades.

## Root Cause

The custom execution script hardcoded the wrong trade direction:

```typescript
// Line 137 in iteration 4 custom execution script
// CRITICAL: Use SHORT direction as specifiedconst side: 'LONG' | 'SHORT' = 'SHORT';
```

All 14 signals have `"direction": "LONG"`, but the script forced them to be SHORT trades.

## Why Zero Trades?

The market regime filter rejected all SHORT trades:

```typescript
// Lines 141-143
const regime = getMarketRegime(db, signal.signal_date);
if (side === 'SHORT' && regime.spyTrend === 'BULL' && regime.vixLevel === 'LOW') {
  return null; // Avoid counter-trend shorts in strong bull markets with low VIX
}
```

Since most signals were from Oct 27, 2025 (a likely bullish day with multiple gap-ups), all SHORT trades were filtered out.

## The Paradox

The fix from commit `f1bbefe` **IS present** in iteration 4:

- ✅ Signal interface includes `direction?: 'LONG' | 'SHORT'` field (line 13)
- ✅ All 14 signals have `"direction": "LONG"` correctly embedded (lines 325, 346, 367, etc.)
- ✅ Prompt explicitly states: "**ALWAYS use signal.direction if it exists!**" (line 1825 in claude.service.ts)
- ✅ Example code provided: `const side = signal.direction || 'LONG';`

**Yet Claude still hardcoded `'SHORT'` instead of using `signal.direction`!**

## Analysis

### Possible Reasons for Hardcoded SHORT

1. **Insufficient Prompt Strength**: The "ALWAYS use" instruction may not be strong enough to override Claude's inference from context
2. **Conflicting Context**: The strategy generation (Step 1) output might have mentioned SHORT trading, influencing the execution script generation
3. **Comment Confusion**: The comment "// CRITICAL: Use SHORT direction as specified" suggests Claude thought SHORT was explicitly requested somewhere
4. **Iteration History**: Previous iterations (especially iteration 3) used SHORT, potentially biasing the model

### Evidence from Generated Scripts

**Iteration 3** (84f6a55f-9216-4a13-a2f8-e81cd8c439ec-custom-execution.ts):
- Also hardcoded `const side = 'SHORT';` (line 122)
- Despite signals having LONG direction
- This was the original bug that prompted the fix

**Iteration 4** (48e64781-5ef8-4484-b971-c898688e18e9-custom-execution.ts):
- STILL hardcodes `const side = 'SHORT';` (line 137)
- Fix was present but ineffective

## Proposed Solutions

### Option 1: Make Direction Field Mandatory (Not Optional)

Change the Signal interface from:
```typescript
direction?: 'LONG' | 'SHORT';  // Optional
```

To:
```typescript
direction: 'LONG' | 'SHORT';  // Required
```

And update the example to:
```typescript
const side: 'LONG' | 'SHORT' = signal.direction;  // No fallback
```

### Option 2: Add Validation Error Message

Add a runtime check that throws an error if direction is missing or misused:

```typescript
if (!signal.direction) {
  throw new Error('Signal missing required direction field');
}
const side: 'LONG' | 'SHORT' = signal.direction;
```

### Option 3: Strengthen Prompt with Explicit Warning

Update the prompt to be more forceful:

```typescript
**⚠️ CRITICAL - Trade Direction (DO NOT HARDCODE!):**

YOU MUST use signal.direction! DO NOT hardcode 'LONG' or 'SHORT'!

Example (COPY THIS EXACTLY):
\`\`\`typescript
// Use the direction from the scanner signal
if (!signal.direction) {
  throw new Error('Signal missing direction field');
}
const side: 'LONG' | 'SHORT' = signal.direction;
\`\`\`

**WRONG (DO NOT DO THIS):**
❌ const side = 'LONG';
❌ const side = 'SHORT';
❌ const side = someInferredValue;
```

### Option 4: Pass Direction as Separate Parameter

Instead of embedding direction in the signal interface, pass it as a function parameter:

```typescript
async function executeSignal(
  signal: Signal,
  db: Database,
  tradeDirection: 'LONG' | 'SHORT'  // Explicit parameter
): Promise<Trade | null> {
  const side = tradeDirection;  // Can't be ignored
  // ...
}
```

## Recommendation

**Combine Options 1 and 3:**

1. Make `direction` a required field (not optional)
2. Strengthen the prompt with explicit warnings and anti-patterns
3. Show both correct and incorrect examples

This maximizes the chance that Claude will follow the instruction by:
- Making it impossible to ignore (TypeScript will error if omitted)
- Being extremely explicit about what NOT to do
- Providing clear examples of both right and wrong approaches

## Impact

If not fixed:
- Custom execution scripts will continue to use wrong trade directions
- Gap-up LONG strategies will be executed as gap-fade SHORT strategies
- Most trades will be filtered out by market regime filters
- Learning agent will fail to generate meaningful results

## Files Affected

- `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts` - Signal interface generation (lines 1609-1640)
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts` - Execution script prompt (lines 1824-1832)
- Generated execution scripts in `backend/generated-scripts/success/2025-11-11/`

## Next Steps

1. Implement recommended fix (make direction required + strengthen prompt)
2. Merge fix into `execution-script-evolution` branch (if not already there)
3. Restart backend server to ensure fix is loaded
4. Run iteration 5 to verify fix works
5. Check if iteration 5 correctly uses `signal.direction` and generates trades
