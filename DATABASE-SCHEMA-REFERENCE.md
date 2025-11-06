# Database Schema Reference

**Last Updated:** 2025-11-06
**Database:** `/Users/edwardkim/Code/ai-backtest/backtesting.db`

## Quick Stats
- **Total Agents:** 8
- **Total Iterations Completed:** 51
- **Total Knowledge Entries:** 173

---

## Core Agent Learning Tables

### 1. `trading_agents` - Agent Definitions

Main table for all trading agents in the system.

**Key Columns:**
```
id TEXT PRIMARY KEY                    -- UUID
name TEXT                              -- "VWAP Mean Reversion Trader"
instructions TEXT                      -- Natural language instructions
system_prompt TEXT                     -- Generated Claude system prompt
risk_tolerance TEXT                    -- 'conservative', 'moderate', 'aggressive'
trading_style TEXT                     -- 'scalper', 'day_trader', 'swing_trader'
pattern_focus TEXT                     -- JSON: ["vwap_bounce", "gap_fill"]
market_conditions TEXT                 -- JSON: ["trending", "ranging", "volatile"]
status TEXT DEFAULT 'learning'         -- 'learning', 'paper_trading', 'live_trading', 'paused'
universe TEXT DEFAULT 'Tech Sector'    -- Stock universe to trade
timeframe TEXT NOT NULL                -- 'intraday', 'swing', 'position'
auto_learn_enabled INTEGER DEFAULT 0   -- Boolean for automated learning
continuous_learning_enabled INTEGER    -- Boolean for continuous learning mode
created_at DATETIME
updated_at DATETIME
```

**Example Query:**
```sql
-- Get all active learning agents
SELECT id, name, status, universe
FROM trading_agents
WHERE active = 1 AND status = 'learning';
```

---

### 2. `agent_iterations` - Learning Iterations

Stores each iteration of an agent's learning process. This is the primary table for tracking agent evolution.

**Key Columns:**
```
id TEXT PRIMARY KEY                    -- UUID
agent_id TEXT NOT NULL                 -- Foreign key to trading_agents
iteration_number INTEGER NOT NULL      -- Sequential iteration number (1, 2, 3...)

-- Strategy Scripts
scan_script TEXT NOT NULL              -- TypeScript code for scanning
execution_script TEXT NOT NULL         -- TypeScript code for execution logic
version_notes TEXT                     -- "Testing tighter stops", "Added volume filter"

-- Backtest Results
signals_found INTEGER                  -- Number of signals generated
backtest_results TEXT                  -- JSON: full BacktestResult with all metrics
win_rate REAL                          -- 0.0 to 1.0
sharpe_ratio REAL                      -- Sharpe ratio of the strategy
total_return REAL                      -- Total $ return

-- Claude Analysis
expert_analysis TEXT                   -- Full expert analysis from Claude (JSON)
refinements_suggested TEXT             -- JSON array of suggested improvements

-- Metadata
winning_template TEXT                  -- Which template won: 'conservative', 'aggressive', 'time_based', etc.
iteration_status TEXT DEFAULT 'completed'  -- 'completed', 'approved', 'rejected'
manual_guidance TEXT                   -- Optional human feedback
created_at TEXT NOT NULL
```

**Important Notes:**
- `backtest_results` contains JSON with template comparisons
- `expert_analysis` contains JSON with Claude's detailed analysis including `execution_analysis`
- `winning_template` shows which execution template won (or 'custom' if custom script won)

**Example Queries:**
```sql
-- Get all iterations for an agent in order
SELECT iteration_number, signals_found, win_rate, sharpe_ratio, total_return, winning_template
FROM agent_iterations
WHERE agent_id = 'd992e829-27d9-406d-b771-8e3789645a5e'
ORDER BY iteration_number;

-- Get the most recent iteration for an agent
SELECT *
FROM agent_iterations
WHERE agent_id = 'd992e829-27d9-406d-b771-8e3789645a5e'
ORDER BY iteration_number DESC
LIMIT 1;

-- Get previous iteration data (for context in next iteration)
SELECT *
FROM agent_iterations
WHERE agent_id = ? AND iteration_number = ? - 1;
```

---

### 3. `agent_knowledge` - Accumulated Knowledge

Stores extracted insights, preferences, and rules that agents learn over time. This knowledge informs future iterations.

**Key Columns:**
```
id TEXT PRIMARY KEY                    -- UUID
agent_id TEXT NOT NULL                 -- Foreign key to trading_agents
knowledge_type TEXT NOT NULL           -- 'INSIGHT', 'PARAMETER_PREF', 'PATTERN_RULE'
pattern_type TEXT                      -- e.g., 'vwap_bounce', 'gap_and_go'
insight TEXT NOT NULL                  -- Human-readable insight
supporting_data TEXT                   -- JSON: stats, examples, evidence
confidence REAL                        -- 0-1 confidence score
learned_from_iteration INTEGER         -- Which iteration produced this
times_validated INTEGER DEFAULT 0      -- How many times confirmed
last_validated TEXT                    -- Last validation date
created_at TEXT NOT NULL
```

**Knowledge Types:**
- `INSIGHT`: High-level understanding ("Tech stocks tend to bounce off VWAP in first hour")
- `PARAMETER_PREF`: Specific parameter preferences ("2% stops work better than 1.5%")
- `PATTERN_RULE`: Pattern-specific rules ("Exit before 3pm on Fridays")

**Example Queries:**
```sql
-- Get all knowledge for an agent
SELECT knowledge_type, pattern_type, insight, confidence, learned_from_iteration
FROM agent_knowledge
WHERE agent_id = 'd992e829-27d9-406d-b771-8e3789645a5e'
ORDER BY confidence DESC, created_at DESC;

-- Get execution-related knowledge
SELECT insight, confidence, learned_from_iteration
FROM agent_knowledge
WHERE agent_id = ? AND insight LIKE '%stop%' OR insight LIKE '%exit%' OR insight LIKE '%target%'
ORDER BY confidence DESC;

-- Count knowledge by type
SELECT knowledge_type, COUNT(*) as count
FROM agent_knowledge
WHERE agent_id = ?
GROUP BY knowledge_type;
```

---

### 4. `agent_strategies` - Strategy Versions

Stores approved strategy versions. When an iteration is promoted to production, it's saved here.

**Key Columns:**
```
id TEXT PRIMARY KEY                    -- UUID
agent_id TEXT NOT NULL                 -- Foreign key to trading_agents
version TEXT NOT NULL                  -- "v1.0", "v1.1", "v2.0"
scan_script TEXT NOT NULL              -- Approved scan script
execution_script TEXT NOT NULL         -- Approved execution script
backtest_sharpe REAL                   -- Performance metrics
backtest_win_rate REAL
backtest_total_return REAL
is_current_version INTEGER DEFAULT 0   -- 1 if this is the active version
parent_version TEXT                    -- Version this was refined from
changes_from_parent TEXT               -- Description of changes
created_at TEXT NOT NULL
```

**Example Queries:**
```sql
-- Get current active strategy for an agent
SELECT *
FROM agent_strategies
WHERE agent_id = ? AND is_current_version = 1;

-- Get all versions for an agent
SELECT version, backtest_sharpe, backtest_win_rate, changes_from_parent
FROM agent_strategies
WHERE agent_id = ?
ORDER BY version;
```

---

## Supporting Tables

### 5. `backtests` - Backtest Results

Legacy backtest results table (used by older system).

**Key Columns:**
```
id INTEGER PRIMARY KEY
strategy_id INTEGER NOT NULL
config TEXT                            -- JSON backtest configuration
status TEXT DEFAULT 'RUNNING'          -- 'RUNNING', 'COMPLETED', 'FAILED'
metrics TEXT                           -- JSON BacktestMetrics
equity_curve TEXT                      -- JSON EquityPoint[]
error TEXT
created_at DATETIME
completed_at DATETIME
```

---

### 6. `scan_results` - Pattern Scan Results

Stores results from pattern scanning (used for manual pattern discovery).

**Key Columns:**
```
id TEXT PRIMARY KEY                    -- UUID
backtest_set_id TEXT NOT NULL
ticker TEXT NOT NULL
start_date TEXT NOT NULL               -- Pattern start date (YYYY-MM-DD)
end_date TEXT NOT NULL                 -- Pattern end date (YYYY-MM-DD)
peak_date TEXT                         -- Date of peak price
total_change_percent REAL              -- Total % change during pattern
peak_change_percent REAL               -- % change to peak
volume_spike_ratio REAL                -- Max volume / avg volume
pattern_duration_days INTEGER
notes TEXT
tags TEXT                              -- JSON array
daily_bars TEXT                        -- JSON OHLCV data
created_at DATETIME
```

---

### 7. `claude_analyses` - Claude Visual Analysis

Stores Claude's visual analysis of chart patterns (separate from agent learning).

**Key Columns:**
```
id TEXT PRIMARY KEY                    -- UUID
backtest_set_id TEXT NOT NULL
selected_sample_ids TEXT               -- JSON array of sample IDs
analysis_status TEXT                   -- 'PENDING', 'GENERATING_CHARTS', 'ANALYZING', 'COMPLETED', 'FAILED'
visual_insights TEXT                   -- JSON: continuation_signals, exhaustion_signals, etc.
error_message TEXT
created_at DATETIME
completed_at DATETIME
```

---

## Common Query Patterns

### Get Agent with Latest Iteration
```sql
SELECT
  a.id, a.name, a.status, a.universe,
  i.iteration_number, i.win_rate, i.sharpe_ratio, i.total_return, i.winning_template
FROM trading_agents a
LEFT JOIN agent_iterations i ON a.id = i.agent_id
WHERE a.id = ?
ORDER BY i.iteration_number DESC
LIMIT 1;
```

### Get All Iterations with Key Metrics
```sql
SELECT
  iteration_number,
  signals_found,
  win_rate,
  sharpe_ratio,
  total_return,
  winning_template,
  created_at
FROM agent_iterations
WHERE agent_id = ?
ORDER BY iteration_number;
```

### Get Agent Learning Progress
```sql
SELECT
  a.name,
  COUNT(i.id) as total_iterations,
  COUNT(k.id) as knowledge_count,
  MAX(i.sharpe_ratio) as best_sharpe,
  MAX(i.win_rate) as best_win_rate
FROM trading_agents a
LEFT JOIN agent_iterations i ON a.id = i.agent_id
LEFT JOIN agent_knowledge k ON a.id = k.agent_id
WHERE a.id = ?
GROUP BY a.id;
```

### Get Knowledge Evolution Over Time
```sql
SELECT
  learned_from_iteration,
  knowledge_type,
  COUNT(*) as insights_learned
FROM agent_knowledge
WHERE agent_id = ?
GROUP BY learned_from_iteration, knowledge_type
ORDER BY learned_from_iteration;
```

---

## Execution Script Evolution Fields

### In `agent_iterations.expert_analysis` JSON

The `expert_analysis` field contains a JSON object with this structure:
```typescript
{
  overall_assessment: string,
  pattern_quality: {
    signal_clarity: string,
    market_conditions: string,
    edge_strength: string
  },
  execution_analysis: {
    template_comparison: string,        // Comparison of all 5 templates
    exit_timing_issues: string[],       // Array of timing problems found
    stop_loss_effectiveness: string,    // Analysis of stop loss performance
    take_profit_effectiveness: string,  // Analysis of take profit performance
    suggested_improvements: string[]    // Execution improvement suggestions
  },
  recommendations: {
    scanning: string[],
    execution: string[],
    risk_management: string[]
  }
}
```

### In `agent_iterations.backtest_results` JSON

Contains results from testing all templates:
```typescript
{
  templateResults: [
    {
      template: "conservative" | "aggressive" | "time_based" | "atr_adaptive" | "price_action" | "custom",
      metrics: {
        totalTrades: number,
        winners: number,
        losers: number,
        winRate: number,
        totalReturn: number,
        sharpeRatio: number,
        profitFactor: number,
        // ... more metrics
      }
    },
    // ... up to 6 results (5 templates + 1 custom)
  ]
}
```

---

## All Tables in Database

```
agent_activity_log          paper_account_snapshots
agent_alerts                paper_accounts
agent_iterations            paper_orders
agent_knowledge             paper_positions
agent_strategies            paper_trades
analysis_charts             pivot_points_cache
backtest_sets               portfolio_backtests
backtests                   portfolio_state
batch_backtest_results      risk_metrics
batch_backtest_runs         scan_history
batch_strategy_performance  scan_results
chart_thumbnails            strategies
claude_analyses             strategy_backtest_scripts
conversations               strategy_recommendations
daily_metrics               support_resistance_levels
earnings_events             trade_recommendations
executed_trades             trades
live_signals                tradestation_orders
market_regime               trading_agents
news_events                 universe
ohlcv_data                  universe_stocks
paper_account_snapshots
```

---

## Tips for Navigating the Schema

1. **Start with `trading_agents`** to find the agent ID you need
2. **Use `agent_iterations`** to see learning progress and access scripts
3. **Check `agent_knowledge`** to see what the agent has learned
4. **Join tables** to get comprehensive views of agent performance
5. **Parse JSON fields** when accessing `backtest_results`, `expert_analysis`, etc.

---

## Recent Active Agents

| Agent ID | Name | Latest Iteration | Status |
|----------|------|------------------|--------|
| d992e829-27d9-406d-b771-8e3789645a5e | VWAP Mean Reversion Trader | 3 | learning |
| 5dc3c49f-188e-48f5-9244-485ec7f67175 | Gap Down Specialist | 2 | learning |
| 3159d447-5cbc-41ec-828d-525c76db97b0 | VWAP Mean Reversion Agent | 16 | learning |
| 4eed4e6a-dec3-4115-a865-c125df39b8d1 | First Red Day Fade Trader | 22 | learning |
