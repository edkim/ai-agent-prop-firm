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

-- Scanner System Tables

-- Universe Definitions Table
CREATE TABLE IF NOT EXISTS universe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- e.g., 'russell2000', 'sp500', 'all-us-stocks'
    description TEXT,
    total_stocks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Universe Stocks Table (maps tickers to universes)
CREATE TABLE IF NOT EXISTS universe_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT, -- Company name
    sector TEXT,
    industry TEXT,
    market_cap REAL,
    is_active INTEGER DEFAULT 1, -- 1 = active, 0 = delisted/removed
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (universe_id) REFERENCES universe(id) ON DELETE CASCADE,
    UNIQUE(universe_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_universe_stocks_ticker ON universe_stocks(ticker);
CREATE INDEX IF NOT EXISTS idx_universe_stocks_universe ON universe_stocks(universe_id);

-- Daily Metrics Table (pre-computed metrics for efficient scanning)
CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD format
    timestamp INTEGER NOT NULL, -- Unix timestamp for the day

    -- Price metrics
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL,

    -- Change metrics
    change_percent REAL, -- Daily % change
    change_from_open REAL, -- % change from open to close

    -- Volume metrics
    volume_ratio REAL, -- Volume / 20-day average volume
    volume_20d_avg REAL, -- 20-day average volume

    -- Range metrics
    high_low_range_percent REAL, -- (high - low) / open * 100
    close_to_high_percent REAL, -- Where close is relative to high
    close_to_low_percent REAL, -- Where close is relative to low

    -- Moving averages
    sma_20 REAL,
    sma_50 REAL,
    sma_200 REAL,

    -- Price position relative to MAs
    price_to_sma20_percent REAL,
    price_to_sma50_percent REAL,
    price_to_sma200_percent REAL,

    -- Momentum indicators
    rsi_14 REAL, -- 14-day RSI
    consecutive_up_days INTEGER, -- Number of consecutive up days (0 if down day)
    consecutive_down_days INTEGER, -- Number of consecutive down days (0 if up day)

    -- Multi-day metrics
    change_5d_percent REAL, -- 5-day % change
    change_10d_percent REAL, -- 10-day % change
    change_20d_percent REAL, -- 20-day % change

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_ticker_date ON daily_metrics(ticker, date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_volume_ratio ON daily_metrics(ticker, volume_ratio);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_change ON daily_metrics(ticker, change_percent);

-- Sample Sets Table (user-created collections of patterns)
CREATE TABLE IF NOT EXISTS sample_sets (
    id TEXT PRIMARY KEY, -- UUID
    name TEXT NOT NULL,
    description TEXT,
    pattern_type TEXT, -- e.g., 'capitulatory', 'breakout', 'reversal'
    total_samples INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scan Results Table (individual pattern occurrences saved to sample sets)
CREATE TABLE IF NOT EXISTS scan_results (
    id TEXT PRIMARY KEY, -- UUID
    sample_set_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    start_date TEXT NOT NULL, -- Pattern start date (YYYY-MM-DD)
    end_date TEXT NOT NULL, -- Pattern end date (YYYY-MM-DD)
    peak_date TEXT, -- Date of peak price during pattern

    -- Pattern metrics
    total_change_percent REAL, -- Total % change during pattern
    peak_change_percent REAL, -- % change from start to peak
    volume_spike_ratio REAL, -- Max volume / average volume
    pattern_duration_days INTEGER, -- Number of days in pattern

    -- Additional metadata
    notes TEXT, -- User notes
    tags TEXT, -- JSON array of tags

    -- Chart data (optional, for quick access)
    daily_bars TEXT, -- JSON array of daily OHLCV data

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sample_set_id) REFERENCES sample_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scan_results_sample_set ON scan_results(sample_set_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_ticker ON scan_results(ticker);
CREATE INDEX IF NOT EXISTS idx_scan_results_date_range ON scan_results(start_date, end_date);

-- Portfolio Backtests Table (scan-and-backtest workflow results)
CREATE TABLE IF NOT EXISTS portfolio_backtests (
    id TEXT PRIMARY KEY, -- UUID
    scan_query TEXT NOT NULL, -- Natural language scan query
    strategy_prompt TEXT NOT NULL, -- Natural language strategy description
    universe TEXT NOT NULL, -- Universe scanned (e.g., 'russell2000')

    -- Scan results summary
    total_matches INTEGER, -- Total stocks matched by scanner
    tested_count INTEGER, -- Number of stocks backtested
    skipped_count INTEGER, -- Number of matches skipped
    scan_time_ms INTEGER, -- Scanner execution time

    -- Portfolio-level metrics
    total_stocks_tested INTEGER,
    total_trades INTEGER,
    successful_backtests INTEGER, -- Number of successful backtest executions
    failed_backtests INTEGER, -- Number of failed backtest executions

    winning_trades INTEGER,
    losing_trades INTEGER,
    win_rate REAL, -- Percentage (0-100)

    total_pnl REAL,
    total_pnl_percent REAL,
    avg_pnl_per_trade REAL,
    avg_pnl_percent_per_trade REAL,
    median_pnl_percent REAL,

    -- Best/worst performers (JSON strings)
    best_trade TEXT, -- JSON: { ticker, date, pnl_percent, ... }
    worst_trade TEXT, -- JSON: { ticker, date, pnl_percent, ... }
    best_stock TEXT, -- JSON: { ticker, win_rate, avg_pnl_percent }
    worst_stock TEXT, -- JSON: { ticker, win_rate, avg_pnl_percent }

    -- Full results (JSON array)
    individual_results TEXT, -- JSON array of IndividualBacktestResult[]

    -- Execution metadata
    execution_time_ms INTEGER, -- Total workflow execution time
    status TEXT DEFAULT 'COMPLETED', -- 'RUNNING', 'COMPLETED', 'FAILED'
    error TEXT, -- Error message if failed

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portfolio_backtests_universe ON portfolio_backtests(universe);
CREATE INDEX IF NOT EXISTS idx_portfolio_backtests_created ON portfolio_backtests(created_at);
CREATE INDEX IF NOT EXISTS idx_portfolio_backtests_win_rate ON portfolio_backtests(win_rate);

-- Individual samples (Phase 3: curated pattern collections)
CREATE TABLE IF NOT EXISTS samples (
    id TEXT PRIMARY KEY, -- UUID
    ticker TEXT NOT NULL,
    start_date TEXT NOT NULL, -- Pattern start date (YYYY-MM-DD)
    end_date TEXT NOT NULL, -- Pattern end date (YYYY-MM-DD)
    sample_set_id TEXT,
    source_scan_id TEXT, -- Optional: which scan found this
    notes TEXT,
    metadata TEXT, -- JSON: Store max_gain, peak_date, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sample_set_id) REFERENCES sample_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (source_scan_id) REFERENCES scan_history(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_samples_sample_set ON samples(sample_set_id);
CREATE INDEX IF NOT EXISTS idx_samples_ticker ON samples(ticker);
CREATE INDEX IF NOT EXISTS idx_samples_date_range ON samples(start_date, end_date);

-- Scan history (Phase 3: track all scanner executions)
CREATE TABLE IF NOT EXISTS scan_history (
    id TEXT PRIMARY KEY, -- UUID
    user_prompt TEXT NOT NULL,
    universe_id TEXT,
    date_range_start TEXT, -- YYYY-MM-DD
    date_range_end TEXT, -- YYYY-MM-DD
    matches_found INTEGER,
    results_json TEXT, -- Full scan results as JSON (Phase 4: for cached results)
    execution_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_history_created ON scan_history(created_at);
CREATE INDEX IF NOT EXISTS idx_scan_history_universe ON scan_history(universe_id);

-- Chart Thumbnails Table (Phase 4: on-demand chart generation)
CREATE TABLE IF NOT EXISTS chart_thumbnails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    start_date TEXT NOT NULL, -- YYYY-MM-DD format
    end_date TEXT NOT NULL, -- YYYY-MM-DD format
    chart_data TEXT NOT NULL, -- Base64-encoded PNG image
    width INTEGER DEFAULT 300,
    height INTEGER DEFAULT 150,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_chart_thumbnails_ticker ON chart_thumbnails(ticker);
CREATE INDEX IF NOT EXISTS idx_chart_thumbnails_date_range ON chart_thumbnails(start_date, end_date);
