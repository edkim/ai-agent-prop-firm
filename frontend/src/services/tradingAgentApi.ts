/**
 * Trading Agent API Service
 * Handles all API calls related to autonomous trading agents
 */

import axios from 'axios';
import type {
  TradingAgent,
  CreateAgentRequest,
  UpdateAgentRequest,
  PortfolioState,
  LiveSignal,
  TradeRecommendation,
  ExecutedTrade,
  RiskMetrics,
  AgentActivity,
  EquityCurveDataPoint,
} from '../types/tradingAgent';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/agents`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export const tradingAgentApi = {
  // ===== Agent Management =====

  /**
   * Get all trading agents
   */
  async getAllAgents(): Promise<TradingAgent[]> {
    const response = await apiClient.get<{ agents: TradingAgent[] }>('/');
    return response.data.agents;
  },

  /**
   * Get a single agent by ID
   */
  async getAgent(agentId: string): Promise<TradingAgent> {
    const response = await apiClient.get<TradingAgent>(`/${agentId}`);
    return response.data;
  },

  /**
   * Create a new trading agent
   */
  async createAgent(request: CreateAgentRequest): Promise<TradingAgent> {
    const response = await apiClient.post<TradingAgent>('/', request);
    return response.data;
  },

  /**
   * Update an existing agent
   */
  async updateAgent(agentId: string, request: UpdateAgentRequest): Promise<TradingAgent> {
    const response = await apiClient.patch<TradingAgent>(`/${agentId}`, request);
    return response.data;
  },

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    await apiClient.delete(`/${agentId}`);
  },

  /**
   * Activate an agent
   */
  async activateAgent(agentId: string): Promise<TradingAgent> {
    const response = await apiClient.post<TradingAgent>(`/${agentId}/activate`);
    return response.data;
  },

  /**
   * Deactivate an agent
   */
  async deactivateAgent(agentId: string): Promise<TradingAgent> {
    const response = await apiClient.post<TradingAgent>(`/${agentId}/deactivate`);
    return response.data;
  },

  // ===== Portfolio & Positions =====

  /**
   * Get portfolio state for an agent
   */
  async getPortfolio(agentId: string): Promise<PortfolioState> {
    const response = await apiClient.get<PortfolioState>(`/${agentId}/portfolio`);
    return response.data;
  },

  /**
   * Get open positions for an agent
   */
  async getPositions(agentId: string): Promise<ExecutedTrade[]> {
    const response = await apiClient.get<ExecutedTrade[]>(`/${agentId}/positions`);
    return response.data;
  },

  // ===== Monitoring =====

  /**
   * Start position monitoring for an agent
   */
  async startMonitoring(agentId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/${agentId}/monitor/start`);
    return response.data;
  },

  /**
   * Stop position monitoring for an agent
   */
  async stopMonitoring(agentId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/${agentId}/monitor/stop`);
    return response.data;
  },

  // ===== Signals =====

  /**
   * Get signals for an agent
   */
  async getSignals(agentId: string, params?: {
    status?: string;
    limit?: number;
  }): Promise<LiveSignal[]> {
    const response = await apiClient.get<{ signals: LiveSignal[] }>(`/${agentId}/signals`, { params });
    return response.data.signals || [];
  },

  // ===== Recommendations =====

  /**
   * Get trade recommendations for an agent
   */
  async getRecommendations(agentId: string, params?: {
    status?: string;
    limit?: number;
  }): Promise<TradeRecommendation[]> {
    const response = await apiClient.get<{ recommendations: TradeRecommendation[] }>(`/${agentId}/recommendations`, { params });
    return response.data.recommendations || [];
  },

  /**
   * Approve a trade recommendation
   */
  async approveRecommendation(agentId: string, recommendationId: string): Promise<ExecutedTrade> {
    const response = await apiClient.post<ExecutedTrade>(
      `/${agentId}/recommendations/${recommendationId}/approve`
    );
    return response.data;
  },

  /**
   * Reject a trade recommendation
   */
  async rejectRecommendation(agentId: string, recommendationId: string): Promise<void> {
    await apiClient.post(`/${agentId}/recommendations/${recommendationId}/reject`);
  },

  // ===== Trades =====

  /**
   * Get trades for an agent
   */
  async getTrades(agentId: string, params?: {
    status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
    limit?: number;
    offset?: number;
  }): Promise<ExecutedTrade[]> {
    const response = await apiClient.get<{ trades: ExecutedTrade[] }>(`/${agentId}/trades`, { params });
    return response.data.trades || [];
  },

  /**
   * Close a trade manually
   */
  async closeTrade(agentId: string, tradeId: string): Promise<ExecutedTrade> {
    const response = await apiClient.post<ExecutedTrade>(`/${agentId}/trades/${tradeId}/close`);
    return response.data;
  },

  /**
   * Enable trailing stop for a trade
   */
  async enableTrailingStop(
    agentId: string,
    tradeId: string,
    config: { trailPercent: number; activationPercent?: number }
  ): Promise<void> {
    await apiClient.post(`/${agentId}/trades/${tradeId}/trailing-stop`, config);
  },

  // ===== Metrics & Performance =====

  /**
   * Get risk metrics for an agent
   */
  async getMetrics(agentId: string, params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<RiskMetrics[]> {
    const response = await apiClient.get<{ metrics: RiskMetrics[] }>(`/${agentId}/metrics`, { params });
    return response.data.metrics || [];
  },

  /**
   * Get latest daily metrics
   */
  async getLatestMetrics(agentId: string): Promise<RiskMetrics> {
    const response = await apiClient.get<RiskMetrics>(`/${agentId}/metrics/latest`);
    return response.data;
  },

  /**
   * Get equity curve data
   */
  async getEquityCurve(agentId: string, params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<EquityCurveDataPoint[]> {
    const response = await apiClient.get<{ equityCurve: EquityCurveDataPoint[] }>(`/${agentId}/equity-curve`, { params });
    return response.data.equityCurve || [];
  },

  /**
   * Calculate metrics for a specific date
   */
  async calculateMetrics(agentId: string, date: string): Promise<RiskMetrics> {
    const response = await apiClient.post<RiskMetrics>(`/${agentId}/metrics/calculate`, { date });
    return response.data;
  },

  // ===== Activity =====

  /**
   * Get recent activity for an agent
   */
  async getActivity(agentId: string, params?: {
    limit?: number;
    activityType?: string;
  }): Promise<AgentActivity[]> {
    const response = await apiClient.get<{ activity: AgentActivity[] }>(`/${agentId}/activity`, { params });
    return response.data.activity || [];
  },
};
