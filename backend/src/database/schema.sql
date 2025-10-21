-- OHLCV Market Data Table
CREATE TABLE IF NOT EXISTS ohlcv_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL,
    timeframe TEXT NOT NULL,
    time_of_day TEXT,
    day_of_week INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, timestamp, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker_timeframe ON ohlcv_data(ticker, timeframe, timestamp);
CREATE INDEX IF NOT EXISTS idx_ohlcv_time_of_day ON ohlcv_data(ticker, timeframe, time_of_day);

-- Strategies Table
CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    strategy_type TEXT DEFAULT 'rule-based', -- 'rule-based' or 'custom'
    custom_strategy_type TEXT, -- e.g., 'opening-range-breakout' for custom strategies
    ticker TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    config TEXT NOT NULL, -- JSON string of full strategy configuration
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Backtests Table
CREATE TABLE IF NOT EXISTS backtests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    config TEXT NOT NULL, -- JSON string of backtest configuration
    status TEXT NOT NULL DEFAULT 'RUNNING',
    metrics TEXT, -- JSON string of BacktestMetrics
    equity_curve TEXT, -- JSON string of EquityPoint[]
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

-- Trades Table
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backtest_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    side TEXT NOT NULL,
    entry_timestamp INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    exit_timestamp INTEGER,
    exit_price REAL,
    quantity REAL NOT NULL,
    commission REAL NOT NULL DEFAULT 0,
    pnl REAL,
    pnl_percent REAL,
    exit_reason TEXT,
    bars INTEGER,
    FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trades_backtest ON trades(backtest_id);

-- Earnings Events Table
CREATE TABLE IF NOT EXISTS earnings_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    fiscal_period TEXT,
    fiscal_year TEXT,
    report_date TEXT NOT NULL, -- Date in YYYY-MM-DD format
    report_timestamp INTEGER, -- Unix timestamp if time is available
    time_of_day TEXT, -- 'BMO' (before market open), 'AMC' (after market close), or HH:MM
    eps_estimate REAL,
    eps_actual REAL,
    revenue_estimate REAL,
    revenue_actual REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, report_date, fiscal_period)
);

CREATE INDEX IF NOT EXISTS idx_earnings_ticker_date ON earnings_events(ticker, report_date);
CREATE INDEX IF NOT EXISTS idx_earnings_timestamp ON earnings_events(ticker, report_timestamp);

-- Conversations Table (for Phase 2 - AI integration)
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER,
    messages TEXT NOT NULL, -- JSON array of conversation messages
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL
);
