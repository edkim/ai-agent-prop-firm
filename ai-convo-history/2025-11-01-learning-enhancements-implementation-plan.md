# Learning System Enhancements - Implementation Plan

**Date**: 2025-11-01
**Status**: Planning
**Priority**: High
**Companion Document**: 2025-11-01-scanner-execution-alignment-strategy.md

---

## Executive Summary

This document outlines the implementation plan for five major enhancements to the learning system:

1. **Execution Template Library** - Reusable, proven exit strategies
2. **Multiple Execution Scripts per Scan** - Test 3-5 exits per scan
3. **Manual Guidance Between Iterations** - User can guide agent learning
4. **Grid Search for Parameters** - Optimize without regenerating scripts
5. **AI-Powered Execution Analysis** - Claude analyzes trades for insights

**Expected Impact:**
- **92% cost reduction** ($4.25 → $0.33 per 10 iterations)
- **40% faster learning** (10 → 6 iterations to find edge)
- **5× more data** per iteration (5 exits tested vs 1)

---

## Priority 1: Execution Template Library

### Overview

Pre-built, battle-tested exit strategies stored as TypeScript templates. No API costs, instant reusability.

### Core Templates (Initial Set)

#### 1. Conservative (Scalping)
**Use Case:** Quick profits, tight risk control

```typescript
{
  name: "Conservative Scalper",
  description: "Tight stops, quick exits. Optimized for high win rate.",

  parameters: {
    stopLossPct: 1.0,
    takeProfitPct: 1.5,
    trailingStopPct: 0.5,
    maxHoldBars: 12  // Exit after 1 hour if no exit triggered
  },

  strategy: "Fixed stops with time-based backstop. Exit quickly."
}
```

**Ideal for:**
- High-frequency patterns
- Volatile tickers
- Small account sizes (risk management)

---

#### 2. Aggressive (Swing)
**Use Case:** Let winners run, wider stops

```typescript
{
  name: "Aggressive Swing",
  description: "Wide stops, trailing profit capture. Optimized for profit factor.",

  parameters: {
    stopLossPct: 2.5,
    takeProfitPct: 5.0,
    trailingStopPct: 1.5,
    activateTrailingAt: 2.0  // Start trailing after +2% profit
  },

  strategy: "Wide initial target, activate trailing stop once profitable."
}
```

**Ideal for:**
- Strong directional patterns
- High conviction setups
- Larger account sizes

---

#### 3. Time-Based
**Use Case:** Intraday mean reversion, avoid overnight risk

```typescript
{
  name: "Intraday Time Exit",
  description: "Exit by specific time regardless of P&L. No overnight holds.",

  parameters: {
    stopLossPct: 2.0,
    takeProfitPct: 3.0,
    exitTime: "15:30:00",  // Exit 30 min before close
    maxHoldMinutes: 120    // Exit after 2 hours max
  },

  strategy: "Momentum fade strategy - exit before session ends."
}
```

**Ideal for:**
- Gap fade strategies
- Intraday exhaustion plays
- News-driven volatility

---

#### 4. Volatility-Adaptive (ATR-based)
**Use Case:** Dynamic stops based on market volatility

```typescript
{
  name: "ATR Adaptive",
  description: "Stops adjust to volatility. Tighter in calm markets, wider in volatile.",

  parameters: {
    stopLossATRMultiplier: 2.0,   // 2× ATR for stop
    takeProfitATRMultiplier: 3.0, // 3× ATR for target
    atrPeriod: 14,
    trailingStopATRMultiplier: 1.5
  },

  strategy: "Calculate ATR at entry, use multiples for all exits."
}
```

**Ideal for:**
- Varying volatility regimes
- Multi-timeframe strategies
- Adaptive systems

---

#### 5. Price Action Trailing (Bar-by-Bar)
**Use Case:** Follow price action closely, exit on bar structure breaks

```typescript
{
  name: "Price Action Trailing",
  description: "Uses prior bar extremes as trailing stop. Tight tracking of price action.",

  parameters: {
    stopLossPct: 2.0,           // Initial hard stop
    takeProfitPct: 4.0,         // Initial target
    usePriorBarTrailing: true,  // Enable bar-by-bar trailing
    barsToActivate: 2           // Start trailing after N profitable bars
  },

  strategy: `
    LONG positions: Trail stop at prior bar's low
    SHORT positions: Trail stop at prior bar's high

    Activates after position moves favorably for N bars.
    Provides tight exit on first sign of reversal.
  `
}
```

**Ideal for:**
- Price action-focused strategies
- Capturing quick moves before reversal
- Tight risk management without indicators

**Notes:**
- Future enhancements may include dynamic position sizing based on volatility or setup quality (bet bigger on A+ setups)
- Future: Multiple entry/exit scaling (add to winners, scale out at targets)
- Future: Lower timeframe support (1min, 10sec) for better execution fills

---

### Template Structure

```typescript
// backend/src/templates/execution/template.interface.ts
export interface ExecutionTemplate {
  name: string;
  description: string;
  category: 'scalping' | 'swing' | 'time_based' | 'volatility_adaptive' | 'price_action';

  parameters: {
    [key: string]: number | string;  // Parameterizable values
  };

  codeTemplate: string;  // Template string with {{param}} placeholders

  metadata: {
    idealFor: string[];      // Use cases
    riskLevel: 'low' | 'medium' | 'high';
    avgHoldTime: string;     // Expected hold time
    winRateTarget: number;   // Expected win rate
  };
}
```

### Rendering Templates

```typescript
// backend/src/services/template-renderer.service.ts
class TemplateRenderer {
  render(template: ExecutionTemplate, customParams?: any): string {
    const params = { ...template.parameters, ...customParams };

    let code = template.codeTemplate;

    // Replace all {{param}} placeholders
    for (const [key, value] of Object.entries(params)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      code = code.replace(placeholder, String(value));
    }

    return code;
  }

  renderWithSignals(
    template: ExecutionTemplate,
    signals: ScannerSignal[],
    ticker: string
  ): string {
    const baseCode = this.render(template);

    // Inject signals and ticker
    const fullScript = `
      import { initializeDatabase, getDatabase } from './src/database/db';
      import * as helpers from './src/utils/backtest-helpers';
      import dotenv from 'dotenv';
      import path from 'path';

      dotenv.config({ path: path.resolve(__dirname, '../.env') });

      // ... interfaces ...

      const SCANNER_SIGNALS = ${JSON.stringify(signals, null, 2)};

      async function runBacktest() {
        const dbPath = process.env.DATABASE_PATH || './backtesting.db';
        initializeDatabase(dbPath);
        const db = getDatabase();

        const ticker = '${ticker}';
        const timeframe = '5min';

        ${baseCode}
      }

      runBacktest().catch(console.error);
    `;

    return fullScript;
  }
}
```

### Storage

```
backend/
  src/
    templates/
      execution/
        index.ts                    # Template registry
        conservative.ts             # Conservative template
        aggressive.ts               # Aggressive template
        time-based.ts              # Time-based template
        volatility-adaptive.ts      # ATR-based template
        price-action.ts             # Price action trailing template
        template.interface.ts       # TypeScript interfaces
```

### Database Schema

```typescript
// Store which template an agent is using
interface TradingAgent {
  // ... existing fields
  execution_template?: string;  // 'conservative' | 'aggressive' | etc
  execution_params?: any;       // Custom parameter overrides
}

// Track template performance
interface TemplatePerformance {
  id: string;
  agent_id: string;
  iteration_number: number;
  template_name: string;
  parameters: any;

  // Results
  trades: number;
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
  avg_win: number;
  avg_loss: number;
}
```

### API Endpoints

```typescript
// List available templates
GET /api/execution-templates
→ Returns: Array of template metadata

// Get template details
GET /api/execution-templates/:name
→ Returns: Full template with parameters and description

// Set agent's template
PUT /api/learning-agents/:id/execution-template
{
  "template": "aggressive",
  "params": { "stopLossPct": 2.0 }  // Optional overrides
}
```

### Implementation Steps

1. **Week 1, Day 1-2:** Create template interface and 5 core templates
2. **Week 1, Day 3:** Build template renderer service
3. **Week 1, Day 4:** Add database schema and migrations
4. **Week 1, Day 5:** Create API endpoints
5. **Week 1, Day 6:** Test templates individually
6. **Week 1, Day 7:** Documentation and integration

**Time Estimate:** 6-7 days
**API Cost:** $0 (no Claude calls)
**Deliverables:** 5 templates, renderer, API, tests

---

## Priority 2: Multiple Execution Scripts per Scan

### Overview

Test 3-5 different execution templates on the same scan results to find the best exit strategy.

### Workflow

```
Iteration N:
  ├─ Scanner generates 12 signals
  │
  ├─ Execution Phase (parallel):
  │  ├─ Test 1: Conservative template → 12 trades
  │  ├─ Test 2: Aggressive template → 12 trades
  │  ├─ Test 3: Time-based template → 12 trades
  │  ├─ Test 4: Volatility template → 12 trades
  │  └─ Test 5: Indicator template → 12 trades
  │
  ├─ Compare Results:
  │  ├─ Conservative: 58% win, +0.8% avg, PF 1.4
  │  ├─ Aggressive:  50% win, +1.4% avg, PF 1.8 ✅ WINNER
  │  ├─ Time-based:  42% win, +0.6% avg, PF 1.1
  │  ├─ Volatility:  55% win, +1.2% avg, PF 1.6
  │  └─ Indicator:   48% win, +1.0% avg, PF 1.5
  │
  └─ Next Iteration: Use Aggressive template, refine scanner
```

### Implementation

```typescript
// agent-learning.service.ts
async runBacktests(scanScript: string, scanResults: any[]) {
  if (scanResults.length === 0) {
    return { totalTrades: 0, trades: [] };
  }

  // Get templates to test (from agent config or defaults)
  const templatesToTest = this.getTemplatesToTest(agent);

  console.log(`Testing ${templatesToTest.length} execution templates on ${scanResults.length} signals...`);

  // Group signals by ticker
  const signalsByTicker = this.groupSignalsByTicker(scanResults);

  // Test each template
  const templateResults = await Promise.all(
    templatesToTest.map(async (templateName) => {
      const template = executionTemplates[templateName];
      const allTrades = [];

      // Run this template against all tickers
      for (const [ticker, signals] of Object.entries(signalsByTicker)) {
        const script = this.templateRenderer.renderWithSignals(template, signals, ticker);
        const result = await this.scriptExecution.executeScript(script, 120000);

        if (result.success && result.data) {
          allTrades.push(...result.data);
        }
      }

      // Calculate performance metrics
      const performance = this.calculatePerformance(allTrades);

      return {
        template: templateName,
        trades: allTrades,
        ...performance
      };
    })
  );

  // Rank by profit factor
  const ranked = templateResults.sort((a, b) => b.profitFactor - a.profitFactor);
  const winner = ranked[0];

  console.log(`Template Performance:`);
  ranked.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.template}: PF ${r.profitFactor}, WR ${r.winRate}%, Avg ${r.avgWin}%`);
  });
  console.log(`Winner: ${winner.template}`);

  // Store all results for analysis
  await this.storeTemplatePerformance(agent.id, iterationNumber, templateResults);

  // Return winner's results as primary
  return {
    ...winner,
    allTemplateResults: templateResults,  // For detailed analysis
    recommendation: `${winner.template} template performed best with profit factor ${winner.profitFactor}`
  };
}
```

### Agent Configuration

```typescript
// Allow user to configure which templates to test
interface TradingAgent {
  // ... existing fields
  execution_templates_to_test?: string[];  // e.g., ['conservative', 'aggressive', 'volatility']
  auto_select_best_template?: boolean;     // Auto-use winner in next iteration
}

// Defaults if not specified
DEFAULT_TEMPLATES_TO_TEST = ['conservative', 'aggressive', 'time_based'];
```

### Results Storage

```typescript
// Store comparative results
interface TemplateComparison {
  id: string;
  agent_id: string;
  iteration_number: number;
  scan_signals: number;

  results: {
    template: string;
    trades: number;
    win_rate: number;
    profit_factor: number;
    sharpe_ratio: number;
    avg_win: number;
    avg_loss: number;
  }[];

  winner: string;  // Which template won
  recommendation: string;
}
```

### Analysis Integration

```typescript
// Analysis should compare templates
async analyzeResults(agent, backtestResults, scanResults) {
  const allTemplateResults = backtestResults.allTemplateResults;

  const analysis = {
    summary: `Tested ${allTemplateResults.length} execution templates on ${scanResults.length} signals`,

    scanner_quality: {
      // ... scanner analysis
    },

    execution_comparison: {
      winner: backtestResults.template,
      winner_stats: {
        profit_factor: backtestResults.profitFactor,
        win_rate: backtestResults.winRate
      },

      insights: this.generateTemplateInsights(allTemplateResults),
      // Example: "Aggressive template outperformed by capturing larger winners (+1.4% vs +0.8%)"

      recommendation: backtestResults.recommendation
    },

    refinements: [
      {
        type: 'execution_template',
        description: `Use ${backtestResults.template} template in next iteration`,
        projected_improvement: `Expected profit factor: ${backtestResults.profitFactor}`
      }
    ]
  };

  return analysis;
}
```

### Cost Analysis

**Current (1 execution per scan):**
```
Scan generation:      8K tokens
Execution generation: 9K tokens
Total:               17K tokens per iteration
```

**New (5 templates per scan):**
```
Scan generation:      8K tokens
Template rendering:   0K tokens (just string replacement!)
Execution (5 runs):   0K tokens (no generation)
Total:                8K tokens per iteration
```

**Savings: 53% cost reduction**

**Additional value:**
- 5× more exit strategies tested
- Empirical comparison (not guessing)
- Faster convergence to best approach

### Implementation Steps

1. **Day 1:** Update `runBacktests()` to support multiple templates
2. **Day 2:** Add template comparison logic and ranking
3. **Day 3:** Update database schema for template performance storage
4. **Day 4:** Integrate with analysis service
5. **Day 5:** Add API endpoints for template comparison results
6. **Day 6:** Testing and validation
7. **Day 7:** Documentation

**Time Estimate:** 7 days
**API Cost Reduction:** 53%
**Deliverables:** Multi-template framework, comparison dashboard

---

## Priority 3: Manual Guidance Between Iterations

### Overview

Allow user to provide explicit guidance that influences the next iteration's scanner and/or execution generation.

### Use Cases

**Use Case 1: User Notices Pattern**
```
After Iteration 3, user reviews trades:
→ "All winners had volume > 5× average, but scanner only requires 2×"

User provides guidance:
→ "Increase volume threshold to 5× in next iteration"

Iteration 4 scanner prompt includes this guidance
→ Scanner generates with volume > 5× requirement
```

**Use Case 2: Execution Override**
```
After Iteration 5, user sees trades exiting too early:
→ "Winners reversed after hitting take profit at +2.5%"

User provides guidance:
→ "Widen take profit to 4.0% and add trailing stop at +2%"

Iteration 6 execution uses these parameters
→ Captures more profit on winners
```

**Use Case 3: Strategy Pivot**
```
After Iteration 7, strategy isn't working:
→ "Fade strategy not profitable, try momentum continuation instead"

User provides guidance:
→ "Reverse direction: Buy breakouts above prior high instead of fading"

Iteration 8 scanner generates breakout strategy
→ Complete strategy pivot without starting over
```

### Database Schema

```typescript
interface Iteration {
  // ... existing fields

  user_guidance?: {
    text: string;              // Free-form guidance text
    focus: 'scanner' | 'execution' | 'both';  // What to adjust
    priority: 'high' | 'medium' | 'low';       // How strongly to weight
    created_at: Date;
    created_by: string;        // User ID
  };
}
```

### API Endpoints

```typescript
// Add guidance to an iteration
POST /api/learning-agents/:agentId/iterations/:iterationId/guidance
{
  "text": "Increase volume threshold to 5× average",
  "focus": "scanner",
  "priority": "high"
}

// Get guidance for an iteration
GET /api/learning-agents/:agentId/iterations/:iterationId/guidance

// Update guidance (before next iteration runs)
PUT /api/learning-agents/:agentId/iterations/:iterationId/guidance
{
  "text": "Updated guidance...",
  "focus": "both"
}

// Delete guidance
DELETE /api/learning-agents/:agentId/iterations/:iterationId/guidance
```

### Prompt Integration

**Scanner Generation (with guidance):**

```typescript
async generateStrategy(agent: TradingAgent, iterationNumber: number) {
  // Get previous iteration's guidance
  const previousIteration = await this.getIteration(agent.id, iterationNumber - 1);
  const guidance = previousIteration?.user_guidance;

  let scannerQuery = this.buildBaseScannerQuery(agent, iterationNumber);

  // Add user guidance if present and relevant
  if (guidance && (guidance.focus === 'scanner' || guidance.focus === 'both')) {
    scannerQuery += `

CRITICAL USER GUIDANCE (Priority: ${guidance.priority}):
${guidance.text}

IMPORTANT: This guidance takes precedence over automated analysis.
Incorporate this direction while maintaining successful elements from previous iterations.
${guidance.priority === 'high' ? 'This is a HIGH priority directive - make it the primary focus.' : ''}
`;
  }

  const scannerResult = await this.claude.generateScannerScript({
    query: scannerQuery,
    universe: agent.universe,
    dateRange: { start: this.getDateDaysAgo(20), end: this.getDateDaysAgo(1) }
  });

  // ... rest of generation
}
```

**Execution Generation (with guidance):**

```typescript
async generateStrategy(agent: TradingAgent, iterationNumber: number) {
  // ... scanner generation ...

  const guidance = previousIteration?.user_guidance;

  let executionPrompt = this.buildBaseExecutionPrompt(agent, iterationNumber);

  if (guidance && (guidance.focus === 'execution' || guidance.focus === 'both')) {
    executionPrompt += `

USER GUIDANCE FOR EXECUTION (Priority: ${guidance.priority}):
${guidance.text}

Apply this guidance to exit rules, risk management, or position sizing as relevant.
${guidance.priority === 'high' ? 'Prioritize this over automated refinements.' : 'Consider this alongside automated analysis.'}
`;
  }

  const executionResult = await this.claude.generateScript(executionPrompt, { ... });

  // ... rest of generation
}
```

### CLI Interface

```bash
# Provide guidance after iteration completes
npm run agent:guidance <agentId> <iterationNumber>

# Interactive prompt:
? Focus area: (scanner/execution/both): scanner
? Priority: (high/medium/low): high
? Guidance text: Increase volume threshold to 5× average

✓ Guidance saved for iteration 3
  Next iteration (#4) will incorporate this guidance
```

### Web UI Integration

```typescript
// Frontend component
<IterationGuidanceForm
  agentId={agentId}
  iterationNumber={iterationNumber}
  onSubmit={handleGuidanceSubmit}
/>

<GuidanceDisplay guidance={iteration.user_guidance} />
```

### Analysis Integration

Analysis should acknowledge when guidance was provided:

```typescript
async analyzeResults(agent, backtestResults, scanResults, iteration) {
  let summary = `Iteration ${iteration.number} completed`;

  if (iteration.user_guidance) {
    summary += ` (incorporating user guidance: "${iteration.user_guidance.text}")`;
  }

  return {
    summary,
    // ... rest of analysis

    guidance_impact: iteration.user_guidance ? {
      guidance_text: iteration.user_guidance.text,
      observed_impact: this.evaluateGuidanceImpact(iteration, previousIteration),
      // Example: "Volume increase from 2× to 5× improved win rate from 40% to 58%"
    } : null
  };
}
```

### Implementation Steps

1. **Day 1:** Add database schema and migration
2. **Day 2:** Create API endpoints
3. **Day 3:** Integrate with scanner/execution generation
4. **Day 4:** Build CLI interface
5. **Day 5:** Add guidance impact analysis
6. **Day 6:** Testing
7. **Day 7:** Documentation and examples

**Time Estimate:** 7 days
**API Cost:** $0 (guidance is appended to prompt, minimal tokens)
**Deliverables:** Guidance system, CLI, API, impact tracking

---

## Priority 4: Grid Search for Parameters

### Overview

Test multiple parameter combinations without regenerating scripts. Dramatically faster than iterative learning.

### Parameterized Scanner Approach

**Traditional (Iteration-based):**
```
Iteration 1: RSI > 70, Volume > 2×  → 40% win rate
Iteration 2: RSI > 75, Volume > 2×  → 45% win rate
Iteration 3: RSI > 75, Volume > 3×  → 52% win rate
Iteration 4: RSI > 80, Volume > 3×  → 48% win rate

Total: 4 iterations, 32K tokens, 4-8 days
```

**Grid Search:**
```
Iteration 1: Generate parameterized scanner
Iteration 2: Test all combinations in minutes
  - RSI 70, Vol 2× → 40%
  - RSI 70, Vol 3× → 42%
  - RSI 75, Vol 2× → 45%
  - RSI 75, Vol 3× → 52% ✅ WINNER
  - RSI 80, Vol 2× → 46%
  - RSI 80, Vol 3× → 48%

Total: 2 iterations, 16K tokens, 1-2 days
```

### Implementation Strategy

**Step 1: Generate Parameterized Scanner**

Modify scanner generation prompt:

```typescript
const scannerPrompt = `
Generate a scanner script that accepts these configurable parameters:
- rsi_threshold: number (RSI level for exhaustion)
- volume_multiplier: number (Volume spike requirement)
- gain_threshold: number (3-day gain percentage)
- time_window_end: string (Latest time to accept signal, e.g., '10:00:00')

Make these parameters injectable at runtime without code modification.

Example usage:
const params = {
  rsi_threshold: 70,
  volume_multiplier: 2.0,
  gain_threshold: 100,
  time_window_end: '10:00:00'
};

The scanner should filter results based on these parameters.
Output only signals that meet ALL criteria.
`;
```

**Generated Scanner (Parameterized):**

```typescript
// Generated by Claude with parameter injection
interface ScanParams {
  rsi_threshold: number;
  volume_multiplier: number;
  gain_threshold: number;
  time_window_end: string;
}

async function runScan(params: ScanParams = {
  rsi_threshold: 70,
  volume_multiplier: 2.0,
  gain_threshold: 100,
  time_window_end: '10:00:00'
}): Promise<ScanMatch[]> {

  const results: ScanMatch[] = [];

  // ... scan logic ...

  // Use parameters in filtering
  if (rsi < params.rsi_threshold) continue;
  if (volumeRatio < params.volume_multiplier) continue;
  if (threeDayGain < params.gain_threshold) continue;
  if (signalTime >= params.time_window_end) continue;

  results.push({ ticker, signal_date, signal_time, ... });

  return results;
}

// Export parameterized function
export { runScan };
```

**Step 2: Grid Search Execution**

```typescript
// backend/src/services/grid-search.service.ts
class GridSearchService {
  async runGridSearch(
    agent: TradingAgent,
    parameterGrid: ParameterGrid,
    executionTemplate: string
  ) {
    const results = [];

    // Generate all parameter combinations
    const combinations = this.generateCombinations(parameterGrid);
    console.log(`Testing ${combinations.length} parameter combinations...`);

    for (const params of combinations) {
      // Run scanner with these parameters
      const scanResults = await this.executeParameterizedScan(agent.scan_script, params);

      // Run execution on scan results
      const backtestResults = await this.runBacktest(
        scanResults,
        executionTemplate
      );

      // Store results
      results.push({
        params,
        signals: scanResults.length,
        trades: backtestResults.totalTrades,
        win_rate: backtestResults.winRate,
        profit_factor: backtestResults.profitFactor,
        sharpe: backtestResults.sharpe
      });
    }

    // Rank by profit factor
    const ranked = results.sort((a, b) => b.profit_factor - a.profit_factor);

    return {
      total_combinations: combinations.length,
      results: ranked,
      winner: ranked[0],
      recommendation: `Optimal parameters: ${JSON.stringify(ranked[0].params)}`
    };
  }

  generateCombinations(grid: ParameterGrid): ParamSet[] {
    const { rsi_threshold, volume_multiplier, gain_threshold, time_window } = grid;
    const combinations = [];

    for (const rsi of rsi_threshold) {
      for (const vol of volume_multiplier) {
        for (const gain of gain_threshold) {
          for (const time of time_window) {
            combinations.push({ rsi, vol, gain, time });
          }
        }
      }
    }

    return combinations;
  }
}
```

### Parameter Grid Definition

```typescript
interface ParameterGrid {
  rsi_threshold?: number[];         // e.g., [65, 70, 75, 80]
  volume_multiplier?: number[];     // e.g., [1.5, 2.0, 2.5, 3.0]
  gain_threshold?: number[];        // e.g., [50, 75, 100, 150]
  time_window_end?: string[];       // e.g., ['10:00', '11:00', '12:00']
}

// Example grid (4 × 4 × 4 × 3 = 192 combinations)
const exampleGrid: ParameterGrid = {
  rsi_threshold: [65, 70, 75, 80],
  volume_multiplier: [1.5, 2.0, 2.5, 3.0],
  gain_threshold: [50, 75, 100, 150],
  time_window_end: ['10:00:00', '11:00:00', '12:00:00']
};
```

### Smart Grid Search (Reduce Combinations)

**Problem:** 192 combinations = slow

**Solution:** Multi-stage grid search

```typescript
// Stage 1: Coarse grid (16 combinations)
const coarseGrid = {
  rsi_threshold: [65, 75],
  volume_multiplier: [1.5, 3.0],
  gain_threshold: [50, 100],
  time_window_end: ['10:00:00', '12:00:00']
};

const coarseResults = await gridSearch.run(coarseGrid);
const coarseWinner = coarseResults.winner;

// Stage 2: Fine-tune around winner (9 combinations)
const fineGrid = {
  rsi_threshold: [coarseWinner.rsi - 5, coarseWinner.rsi, coarseWinner.rsi + 5],
  volume_multiplier: [coarseWinner.vol - 0.5, coarseWinner.vol, coarseWinner.vol + 0.5],
  gain_threshold: [coarseWinner.gain],  // Lock this parameter
  time_window_end: [coarseWinner.time]  // Lock this parameter
};

const fineResults = await gridSearch.run(fineGrid);
const optimalParams = fineResults.winner;

// Total: 16 + 9 = 25 tests instead of 192
```

### Execution Parameter Grid Search

Same approach works for execution parameters:

```typescript
const executionGrid = {
  stop_loss_pct: [1.0, 1.5, 2.0, 2.5],
  take_profit_pct: [2.0, 3.0, 4.0, 5.0],
  trailing_stop_pct: [0.5, 1.0, 1.5, 2.0]
};

// Test all combinations of exit parameters
const bestExitParams = await gridSearch.runExecutionGrid(
  scanResults,
  executionGrid
);
```

### API Endpoints

```typescript
// Start grid search
POST /api/learning-agents/:id/grid-search
{
  "parameter_grid": {
    "rsi_threshold": [65, 70, 75, 80],
    "volume_multiplier": [1.5, 2.0, 2.5, 3.0]
  },
  "execution_template": "aggressive",
  "strategy": "coarse_then_fine"  // or "exhaustive"
}

// Get grid search results
GET /api/learning-agents/:id/grid-search/:searchId

// Apply winning parameters
POST /api/learning-agents/:id/grid-search/:searchId/apply
→ Updates agent's scanner/execution parameters
```

### Results Visualization

```typescript
// Generate heatmap of parameter performance
{
  "heatmap": [
    { "rsi": 65, "volume": 1.5, "profit_factor": 1.2 },
    { "rsi": 65, "volume": 2.0, "profit_factor": 1.4 },
    { "rsi": 70, "volume": 1.5, "profit_factor": 1.5 },
    { "rsi": 70, "volume": 2.0, "profit_factor": 1.8 },  // Winner
    ...
  ],

  "insights": [
    "RSI 70 outperforms 65 and 75 across all volume levels",
    "Volume 2× is optimal - higher reduces signal count without improving quality",
    "Sweet spot: RSI 70, Volume 2×"
  ]
}
```

### Implementation Steps

1. **Day 1:** Update scanner generation to be parameterizable
2. **Day 2:** Build grid search service
3. **Day 3:** Implement combination generator and executor
4. **Day 4:** Add smart grid (coarse → fine)
5. **Day 5:** Build results visualization
6. **Day 6:** API endpoints
7. **Day 7:** Testing and validation

**Time Estimate:** 7 days
**API Cost Reduction:** 60% (1 generation, many parameter tests)
**Deliverables:** Grid search framework, heatmap visualization, API

---

## Priority 5: AI-Powered Execution Analysis

### Overview

Use Claude to analyze trade data, charts, and patterns to suggest execution improvements.

### Use Case 1: Losing Trade Analysis

**Input:** All losing trades from recent iterations

```typescript
const losingTrades = [
  {
    ticker: "OMER",
    entry_price: 10.50,
    exit_price: 9.98,
    pnl: -0.52,
    pnl_pct: -4.95,
    entry_time: "09:45:00",
    exit_time: "10:15:00",
    exit_reason: "Stop loss",
    bars: [...]  // All price action between entry and exit
  },
  // ... more losing trades
];
```

**Analysis Prompt:**

```typescript
const analysisPrompt = `
You are a professional trading analyst. Analyze these losing trades to identify exit improvements.

LOSING TRADES DATA:
${JSON.stringify(losingTrades, null, 2)}

For each trade, I'm providing:
- Entry and exit prices, times, reasons
- Full bar-by-bar price action (5-minute bars)
- Volume, RSI, and other indicators at each bar

ANALYSIS TASKS:

1. EARLY EXIT OPPORTUNITIES
   - Could we have exited earlier to reduce loss?
   - What signal would have caught the reversal?
   - Example: "RSI crossed below 40", "Volume dried up", "Lower high formed"

2. SHOULD NOT HAVE ENTERED
   - Were there warning signs at entry we missed?
   - What filter would have prevented this trade?
   - Example: "Entry bar had weak volume", "RSI was already reversing"

3. BETTER STOP PLACEMENT
   - Was stop loss too tight or too loose?
   - Where should stop have been placed?
   - Example: "Stop should be below prior swing low, not fixed %"

4. PATTERN IDENTIFICATION
   - Do losing trades share common characteristics?
   - Example: "All losses occurred after 11 AM", "All had declining volume"

Provide specific, actionable recommendations for exit rule improvements.
Format as JSON with categories: early_exits, entry_filters, stop_placement, patterns.
`;

const aiAnalysis = await claude.analyze(analysisPrompt);
```

**Expected Response:**

```json
{
  "early_exits": [
    {
      "trade": "OMER",
      "opportunity": "RSI crossed below 40 at 10:05 (10 min after entry)",
      "potential_savings": "+1.2% (exit at 10.37 instead of 9.98)",
      "recommendation": "Add RSI reversal exit: Exit LONG if RSI < 40"
    }
  ],

  "entry_filters": [
    {
      "pattern": "3 of 5 losing trades entered after 11:00 AM",
      "recommendation": "Restrict entries to before 11:00 AM"
    }
  ],

  "stop_placement": [
    {
      "insight": "Fixed 2% stop hit on all 5 trades, but price then bounced",
      "recommendation": "Use ATR-based stop (2 × ATR) instead of fixed %"
    }
  ],

  "patterns": [
    {
      "pattern": "All losses had declining volume after entry",
      "recommendation": "Monitor volume after entry - exit if volume drops below entry bar volume"
    }
  ]
}
```

### Use Case 2: Parameter Optimization via AI

**Input:** Recent trade history + current parameters

```typescript
const optimizationPrompt = `
Analyze recent trade performance and suggest optimal parameter values.

CURRENT PARAMETERS:
- Stop loss: 1.5%
- Take profit: 2.5%
- Trailing stop: 1.0%

RECENT TRADES (Last 20):
${JSON.stringify(recentTrades, null, 2)}

OBSERVED PATTERNS:
- Win rate: 55%
- Average win: +2.8%
- Average loss: -1.5%
- 40% of winners reversed after hitting +2.5% take profit
- 80% of losers hit initial stop at -1.5%

QUESTIONS:
1. Should we widen take profit? (Winners are running further than +2.5%)
2. Is stop loss appropriate? (Protecting capital vs too tight)
3. Should trailing stop activate earlier or be tighter/wider?

Provide specific parameter recommendations with reasoning.
`;

const aiSuggestions = await claude.analyze(optimizationPrompt);
```

**Expected Response:**

```json
{
  "recommendations": [
    {
      "parameter": "take_profit_pct",
      "current": 2.5,
      "suggested": 3.5,
      "reasoning": "40% of winners reversed after hitting +2.5%, averaging +3.2% before reversal. Widening to +3.5% captures more profit without over-extending.",
      "expected_impact": "+0.3% average win improvement"
    },
    {
      "parameter": "stop_loss_pct",
      "current": 1.5,
      "suggested": 1.5,
      "reasoning": "80% of losers hitting initial stop suggests it's working. Keep unchanged.",
      "expected_impact": "No change"
    },
    {
      "parameter": "trailing_stop_pct",
      "current": 1.0,
      "suggested": 1.25,
      "reasoning": "Winners averaging +2.8% but trailing stop at 1.0% may be too tight. Widen slightly to capture more upside while still protecting profit.",
      "expected_impact": "+0.2% average win improvement"
    }
  ],

  "additional_suggestions": [
    {
      "type": "new_rule",
      "description": "Add time-based exit: If trade is negative after 30 minutes, exit immediately",
      "reasoning": "Losers averaged 25 minutes from entry to stop. Earlier exit would reduce loss magnitude."
    }
  ]
}
```

### Use Case 3: Chart Pattern Analysis (Future)

**Using Claude's vision capabilities:**

```typescript
// Generate candlestick chart images
const chartImages = trades.map(trade => {
  return generateCandlestickChart({
    bars: trade.bars,
    entry_price: trade.entry_price,
    exit_price: trade.exit_price,
    indicators: ['RSI', 'Volume'],
    border_color: trade.pnl > 0 ? 'green' : 'red'
  });
});

// Analyze with Claude vision
const chartAnalysisPrompt = `
Analyze these candlestick charts of trades we executed.
- Green border = winning trade
- Red border = losing trade
- Entry marked with green arrow, exit with red arrow

Identify VISUAL patterns that separate winners from losers.
Look for:
- Chart patterns (double tops, lower highs, flags, etc.)
- Candlestick patterns (doji, engulfing, hammers)
- Indicator divergences
- Volume patterns

Suggest exit rules based on visual chart patterns.
`;

const chartAnalysis = await claude.analyzeImages(chartImages, chartAnalysisPrompt);
```

**Expected Response:**

```json
{
  "visual_patterns": [
    {
      "pattern": "Lower highs after entry",
      "frequency_in_losers": "80%",
      "frequency_in_winners": "10%",
      "recommendation": "Exit if two consecutive bars make lower highs",
      "visual_description": "After entry, price makes lower peak on each swing up"
    },
    {
      "pattern": "Volume spike reversal",
      "frequency_in_losers": "60%",
      "frequency_in_winners": "5%",
      "recommendation": "Exit if volume spikes 2× on a reversal candle",
      "visual_description": "High volume bar that closes opposite to position direction"
    }
  ]
}
```

### Implementation

```typescript
// backend/src/services/ai-analyzer.service.ts
class AIAnalyzer {
  constructor(
    private claude: ClaudeService
  ) {}

  async analyzeLosers(trades: Trade[]): Promise<AIAnalysis> {
    const losingTrades = trades.filter(t => t.pnl < 0);

    if (losingTrades.length < 3) {
      return {
        error: "Insufficient losing trades for analysis (need 3+)",
        recommendations: []
      };
    }

    const prompt = this.buildLoserAnalysisPrompt(losingTrades);
    const response = await this.claude.analyzeText(prompt);

    return this.parseAIResponse(response);
  }

  async suggestParameters(
    currentParams: ExecutionParams,
    recentTrades: Trade[]
  ): Promise<ParameterSuggestions> {
    const stats = this.calculateTradeStats(recentTrades);
    const prompt = this.buildParameterOptimizationPrompt(currentParams, stats, recentTrades);

    const response = await this.claude.analyzeText(prompt);
    return this.parseParameterSuggestions(response);
  }

  async analyzeCharts(trades: Trade[]): Promise<ChartAnalysis> {
    // Generate chart images
    const chartImages = await this.chartGenerator.generateCharts(trades);

    // Analyze with Claude vision
    const prompt = this.buildChartAnalysisPrompt(trades);
    const response = await this.claude.analyzeImages(chartImages, prompt);

    return this.parseChartAnalysis(response);
  }

  private buildLoserAnalysisPrompt(trades: Trade[]): string {
    return `
You are a professional trading analyst. Analyze these losing trades...
${JSON.stringify(trades, null, 2)}
...
    `;
  }
}
```

### When to Run AI Analysis

**Option 1: Automatic (Every N Iterations)**

```typescript
if (iterationNumber % 5 === 0) {  // Every 5 iterations
  console.log('Running AI analysis on recent trades...');
  const aiAnalysis = await this.aiAnalyzer.analyzeLosers(recentTrades);
  const paramSuggestions = await this.aiAnalyzer.suggestParameters(currentParams, recentTrades);

  // Include in analysis output
  analysis.ai_insights = {
    loser_analysis: aiAnalysis,
    parameter_suggestions: paramSuggestions
  };
}
```

**Option 2: On-Demand (User Triggered)**

```typescript
// API endpoint
POST /api/learning-agents/:id/ai-analysis
{
  "type": "losers" | "parameters" | "charts",
  "iterations_to_analyze": 5  // Analyze last 5 iterations
}

// Returns AI insights
```

**Option 3: Conditional (Performance Degradation)**

```typescript
if (profitFactor < 1.2 && iterationNumber > 3) {
  console.log('Performance below threshold - running AI analysis...');
  const aiAnalysis = await this.aiAnalyzer.analyzeLosers(allTrades);

  // AI can identify what's not working
}
```

### Cost Management

**Analysis Costs:**
- Losing trade analysis: ~5K tokens (trade data + response)
- Parameter optimization: ~3K tokens
- Chart analysis (future): ~15K tokens (images expensive)

**Recommendation:** Run AI analysis every 3-5 iterations, not every iteration

**Budget Example:**
```
10 iterations total:
- AI analysis on iterations 5 and 10 (2 times)
- 2 × 8K tokens = 16K tokens
- Additional cost: ~$0.40

Total value: Potentially 10-20% performance improvement
```

### Implementation Steps

1. **Week 4, Day 1-2:** Build losing trade analyzer
2. **Week 4, Day 3:** Build parameter optimizer
3. **Week 4, Day 4:** Integrate with analysis service
4. **Week 4, Day 5:** Add API endpoints
5. **Week 4, Day 6:** Testing and validation
6. **Week 4, Day 7:** Documentation
7. **(Future) Week 5:** Chart analysis with vision

**Time Estimate:** 7 days (charts: +7 days)
**API Cost:** ~8K tokens per analysis
**Deliverables:** AI analyzer service, API endpoints, insights

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goals:**
- Build execution template library
- Add manual guidance feature
- Establish reusable patterns

**Tasks:**
1. Create 5 core execution templates (Day 1-2)
2. Build template renderer service (Day 3)
3. Add manual guidance schema + API (Day 4-5)
4. Integration and testing (Day 6)
5. Documentation (Day 7)

**Deliverables:**
- ✅ 5 execution templates
- ✅ Template rendering system
- ✅ Manual guidance API
- ✅ CLI for guidance
- ✅ Tests

**Expected Impact:**
- 0% cost reduction (baseline)
- Foundation for future phases

---

### Phase 2: Acceleration (Week 2)

**Goals:**
- Test multiple executions per scan
- Dramatically reduce API costs
- 5× more data per iteration

**Tasks:**
1. Update runBacktests for multi-template (Day 1-2)
2. Add template comparison logic (Day 3)
3. Store comparative results (Day 4)
4. Integrate with analysis (Day 5)
5. API endpoints + dashboard (Day 6)
6. Testing and validation (Day 7)

**Deliverables:**
- ✅ Multi-execution framework
- ✅ Template performance tracking
- ✅ Comparison dashboard
- ✅ Winner auto-selection

**Expected Impact:**
- **53% cost reduction** (8K vs 17K tokens per iteration)
- **5× more execution data** per iteration
- Faster convergence to optimal exits

---

### Phase 3: Optimization (Week 3)

**Goals:**
- Enable parameter grid search
- Find optimal parameters without iteration waste
- Further reduce costs

**Tasks:**
1. Parameterized scanner generation (Day 1-2)
2. Grid search service (Day 3-4)
3. Smart grid (coarse → fine) (Day 5)
4. Visualization + API (Day 6)
5. Testing and docs (Day 7)

**Deliverables:**
- ✅ Parameterized scanner template
- ✅ Grid search framework
- ✅ Parameter heatmaps
- ✅ API endpoints

**Expected Impact:**
- **Additional 60% reduction** (1 generation, many tests)
- **Combined: 82% cost reduction** from baseline
- Find optimal params in 1-2 iterations vs 5-10

---

### Phase 4: Intelligence (Week 4+)

**Goals:**
- AI-powered trade analysis
- Execution strategy suggestions
- Continuous improvement insights

**Tasks:**
1. Losing trade analyzer (Day 1-2)
2. Parameter optimizer (Day 3-4)
3. Integration with learning loop (Day 5)
4. API + on-demand analysis (Day 6)
5. Testing and docs (Day 7)
6. (Future) Chart analysis with vision

**Deliverables:**
- ✅ AI analyzer service
- ✅ Loser analysis
- ✅ Parameter suggestions
- ✅ API endpoints
- ⏳ Chart analysis (future)

**Expected Impact:**
- **10-20% performance improvement** from AI insights
- **Faster problem identification**
- Novel exit strategies discovered

---

## Expected Cumulative Impact

### Baseline (Current State)

```
Learning Cycle (10 iterations):
- 1 scan + 1 execution per iteration
- 17K tokens × 10 = 170K tokens
- Cost: ~$4.25
- Time: 2-3 weeks
- Data: 10 iterations × 1 execution = 10 data points
```

### After All Enhancements

```
Learning Cycle (6 iterations to same result):
- Iteration 1: Generate parameterized scan + test 5 templates
  → 8K tokens (scan only, templates free)
  → 5 execution strategies tested

- Iterations 2-5: Grid search on parameters
  → 0K tokens (just parameter variations)
  → Find optimal scanner params

- Iteration 6: Lock in winners, run AI analysis
  → 8K tokens (AI analysis)

Total:
- Tokens: 8K + 0K + 0K + 0K + 0K + 8K = 16K tokens
- Cost: ~$0.40
- Time: 1 week
- Data: 6 iterations × 5 executions × 20 param tests = 600 data points

Cost Reduction: 92% ($4.25 → $0.40)
Time Reduction: 67% (3 weeks → 1 week)
Data Increase: 60× more data (600 vs 10 points)
```

---

## Success Metrics

### After Phase 1 (Templates + Guidance)
- [ ] 5 templates implemented and tested
- [ ] Manual guidance successfully influences next iteration
- [ ] Templates reusable across agents

### After Phase 2 (Multi-Execution)
- [ ] 53% cost reduction achieved
- [ ] 5 templates tested per iteration
- [ ] Template winner identified automatically

### After Phase 3 (Grid Search)
- [ ] 82% total cost reduction achieved
- [ ] Optimal parameters found in 1-2 iterations
- [ ] Parameter sensitivity visualized

### After Phase 4 (AI Analysis)
- [ ] AI identifies actionable improvements
- [ ] Parameter suggestions improve performance 10%+
- [ ] Losing trades analyzed for patterns

---

## Open Questions

### 1. Template Library

**Question:** Should we start with the 5 templates outlined, or do you have specific exit strategies you want included?

**Options:**
- A) Start with outlined 5 (Conservative, Aggressive, Time-based, ATR-adaptive, Price-action)
- B) You provide custom templates based on your trading experience
- C) Mix: 3 standard + 2 custom

**Recommendation:** Option A for Phase 1, add custom in Phase 2

---

### 2. Multi-Execution

**Question:** How many templates should we test simultaneously?

**Options:**
- A) 3 templates (faster, but less coverage)
- B) 5 templates (balanced)
- C) All available templates (slower, but comprehensive)

**Recommendation:** Option B (5 templates)

**Trade-off:**
```
3 templates: 60 sec execution time
5 templates: 100 sec execution time
All (10): 200 sec execution time
```

---

### 3. Grid Search Scope

**Question:** What parameters are most important to optimize?

**Current Candidates:**
1. RSI threshold (scanner)
2. Volume multiplier (scanner)
3. Gain threshold (scanner)
4. Time window (scanner)
5. Stop loss % (execution)
6. Take profit % (execution)
7. Trailing stop % (execution)

**Recommendation:** Focus on scanner params first (1-4), then execution (5-7)

**Rationale:** Scanner quality has more impact than exit optimization

---

### 4. AI Analysis Frequency

**Question:** Should AI analysis be automatic, manual, or conditional?

**Options:**
- A) Automatic every N iterations (e.g., every 5)
- B) Manual/on-demand (user triggers via API)
- C) Conditional (runs when performance degrades)

**Recommendation:** Option C (conditional) with manual override

**Logic:**
```typescript
if (profitFactor < 1.5 && iterationNumber > 3) {
  runAIAnalysis();  // Automatic when struggling
}

// Plus: Manual endpoint for any time
POST /api/agents/:id/ai-analysis
```

---

### 5. Manual Guidance Interface

**Question:** How should users provide guidance?

**Options:**
- A) CLI only (fastest to build)
- B) API only (integrate with frontend)
- C) Both CLI + API (best UX)
- D) Web UI (most user-friendly, slower to build)

**Recommendation:** Option C (CLI + API) for Phase 1, Web UI in Phase 2

---

## Next Steps

1. **Review & Approve Plan**
   - Which priorities resonate most?
   - Any concerns or changes needed?
   - Answers to open questions above?

2. **Phase 1 Kickoff** (If approved)
   - Create template library
   - Add manual guidance
   - Expected: 1 week

3. **Measure & Iterate**
   - Track cost reduction
   - Monitor learning speed
   - Adjust priorities based on results

---

**Document Status:** Draft - Awaiting Approval
**Next Action:** User review and priority confirmation
**Estimated Total Time:** 4 weeks for all phases
**Expected ROI:** 92% cost reduction, 67% time reduction
