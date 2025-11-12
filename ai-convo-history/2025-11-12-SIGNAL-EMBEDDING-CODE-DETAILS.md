# Signal Embedding - Detailed Code Analysis

## Complete Signal Embedding Flow

### Step 1: Execute Scanner, Get 500 Signals
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Lines 96-101:**

```typescript
// Step 2: Execute scan
logger.info('Step 2: Running scan');
const scanResults = await this.executeScan(strategy.scanScript, strategy.scannerTokenUsage);
logger.info('Scan complete', {
  signalsFound: scanResults.length,
  tickers: [...new Set(scanResults.map((s: any) => s.ticker))]
});
```

### Step 2: Filter 500 Signals Down to 200
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Lines 34-40 (CONFIG):**

```typescript
const DEFAULT_BACKTEST_CONFIG: AgentBacktestConfig = {
  max_signals_per_iteration: 200,     // CAP at 200 signals for statistical significance
  max_signals_per_ticker_date: 2,     // Max 2 signals per ticker per day
  max_signals_per_date: 200,          // Max 200 signals per unique date
  min_pattern_strength: 0,            // Minimum quality score (0 = accept all)
  backtest_timeout_ms: 120000,        // 2 minute timeout per backtest
};
```

**Lines 505-521 (FILTERING):**

```typescript
console.log(`   Raw scan results: ${scanResults.length}`);

// Apply signal filtering to reduce to manageable set
const filteredResults = this.applySignalFiltering(scanResults, DEFAULT_BACKTEST_CONFIG);

console.log(`   Testing ${DEFAULT_TEMPLATES.length} execution templates on ${filteredResults.length} filtered signals...`);

// Group signals by ticker
const signalsByTicker: { [ticker: string]: any[] } = {};
for (const signal of filteredResults) {
  if (!signalsByTicker[signal.ticker]) {
    signalsByTicker[signal.ticker] = [];
  }
  signalsByTicker[signal.ticker].push(signal);
}

console.log(`   Grouped into ${Object.keys(signalsByTicker).length} ticker(s)`);
```

**Lines 1144-1173 (FILTERING IMPLEMENTATION):**

```typescript
private applySignalFiltering(signals: any[], config: AgentBacktestConfig): any[] {
  console.log(`\n📊 Signal Filtering:`);
  console.log(`   Raw scan results: ${signals.length}`);

  // Step 1: Filter by minimum quality
  const qualityFiltered = signals.filter(signal =>
    (signal.pattern_strength || 0) >= config.min_pattern_strength
  );
  console.log(`   After quality filter (>=${config.min_pattern_strength}): ${qualityFiltered.length}`);

  // Step 2: Apply diversification (limit per ticker/date, limit per date)
  const diversified = this.applyDiversification(
    qualityFiltered,
    config.max_signals_per_ticker_date,
    config.max_signals_per_date
  );
  console.log(`   After diversification: ${diversified.length}`);

  // Step 3: Sort by quality and take top N
  const final = diversified
    .sort((a, b) => (b.pattern_strength || 0) - (a.pattern_strength || 0))
    .slice(0, config.max_signals_per_iteration);  // <-- CAP TO 200!

  console.log(`   Final set to backtest: ${final.length}`);

  const estimatedMinutes = (final.length * config.backtest_timeout_ms / 1000 / 60).toFixed(1);
  console.log(`   Estimated time: ~${estimatedMinutes} minutes\n`);

  return final;
}
```

### Step 3: Generate Custom Execution Script
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`
**Lines 1801-1850 (PARTIAL):**

The Claude API generates a script that looks something like:

```typescript
// Example of what Claude generates:
import { initializeDatabase, getDatabase } from '../../src/database/db';

interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  direction: 'LONG' | 'SHORT';
  metrics: Record<string, any>;
}

// THIS IS THE KEY: Empty placeholder that gets replaced!
const signals = [];

async function executeSignals(signals: Signal[]): Promise<Trade[]> {
  const db = getDatabase();
  const results: Trade[] = [];

  for (const signal of signals) {
    // ... execution logic here
  }

  return results;
}

const trades = await executeSignals(signals);
console.log(JSON.stringify(trades, null, 2));
```

### Step 4: INJECT 200 SIGNALS INTO SCRIPT VIA REGEX
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Lines 629-678 (THE CRITICAL EMBEDDING CODE):**

```typescript
try {
  // Embed signals data into the custom script
  // The custom script expects to read from stdin, but we'll embed the data directly
  const signalsJson = JSON.stringify(filteredResults, null, 2);

  // Replace either the readFileSync pattern OR the empty array placeholder
  let scriptWithSignals = executionScript.replace(
    /const input = require\('fs'\)\.readFileSync\(0, 'utf-8'\);?\s*const signals = JSON\.parse\(input\);?/g,
    `const signals = ${signalsJson};`
  );

  // Also handle the placeholder pattern: const signals = [];
  scriptWithSignals = scriptWithSignals.replace(
    /const signals\s*=\s*\[\s*\];?/g,
    `const signals = ${signalsJson};`
  );

  // Fix import paths: Claude generates ../../src/database/db but script is nested 3 levels deep
  // generated-scripts/success/YYYY-MM-DD/ -> need ../../../src/database/db
  scriptWithSignals = scriptWithSignals.replace(
    /from ['"]\.\.\/\.\.\/src\//g,
    `from '../../../src/`
  );

  // Add database initialization if missing
  // Look for import of getDatabase and add initializeDatabase import if not present
  if (!scriptWithSignals.includes('initializeDatabase')) {
    scriptWithSignals = scriptWithSignals.replace(
      /import \{ getDatabase \} from ['"]\.\.\/\.\.\/\.\.\/src\/database\/db['"]/,
      `import { initializeDatabase, getDatabase } from '../../../src/database/db'`
    );
  }

  // Add database initialization call before executeSignals if missing
  // Look for the pattern where executeSignals is called
  if (!scriptWithSignals.includes('initializeDatabase(')) {
    scriptWithSignals = scriptWithSignals.replace(
      /async function executeSignals\(signals: Signal\[\]\): Promise<Trade\[\]> \{[\s\S]*?const db = getDatabase\(\);/,
      (match) => {
        // Add initialization call before getDatabase
        return match.replace(
          'const db = getDatabase();',
          `const dbPath = process.env.DATABASE_PATH || './backtesting.db';\n  initializeDatabase(dbPath);\n  const db = getDatabase();`
        );
      }
    );
  }

  // Save modified script to file
  fs.writeFileSync(scriptPath, scriptWithSignals);

  // Execute with 120 second timeout
  const result = await this.scriptExecution.executeScript(scriptPath, 120000, tokenUsage);
```

## What The Generated File Looks Like After Embedding

**Before embedding (what Claude generates):**
```typescript
const signals = [];

async function executeSignals(signals: Signal[]): Promise<Trade[]> {
  // ... code
}
```

**After embedding (200 actual signals):**
```typescript
const signals = [
  {
    "ticker": "AAPL",
    "signal_date": "2025-11-10",
    "signal_time": "09:35:00",
    "direction": "LONG",
    "metrics": {
      "rsi": 42.5,
      "pattern_strength": 0.85
    }
  },
  {
    "ticker": "GOOGL",
    "signal_date": "2025-11-10",
    "signal_time": "10:15:00",
    "direction": "SHORT",
    "metrics": {
      "rsi": 68.2,
      "pattern_strength": 0.78
    }
  },
  // ... repeat 198 more times
];

async function executeSignals(signals: Signal[]): Promise<Trade[]> {
  // ... code
}
```

## The Regex Patterns Used for Signal Replacement

### Pattern 1: File-based stdin loading (legacy)
```regex
/const input = require\('fs'\)\.readFileSync\(0, 'utf-8'\);?\s*const signals = JSON\.parse\(input\);?/g
```
Replaces:
```typescript
const input = require('fs').readFileSync(0, 'utf-8');
const signals = JSON.parse(input);
```
With:
```typescript
const signals = [{ ... }, { ... }, ...];
```

### Pattern 2: Empty array placeholder (current default)
```regex
/const signals\s*=\s*\[\s*\];?/g
```
Replaces:
```typescript
const signals = [];
// or
const signals=[];
// or
const signals = [ ];
```
With:
```typescript
const signals = [{ ... }, { ... }, ...];
```

## Why Iteration 6 Could Have Empty Signals

### Hypothesis 1: Regex Pattern Miss
If Claude generates:
```typescript
const signals: Signal[] = [];
```

The regex `/const signals\s*=\s*\[\s*\];?/` would NOT match because of the type annotation `: Signal[]`.

**Fix:** Update regex to:
```regex
/const signals(?::\s*Signal\[\])?\s*=\s*\[\s*\];?/g
```

### Hypothesis 2: Script Generation Failed
If `generateExecutionScript()` threw an error (lines 1801+), the `strategy.executionScript` would be empty string, and the embedding would have nothing to embed.

### Hypothesis 3: Iteration 2+ Script Regeneration Skipped
Lines 105-127 only regenerate the script IF:
1. Iteration > 1
2. scanResults.length > 0
3. previousIteration exists
4. previousIteration.backtest_results exists
5. previousIteration.expert_analysis exists

If ANY of these fail, the script from iteration 1 is reused without updating signals.

## Size Implications of 200-Signal Cap

**JSON Size Calculation:**
- Per signal (minimal): ~200 bytes (ticker, date, time, direction, basic metrics)
- 200 signals × 200 bytes = 40 KB
- With pretty printing (null, 2): ~80-100 KB
- In JavaScript literal: ~100-120 KB raw file size

**Potential Issues:**
1. TypeScript compilation might time out on 100+ KB inline array
2. V8 JavaScript parser might struggle with massive object literals
3. String replacement on 1MB+ generated script could be slow
4. File I/O with these sizes could cause issues

## Signal Embedding Summary Table

| Stage | Input | Process | Output | Location |
|-------|-------|---------|--------|----------|
| 1. Scan | Strategy | Execute scanner script | 500 signals | Line 97 |
| 2. Filter | 500 signals | Apply filtering rules | 200 signals | Line 507-508 |
| 3. JSON | 200 signals | JSON.stringify() | 40-100 KB JSON string | Line 632 |
| 4. Embed | Script + JSON | Regex replace | Script with signals | Lines 635-644 |
| 5. Fix | Script | Import/DB fixes | Final script | Lines 646-675 |
| 6. Write | Final script | fs.writeFileSync | Script file | Line 678 |
| 7. Execute | Script file | TypeScript execution | Trade results | Line 681 |

## Key Observations

1. **No validation** after embedding signals - should verify the regex actually matched
2. **Silent failure** - if regex doesn't match, script runs with empty signals array
3. **No type safety** - generated script and embedding code don't validate signal interface
4. **Large data** - 200 signals creates massive inline JSON (100+ KB)
5. **Multiple regex operations** - 4 separate regex replacements, any could fail
