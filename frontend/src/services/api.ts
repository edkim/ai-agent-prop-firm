/**
 * API Client Service
 * Handles all communication with the backend API
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';

// API base URL - defaults to localhost during development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minute timeout for backtests
});

// Types for API requests and responses
export interface IntelligentBacktestRequest {
  prompt: string;
  ticker: string;
  strategyType?: string;
  timeframe?: string;
  config?: Record<string, any>;
}

export interface RoutingDecision {
  strategy: 'template-api' | 'custom-dates' | 'fully-custom';
  reason: string;
  dates?: string[];
  useTemplate?: string;
}

export interface Trade {
  date?: string;
  ticker?: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  noTrade?: boolean;
  noTradeReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
}

// Backend response uses snake_case
interface BackendTrade {
  date?: string;
  ticker?: string;
  side?: 'LONG' | 'SHORT';
  entry_time?: string;
  entry_price?: number;
  exit_time?: string;
  exit_price?: number;
  pnl?: number;
  pnl_percent?: number;
  exit_reason?: string;
  noTrade?: boolean;
  noTradeReason?: string;
  highest_price?: number;
  lowest_price?: number;
}

/**
 * Convert backend snake_case trade to frontend camelCase
 */
const transformTrade = (backendTrade: BackendTrade): Trade => {
  return {
    date: backendTrade.date,
    ticker: backendTrade.ticker,
    side: backendTrade.side,
    entryTime: backendTrade.entry_time,
    entryPrice: backendTrade.entry_price,
    exitTime: backendTrade.exit_time,
    exitPrice: backendTrade.exit_price,
    pnl: backendTrade.pnl,
    pnlPercent: backendTrade.pnl_percent,
    exitReason: backendTrade.exit_reason,
    noTrade: backendTrade.noTrade,
    noTradeReason: backendTrade.noTradeReason,
    highestPrice: backendTrade.highest_price,
    lowestPrice: backendTrade.lowest_price,
  };
};

export interface Metrics {
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  total_pnl?: number;
  avg_pnl?: number;
  avg_winner?: number;
  avg_loser?: number;
  largest_winner?: number;
  largest_loser?: number;
}

export interface BacktestResults {
  backtest?: {
    ticker: string;
    strategy: string;
    period?: string;
  };
  trades: Trade[];
  metrics: Metrics;
  summary?: string;
}

export interface IntelligentBacktestResponse {
  success: boolean;
  executionId: string;
  results: BacktestResults;
  executionTime: number;
  routing?: RoutingDecision;
  scriptPath?: string;
  error?: string;
  stderr?: string;
  metadata?: {
    routing?: RoutingDecision;
    dates?: string[];
    parameters?: Record<string, any>;
    claude?: {
      assumptions?: string[];
      confidence?: number;
      indicators?: string[];
      explanation?: string;
    };
  };
}

/**
 * Execute an intelligent backtest using natural language prompt
 */
export const executeIntelligentBacktest = async (
  request: IntelligentBacktestRequest
): Promise<IntelligentBacktestResponse> => {
  const response = await apiClient.post<any>(
    '/backtests/execute-intelligent',
    request
  );

  // Transform snake_case trades to camelCase
  const data = response.data;
  if (data.results?.trades) {
    data.results.trades = data.results.trades.map(transformTrade);
  }

  return data;
};

/**
 * Execute a custom script backtest (legacy endpoint)
 */
export const executeScriptBacktest = async (
  scriptTemplate: string,
  parameters: Record<string, any>
): Promise<IntelligentBacktestResponse> => {
  const response = await apiClient.post<IntelligentBacktestResponse>(
    '/backtests/execute-script',
    { scriptTemplate, parameters }
  );
  return response.data;
};

/**
 * Get all backtests
 */
export const getAllBacktests = async () => {
  const response = await apiClient.get('/backtests');
  return response.data;
};

/**
 * Get specific backtest by ID
 */
export const getBacktest = async (id: number) => {
  const response = await apiClient.get(`/backtests/${id}`);
  return response.data;
};

/**
 * Delete a backtest
 */
export const deleteBacktest = async (id: number) => {
  const response = await apiClient.delete(`/backtests/${id}`);
  return response.data;
};

// Export the axios instance for custom requests
export default apiClient;
