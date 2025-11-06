# Execution Script Evolution Implementation

**Date:** 2025-11-06
**Branch:** execution-script-evolution

## Summary

Added execution script evolution to the learning iteration system. Learning agents now evolve both their scanning AND execution logic across iterations.

## Key Changes

### 1. Enhanced Type Definitions (`backend/src/types/agent.types.ts`)

- **Added new refinement types:**
  - `execution_timing`: Adjust entry timing relative to signal
  - `exit_strategy`: Modify stop/target logic
  - `position_sizing`: Dynamic sizing based on signal strength

- **Added ExecutionAnalysis interface:**
  ```typescript
  interface ExecutionAnalysis {
    template_comparison: string;
    exit_timing_issues: string[];
    stop_loss_effectiveness: string;
    take_profit_effectiveness: string;
    suggested_improvements: string[];
  }
  ```

- **Updated ExpertAnalysis to include execution_analysis field**

### 2. Enhanced Claude Analysis (`backend/src/services/claude.service.ts`)

- **Updated `analyzeBacktestResults()`:**
  - Now shows all 5 template performances to Claude
  - Asks Claude to compare templates and explain which works best
  - Requests execution_analysis section with specific execution insights
  - Analyzes stop loss/take profit effectiveness
  - Identifies exit timing issues

- **Added `generateExecutionScript()` method:**
  - Takes previous winning template + all template performances
  - Incorporates execution analysis from previous iteration
  - Uses agent's accumulated knowledge
  - Generates custom TypeScript execution script
  - Returns both script and rationale for improvements

### 3. Updated Learning Service (`backend/src/services/agent-learning.service.ts`)

- **Added `getPreviousIteration()` helper:**
  - Retrieves previous iteration data including backtest results and analysis
  - Parses JSON fields automatically

- **Updated `generateStrategy()`:**
  - **Iteration 1:** Uses template library (tests all 5 templates, keeps best)
  - **Iteration 2+:** Calls `generateExecutionScript()` with:
    - Winning template from iteration 1
    - All template performance comparisons
    - Execution analysis insights
    - Agent's accumulated knowledge
    - Scanner context

- **Updated `runBacktests()`:**
  - Tests custom execution script if provided (iteration 2+)
  - Adds custom script results to templateResults array
  - Labels as "Custom Execution (Claude-Generated)"
  - Allows custom script to compete with templates for winner position
  - Sorts by profit factor - best wins regardless of source

### 4. Enhanced Knowledge Extraction (`backend/src/services/agent-knowledge-extraction.service.ts`)

- **Added `mapExecutionAnalysisToKnowledge()`:**
  - Extracts execution preferences from template comparisons
  - Captures stop loss effectiveness insights
  - Captures take profit effectiveness insights
  - Identifies exit timing issues as negative pattern rules
  - Stores execution improvement suggestions

- **Knowledge types extracted:**
  - `PARAMETER_PREF`: Template preferences, stop/target effectiveness
  - `PATTERN_RULE`: Exit timing issues (what not to do)
  - `INSIGHT`: Execution improvement suggestions

## How It Works

### Iteration 1
1. Generate scanner script using Claude
2. Test all 5 execution templates on scan results
3. Pick winning template based on profit factor
4. Claude analyzes results including execution performance
5. Extract execution knowledge for future use

### Iteration 2+
1. Generate improved scanner script using learnings
2. **Generate custom execution script** using:
   - Previous winning template as starting point
   - Analysis of what worked/didn't work in all templates
   - Accumulated execution knowledge
   - Pattern-specific characteristics
3. Test custom script alongside 5 templates
4. Pick overall winner (custom vs templates)
5. Claude analyzes results
6. Extract more execution knowledge

## Expected Benefits

1. **Specialized Execution:** Each agent develops execution logic tailored to its specific pattern
2. **Continuous Improvement:** Execution strategy evolves based on what actually works
3. **Best of Both Worlds:**
   - Iteration 1: Comprehensive template testing
   - Iteration 2+: Custom optimization
4. **Knowledge Accumulation:** Execution insights compound over iterations
5. **Pattern-Specific:** Exit strategies adapt to pattern characteristics (mean reversion vs trend following, etc.)

## Example Evolution Path

### Iteration 1
- Tests: Conservative, Aggressive, Time-Based, ATR-Adaptive, Price Action
- Winner: Time-Based (2hr max hold, 2% stops, 3% targets)
- Claude notes: "Stops too tight, losers exit in 10-20 min before reversion"

### Iteration 2
- Custom script generated with:
  - Loosened stops to 2.5% (learned from iteration 1)
  - Added 30-min minimum hold before stop
  - Kept 2hr max hold (worked well)
  - Added volume-weighted exit timing
- Tests: Custom + all 5 templates
- Winner: Custom script outperforms all templates

### Iteration 3
- Further refinements based on iteration 2 results
- Continues to compound improvements

## Files Modified

1. `backend/src/types/agent.types.ts` - Type definitions
2. `backend/src/services/claude.service.ts` - Claude API integration
3. `backend/src/services/agent-learning.service.ts` - Learning iteration logic
4. `backend/src/services/agent-knowledge-extraction.service.ts` - Knowledge extraction

## Testing

The implementation will be tested through:
1. Running iteration 1 on existing agent (should work as before)
2. Running iteration 2 to trigger custom script generation
3. Verifying custom script competes with templates
4. Checking knowledge extraction includes execution insights

## Next Steps

1. Test with VWAP Mean Reversion Trader (already has iteration 1)
2. Monitor custom script performance vs templates
3. Validate knowledge accumulation across iterations
4. Consider adding execution-specific convergence metrics
