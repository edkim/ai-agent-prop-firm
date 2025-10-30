-- =====================================================
-- PHASE 2: AUTONOMY FEATURES MIGRATION
-- Adds scheduled iterations, auto-refinement, continuous learning,
-- performance monitoring, and graduation capabilities
-- =====================================================

-- Add autonomy columns to trading_agents table
ALTER TABLE trading_agents ADD COLUMN auto_learn_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN learning_schedule TEXT; -- Cron format: "0 */6 * * *"
ALTER TABLE trading_agents ADD COLUMN next_scheduled_iteration TEXT; -- ISO timestamp

ALTER TABLE trading_agents ADD COLUMN auto_approve_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN approval_thresholds TEXT; -- JSON: min_win_rate, min_sharpe, etc.

ALTER TABLE trading_agents ADD COLUMN continuous_learning_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN max_iterations_per_day INTEGER DEFAULT 10;
ALTER TABLE trading_agents ADD COLUMN min_iteration_gap_minutes INTEGER DEFAULT 60;
ALTER TABLE trading_agents ADD COLUMN convergence_threshold REAL DEFAULT 0.01; -- 1% improvement threshold

-- Agent Alerts Table
CREATE TABLE IF NOT EXISTS agent_alerts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'PERFORMANCE_DEGRADATION', 'CONVERGENCE', 'GRADUATION_READY', 'ERROR', 'MILESTONE'
  severity TEXT NOT NULL, -- 'INFO', 'WARNING', 'CRITICAL'
  message TEXT NOT NULL,
  details TEXT, -- JSON: additional context
  acknowledged INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_alerts_agent_id ON agent_alerts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_acknowledged ON agent_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_severity ON agent_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_type ON agent_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_created ON agent_alerts(created_at DESC);
