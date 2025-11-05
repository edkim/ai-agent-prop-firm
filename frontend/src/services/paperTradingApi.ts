/**
 * Paper Trading API Service
 * Handles all API calls related to paper trading
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/paper-trading`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export interface PaperTradingAgent {
  id: string;
  name: string;
  status: string;
  account_id: string;
  initial_balance: number;
  current_cash: number;
  equity: number;
  buying_power: number;
  total_pnl: number;
  total_pnl_percent: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  account_status: string;
  account_created_at: string;
}

export interface PaperTradingStatus {
  isRunning: boolean;
  polygonConnected: boolean;
  subscribedTickers: string[];
  activeAgents: number;
  watchedTickers: number;
  pendingOrders: number;
  activeAccounts: number;
}

export interface PaperTradingSummary {
  total_agents: number;
  total_equity: number;
  avg_pnl_percent: number;
  total_trades: number;
  avg_win_rate: number | null;
  active_positions: number;
  recent_trades: any[];
}

export interface PaperPosition {
  ticker: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  entry_time: string;
}

export interface PaperTrade {
  ticker: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number | null;
  pnl_percent: number | null;
  executed_at: string;
  agent_name: string;
}

export const paperTradingApi = {
  /**
   * Get paper trading system status
   */
  async getStatus(): Promise<PaperTradingStatus> {
    const response = await apiClient.get<PaperTradingStatus>('/status');
    return response.data;
  },

  /**
   * Get all paper trading agents
   */
  async getAgents(): Promise<PaperTradingAgent[]> {
    const response = await apiClient.get<PaperTradingAgent[]>('/agents');
    return response.data;
  },

  /**
   * Get paper trading summary statistics
   */
  async getSummary(): Promise<PaperTradingSummary> {
    const response = await apiClient.get<PaperTradingSummary>('/summary');
    return response.data;
  },

  /**
   * Get account details for an agent
   */
  async getAgentAccount(agentId: string) {
    const response = await apiClient.get(`/agents/${agentId}/account`);
    return response.data;
  },

  /**
   * Get current positions for an agent
   */
  async getAgentPositions(agentId: string): Promise<PaperPosition[]> {
    const response = await apiClient.get<PaperPosition[]>(`/agents/${agentId}/positions`);
    return response.data;
  },

  /**
   * Get trade history for an agent
   */
  async getAgentTrades(agentId: string, limit = 50): Promise<PaperTrade[]> {
    const response = await apiClient.get<PaperTrade[]>(`/agents/${agentId}/trades`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Get performance stats for an agent
   */
  async getAgentPerformance(agentId: string) {
    const response = await apiClient.get(`/agents/${agentId}/performance`);
    return response.data;
  },

  /**
   * Pause paper trading for an agent
   */
  async pauseAgent(agentId: string) {
    const response = await apiClient.post(`/agents/${agentId}/pause`);
    return response.data;
  },

  /**
   * Resume paper trading for an agent
   */
  async resumeAgent(agentId: string) {
    const response = await apiClient.post(`/agents/${agentId}/resume`);
    return response.data;
  },

  /**
   * Get paper trading leaderboard
   */
  async getLeaderboard() {
    const response = await apiClient.get('/leaderboard');
    return response.data;
  },
};
