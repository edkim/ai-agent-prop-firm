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

-- Backtest Sets Table (user-created collections of patterns)
CREATE TABLE IF NOT EXISTS backtest_sets (
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
    backtest_set_id TEXT NOT NULL,
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
    FOREIGN KEY (backtest_set_id) REFERENCES backtest_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scan_results_backtest_set ON scan_results(backtest_set_id);
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

-- Note: The samples table has been removed. Use scan_results table instead.

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
    signal_date TEXT, -- YYYY-MM-DD format (optional: when to change line color from blue to green)
    chart_data TEXT NOT NULL, -- Base64-encoded PNG image
    width INTEGER DEFAULT 300,
    height INTEGER DEFAULT 150,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, start_date, end_date, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_chart_thumbnails_ticker ON chart_thumbnails(ticker);
CREATE INDEX IF NOT EXISTS idx_chart_thumbnails_date_range ON chart_thumbnails(start_date, end_date);

-- Claude Analyses Table (Phase 5: visual AI analysis for backtest prompt generation)
CREATE TABLE IF NOT EXISTS claude_analyses (
    id TEXT PRIMARY KEY, -- UUID
    backtest_set_id TEXT NOT NULL,
    selected_sample_ids TEXT NOT NULL, -- JSON array of sample IDs
    analysis_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'GENERATING_CHARTS', 'ANALYZING', 'COMPLETED', 'FAILED'
    visual_insights TEXT, -- JSON: continuation_signals, exhaustion_signals, etc.
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (backtest_set_id) REFERENCES backtest_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_claude_analyses_set ON claude_analyses(backtest_set_id);
CREATE INDEX IF NOT EXISTS idx_claude_analyses_status ON claude_analyses(analysis_status);

-- Strategy Recommendations Table (strategies suggested by Claude)
CREATE TABLE IF NOT EXISTS strategy_recommendations (
    id TEXT PRIMARY KEY, -- UUID
    analysis_id TEXT NOT NULL,
    name TEXT NOT NULL,
    side TEXT NOT NULL, -- 'long' or 'short'
    entry_conditions TEXT NOT NULL, -- JSON: visual conditions + specific signals
    exit_conditions TEXT NOT NULL, -- JSON: exit rules + stop loss
    confidence_score REAL, -- 0-100, if Claude provides it
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES claude_analyses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_strategy_recommendations_analysis ON strategy_recommendations(analysis_id);

-- Analysis Charts Table (cache generated charts for Claude analysis)
CREATE TABLE IF NOT EXISTS analysis_charts (
    id TEXT PRIMARY KEY, -- UUID
    analysis_id TEXT NOT NULL,
    sample_id TEXT NOT NULL,
    chart_type TEXT NOT NULL, -- 'daily_context' or 'intraday_detail'
    ticker TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    chart_data TEXT NOT NULL, -- Base64-encoded PNG
    width INTEGER,
    height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES claude_analyses(id) ON DELETE CASCADE,
    FOREIGN KEY (sample_id) REFERENCES scan_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_charts_analysis ON analysis_charts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_charts_sample ON analysis_charts(sample_id);

-- Batch Backtest Runs Table (one record per batch execution)
CREATE TABLE IF NOT EXISTS batch_backtest_runs (
    id TEXT PRIMARY KEY, -- UUID
    analysis_id TEXT NOT NULL,
    backtest_set_id TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    total_strategies INTEGER DEFAULT 0,
    total_samples INTEGER DEFAULT 0,
    total_tests INTEGER DEFAULT 0, -- strategies × samples
    completed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (analysis_id) REFERENCES claude_analyses(id) ON DELETE CASCADE,
    FOREIGN KEY (backtest_set_id) REFERENCES backtest_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_batch_runs_analysis ON batch_backtest_runs(analysis_id);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_backtest_runs(status);

-- Strategy Backtest Scripts Table (generated scripts for each strategy)
CREATE TABLE IF NOT EXISTS strategy_backtest_scripts (
    id TEXT PRIMARY KEY, -- UUID
    strategy_recommendation_id TEXT NOT NULL,
    script_path TEXT NOT NULL, -- Path to generated TypeScript file
    script_hash TEXT, -- SHA-256 hash for change detection
    generation_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'GENERATING', 'COMPLETED', 'FAILED'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (strategy_recommendation_id) REFERENCES strategy_recommendations(id) ON DELETE CASCADE,
    UNIQUE(strategy_recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_strategy_scripts_recommendation ON strategy_backtest_scripts(strategy_recommendation_id);
CREATE INDEX IF NOT EXISTS idx_strategy_scripts_status ON strategy_backtest_scripts(generation_status);

-- Batch Backtest Results Table (individual test results: one per strategy+sample combo)
CREATE TABLE IF NOT EXISTS batch_backtest_results (
    id TEXT PRIMARY KEY, -- UUID
    batch_run_id TEXT NOT NULL,
    strategy_recommendation_id TEXT NOT NULL,
    sample_id TEXT NOT NULL, -- scan_results.id
    ticker TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'

    -- Trade results
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    total_pnl REAL DEFAULT 0,
    total_pnl_percent REAL DEFAULT 0,
    max_drawdown_percent REAL,

    -- Detailed results
    trades_json TEXT, -- JSON array of trade objects
    metrics_json TEXT, -- JSON object with detailed metrics

    -- Execution metadata
    execution_time_ms INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    FOREIGN KEY (batch_run_id) REFERENCES batch_backtest_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (strategy_recommendation_id) REFERENCES strategy_recommendations(id) ON DELETE CASCADE,
    FOREIGN KEY (sample_id) REFERENCES scan_results(id) ON DELETE CASCADE,
    UNIQUE(batch_run_id, strategy_recommendation_id, sample_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_results_run ON batch_backtest_results(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_batch_results_strategy ON batch_backtest_results(strategy_recommendation_id);
CREATE INDEX IF NOT EXISTS idx_batch_results_sample ON batch_backtest_results(sample_id);
CREATE INDEX IF NOT EXISTS idx_batch_results_status ON batch_backtest_results(status);

-- Batch Strategy Performance Summary (aggregated performance per strategy)
CREATE TABLE IF NOT EXISTS batch_strategy_performance (
    id TEXT PRIMARY KEY, -- UUID
    batch_run_id TEXT NOT NULL,
    strategy_recommendation_id TEXT NOT NULL,
    strategy_name TEXT NOT NULL,

    -- Win/Loss statistics
    total_tests INTEGER DEFAULT 0,
    successful_tests INTEGER DEFAULT 0, -- Tests that completed without error
    failed_tests INTEGER DEFAULT 0, -- Tests that errored
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate REAL, -- Percentage (0-100)

    -- P&L statistics
    total_pnl REAL DEFAULT 0,
    avg_pnl_per_trade REAL,
    avg_pnl_percent_per_trade REAL,
    median_pnl_percent REAL,
    best_pnl_percent REAL,
    worst_pnl_percent REAL,

    -- Risk metrics
    avg_drawdown_percent REAL,
    max_drawdown_percent REAL,

    -- Best/Worst performers
    best_sample_id TEXT, -- Sample with best performance
    best_sample_pnl_percent REAL,
    worst_sample_id TEXT, -- Sample with worst performance
    worst_sample_pnl_percent REAL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (batch_run_id) REFERENCES batch_backtest_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (strategy_recommendation_id) REFERENCES strategy_recommendations(id) ON DELETE CASCADE,
    UNIQUE(batch_run_id, strategy_recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_strategy_performance_run ON batch_strategy_performance(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_strategy_performance_win_rate ON batch_strategy_performance(win_rate);

-- =====================================================
-- PHASE 1: LIVE TRADING INFRASTRUCTURE
-- Real-time trading agent tables
-- =====================================================

-- Trading Agents Configuration
CREATE TABLE IF NOT EXISTS trading_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL UNIQUE, -- TradeStation account ID
    timeframe TEXT NOT NULL, -- 'intraday', 'swing', 'position'
    strategies TEXT NOT NULL, -- JSON array of strategy pattern IDs
    risk_limits TEXT NOT NULL, -- JSON object with risk parameters
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agents_active ON trading_agents(active);

-- Real-time Market Data Bars
CREATE TABLE IF NOT EXISTS realtime_bars (
    ticker TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL,
    timeframe TEXT NOT NULL, -- '1min', '5min', etc.
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, timestamp, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_realtime_bars_ticker_time ON realtime_bars(ticker, timestamp);
CREATE INDEX IF NOT EXISTS idx_realtime_bars_timeframe ON realtime_bars(timeframe, timestamp);

-- Live Pattern Detections
CREATE TABLE IF NOT EXISTS live_signals (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    ticker TEXT NOT NULL,
    pattern_type TEXT NOT NULL, -- 'breakout-volume-surge', 'gap-and-go', etc.
    detection_time DATETIME NOT NULL,
    signal_data TEXT, -- JSON: prices, indicators, pattern details
    status TEXT DEFAULT 'DETECTED', -- DETECTED, ANALYZING, EXECUTED, REJECTED, EXPIRED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_live_signals_status ON live_signals(status);
CREATE INDEX IF NOT EXISTS idx_live_signals_ticker ON live_signals(ticker, detection_time);
CREATE INDEX IF NOT EXISTS idx_live_signals_agent ON live_signals(agent_id, status);

-- AI Trade Recommendations
CREATE TABLE IF NOT EXISTS trade_recommendations (
    id TEXT PRIMARY KEY,
    signal_id TEXT,
    agent_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    side TEXT NOT NULL, -- 'LONG', 'SHORT'
    entry_price REAL,
    position_size INTEGER, -- Number of shares
    stop_loss REAL,
    take_profit REAL,
    confidence_score INTEGER, -- 0-100
    reasoning TEXT, -- Claude's explanation
    chart_data TEXT, -- Base64 chart image
    risk_checks TEXT, -- JSON: which risk checks passed/failed
    status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, EXECUTED, CANCELLED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (signal_id) REFERENCES live_signals(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trade_recommendations_status ON trade_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_trade_recommendations_agent ON trade_recommendations(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_recommendations_created ON trade_recommendations(created_at DESC);

-- Executed Trades (Live/Paper)
CREATE TABLE IF NOT EXISTS executed_trades (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    recommendation_id TEXT,
    ticker TEXT NOT NULL,
    side TEXT NOT NULL, -- 'LONG', 'SHORT'
    
    -- Entry details
    entry_time DATETIME,
    entry_price REAL,
    position_size INTEGER,
    entry_order_id TEXT, -- TradeStation order ID
    
    -- Exit details
    exit_time DATETIME,
    exit_price REAL,
    exit_order_id TEXT,
    
    -- P&L
    pnl REAL,
    pnl_percent REAL,
    
    -- Risk management
    stop_loss REAL,
    take_profit REAL,
    trailing_stop REAL,
    
    -- Exit reason
    exit_reason TEXT, -- STOP_HIT, TARGET_HIT, TIME_EXIT, MANUAL_EXIT, TRAILING_STOP
    
    -- Status
    status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED, CANCELLED
    
    -- Metadata
    pattern_type TEXT,
    confidence_score INTEGER,
    notes TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (recommendation_id) REFERENCES trade_recommendations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_executed_trades_agent ON executed_trades(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_executed_trades_ticker ON executed_trades(ticker, entry_time);
CREATE INDEX IF NOT EXISTS idx_executed_trades_status ON executed_trades(status);
CREATE INDEX IF NOT EXISTS idx_executed_trades_entry_time ON executed_trades(entry_time DESC);

-- Portfolio State (per agent)
CREATE TABLE IF NOT EXISTS portfolio_state (
    agent_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    
    -- Equity
    cash REAL DEFAULT 0,
    positions TEXT, -- JSON: {ticker: {shares, avgPrice, currentPrice, pnl}}
    total_equity REAL DEFAULT 0,
    
    -- Daily metrics
    daily_pnl REAL DEFAULT 0,
    daily_pnl_percent REAL DEFAULT 0,
    
    -- Position metrics
    open_trade_count INTEGER DEFAULT 0,
    total_exposure REAL DEFAULT 0,
    
    -- Last update
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

-- Risk Metrics (historical tracking)
CREATE TABLE IF NOT EXISTS risk_metrics (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    metric_date DATE NOT NULL,
    
    -- Exposure metrics
    total_exposure REAL,
    max_position_size REAL,
    avg_position_size REAL,
    
    -- Performance metrics
    daily_pnl REAL,
    daily_pnl_percent REAL,
    cumulative_pnl REAL,
    
    -- Risk metrics
    max_drawdown REAL,
    current_drawdown REAL,
    sharpe_ratio REAL,
    sortino_ratio REAL,
    
    -- Trade statistics
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate REAL,
    avg_win REAL,
    avg_loss REAL,
    largest_win REAL,
    largest_loss REAL,
    profit_factor REAL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE,
    UNIQUE(agent_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_metrics_agent_date ON risk_metrics(agent_id, metric_date DESC);

-- TradeStation Orders (audit trail)
CREATE TABLE IF NOT EXISTS tradestation_orders (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    trade_id TEXT, -- Links to executed_trades
    
    -- Order details
    order_id TEXT NOT NULL, -- TradeStation order ID
    ticker TEXT NOT NULL,
    side TEXT NOT NULL, -- BUY, SELL
    order_type TEXT NOT NULL, -- MARKET, LIMIT, STOP, STOP_LIMIT
    quantity INTEGER NOT NULL,
    limit_price REAL,
    stop_price REAL,
    
    -- Status
    status TEXT NOT NULL, -- PENDING, FILLED, PARTIAL, CANCELLED, REJECTED
    filled_quantity INTEGER DEFAULT 0,
    avg_fill_price REAL,
    
    -- Timestamps
    submitted_at DATETIME NOT NULL,
    filled_at DATETIME,
    
    -- Response data
    response_data TEXT, -- JSON: full TradeStation API response
    error_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (trade_id) REFERENCES executed_trades(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tradestation_orders_agent ON tradestation_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_tradestation_orders_status ON tradestation_orders(status);
CREATE INDEX IF NOT EXISTS idx_tradestation_orders_trade ON tradestation_orders(trade_id);

-- Agent Activity Log (audit trail)
CREATE TABLE IF NOT EXISTS agent_activity_log (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- SIGNAL_DETECTED, TRADE_ANALYZED, ORDER_PLACED, POSITION_CLOSED, RISK_LIMIT_HIT, etc.
    ticker TEXT,
    description TEXT NOT NULL,
    data TEXT, -- JSON: additional context
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent_time ON agent_activity_log(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_type ON agent_activity_log(activity_type, timestamp DESC);
