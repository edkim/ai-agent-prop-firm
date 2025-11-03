-- Learning Agent Database Schema Migration
-- Date: 2025-11-02
-- Purpose: Add missing tables and fields for learning agent functionality

-- ========================================
-- Table: agent_iterations
-- Stores learning iteration history
-- ========================================
CREATE TABLE IF NOT EXISTS agent_iterations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  iteration_number INTEGER NOT NULL,
  scan_script TEXT NOT NULL,
  execution_script TEXT,
  version_notes TEXT,
  signals_found INTEGER NOT NULL DEFAULT 0,
  backtest_results TEXT,  -- JSON
  win_rate REAL NOT NULL DEFAULT 0,
  sharpe_ratio REAL NOT NULL DEFAULT 0,
  total_return REAL NOT NULL DEFAULT 0,
  expert_analysis TEXT,  -- JSON
  refinements_suggested TEXT,  -- JSON
  iteration_status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, approved, rejected
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_iterations_agent_id ON agent_iterations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_iterations_iteration_number ON agent_iterations(agent_id, iteration_number);
CREATE INDEX IF NOT EXISTS idx_agent_iterations_status ON agent_iterations(iteration_status);

-- ========================================
-- Table: agent_strategies
-- Stores strategy versions
-- ========================================
CREATE TABLE IF NOT EXISTS agent_strategies (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  version TEXT NOT NULL,
  scan_script TEXT NOT NULL,
  execution_script TEXT,
  backtest_sharpe REAL,
  backtest_win_rate REAL,
  backtest_total_return REAL,
  is_current_version INTEGER NOT NULL DEFAULT 0,
  parent_version TEXT,
  changes_from_parent TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_strategies_agent_id ON agent_strategies(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_strategies_current ON agent_strategies(agent_id, is_current_version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_strategies_version ON agent_strategies(agent_id, version);

-- ========================================
-- Table: agent_knowledge
-- Stores accumulated knowledge and insights
-- ========================================
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  knowledge_type TEXT NOT NULL,  -- PARAMETER_PREF, PATTERN_RULE, INSIGHT, FAILURE_MODE
  pattern_type TEXT,  -- e.g., 'gap_and_go', 'vwap_bounce'
  insight TEXT NOT NULL,
  supporting_data TEXT,  -- JSON with examples/metrics
  confidence REAL NOT NULL DEFAULT 0.5,  -- 0.0 to 1.0
  learned_from_iteration INTEGER NOT NULL,
  times_validated INTEGER NOT NULL DEFAULT 1,
  last_validated_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent_id ON agent_knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_type ON agent_knowledge(agent_id, knowledge_type);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_confidence ON agent_knowledge(agent_id, confidence);

-- ========================================
-- Table: agent_alerts
-- Stores performance alerts and notifications
-- ========================================
CREATE TABLE IF NOT EXISTS agent_alerts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,  -- PERFORMANCE_DEGRADATION, CONVERGENCE, GRADUATION_READY, ERROR, MILESTONE
  severity TEXT NOT NULL,  -- INFO, WARNING, CRITICAL
  message TEXT NOT NULL,
  details TEXT,  -- JSON
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_alerts_agent_id ON agent_alerts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_unacknowledged ON agent_alerts(agent_id, acknowledged);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_type ON agent_alerts(alert_type);

-- ========================================
-- Table: agent_activity_log (already exists, adding index if missing)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_agent_id ON agent_activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_type ON agent_activity_log(activity_type);

-- ========================================
-- Update trading_agents table with Phase 2 fields
-- ========================================

-- Learning configuration
ALTER TABLE trading_agents ADD COLUMN trading_style TEXT DEFAULT 'day_trader';
ALTER TABLE trading_agents ADD COLUMN risk_tolerance TEXT DEFAULT 'moderate';
ALTER TABLE trading_agents ADD COLUMN pattern_focus TEXT DEFAULT '[]';  -- JSON array
ALTER TABLE trading_agents ADD COLUMN market_conditions TEXT DEFAULT '[]';  -- JSON array
ALTER TABLE trading_agents ADD COLUMN status TEXT DEFAULT 'learning';  -- learning, paper_trading, live_trading, retired

-- Auto-approval settings
ALTER TABLE trading_agents ADD COLUMN auto_approve_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN approval_thresholds TEXT;  -- JSON with min_win_rate, min_sharpe_ratio, etc.

-- Continuous learning settings
ALTER TABLE trading_agents ADD COLUMN continuous_learning_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN max_iterations_per_day INTEGER DEFAULT 5;
ALTER TABLE trading_agents ADD COLUMN min_iteration_gap_minutes INTEGER DEFAULT 60;
ALTER TABLE trading_agents ADD COLUMN convergence_threshold REAL DEFAULT 0.05;

-- Universe/watchlist
ALTER TABLE trading_agents ADD COLUMN universe TEXT DEFAULT 'Tech Sector';

-- Metadata
ALTER TABLE trading_agents ADD COLUMN description TEXT;
ALTER TABLE trading_agents ADD COLUMN created_by TEXT DEFAULT 'system';

-- ========================================
-- Migration complete
-- ========================================

-- Display summary
SELECT 'Migration complete! Created tables:' AS status;
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agent_%' ORDER BY name;
