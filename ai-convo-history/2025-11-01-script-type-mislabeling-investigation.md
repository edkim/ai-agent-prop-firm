# Script Type Mislabeling Investigation - Root Cause Analysis

## Date: 2025-11-01
## Status: CRITICAL BUG IDENTIFIED - Root cause is NOT mislabeling

---

## Executive Summary

**THE MISLABELING IS NOT THE ROOT CAUSE** of backtests not generating trades. Instead, the system is **generating ONLY SCANNER scripts when it should be generating BOTH scanner AND execution scripts in sequence**. The mislabeling ("unknown" type) is a secondary symptom of a deeper workflow issue.

---

## Key Findings

### 1. Successful Script from 2025-11-01 19:52 (217e44e6-dcec-49c1-849b-052b55002b63)

**File:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-11-01/217e44e6-dcec-49c1-849b-052b55002b63-unknown.ts`

**Metadata:**
- scriptType: "unknown" (MISLABELED - should be "scanner")
- status: "success"
- signals: 69 (output was 69 scanner signals)
- executionTime: 2344ms

**Script Content Analysis:**
- Functions: `async function runScan()` - THIS IS A SCANNER SCRIPT
- Output: Array of 69 objects with fields: `ticker`, `signal_date`, `signal_time`, `direction`, `pattern_strength`, `metrics` (VWAP, entry price, volume ratio, etc.)
- Logic: Scans 100 tech stocks for "intraday fade opportunities" and outputs scanner signals
- Final output: `console.log(JSON.stringify(topResults, null, 2));`

**Conclusion:** This is 100% a SCANNER script, but labeled as "unknown" due to detection issue.

---

### 2. Failed Script from 2025-10-31 (078faf7a-613e-45f6-b7b8-caf663a12677)

**File:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/failed/2025-10-31/078faf7a-613e-45f6-b7b8-caf663a12677-scanner.ts`

**Metadata:**
- scriptType: "scanner" (correctly labeled)
- status: "failed" 
- compilationErrors: Multiple TypeScript errors

**Script Content Analysis:**
- STARTS with TradeResult interface definition
- Has ScannerSignal interface
- Has SCANNER_SIGNALS declaration
- Has helper functions for volume spike, rejection patterns, VWAP
- Main function: `async function runBacktest()`
- THIS IS AN EXECUTION SCRIPT, NOT A SCANNER SCRIPT

**Conclusion:** MISLABELED as "scanner" when it's actually an EXECUTION script. The filename has "-scanner.ts" but the code is execution logic.

---

### 3. Successful Script from 2025-10-31 (35376f9d-a72b-448a-acb6-0313ee16e4ab)

**File:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-10-31/35376f9d-a72b-448a-acb6-0313ee16e4ab-unknown.ts`

**Script Content Analysis:**
- Defines `interface ScanMatch` (scanner output format)
- Defines `interface BarWithVWAP` (internal calculation)
- Function: `function calculateVWAPForBars()` - scanner logic
- Function: `function detectMeanReversionPattern()` - scanner pattern detection
- THIS IS A SCANNER SCRIPT

**Conclusion:** Another "unknown" mislabeled SCANNER script.

---

## The detectScriptType() Problem

**Location:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/script-execution.service.ts:142-156`

```typescript
private detectScriptType(fileName: string, content: string): 'scanner' | 'execution' | 'unknown' {
    // Check filename first
    if (fileName.includes('scanner')) return 'scanner';
    if (fileName.includes('execution')) return 'execution';

    // Check content for indicators
    if (content.includes('SCANNER_SIGNALS') || content.includes('// Scanner script')) {
      return 'scanner';
    }
    if (content.includes('TradeResult') || content.includes('// Execution script')) {
      return 'execution';
    }

    return 'unknown';
  }
```

**Why Detection Fails:**

1. **For SCANNER scripts generating 69 signals:**
   - Filename: `217e44e6-dcec-49c1-849b-052b55002b63-unknown.ts` (no "scanner" in name - detection FAILS)
   - Content: Does NOT contain `SCANNER_SIGNALS` (not injected - it generates them)
   - Content: Does NOT contain `// Scanner script` comment
   - Content: Does NOT contain `TradeResult` 
   - Result: Returns "unknown" (CORRECT detection that file isn't labeled correctly)

2. **For EXECUTION scripts with failures:**
   - Filename: `078faf7a-613e-45f6-b7b8-caf663a12677-scanner.ts` (HAS "scanner" - detection PASSES)
   - The filename check happens FIRST and returns 'scanner' immediately
   - Never checks content, so doesn't realize it's actually an execution script
   - Result: Returns "scanner" (WRONG - mislabeled due to filename trust)

---

## The Real Problem: Missing Execution Scripts

**Evidence from successful scripts directory:**

All files in `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-10-31/`:
- `35376f9d-a72b-448a-acb6-0313ee16e4ab-unknown.ts` - SCANNER
- `570c8f18-84bc-47a9-bf64-ddc9ac6bc37a-unknown.ts` - SCANNER (500 signals)
- `d60fe659-b37b-4c29-badb-e24baba75a14-unknown.ts` - likely SCANNER
- `44b9f384-20e0-4177-bf30-2a7bf480d465-unknown.ts` - likely SCANNER
- `b6fd181a-69f5-4a7a-ad4d-f0956fc2339c-unknown.ts` - likely SCANNER
- `636c3109-2633-4546-bda6-40155e384031-unknown.ts` - likely SCANNER
- `3dc149c6-5bd6-4ceb-b60f-011a97893f96-unknown.ts` - likely SCANNER

**OBSERVATION:** All successful scripts from 2025-10-31 are labeled "unknown" and are SCANNER scripts. **NO EXECUTION SCRIPTS IN SUCCESS FOLDER.**

All files in `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/failed/2025-10-31/`:
- `078faf7a-613e-45f6-b7b8-caf663a12677-scanner.ts` - Actually an EXECUTION script (failed to compile)
- `83eb2a11-af3c-426c-9ede-2ac83d934340-scanner.ts` - Likely EXECUTION (failed)
- `9d1c88bb-6a96-489b-85bd-d71773e4939d-scanner.ts` - Likely EXECUTION (failed)
- `a1ab87fc-a46d-4f4e-834c-a35f351b9509-scanner.ts` - Likely EXECUTION (failed)

---

## The Learning Loop Workflow Issue

**From agent-learning.service.ts:63-92:**

```typescript
async runIteration(agentId: string): Promise<IterationResult> {
  // Step 1: Generate strategy (scan + execution)
  const strategy = await this.generateStrategy(agent, iterationNumber);
  
  // Step 2: Execute scan
  const scanResults = await this.executeScan(strategy.scanScript);
  
  // Step 3: Run backtests on scan results
  const backtestResults = await this.runBacktests(strategy.executionScript, scanResults);
  ...
}
```

**What SHOULD happen:**
1. Generate BOTH scanScript and executionScript
2. Run scanScript → get array of signals (69 signals from 217e44e6)
3. Run executionScript with those signals injected → get trades with PnL

**What IS happening:**
1. Only SCANNER scripts are being successfully generated
2. EXECUTION scripts fail to compile
3. No trades are generated because execution scripts never run successfully

---

## Root Cause Summary

1. **PRIMARY CAUSE:** Claude is generating EXECUTION scripts with TypeScript compilation errors
   - Missing property errors (e.g., `volume_ratio`)
   - Type mismatches (e.g., `null` assigned to `string`)
   - Syntax errors in PnL calculation

2. **SECONDARY CAUSE:** Failed execution scripts fallback to "scanner" label based on filename
   - Filename trust in detectScriptType() causes wrong labeling
   - Makes investigation harder because "scanner.ts" files contain execution code

3. **TERTIARY ISSUE:** Successful scanner scripts not labeled correctly
   - Labeled as "unknown" instead of "scanner"
   - Not a functional problem, but makes analysis confusing

---

## Why Backtests Aren't Generating Trades

The execution flow fails at Step 3:

```typescript
// Step 3: Run backtests on scan results
const backtestResults = await this.runBacktests(strategy.executionScript, scanResults);
```

The `executionScript` fails to compile because Claude is generating invalid TypeScript. When it fails, `backtestResults.totalTrades === 0`, which triggers the fallback analysis (lines 98-108).

The system then continues with empty analysis instead of actual trade data, which is why backtests appear to run but generate no trades.

---

## Recommended Fix Priority

1. **CRITICAL:** Fix Claude's execution script generation to eliminate TypeScript errors
   - Add validation rules in the prompt
   - Verify all properties exist before accessing them
   - Test syntax before submitting

2. **HIGH:** Fix detectScriptType() to check content before filename
   - Filename can be wrong; content is authoritative
   - Check for `interface TradeResult` for execution scripts
   - Check for `runScan()` or `async function run()` for scanner scripts

3. **MEDIUM:** Add explicit type labels in script templates
   - Add `// Script type: SCANNER` or `// Script type: EXECUTION` comment
   - Helps detection and debugging
   - Makes intent explicit in generated code

---

## Evidence Files

- Successful scanner (mislabeled unknown): `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-11-01/217e44e6-dcec-49c1-849b-052b55002b63-unknown.ts`
- Failed execution (mislabeled scanner): `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/failed/2025-10-31/078faf7a-613e-45f6-b7b8-caf663a12677-scanner.ts`
- Successful scanner (mislabeled unknown): `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-10-31/35376f9d-a72b-448a-acb6-0313ee16e4ab-unknown.ts`

