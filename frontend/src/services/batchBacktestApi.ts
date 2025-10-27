/**
 * Batch Backtest API Client
 * Handles communication with batch backtesting endpoints
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
  timeout: 120000, // 2 minute timeout for batch operations
});

// Type definitions

export interface StartBatchBacktestRequest {
  analysisId: string;
  backtestSetId: string;
}

export interface StartBatchBacktestResponse {
  batchRunId: string;
}

export interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  winRate: number;
  totalTests: number;
  successfulTests: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  avgPnlPercent: number;
}

export interface BatchBacktestStatus {
  batchRunId: string;
  status: string; // 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
  totalTests: number;
  completedTests: number;
  failedTests: number;
  strategies: StrategyPerformance[];
}

export interface StrategyResult {
  id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_pnl: number;
  total_pnl_percent: number;
  status: string;
  error_message?: string;
}

export interface StrategyResultsResponse {
  results: StrategyResult[];
}

// Batch Backtest API functions

export const batchBacktestApi = {
  /**
   * Start a new batch backtest run
   */
  async startBatchBacktest(request: StartBatchBacktestRequest): Promise<StartBatchBacktestResponse> {
    const response = await apiClient.post<StartBatchBacktestResponse>('/batch-backtest', {
      analysisId: request.analysisId,
      backtestSetId: request.backtestSetId,
    });
    return response.data;
  },

  /**
   * Get batch backtest status and results
   */
  async getBatchBacktestStatus(batchRunId: string): Promise<BatchBacktestStatus> {
    const response = await apiClient.get<BatchBacktestStatus>(`/batch-backtest/${batchRunId}`);
    return response.data;
  },

  /**
   * Get detailed results for a specific strategy
   */
  async getStrategyResults(batchRunId: string, strategyId: string): Promise<StrategyResultsResponse> {
    const response = await apiClient.get<StrategyResultsResponse>(
      `/batch-backtest/${batchRunId}/strategy/${strategyId}`
    );
    return response.data;
  },
};

export default batchBacktestApi;
