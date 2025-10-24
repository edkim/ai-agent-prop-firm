# Strategy Parameter Optimization System

## Overview

This document outlines the design for a comprehensive parameter optimization system that allows testing different parameter combinations, tickers, and date ranges while minimizing Claude API costs.

## Current State Analysis

**Existing Architecture:**
- Claude generates TypeScript backtest scripts based on natural language prompts
- Scripts are saved to `claude-generated-scripts/` with metadata
- Scripts currently have **hardcoded parameters** like:
  - `smaPeriod = 5`
  - `stopLossPercent = 1.0`
  - `takeProfitPercent = 3.0`
  - `ticker`, `timeframe`, `tradingDays[]`

**Key Insight: Cost Efficiency**
- Claude only needs to generate the script **ONCE** for a given strategy
- After generation, the script can be executed **hundreds of times** with different parameters
- **Cost:** 1 Claude API call → unlimited parameter combinations

---

## Architecture: 3-Phase Approach

### Phase 1: Parameterized Script Generation (Foundation)

**Goal:** Modify Claude to generate scripts that accept runtime parameters instead of hardcoded values.

#### Changes Required

**1. Update Claude System Prompt**
- File: `src/services/claude.service.ts`
- Instruct Claude to generate scripts with parameterizable values
- Add instructions for accepting parameters via:
  - Command-line arguments (`process.argv`)
  - Environment variables
  - Configuration object passed to main function

**2. Script Structure Change**

Current (Hardcoded):
```typescript
async function runBacktest() {
  const ticker = 'USAR';
  const smaPeriod = 5;
  const stopLossPercent = 1.0;
  const takeProfitPercent = 3.0;
  const tradingDays = ['2025-10-09', '2025-10-10', ...];
  // ...
}
```

New (Parameterized):
```typescript
interface BacktestConfig {
  ticker: string;
  timeframe: string;
  smaPeriod: number;
  consecutiveBars: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  tradingDays: string[];
  volumeFilter?: number;
  // ... other strategy-specific params
}

async function runBacktest(config: BacktestConfig) {
  const {
    ticker,
    timeframe,
    smaPeriod,
    consecutiveBars,
    stopLossPercent,
    takeProfitPercent,
    tradingDays,
    volumeFilter
  } = config;

  // Strategy logic uses config values...
}

// Accept config as JSON from stdin or file
const configPath = process.argv[2] || './backtest-config.json';
const config: BacktestConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
runBacktest(config);
```

**3. Benefits**
- 1 Claude call generates reusable script
- Can test infinite parameter combinations
- Can reuse existing scripts from `claude-generated-scripts/`
- No additional Claude API costs for optimization

---

### Phase 2: Parameter Sweep & Grid Search

**Goal:** Build API endpoint that runs the same strategy with multiple parameter combinations.

#### New API Endpoint

**Endpoint:** `POST /api/backtests/optimize`

**Request Schema:**
```typescript
interface OptimizationRequest {
  // Strategy definition (generates script once)
  strategyPrompt: string;

  // Base parameters (common across all tests)
  baseParams: {
    ticker?: string;
    timeframe?: string;
    strategyType?: string;
  };

  // Parameter grid to test
  parameterGrid: {
    [paramName: string]: number[] | string[];
  };

  // Multi-ticker testing
  tickers?: string[];

  // Multi-date-range testing
  dateRanges?: Array<{
    start: string;
    end: string;
  }>;

  // Optimization settings
  settings?: {
    maxConcurrent?: number;  // Max parallel script executions
    timeout?: number;         // Per-execution timeout
    saveResults?: boolean;    // Save to database
  };
}
```

**Example Request:**
```json
{
  "strategyPrompt": "Enter long when price above SMA for N consecutive bars, short when below. Use X% stop loss and Y% take profit.",
  "baseParams": {
    "timeframe": "1min",
    "strategyType": "sma-momentum"
  },
  "parameterGrid": {
    "smaPeriod": [5, 9, 20, 50],
    "consecutiveBars": [3, 5, 7],
    "stopLossPercent": [0.5, 1.0, 1.5, 2.0],
    "takeProfitPercent": [1.5, 2.0, 3.0, 4.0]
  },
  "tickers": ["TSLA", "AAPL", "NVDA", "SPY"],
  "dateRanges": [
    { "start": "2025-09-01", "end": "2025-09-10" },
    { "start": "2025-10-01", "end": "2025-10-10" }
  ],
  "settings": {
    "maxConcurrent": 5,
    "saveResults": true
  }
}
```

**Response Schema:**
```typescript
interface OptimizationResponse {
  optimizationId: string;
  totalCombinations: number;
  claudeApiCalls: number;  // Should be 1
  status: 'running' | 'completed' | 'failed';
  results?: OptimizationResult[];
  summary?: {
    bestParameters: { [key: string]: any };
    bestPerformance: PerformanceMetrics;
    completionTime: number;
  };
}

interface OptimizationResult {
  parameters: { [key: string]: any };
  ticker: string;
  dateRange: { start: string; end: string };
  metrics: PerformanceMetrics;
  trades: TradeResult[];
}

interface PerformanceMetrics {
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  profitFactor?: number;
}
```

#### Execution Flow

1. **Script Generation (1 Claude call)**
   - Receive optimization request
   - Generate parameterized script using Claude
   - Save script to file system

2. **Parameter Combination Generation**
   - Calculate cartesian product of all parameter values
   - Example: 4 SMA × 3 bars × 4 stops × 4 TPs = 192 combinations
   - Multiply by tickers and date ranges

3. **Parallel Execution**
   - Create config JSON for each combination
   - Execute script with config (via `ts-node` or compiled)
   - Respect `maxConcurrent` limit to avoid overwhelming system

4. **Result Aggregation**
   - Collect results from all executions
   - Calculate performance metrics
   - Rank by specified metric (Sharpe ratio, total P&L, win rate, etc.)

5. **Database Storage** (if enabled)
   - Save optimization run metadata
   - Save all parameter combinations and results
   - Enable historical comparison

#### Implementation Files

**New Service:** `src/services/optimization.service.ts`
```typescript
export class OptimizationService {
  async runOptimization(request: OptimizationRequest): Promise<OptimizationResponse>

  private async generateParameterCombinations(grid: ParameterGrid): Promise<ParameterSet[]>

  private async executeParameterSet(
    scriptPath: string,
    config: BacktestConfig
  ): Promise<OptimizationResult>

  private async rankResults(results: OptimizationResult[]): Promise<RankedResults>
}
```

**New Route:** `src/api/routes/optimization.ts`
```typescript
router.post('/optimize', async (req, res) => {
  // Validate request
  // Call OptimizationService
  // Return results or job ID for async processing
});

router.get('/optimize/:id', async (req, res) => {
  // Get optimization status/results by ID
});

router.get('/optimize/:id/results', async (req, res) => {
  // Get detailed results for specific optimization
});
```

**Database Schema:** `src/database/optimization.db.ts`
```sql
CREATE TABLE optimization_runs (
  id TEXT PRIMARY KEY,
  strategy_prompt TEXT NOT NULL,
  base_params JSON,
  parameter_grid JSON,
  tickers JSON,
  date_ranges JSON,
  total_combinations INTEGER,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  best_parameters JSON,
  best_performance JSON
);

CREATE TABLE optimization_results (
  id TEXT PRIMARY KEY,
  optimization_run_id TEXT,
  parameters JSON,
  ticker TEXT,
  date_range_start TEXT,
  date_range_end TEXT,
  metrics JSON,
  trades JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (optimization_run_id) REFERENCES optimization_runs(id)
);

CREATE INDEX idx_opt_runs_created ON optimization_runs(created_at);
CREATE INDEX idx_opt_results_run_id ON optimization_results(optimization_run_id);
CREATE INDEX idx_opt_results_ticker ON optimization_results(ticker);
```

---

### Phase 3: Results Visualization & Comparison

**Goal:** Provide intuitive UI for viewing, comparing, and analyzing optimization results.

#### Frontend Components

**1. Optimization Panel** (`src/components/OptimizationPanel.tsx`)

Features:
- Parameter grid input (add parameters, specify ranges/values)
- Ticker multi-select
- Date range selector (multiple ranges)
- Optimization settings (concurrent executions, metrics to optimize for)
- "Run Optimization" button
- Progress indicator during execution

**2. Results Dashboard** (`src/components/OptimizationResults.tsx`)

Features:
- **Summary Statistics**
  - Total combinations tested
  - Best performing parameters
  - Performance distribution charts

- **Comparison Table**
  - Sortable columns (all metrics)
  - Filter by ticker, date range, parameter values
  - Export to CSV/JSON
  - Highlight top N performers

- **Heatmaps**
  - 2D parameter heatmaps (e.g., SMA period vs. Take Profit)
  - Color-coded by performance metric
  - Interactive hover for details

- **Performance Charts**
  - Equity curves for top performers
  - Parameter sensitivity analysis
  - Win rate vs. profit factor scatter
  - Drawdown analysis

- **Detailed View**
  - Click any result to see individual trades
  - Compare specific parameter sets side-by-side
  - View generated script for that combination

**3. Historical Optimizations** (`src/components/OptimizationHistory.tsx`)

Features:
- List of past optimization runs
- Load previous results for comparison
- Delete old optimization runs
- Re-run optimization with different settings

#### API Endpoints for Frontend

```typescript
// Get optimization history
GET /api/optimizations
Response: { optimizations: OptimizationSummary[] }

// Get specific optimization
GET /api/optimizations/:id
Response: OptimizationResponse

// Get detailed results with pagination
GET /api/optimizations/:id/results?page=1&limit=50&sortBy=totalPnL&order=desc
Response: { results: OptimizationResult[], total: number, page: number }

// Export results
GET /api/optimizations/:id/export?format=csv
Response: CSV file download

// Delete optimization
DELETE /api/optimizations/:id
Response: { success: boolean }
```

---

## Advanced Features (Future Enhancements)

### 1. Smart Optimization Algorithms

Instead of exhaustive grid search, implement:

**Bayesian Optimization**
- Use previous results to guide next parameter selection
- Significantly reduce number of tests needed
- Library: `@botpress/bayesian-optimization` or `scikit-optimize`

**Genetic Algorithm**
- Evolve parameter sets over generations
- Good for large parameter spaces
- Library: `geneticalgorithm` npm package

**Random Search**
- Randomly sample parameter space
- Often as good as grid search with fewer tests
- Built-in implementation

### 2. Walk-Forward Analysis

- Train on in-sample period
- Test on out-of-sample period
- Rotate windows forward
- Detect overfitting

### 3. Monte Carlo Simulation

- Randomize trade order
- Test parameter robustness
- Calculate confidence intervals

### 4. Multi-Objective Optimization

Optimize for multiple goals simultaneously:
- Maximize Sharpe ratio
- Minimize drawdown
- Maintain minimum trade count
- Return Pareto frontier of solutions

### 5. Real-time Optimization

- Run optimization in background
- Stream results as they complete
- Use WebSockets for live updates

---

## Cost Analysis

### Claude API Costs

**Current Approach (Without Optimization):**
- Testing 192 parameter combinations = 192 Claude API calls
- Cost: 192 × $0.015 (Sonnet cost per call) = **$2.88 per optimization**

**With Optimization System:**
- Testing 192 parameter combinations = 1 Claude API call
- Cost: 1 × $0.015 = **$0.015 per optimization**
- **Savings: 99.2%** reduction in API costs

**Scaling:**
- 1,000 parameter tests: $15 → $0.015 (999x savings)
- 10,000 parameter tests: $150 → $0.015 (9,999x savings)

### Computational Costs

**Script Execution:**
- Average execution time: ~1-2 seconds per parameter set
- 192 combinations × 2s = 384 seconds = **6.4 minutes** (sequential)
- With 5 concurrent executions: **~1.3 minutes**

**Data Fetching:**
- Data is fetched once per ticker/date/timeframe combination
- Cached in database for subsequent runs
- Marginal cost after first fetch

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Modify Claude system prompt for parameterized scripts
- [ ] Update script generation service
- [ ] Test with sample strategies
- [ ] Verify backward compatibility

### Phase 2: Optimization API (Week 3-4)
- [ ] Create optimization service
- [ ] Implement parameter combination generator
- [ ] Build parallel execution engine
- [ ] Add database schema and storage
- [ ] Create API routes
- [ ] Write tests

### Phase 3: Frontend (Week 5-6)
- [ ] Build optimization panel UI
- [ ] Create results dashboard
- [ ] Implement comparison table
- [ ] Add heatmap visualizations
- [ ] Build historical view
- [ ] Integration testing

### Phase 4: Advanced Features (Future)
- [ ] Bayesian optimization
- [ ] Walk-forward analysis
- [ ] Real-time streaming results
- [ ] Multi-objective optimization

---

## Example Usage

### Scenario: Optimizing SMA Crossover Strategy

**User Input:**
```json
{
  "strategyPrompt": "Enter long when price crosses above SMA, exit when it crosses below. Use stop loss and take profit.",
  "parameterGrid": {
    "smaPeriod": [5, 10, 20, 50, 100, 200],
    "stopLossPercent": [0.5, 1.0, 1.5, 2.0],
    "takeProfitPercent": [1.0, 2.0, 3.0, 4.0, 5.0]
  },
  "tickers": ["SPY", "QQQ", "IWM"],
  "dateRanges": [
    { "start": "2024-01-01", "end": "2024-06-30" },
    { "start": "2024-07-01", "end": "2024-12-31" }
  ]
}
```

**System Actions:**
1. Claude generates 1 parameterized script (1 API call)
2. System generates 6 × 4 × 5 = 120 parameter combinations
3. Tests across 3 tickers × 2 date ranges = 720 total tests
4. Executes in ~3-4 minutes (with parallel execution)
5. Returns ranked results with best parameters

**Result:**
- Best Parameters: `{ smaPeriod: 20, stopLoss: 1.0, takeProfit: 3.0 }`
- Best Performance: 15% return, 65% win rate, 2.3 Sharpe ratio
- Total Cost: $0.015 (vs $10.80 without optimization)

---

## Security & Performance Considerations

### Security
- Validate all parameter inputs to prevent code injection
- Sanitize file paths for script execution
- Limit concurrent executions to prevent DoS
- Rate limit optimization API endpoints
- Require authentication for optimization features

### Performance
- Use worker threads or child processes for parallel execution
- Implement execution queue with priority system
- Cache frequently used data in memory
- Add timeout limits to prevent infinite loops
- Monitor system resources during optimization

### Data Management
- Auto-cleanup old optimization results (configurable retention)
- Compress large result sets
- Paginate results API responses
- Index database tables for fast queries

---

## Conclusion

This optimization system provides a powerful, cost-effective way to tune trading strategies by:
- **Minimizing Claude API costs** (99%+ reduction)
- **Automating parameter testing** across multiple combinations
- **Enabling data-driven** strategy development
- **Providing intuitive** result visualization
- **Supporting advanced** optimization algorithms

The modular design allows for incremental implementation and future enhancements while maintaining backward compatibility with existing functionality.
