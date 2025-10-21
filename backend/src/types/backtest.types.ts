/**
 * Backtesting Type Definitions
 */

import { Position, OHLCVBar } from './strategy.types';

export interface BacktestConfig {
  strategyId: number;
  startDate: string; // ISO date string
  endDate: string;
  initialCapital: number;
  commission?: number; // Per trade or percentage
  slippage?: number; // Percentage
}

export interface Trade {
  id?: number;
  backtestId?: number;
  ticker: string;
  side: 'LONG' | 'SHORT';
  entryTimestamp: number;
  entryPrice: number;
  exitTimestamp?: number;
  exitPrice?: number;
  quantity: number;
  commission: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | 'END_OF_PERIOD';
  bars?: number; // Number of bars held
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  cash: number;
  positionValue: number;
  drawdown: number;
  drawdownPercent: number;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  cagr: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageTradeDuration: number; // in bars
  expectancy: number;
  stdDevReturns: number;
}

export interface BacktestResult {
  id?: number;
  strategyId: number;
  config: BacktestConfig;
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface BacktestState {
  currentBar: OHLCVBar;
  currentIndex: number;
  cash: number;
  positions: Position[];
  closedTrades: Trade[];
  equityCurve: EquityPoint[];
  peakEquity: number;
}

export interface OrderRequest {
  ticker: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice?: number;
}

export interface OrderResult {
  executed: boolean;
  executionPrice?: number;
  commission: number;
  slippage: number;
  reason?: string;
}
