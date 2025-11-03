-- Paper Trading System Database Schema Migration
-- Date: 2025-11-03
-- Purpose: Add tables for simulated paper trading with per-agent virtual accounts

-- ========================================
-- Table: paper_accounts
-- Virtual trading accounts for paper trading agents
-- ========================================
CREATE TABLE IF NOT EXISTS paper_accounts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  initial_balance REAL NOT NULL DEFAULT 100000.00,
  current_cash REAL NOT NULL DEFAULT 100000.00,
  equity REAL NOT NULL DEFAULT 100000.00,  -- cash + position_value
  buying_power REAL NOT NULL DEFAULT 100000.00,
  total_pnl REAL NOT NULL DEFAULT 0.00,
  total_pnl_percent REAL NOT NULL DEFAULT 0.00,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  max_drawdown REAL NOT NULL DEFAULT 0.00,
  sharpe_ratio REAL NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active',  -- active, paused, closed
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paper_accounts_agent_id ON paper_accounts(agent_id);
CREATE INDEX IF NOT EXISTS idx_paper_accounts_status ON paper_accounts(status);

-- ========================================
-- Table: paper_positions
-- Current open positions for paper trading accounts
-- ========================================
CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  quantity INTEGER NOT NULL,  -- positive for long, negative for short
  avg_entry_price REAL NOT NULL,
  current_price REAL NOT NULL,
  position_value REAL NOT NULL,  -- quantity * current_price
  unrealized_pnl REAL NOT NULL DEFAULT 0.00,
  unrealized_pnl_percent REAL NOT NULL DEFAULT 0.00,
  signal_id TEXT,  -- reference to live_signals table if applicable
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paper_positions_account_id ON paper_positions(account_id);
CREATE INDEX IF NOT EXISTS idx_paper_positions_ticker ON paper_positions(ticker);
CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_positions_account_ticker ON paper_positions(account_id, ticker);

-- ========================================
-- Table: paper_orders
-- Order history for paper trading (includes pending, filled, cancelled, rejected)
-- ========================================
CREATE TABLE IF NOT EXISTS paper_orders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,  -- buy, sell
  quantity INTEGER NOT NULL,
  order_type TEXT NOT NULL,  -- market, limit, stop, stop_limit
  limit_price REAL,
  stop_price REAL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, filled, partially_filled, cancelled, rejected
  filled_quantity INTEGER NOT NULL DEFAULT 0,
  avg_fill_price REAL,
  commission REAL NOT NULL DEFAULT 0.00,
  slippage REAL NOT NULL DEFAULT 0.00,
  rejection_reason TEXT,
  signal_id TEXT,  -- reference to live_signals if this order came from a signal
  created_at TEXT NOT NULL,
  filled_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paper_orders_account_id ON paper_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_paper_orders_status ON paper_orders(status);
CREATE INDEX IF NOT EXISTS idx_paper_orders_ticker ON paper_orders(ticker);
CREATE INDEX IF NOT EXISTS idx_paper_orders_created_at ON paper_orders(created_at);

-- ========================================
-- Table: paper_trades
-- Executed trade log (filled orders create trades)
-- ========================================
CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,  -- buy, sell
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  value REAL NOT NULL,  -- quantity * price
  commission REAL NOT NULL DEFAULT 0.00,
  slippage REAL NOT NULL DEFAULT 0.00,
  pnl REAL,  -- calculated when closing position (null for opening trades)
  pnl_percent REAL,
  signal_id TEXT,
  executed_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES paper_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_account_id ON paper_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_order_id ON paper_trades(order_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_ticker ON paper_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_paper_trades_executed_at ON paper_trades(executed_at);

-- ========================================
-- Table: paper_account_snapshots
-- Daily snapshots of account equity for performance tracking
-- ========================================
CREATE TABLE IF NOT EXISTS paper_account_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  equity REAL NOT NULL,
  cash REAL NOT NULL,
  position_value REAL NOT NULL,
  total_pnl REAL NOT NULL,
  total_pnl_percent REAL NOT NULL,
  num_positions INTEGER NOT NULL DEFAULT 0,
  sharpe_ratio REAL NOT NULL DEFAULT 0.00,
  max_drawdown REAL NOT NULL DEFAULT 0.00,
  snapshot_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paper_snapshots_account_id ON paper_account_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_paper_snapshots_date ON paper_account_snapshots(snapshot_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_snapshots_account_date ON paper_account_snapshots(account_id, snapshot_date);

-- ========================================
-- Migration complete
-- ========================================

-- Display summary
SELECT 'Migration complete! Created paper trading tables:' AS status;
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'paper_%' ORDER BY name;
