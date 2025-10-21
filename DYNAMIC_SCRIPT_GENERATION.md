# Dynamic Script Generation for Complex Backtests

## Overview

While the production API supports both rule-based and custom strategies (like `OpeningRangeBreakoutStrategy`), some backtests require highly specialized logic that doesn't fit into pre-registered strategy classes. For these cases, Claude can generate and execute TypeScript scripts dynamically.

**Key Principle:** Users never write code themselves. Claude analyzes the strategy request and decides whether to:
1. Use the existing API (rule-based or pre-registered custom strategies)
2. Generate a one-off TypeScript script for complex logic

## When to Use Dynamic Scripts vs API

**Use the Production API when:**
- ✅ Strategy fits rule-based configuration (MA crossover, RSI, etc.)
- ✅ Strategy matches a pre-registered custom strategy (ORB, mean reversion)
- ✅ Logic can be expressed with existing indicators + conditions
- ✅ User wants to save and reuse the strategy

**Generate a Dynamic Script when:**
- ✅ Complex time-based logic (opening range calculations)
- ✅ Stateful tracking not supported by API (tracking intraday highs/lows)
- ✅ One-off analysis or parameter comparison
- ✅ Logic requires sequential conditions that change during the day
- ✅ Rapid prototyping before formalizing into a custom strategy class

## Script Generation Service Architecture

```
User Request
    ↓
Claude (Conversation Handler)
    ↓
Decision: API or Script?
    ↓
    ├─→ API Route → BacktestService → Return JSON results
    │
    └─→ ScriptGenerationService
            ├─ Generate TypeScript from template
            ├─ Write to /tmp/backtest-{uuid}.ts
            ├─ Execute via ts-node
            ├─ Capture stdout/stderr
            ├─ Parse results
            ├─ Clean up temp file
            └─ Return formatted results to Claude
```

## File Structure Addition

```
backend/
├── src/
│   ├── services/
│   │   ├── script-execution.service.ts  # NEW: Execute dynamic scripts
│   │   ├── script-generator.service.ts  # NEW: Generate scripts from templates
│   │   └── ...
│   ├── templates/
│   │   ├── orb-backtest.template.ts     # NEW: ORB script template
│   │   ├── basic-backtest.template.ts   # NEW: Basic backtest template
│   │   └── ...
│   └── ...
└── scripts-output/                       # NEW: Store script execution logs
```

## Script Template System

Scripts are generated from templates with variable substitution:

**Example Template: Opening Range Breakout**

```typescript
// templates/orb-backtest.template.ts
import { initializeDatabase, getDatabase } from '../database/db';

interface BacktestConfig {
  ticker: string;
  date: string;
  timeframe: string;
  trailingStopPct?: number;
  marketFilterTicker?: string;
  requireEarnings?: boolean;
}

async function runBacktest(config: BacktestConfig) {
  initializeDatabase();
  const db = getDatabase();

  // {{CUSTOM_LOGIC}} - Replaced by generator

  return {
    trades: trades,
    metrics: calculateMetrics(trades),
    summary: formatSummary(trades)
  };
}

runBacktest({{CONFIG}}).then(console.log).catch(console.error);
```

## Script Generation Service

```typescript
// src/services/script-generator.service.ts
export class ScriptGeneratorService {
  /**
   * Generate a backtest script from template
   */
  generateScript(params: {
    strategyType: 'orb' | 'custom';
    ticker: string;
    date: string;
    config: Record<string, any>;
  }): string {
    const template = this.loadTemplate(params.strategyType);

    // Replace template variables
    let script = template
      .replace('{{TICKER}}', params.ticker)
      .replace('{{DATE}}', params.date)
      .replace('{{CONFIG}}', JSON.stringify(params.config, null, 2));

    return script;
  }

  /**
   * Generate unique filename for script
   */
  generateFilename(): string {
    const uuid = crypto.randomUUID();
    return `/tmp/backtest-${uuid}.ts`;
  }
}
```

## Script Execution Service

```typescript
// src/services/script-execution.service.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export class ScriptExecutionService {
  /**
   * Execute a TypeScript script and return parsed results
   */
  async executeScript(scriptPath: string): Promise<BacktestScriptResult> {
    try {
      // Execute with timeout
      const { stdout, stderr } = await execAsync(
        `npx ts-node ${scriptPath}`,
        {
          cwd: process.cwd(),
          timeout: 30000, // 30 second timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      if (stderr) {
        console.error('Script stderr:', stderr);
      }

      // Parse JSON output from script
      const result = this.parseScriptOutput(stdout);

      return {
        success: true,
        data: result,
        stdout,
        stderr
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      };
    } finally {
      // Clean up temp file
      await fs.unlink(scriptPath).catch(() => {});
    }
  }

  /**
   * Parse script output - handle both JSON and console.log format
   */
  private parseScriptOutput(stdout: string): any {
    // Try to find JSON in output
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through to text parsing
      }
    }

    // Parse console.log format
    return this.parseConsoleOutput(stdout);
  }

  /**
   * Parse console.log formatted output from scripts like run-orb-backtest.ts
   */
  private parseConsoleOutput(stdout: string): any {
    const lines = stdout.split('\n');
    const result: any = {
      trades: [],
      metrics: {}
    };

    // Extract P&L, win rate, etc. from console output
    // (Implementation details depend on script output format)

    return result;
  }
}
```

## Conversation Flow Example

**User Request:**
```
User: "Backtest HOOD opening range breakout on July 31st 2025 with a 2% trailing stop and only if QQQ is positive"
```

**Claude's Decision Process:**
```typescript
// Claude analyzes the request:
{
  strategy: "Opening Range Breakout",
  complexity: "HIGH",
  reasoning: [
    "- Opening range requires time-based stateful logic",
    "- Need to track opening bar (9:30 AM) separately from entry logic",
    "- Can only enter AFTER 9:35 AM (prevent lookahead bias)",
    "- Trailing stop from highest price achieved",
    "- Market filter requires dependency ticker (QQQ)"
  ],
  decision: "GENERATE_SCRIPT",
  rationale: "While we have OpeningRangeBreakoutStrategy in the API, for one-off analysis or quick iteration, a script provides faster results."
}
```

**Claude's Actions:**
```typescript
// 1. Generate script using ScriptGeneratorService
const script = scriptGenerator.generateScript({
  strategyType: 'orb',
  ticker: 'HOOD',
  date: '2025-07-31',
  config: {
    openingRangeMinutes: 5,
    trailingStopPct: 2.0,
    marketFilterTicker: 'QQQ',
    requireEarnings: false
  }
});

// 2. Write to temp file
const scriptPath = '/tmp/backtest-a1b2c3d4.ts';
await fs.writeFile(scriptPath, script);

// 3. Execute
const result = await scriptExecutor.executeScript(scriptPath);

// 4. Format and return to user
```

**Claude's Response to User:**
```
I ran an opening range breakout backtest on HOOD for July 31st, 2025 with your parameters:

**Trade Results:**
- Entry: $105.13 at 9:40 AM (breakout confirmed, QQQ was positive)
- Exit: $106.33 at 10:25 AM (2% trailing stop hit)
- P&L: +$1,141.20 (+1.14%)
- Max gain during trade: +$1.85 (+1.76%)
- Trailing stop captured: 64.9% of max favorable excursion

**Performance:**
- Win rate: 100% (1 trade)
- Highest price achieved: $106.98
- Stop was hit when price retraced from $106.98 to $106.33

Would you like to:
1. Try different trailing stop percentages?
2. Run this on more dates to see consistency?
3. Compare with/without the QQQ filter?
```

## Script Output Format Standard

All generated scripts should output results in a consistent format:

```typescript
interface BacktestScriptOutput {
  backtest: {
    ticker: string;
    date: string;
    strategy: string;
    config: Record<string, any>;
  };
  trades: Array<{
    entry_time: string;
    entry_price: number;
    exit_time: string;
    exit_price: number;
    pnl: number;
    pnl_percent: number;
    exit_reason: string;
    max_gain?: number;
    max_loss?: number;
  }>;
  metrics: {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    total_pnl: number;
    total_pnl_percent: number;
    profit_factor?: number;
  };
  summary: string; // Human-readable summary
}
```

## Security Considerations

**Script Generation:**
- ✅ Use templates with variable substitution (never `eval()` user input)
- ✅ Validate all input parameters before substitution
- ✅ Sanitize ticker symbols (alphanumeric only)
- ✅ Validate date formats
- ✅ Limit numeric parameters to reasonable ranges

**Script Execution:**
- ✅ Execute with timeout (30 seconds default)
- ✅ Limit memory usage (via Node.js max-old-space-size)
- ✅ Run in isolated temp directory
- ✅ Clean up temp files after execution
- ✅ Limit output buffer size (10MB)
- ✅ No network access during script execution (except database)
- ✅ Read-only database access for scripts

**File System:**
- ✅ Scripts written to `/tmp` with UUID filenames
- ✅ Automatic cleanup after execution
- ✅ Limit concurrent script executions (queue if needed)

## Migration Path: Script → API

When a script-based approach proves valuable and needs to be reusable:

1. **Claude identifies pattern:** "You've run this ORB strategy multiple times"
2. **Claude suggests:** "Would you like me to save this as a reusable strategy?"
3. **User agrees**
4. **Claude creates:** Strategy record in database using `OpeningRangeBreakoutStrategy`
5. **Future runs:** Use the API instead of generating scripts

## API Endpoints for Script Execution

```typescript
// POST /api/backtests/execute-script
// Internal endpoint - used by Claude, not exposed to users
{
  "scriptTemplate": "orb",
  "parameters": {
    "ticker": "HOOD",
    "date": "2025-07-31",
    "trailingStopPct": 2.0,
    "marketFilterTicker": "QQQ"
  }
}

// Response:
{
  "success": true,
  "executionId": "exec_123",
  "results": {
    "trades": [...],
    "metrics": {...},
    "summary": "..."
  },
  "executionTime": 2341, // ms
  "scriptPath": "/tmp/backtest-a1b2c3d4.ts" // for debugging
}
```

## Monitoring and Logging

```typescript
// Log all script executions
interface ScriptExecutionLog {
  id: string;
  template: string;
  parameters: Record<string, any>;
  success: boolean;
  executionTime: number;
  stdout: string;
  stderr: string;
  error?: string;
  createdAt: Date;
}

// Store in database or log file for debugging
```

## Benefits of This Approach

**For Users:**
- No code writing required - just describe the strategy
- Fast iteration on complex logic
- Natural language → working backtest in seconds
- Can easily compare variations ("now try without the filter")

**For Claude:**
- Can handle any complexity level
- Falls back to scripts when API limitations reached
- Easy to debug (temp files can be inspected)
- Can show script to user if they want to learn

**For the Platform:**
- Extends capabilities beyond pre-built strategies
- Scripts can become templates for future strategies
- Identifies common patterns to formalize into API
- Maintains flexibility while building toward production features

## Implementation Priority

**Phase 1: MVP (Day 1)**
- Basic ScriptExecutionService with ts-node
- One template: Opening Range Breakout
- Simple output parsing (console.log format)
- Temp file management

**Phase 2: Enhanced (Day 2-3)**
- Multiple templates (ORB, basic momentum, mean reversion)
- Structured JSON output from scripts
- Error handling and timeouts
- Execution logging

**Phase 3: Production (Day 4-5)**
- Script execution queue (limit concurrency)
- Resource limits and security hardening
- Migration path from scripts → saved strategies
- Monitoring and alerting

## Existing Scripts to Use as Templates

The following existing scripts can be converted into templates:

1. **backend/run-orb-backtest-trailing-stop.ts** → `templates/orb-backtest.template.ts`
   - Opening range breakout with trailing stop
   - Market filter support (QQQ)
   - MFE/MAE tracking

2. **backend/run-orb-backtest.ts** → Basic ORB template
   - Simple ORB without trailing stop

3. **backend/run-orb-backtest-no-filter.ts** → ORB without market filter

4. **backend/run-orb-trailing-stop-comparison.ts** → Parameter optimization template

## Quick Start Implementation

To implement this feature today:

1. Create `ScriptExecutionService` with ability to run ts-node
2. Convert `run-orb-backtest-trailing-stop.ts` into a template
3. Create simple parameter substitution logic
4. Add basic output parsing (parse console.log format from existing scripts)
5. Clean up temp files after execution

**Estimated Time: 2-3 hours**

This gives Claude the ability to handle complex backtests immediately while the full API matures.
