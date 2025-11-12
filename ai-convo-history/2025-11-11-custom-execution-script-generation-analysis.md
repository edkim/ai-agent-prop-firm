# Custom Execution Script Generation - Codebase Analysis

## Summary

Custom execution scripts are generated in the AI Backtest backend through a multi-file system that orchestrates Claude AI-generated code. The generation process involves three main service layers, with "executionPrompt" fields serving as fallback descriptions when script generation doesn't return explicit prompt metadata.

## Key Files Involved

### 1. `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`

**Primary Responsibility**: Claude API wrapper for script generation

**Key Methods**:

#### `generateExecutionScriptFromStrategy()` (lines 1646-1758)
- Generates strategy-aligned custom execution scripts for **iteration 1 only**
- Input: Agent instructions, personality, pattern focus, trading style, risk tolerance, market conditions
- Returns: `{ script, rationale, tokenUsage }`
- **No executionPrompt field** - returns only script, rationale, and tokenUsage
- Invoked when `iterationNumber === 1` in agent-learning service

#### `generateExecutionScript()` (lines 1763-1979)
- Generates refined execution scripts based on previous iteration learnings
- Input: Previous template performance, execution analysis, agent knowledge, actual scanner signals
- Returns: `{ script, rationale }` (parsed from Claude's JSON response)
- **No executionPrompt field** - returns only script and rationale
- Invoked for `iterationNumber > 1` when previous backtest results exist

**System Prompts Used**:
- Detailed instruction sets for Claude to generate TypeScript code
- Emphasizes intraday bar data handling, signal processing, and execution strategy
- Includes working examples and critical requirements

### 2. `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`

**Primary Responsibility**: Orchestrates the learning iteration workflow

**Key Method**: `generateStrategy()` (lines 312-440)

**Location of Fallback `executionPrompt`** (lines 427-439):

```typescript
const rationale = iterationNumber === 1
  ? `Initial strategy: ${scannerResult.explanation}. ${executionRationale}`
  : `Iteration ${iterationNumber}: Applied learnings to refine scanner. ${executionRationale}`;

return {
  scanScript: scannerResult.script,
  executionScript,  // Empty for iteration 1, custom script for iteration 2+
  rationale,
  scannerTokenUsage: scannerResult.tokenUsage,
  executionTokenUsage,
  scannerPrompt: scannerResult.prompt || scannerQuery,
  executionPrompt: executionResult?.prompt || `Generated ${iterationNumber === 1 ? 'initial' : 'refined'} execution script`
  //                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                                           FALLBACK TEXT - Line 438
};
```

**Fallback Pattern**:
- If `executionResult?.prompt` exists, use it
- **Otherwise**, use: `Generated initial execution script` (iteration 1) or `Generated refined execution script` (iteration 2+)

**Full Workflow** (lines 312-440):

1. **Iteration 1** (lines 379-398):
   - Calls `claude.generateExecutionScriptFromStrategy()`
   - Sets `executionRationale` from the result
   - executionResult has no `.prompt` field, so fallback text is used

2. **Iteration 2+** (lines 399-425):
   - Calls `claude.generateExecutionScript()` with previous learnings
   - Sets `executionRationale` from the result
   - executionResult has no `.prompt` field, so fallback text is used
   - Fallback becomes: "Generated refined execution script"

3. **Special Case** (lines 105-127):
   - If iteration > 1 AND signals found, regenerates execution script with actual scanner signals
   - This uses the same Claude methods with actual signal samples
   - Still uses the fallback text pattern

## Execution Flow Diagram

```
runIteration() [line 73]
    ↓
generateStrategy() [line 89]
    ├─ Iteration 1:
    │  ├─ generateScannerScript() → scannerResult
    │  ├─ generateExecutionScriptFromStrategy() → executionResult (no .prompt field)
    │  └─ executionPrompt = "Generated initial execution script" [FALLBACK]
    │
    └─ Iteration 2+:
       ├─ generateScannerScript() → scannerResult
       ├─ generateExecutionScript() → executionResult (no .prompt field)
       └─ executionPrompt = "Generated refined execution script" [FALLBACK]
```

## Storage & Usage

**Where executionPrompt is stored**:
- In `agent_iterations` database table (line 1016 of agent-learning.service.ts)
- Column: `execution_prompt`
- Value: String (either Claude response .prompt or fallback text)

**Accessed via**:
- Database query: `SELECT * FROM agent_iterations WHERE id = ?`
- Used for iteration history and audit trails
- Not directly used in execution - for documentation purposes

## Key Observations

### 1. Fallback Trigger Conditions
- **Always triggered** because Claude methods don't return a `.prompt` field
- The fallback text is used for every iteration, not just error cases
- Design assumes prompt metadata isn't needed; only script and rationale matter

### 2. Distinction Between Fields
- `rationale`: Detailed explanation of script (returned by Claude)
- `executionPrompt`: Generic descriptor ("Generated initial/refined execution script")
- `executionScript`: Actual TypeScript code

### 3. Signal Integration (Lines 105-127)
- When signals are available in iteration 2+, execution script is regenerated
- Uses actual signal samples to ensure proper field mapping
- Still follows same fallback pattern for executionPrompt

### 4. Template Execution (Lines 493-723)
- Separate from custom script generation
- Tests 5 execution templates vs custom script
- Uses `ENABLE_TEMPLATE_EXECUTION` flag to control template testing

## Files That Reference executionPrompt

1. `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts` (line 438)
   - Sets initial executionPrompt value

2. `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts` (line 1016)
   - Stores in database during iteration save

3. Database schema: `agent_iterations.execution_prompt` column
   - Stores the prompt text for audit/history

## Related Configuration

### ENABLE_TEMPLATE_EXECUTION (line 45)
```typescript
const ENABLE_TEMPLATE_EXECUTION = false;
```
- Controls whether template library is tested
- When false: only custom execution scripts are tested
- When true: all 5 templates tested and compared

### DEFAULT_BACKTEST_CONFIG (lines 34-40)
```typescript
const DEFAULT_BACKTEST_CONFIG: AgentBacktestConfig = {
  max_signals_per_iteration: 20,      // Cap at 20 signals
  max_signals_per_ticker_date: 2,     // Max 2 signals per ticker per day
  max_signals_per_date: 20,           // Max 20 signals per unique date
  min_pattern_strength: 0,            // Minimum quality score
  backtest_timeout_ms: 120000,        // 2 minute timeout
};
```

## No Malware Detection

This code is a legitimate trading strategy backtesting system with no malicious intent or behavior detected. The codebase demonstrates:
- Proper error handling
- Database safety (parameterized queries)
- Resource limits (signal filtering, timeout management)
- Audit trails (iteration logging)

---

**Document Created**: 2025-11-11
**Status**: Complete
