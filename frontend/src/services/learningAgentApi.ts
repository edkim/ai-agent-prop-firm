/**
 * Learning Agent API Service
 * Handles all API calls related to the multi-agent learning laboratory
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/learning-agents`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 180000, // 3 minute timeout for learning iterations (can take 1-2 minutes)
});

// ===== Types =====

export interface LearningAgent {
  id: string;
  name: string;
  instructions: string;
  system_prompt?: string;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  trading_style: 'scalper' | 'day_trader' | 'swing_trader' | 'position_trader';
  pattern_focus: string[];
  market_conditions: string[];
  risk_config?: any;
  status: 'learning' | 'paper_trading' | 'live_trading' | 'paused';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentIteration {
  id: string;
  agent_id: string;
  iteration_number: number;
  scan_script: string;
  execution_script: string;
  version_notes?: string;
  manual_guidance?: string;
  signals_found: number;
  backtest_results: any;
  win_rate: number;
  sharpe_ratio: number;
  total_return: number;
  expert_analysis: string;
  refinements_suggested: any[];
  iteration_status: 'completed' | 'approved' | 'rejected' | 'improved_upon';
  created_at: string;
}

export interface AgentStrategy {
  id: string;
  agent_id: string;
  version: string;
  scan_script: string;
  execution_script: string;
  backtest_sharpe: number;
  backtest_win_rate: number;
  backtest_total_return: number;
  is_current_version: boolean;
  parent_version?: string;
  changes_from_parent?: string;
  created_at: string;
}

export interface AgentKnowledge {
  id: string;
  agent_id: string;
  knowledge_type: 'INSIGHT' | 'PARAMETER_PREF' | 'PATTERN_RULE';
  pattern_type?: string;
  insight: string;
  supporting_data?: any;
  confidence: number;
  learned_from_iteration: number;
  times_validated: number;
  last_validated?: string;
  created_at: string;
}

export interface CreateAgentRequest {
  name?: string;
  instructions: string;
}

export interface CreateAgentResponse {
  success: boolean;
  agent: LearningAgent;
  detectedPersonality: {
    risk_tolerance: string;
    trading_style: string;
    pattern_focus: string[];
    market_conditions: string[];
  };
}

export interface StartIterationResponse {
  success: boolean;
  result: {
    iteration: AgentIteration;
    strategy: {
      scanScript: string;
      executionScript: string;
      rationale: string;
    };
    scanResults: any[];
    backtestResults: any;
    analysis: any;
    refinements: any[];
  };
}

export interface ApplyRefinementsRequest {
  approved: boolean;
}

export interface ApplyRefinementsResponse {
  success: boolean;
  new_version: AgentStrategy;
  message: string;
}

// ===== API Methods =====

export const learningAgentApi = {
  // ===== Agent Management =====

  /**
   * Get all learning agents
   */
  async getAllAgents(): Promise<LearningAgent[]> {
    const response = await apiClient.get<{ success: boolean; agents: LearningAgent[] }>('/');
    return response.data.agents;
  },

  /**
   * Get a single agent by ID
   */
  async getAgent(agentId: string): Promise<LearningAgent> {
    const response = await apiClient.get<{ success: boolean; agent: LearningAgent }>(`/${agentId}`);
    return response.data.agent;
  },

  /**
   * Create a new learning agent from natural language instructions
   */
  async createAgent(request: CreateAgentRequest): Promise<CreateAgentResponse> {
    const response = await apiClient.post<CreateAgentResponse>('/create', request);
    return response.data;
  },

  /**
   * Update an existing agent
   */
  async updateAgent(agentId: string, updates: Partial<LearningAgent>): Promise<LearningAgent> {
    const response = await apiClient.put<{ success: boolean; agent: LearningAgent }>(`/${agentId}`, updates);
    return response.data.agent;
  },

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    await apiClient.delete(`/${agentId}`);
  },

  // ===== Learning Iterations =====

  /**
   * Start a new learning iteration for an agent
   */
  async startIteration(agentId: string, manualGuidance?: string): Promise<StartIterationResponse> {
    const response = await apiClient.post<StartIterationResponse>(`/${agentId}/iterations/start`, {
      manualGuidance,
    });
    return response.data;
  },

  /**
   * Get all iterations for an agent
   */
  async getIterations(agentId: string): Promise<AgentIteration[]> {
    const response = await apiClient.get<{ success: boolean; iterations: AgentIteration[] }>(`/${agentId}/iterations`);
    return response.data.iterations;
  },

  /**
   * Get a specific iteration
   */
  async getIteration(agentId: string, iterationId: string): Promise<AgentIteration> {
    const response = await apiClient.get<{ success: boolean; iteration: AgentIteration }>(`/${agentId}/iterations/${iterationId}`);
    return response.data.iteration;
  },

  /**
   * Apply refinements from an iteration
   */
  async applyRefinements(agentId: string, iterationId: string, approved: boolean): Promise<ApplyRefinementsResponse> {
    const response = await apiClient.post<ApplyRefinementsResponse>(
      `/${agentId}/iterations/${iterationId}/apply-refinements`,
      { approved }
    );
    return response.data;
  },

  // ===== Strategies =====

  /**
   * Get all strategy versions for an agent
   */
  async getStrategies(agentId: string): Promise<AgentStrategy[]> {
    const response = await apiClient.get<{ success: boolean; strategies: AgentStrategy[] }>(`/${agentId}/strategies`);
    return response.data.strategies;
  },

  /**
   * Get a specific strategy version
   */
  async getStrategy(agentId: string, version: string): Promise<AgentStrategy> {
    const response = await apiClient.get<{ success: boolean; strategy: AgentStrategy }>(`/${agentId}/strategies/${version}`);
    return response.data.strategy;
  },

  // ===== Knowledge Base =====

  /**
   * Get accumulated knowledge for an agent
   */
  async getKnowledge(agentId: string, filters?: { type?: string; pattern?: string }): Promise<AgentKnowledge[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.pattern) params.append('pattern', filters.pattern);

    const url = params.toString() ? `/${agentId}/knowledge?${params}` : `/${agentId}/knowledge`;
    const response = await apiClient.get<{ success: boolean; knowledge: AgentKnowledge[] }>(url);
    return response.data.knowledge;
  },
};
