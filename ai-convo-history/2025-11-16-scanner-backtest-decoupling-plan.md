# Scanner-Backtest Decoupling Architecture Plan
**Date:** 2025-11-16
**Status:** Planning

## Overview

Refactor the system to decouple scanner generation from backtest execution, enabling:
- Reusable scanner versions tested across multiple conditions
- Model selection (Sonnet vs Haiku) for scanner generation
- Multiple backtests per scanner (different dates/tickers/execution scripts)
- Better organization and cost efficiency

## Current Architecture Problems

1. **Tight Coupling:** Each "iteration" bundles scanner generation + execution
2. **No Reusability:** Can't test same scanner on different dates/tickers
3. **Walk-forward Confusion:** Doesn't align with natural language prompt approach
4. **No Model Choice:** Always uses default model for generation
5. **Poor Naming:** "Iteration 5" doesn't convey what the scanner does

## Proposed Architecture

### Conceptual Model

```
Scanner Version (e.g., "Gap Down Reversal v3")
├── Scanner Code (TypeScript)
├── Model Used (Sonnet/Haiku)
├── Generation Prompt
├── Created Date
└── Backtests
    ├── Backtest 1: 2025-01-01 to 2025-01-31, SP500, Aggressive Execution
    ├── Backtest 2: 2025-02-01 to 2025-02-28, SP500, Conservative Execution
    ├── Backtest 3: 2025-01-01 to 2025-01-31, Russell2000, Aggressive Execution
    └── Backtest 4: 2025-03-01 to 2025-03-31, SP500, Aggressive Execution (out-of-sample)
```

### Database Schema Changes

#### New: `scanner_versions` table
```sql
CREATE TABLE scanner_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  name TEXT, -- Optional user-friendly name (e.g., "Gap Down Reversal")
  scanner_code TEXT NOT NULL,
  generation_prompt TEXT,
  model_used TEXT NOT NULL, -- 'sonnet' or 'haiku'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  manual_guidance TEXT,
  token_usage TEXT, -- JSON with prompt/completion tokens
  FOREIGN KEY (agent_id) REFERENCES learning_agents(id),
  UNIQUE(agent_id, version_number)
);
```

#### New: `execution_templates` table (for deduplication)
```sql
CREATE TABLE execution_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT UNIQUE NOT NULL,   -- SHA256 hash of code (for dedup)
  template_name TEXT,                -- 'aggressive', 'conservative', 'custom'
  code TEXT NOT NULL,                -- Actual execution code
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_execution_templates_hash ON execution_templates(code_hash);
```

#### New: `backtests` table
```sql
CREATE TABLE backtests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scanner_version_id INTEGER NOT NULL,
  name TEXT, -- Auto-generated name (e.g., "SP500 aggressive (2025-01-01 to 2025-01-31)")

  -- Test Configuration
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  tickers TEXT, -- JSON array
  universe TEXT, -- 'SP500', 'RUSSELL2000', 'custom', etc.
  execution_template_id INTEGER NOT NULL, -- Reference to deduplicated execution code

  -- Results
  signals_found INTEGER,
  trades_executed INTEGER,
  signals_data TEXT, -- JSON with all signals
  trades_data TEXT, -- JSON with all trades
  performance_metrics TEXT, -- JSON with win rate, total PnL, etc.

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  error_message TEXT,

  FOREIGN KEY (scanner_version_id) REFERENCES scanner_versions(id),
  FOREIGN KEY (execution_template_id) REFERENCES execution_templates(id)
);
```

#### Migrate: `learning_iterations` → Read-only archive
- Keep existing table for historical data
- Mark as deprecated in code
- Eventually migrate to new structure

### API Design

#### 1. Generate New Scanner Version
```typescript
POST /api/learning-agents/:agentId/scanner-versions

Body:
{
  prompt: string,              // Scanner generation prompt
  model: 'sonnet' | 'haiku',   // Model to use
  manualGuidance?: string,     // Optional manual guidance
  runBacktest?: {              // Optional: Quick iterate mode (generate + run backtest)
    startDate: string,
    endDate: string,
    tickers?: string[],
    universe?: string,
    executionTemplate?: string,
    customExecutionCode?: string
  }
}

Response:
{
  versionId: number,
  versionNumber: number,
  name: string,               // Auto-generated from prompt
  scannerCode: string,
  tokenUsage: {...},
  model: 'sonnet' | 'haiku',
  backtest?: {                // If runBacktest was provided
    backtestId: number,
    signalsFound: number,
    tradesExecuted: number,
    performanceMetrics: {...}
  }
}
```

#### 2. Run Backtest on Scanner Version
```typescript
POST /api/scanner-versions/:versionId/backtests

Body:
{
  startDate: string,
  endDate: string,
  tickers?: string[],                // Optional custom tickers
  universe?: string,                 // Or use predefined universe
  executionTemplate?: string,        // 'aggressive', 'conservative', etc.
  customExecutionCode?: string,      // User-provided execution code (overrides template)
}

Response:
{
  backtestId: number,
  name: string,                      // Auto-generated from config
  status: 'completed',
  signalsFound: number,
  tradesExecuted: number,
  performanceMetrics: {...}
}

Note: Backend will snapshot the execution template code at runtime and store it.
If executionTemplate='aggressive', we read aggressive.ts, snapshot the code, and store it.
If customExecutionCode is provided, we store that directly.
This ensures complete reproducibility even if templates change later.
```

#### 3. Get Scanner Version with Backtests
```typescript
GET /api/scanner-versions/:versionId

Response:
{
  id: number,
  versionNumber: number,
  name: string,
  scannerCode: string,
  model: 'sonnet' | 'haiku',
  createdAt: string,
  backtests: [
    {
      id: number,
      name: string,
      startDate: string,
      endDate: string,
      universe: string,
      executionTemplate: string,
      signalsFound: number,
      tradesExecuted: number,
      performanceMetrics: {...}
    }
  ]
}
```

#### 4. List Scanner Versions for Agent
```typescript
GET /api/learning-agents/:agentId/scanner-versions

Response:
{
  scannerVersions: [
    {
      id: number,
      versionNumber: number,
      name: string,
      model: 'sonnet' | 'haiku',
      createdAt: string,
      backtestCount: number,
      bestPerformance: {...} // Best backtest results
    }
  ]
}
```

### Service Refactoring

#### New: `ScannerVersionService`
```typescript
class ScannerVersionService {
  // Generate new scanner version using Claude
  async generateVersion(
    agentId: string,
    prompt: string,
    model: 'sonnet' | 'haiku',
    options?: {
      manualGuidance?: string,
      runBacktest?: BacktestConfig  // Quick iterate mode
    }
  ): Promise<ScannerVersionWithOptionalBacktest>

  // Get scanner version by ID
  async getVersion(versionId: number): Promise<ScannerVersion>

  // List versions for agent
  async listVersions(agentId: string): Promise<ScannerVersion[]>

  // Get version with all backtests
  async getVersionWithBacktests(versionId: number): Promise<ScannerVersionWithBacktests>
}
```

#### New: `BacktestService`
```typescript
class BacktestService {
  // Run backtest on scanner version
  async runBacktest(
    scannerVersionId: number,
    config: {
      startDate: string,
      endDate: string,
      tickers?: string[],
      universe?: string,
      executionTemplate?: string,      // Template name (will snapshot code)
      customExecutionCode?: string     // Or custom code (user-provided)
    }
  ): Promise<Backtest>

  // Implementation will:
  // 1. Get execution code (from template file or custom code)
  // 2. Hash the code (SHA256)
  // 3. Check if hash exists in execution_templates table
  // 4. If exists: reuse that ID. If not: insert new template
  // 5. Store execution_template_id in backtest (deduplicated reference)

  // Get backtest by ID
  async getBacktest(backtestId: number): Promise<Backtest>

  // List backtests for scanner version
  async listBacktests(scannerVersionId: number): Promise<Backtest[]>

  // Compare multiple backtests
  async compareBacktests(backtestIds: number[]): Promise<BacktestComparison>
}
```

#### Refactor: `LearningIterationService`
- Mark as deprecated
- Keep for backward compatibility
- Internally use new services
- Eventually remove

### Frontend Changes

#### New UI Flow

1. **Scanner Versions Tab**
   - List all scanner versions for agent
   - Show version number, auto-generated name, model used, creation date
   - Show summary stats (number of backtests, best performance)
   - "Generate New Version" button with:
     - Prompt input
     - Model selector (Sonnet/Haiku)
     - Optional "Quick Test" checkbox to run immediate backtest

2. **Scanner Version Detail Page**
   - Show scanner code
   - Show generation prompt and model used
   - List all backtests for this version
   - "Run New Backtest" button
   - Comparison view for backtests

3. **Backtest Configuration Modal**
   - Date range picker
   - Ticker/universe selector
   - Execution template dropdown (aggressive, conservative, etc.)
   - "Custom Execution Code" textarea (optional override)
   - "Run Backtest" button

4. **Backtest Results View**
   - Signals table
   - Trades table
   - Performance metrics
   - Charts (equity curve, win rate, etc.)

### Migration Strategy

#### Phase 1: Database Schema
1. Create new tables: `scanner_versions`, `backtests`
2. Keep `learning_iterations` as-is (read-only)
3. Add indices for performance

#### Phase 2: Backend Services
1. Implement `ScannerVersionService`
2. Implement `BacktestService`
3. Keep `LearningIterationService` working with new services internally

#### Phase 3: API Routes
1. Add new routes for scanner versions
2. Add new routes for backtests
3. Keep old routes working for backward compatibility

#### Phase 4: Frontend
1. Add new UI components
2. Update agent detail page
3. Add backtest comparison views

#### Phase 5: Data Migration (Optional)
1. Write migration script to convert iterations → scanner versions + backtests
2. Run migration on existing data
3. Verify integrity

#### Phase 6: Cleanup
1. Remove old iteration UI (or hide behind feature flag)
2. Mark old API routes as deprecated
3. Update documentation

## Reproducibility Architecture

### The Problem
If we only store the template name (e.g., `execution_template = 'aggressive'`), and later modify `aggressive.ts`, we can't reproduce old backtest results.

### The Solution: Content-Addressed Storage (Like Git)

**Deduplicate execution code using hashes** to avoid database bloat:

```typescript
async function getOrCreateExecutionTemplate(
  templateName: string,
  code: string
): Promise<number> {
  // 1. Hash the code
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  // 2. Check if this exact code already exists
  const existing = await db.get(
    'SELECT id FROM execution_templates WHERE code_hash = ?',
    codeHash
  );

  if (existing) {
    return existing.id;  // Reuse existing template
  }

  // 3. New code - insert and return new ID
  const result = await db.run(
    'INSERT INTO execution_templates (code_hash, template_name, code) VALUES (?, ?, ?)',
    codeHash, templateName, code
  );

  return result.lastID;
}

// When creating a backtest:
const templateCode = config.customExecutionCode ||
  fs.readFileSync(`./templates/execution/${config.executionTemplate}.ts`, 'utf-8');

const templateId = await getOrCreateExecutionTemplate(
  config.executionTemplate || 'custom',
  templateCode
);

// Store only the reference (4 bytes) instead of full code (10 KB)
backtest.execution_template_id = templateId;
```

### Space Savings

**Without Deduplication:**
- 1,000 backtests × 10 KB code = **10 MB**

**With Deduplication:**
- 5 unique templates × 10 KB = 50 KB
- 1,000 backtest refs × 4 bytes = 4 KB
- **Total: 54 KB (99.5% reduction!)**

### Benefits
1. **Complete Reproducibility:** Can re-run any backtest with exact code used
2. **Template Evolution:** Free to improve templates without breaking old results
3. **Auditability:** Can see exactly what logic was used for any backtest
4. **Debugging:** If results look weird, inspect actual execution code used
5. **Space Efficient:** 99%+ savings when running multiple backtests with same templates

### Database Design
- `execution_templates` table: Stores unique code (deduplicated by hash)
- `backtests.execution_template_id`: Reference to execution code (tiny footprint)
- Multiple backtests using same code → share same execution_templates record

## Benefits

### 1. **Cost Efficiency**
- Generate scanner once with expensive Sonnet model
- Run multiple backtests without re-generating
- Use cheap Haiku model for simple scanners

### 2. **Better Testing**
- Out-of-sample testing: Run same scanner on future dates
- Cross-universe testing: SP500 vs Russell2000
- Execution strategy comparison: Same signals, different exits

### 3. **Cleaner Organization**
- "Gap Down Reversal v5" is clearer than "Iteration 23"
- Backtests grouped by scanner strategy
- Easy to track scanner evolution

### 4. **Flexibility**
- Test scanner on new dates without regenerating
- Try different execution strategies
- A/B test scanner modifications

### 5. **Performance**
- Scanner generation is slow (Claude API)
- Backtest execution is fast (local code)
- Decouple slow from fast operations

## Example Workflow

### Old Way (Current)
```
1. Run iteration 5 → generates scanner + executes on 10 days
2. Want to test on different dates? → Run iteration 6 (regenerates scanner)
3. Want to test different execution? → Run iteration 7 (regenerates scanner)
4. Scanner generation cost: $$$
```

### New Way (Proposed)
```
1. Generate Scanner v5 with Sonnet → "Gap Down with Volume Spike"
2. Run Backtest 1: Jan 1-31, SP500, Aggressive
3. Run Backtest 2: Feb 1-28, SP500, Aggressive (out-of-sample)
4. Run Backtest 3: Jan 1-31, SP500, Conservative (different execution)
5. Run Backtest 4: Jan 1-31, Russell2000, Aggressive (different universe)
6. Scanner generation cost: $ (only once)
```

## Design Decisions

### 1. Quick Iterate Mode
**Decision:** YES - Support generating scanner + running backtest in one API call

**Rationale:**
- Fast iteration during initial development
- Reduces friction when testing new ideas
- Can still run additional backtests manually later
- Implementation: Add optional `runBacktest` parameter to scanner generation endpoint

### 2. Execution Templates
**Decision:** Keep templates with custom code override + snapshot execution code

**Rationale:**
- Predefined templates (aggressive, conservative, etc.) for common strategies
- Allow users to paste custom execution code when needed
- Custom code is user-provided, NOT Claude-generated
- Either `executionTemplate` OR `customExecutionCode` (mutually exclusive)
- **CRITICAL:** Always snapshot actual execution code to database for reproducibility
  - If template selected: Read template file, store both name (metadata) + actual code
  - If custom code: Store code directly with template name = 'custom'
  - This ensures backtests are reproducible even if templates change later

### 3. Backtest Immutability
**Decision:** YES - Backtests are read-only after creation

**Rationale:**
- Ensures reproducibility of results
- Prevents accidental data corruption
- Clear audit trail of what was tested when
- To "edit" a backtest, create a new one

### 4. Scanner Evolution Display
**Decision:** NO - No evolution/parent-child tracking

**Rationale:**
- Adds complexity without clear value
- Users can see chronological list of versions
- Version numbers + timestamps are sufficient
- Can always add later if needed

### 5. Naming Conventions
**Decision:** Auto-generate names from prompts

**Rationale:**
- Reduces user friction (no manual naming required)
- Names can be extracted from prompt using simple heuristics
- Examples:
  - Prompt: "Find gap down stocks with volume spike" → "Gap Down Volume Spike Scanner"
  - Fallback: "Scanner v{N}" if extraction fails
- Implementation: Use first sentence of prompt, title case, append "Scanner"

## Name Generation Examples

```typescript
// Name generation logic
function generateScannerName(prompt: string, versionNumber: number): string {
  // Extract first sentence or first 50 chars
  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  const cleanText = firstSentence.substring(0, 50);

  // Convert to title case and append "Scanner"
  const titleCase = cleanText
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Fallback if extraction fails
  if (!titleCase || titleCase.length < 5) {
    return `Scanner v${versionNumber}`;
  }

  return `${titleCase} Scanner`;
}

// Examples:
generateScannerName("Find gap down stocks with volume spike", 5)
// → "Find Gap Down Stocks With Volume Spike Scanner"

generateScannerName("detect reversal patterns in oversold conditions using RSI", 3)
// → "Detect Reversal Patterns In Oversold Conditions Scanner"

generateScannerName("", 7)
// → "Scanner v7"
```

## Backtest Name Generation Examples

```typescript
function generateBacktestName(config: BacktestConfig): string {
  const universe = config.universe || 'Custom';
  const execution = config.executionTemplate || 'Custom Exec';
  const dateRange = `${config.startDate} to ${config.endDate}`;

  return `${universe} ${execution} (${dateRange})`;
}

// Examples:
generateBacktestName({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  universe: 'SP500',
  executionTemplate: 'aggressive'
})
// → "SP500 aggressive (2025-01-01 to 2025-01-31)"

generateBacktestName({
  startDate: '2025-02-01',
  endDate: '2025-02-28',
  tickers: ['AAPL', 'MSFT'],
  customExecutionCode: '...'
})
// → "Custom Custom Exec (2025-02-01 to 2025-02-28)"
```

## Next Steps

1. ✅ **Review plan with user** - Complete
2. ✅ **Resolve design decisions** - Complete
3. **Implement Phase 1: Database Schema**
4. **Implement Phase 2: Backend Services**
5. **Implement Phase 3: API Routes**
6. **Implement Phase 4: Frontend**
7. **Test thoroughly**
8. **Deploy**

## Notes

- This is a significant refactoring but provides much better UX
- Backward compatibility is maintained during migration
- Cost savings from scanner reuse could be substantial
- Better aligns with actual usage patterns
