-- ===================================================
-- Migration: Rename agent tables for clarity
-- Date: 2025-11-12
-- Purpose: Distinguish learning agents from live trading agents
-- ===================================================

BEGIN TRANSACTION;

-- Step 1: Rename main tables
ALTER TABLE trading_agents RENAME TO learning_agents;
ALTER TABLE agent_activity_log RENAME TO learning_agent_activity_log;
ALTER TABLE agent_alerts RENAME TO learning_agent_alerts;

-- Step 2: Rename foreign key columns in related tables
-- Note: SQLite doesn't support ALTER COLUMN directly, so we need to recreate tables

-- agent_iterations: Rename agent_id to learning_agent_id
CREATE TABLE agent_iterations_new (
  id TEXT PRIMARY KEY,
  learning_agent_id TEXT NOT NULL,
  iteration_number INTEGER NOT NULL,
  -- Strategy under test
  scan_script TEXT NOT NULL,
  execution_script TEXT NOT NULL,
  version_notes TEXT,
  manual_guidance TEXT,
  -- Results
  signals_found INTEGER,
  backtest_results TEXT,
  win_rate REAL,
  sharpe_ratio REAL,
  total_return REAL,
  -- Claude's analysis
  expert_analysis TEXT,
  refinements_suggested TEXT,
  -- Status
  iteration_status TEXT DEFAULT 'completed',
  -- Git tracking
  git_commit_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (learning_agent_id) REFERENCES learning_agents(id) ON DELETE CASCADE
);

INSERT INTO agent_iterations_new SELECT * FROM agent_iterations;
DROP TABLE agent_iterations;
ALTER TABLE agent_iterations_new RENAME TO agent_iterations;

CREATE INDEX IF NOT EXISTS idx_agent_iterations_agent ON agent_iterations(learning_agent_id, iteration_number);
CREATE INDEX IF NOT EXISTS idx_agent_iterations_status ON agent_iterations(iteration_status);

-- agent_knowledge: Rename agent_id to learning_agent_id
CREATE TABLE agent_knowledge_new (
  id TEXT PRIMARY KEY,
  learning_agent_id TEXT NOT NULL,
  iteration_number INTEGER NOT NULL,
  knowledge_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence_score REAL,
  source_backtest_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (learning_agent_id) REFERENCES learning_agents(id) ON DELETE CASCADE
);

INSERT INTO agent_knowledge_new SELECT * FROM agent_knowledge;
DROP TABLE agent_knowledge;
ALTER TABLE agent_knowledge_new RENAME TO agent_knowledge;

-- agent_strategies: Rename agent_id to learning_agent_id
CREATE TABLE agent_strategies_new (
  id TEXT PRIMARY KEY,
  learning_agent_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  scanner_prompt TEXT NOT NULL,
  execution_prompt TEXT NOT NULL,
  description TEXT,
  performance_metrics TEXT,
  status TEXT CHECK(status IN ('active', 'retired', 'testing')) DEFAULT 'testing',
  created_at TEXT DEFAULT (datetime('now')),
  activated_at TEXT,
  retired_at TEXT,
  FOREIGN KEY (learning_agent_id) REFERENCES learning_agents(id) ON DELETE CASCADE,
  UNIQUE(learning_agent_id, version_number)
);

INSERT INTO agent_strategies_new SELECT * FROM agent_strategies;
DROP TABLE agent_strategies;
ALTER TABLE agent_strategies_new RENAME TO agent_strategies;

-- learning_agent_activity_log: Rename agent_id to learning_agent_id
CREATE TABLE learning_agent_activity_log_new (
  id TEXT PRIMARY KEY,
  learning_agent_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (learning_agent_id) REFERENCES learning_agents(id) ON DELETE CASCADE
);

INSERT INTO learning_agent_activity_log_new SELECT * FROM learning_agent_activity_log;
DROP TABLE learning_agent_activity_log;
ALTER TABLE learning_agent_activity_log_new RENAME TO learning_agent_activity_log;

-- learning_agent_alerts: Rename agent_id to learning_agent_id
CREATE TABLE learning_agent_alerts_new (
  id TEXT PRIMARY KEY,
  learning_agent_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('info', 'warning', 'error')) DEFAULT 'info',
  message TEXT NOT NULL,
  metadata TEXT,
  acknowledged BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  FOREIGN KEY (learning_agent_id) REFERENCES learning_agents(id) ON DELETE CASCADE
);

INSERT INTO learning_agent_alerts_new SELECT * FROM learning_agent_alerts;
DROP TABLE learning_agent_alerts;
ALTER TABLE learning_agent_alerts_new RENAME TO learning_agent_alerts;

COMMIT;

-- ===================================================
-- Verification Queries
-- ===================================================

-- Check tables exist
SELECT 'learning_agents table exists' as check_result, COUNT(*) as count FROM learning_agents;
SELECT 'agent_iterations table updated' as check_result, COUNT(*) as count FROM agent_iterations;
SELECT 'agent_knowledge table updated' as check_result, COUNT(*) as count FROM agent_knowledge;
SELECT 'agent_strategies table updated' as check_result, COUNT(*) as count FROM agent_strategies;
SELECT 'learning_agent_activity_log table exists' as check_result, COUNT(*) as count FROM learning_agent_activity_log;
SELECT 'learning_agent_alerts table exists' as check_result, COUNT(*) as count FROM learning_agent_alerts;

-- Check foreign keys work
SELECT 'Foreign key check' as check_result, COUNT(*) as orphaned_iterations
FROM agent_iterations
WHERE learning_agent_id NOT IN (SELECT id FROM learning_agents);
