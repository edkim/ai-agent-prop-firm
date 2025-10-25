/**
 * Portfolio Backtest Types
 *
 * Types for portfolio-level backtesting that integrates scanner and backtest services
 */

import { ScanMatch } from '../services/scanner.service';

export interface PortfolioBacktestRequest {
  scanQuery: string;       // Natural language scan query
  strategyPrompt: string;  // Natural language strategy description
  universe: string;        // Universe to scan (e.g., 'russell2000')
  sampleSize?: number;     // Max number of stocks to backtest (default: 20)
  dateRange?: {            // Optional date range for scanner
    start: string;
    end: string;
  };
}

export interface TradeResult {
  ticker: string;
  date: string;
  side?: 'LONG' | 'SHORT';
  entry_price?: number;
  exit_price?: number;
  pnl?: number;
  pnl_percent?: number;
  exit_reason?: string;
  no_trade?: boolean;
  no_trade_reason?: string;
}

export interface IndividualBacktestResult {
  ticker: string;
  success: boolean;
  error?: string;
  trades?: TradeResult[];
  metrics?: {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    total_pnl: number;
    total_pnl_percent: number;
    avg_pnl: number;
    avg_pnl_percent?: number;
  };
}

export interface PortfolioMetrics {
  total_stocks_tested: number;
  total_trades: number;
  successful_backtests: number;
  failed_backtests: number;

  // Win/loss metrics
  winning_trades: number;
  losing_trades: number;
  win_rate: number;  // Percentage (0-100)

  // P&L metrics
  total_pnl: number;
  total_pnl_percent: number;
  avg_pnl_per_trade: number;
  avg_pnl_percent_per_trade: number;
  median_pnl_percent: number;

  // Best/worst performers
  best_trade?: TradeResult & { ticker: string };
  worst_trade?: TradeResult & { ticker: string };
  best_stock?: { ticker: string; win_rate: number; avg_pnl_percent: number };
  worst_stock?: { ticker: string; win_rate: number; avg_pnl_percent: number };
}

export interface PortfolioBacktestResult {
  success: boolean;
  error?: string;

  // Scan results summary
  scanResults: {
    total_matches: number;
    tested_count: number;
    skipped_count: number;
    scan_time_ms: number;
  };

  // Portfolio-level metrics
  portfolioMetrics: PortfolioMetrics;

  // Individual results for each stock
  individualResults: IndividualBacktestResult[];

  // Execution metadata
  executionTime: number;
  strategyPrompt: string;
  scanQuery: string;
  universe: string;
}
