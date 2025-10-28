/**
 * Claude Analysis API Client (Phase 5)
 * Handles communication with Claude visual AI analysis endpoints
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
  timeout: 60000, // 60 second timeout for analysis operations
});

// Type definitions matching backend types

export type AnalysisStatus =
  | 'PENDING'
  | 'GENERATING_CHARTS'
  | 'ANALYZING'
  | 'COMPLETED'
  | 'FAILED';

export interface VisualInsights {
  continuation_signals?: string[];
  exhaustion_signals?: string[];
  key_observations?: string[];
  [key: string]: any;
}

export interface StrategyEntry {
  visual_conditions?: string;
  specific_signals?: string;
  timing?: string;
  [key: string]: any;
}

export interface StrategyExit {
  visual_conditions?: string;
  take_profit?: string;
  stop_loss?: string;
  max_hold?: string;
  [key: string]: any;
}

export interface StrategyRecommendation {
  id: string;
  name: string;
  side: 'long' | 'short';
  entry_conditions: StrategyEntry;
  exit_conditions: StrategyExit;
  confidence_score?: number;
}

export interface AnalyzeChartsRequest {
  backtestSetId: string;
  sampleIds: string[]; // 1-3 sample IDs
}

export interface AnalyzeChartsResponse {
  analysisId: string;
  status: AnalysisStatus;
  strategies: StrategyRecommendation[];
}

export interface AnalysisResult {
  analysisId: string;
  status: AnalysisStatus;
  visual_insights?: VisualInsights;
  strategies: StrategyRecommendation[];
  error?: string;
}

export interface AnalysisStatusResponse {
  status: AnalysisStatus;
  error?: string;
}

export interface ChartData {
  id: string;
  sampleId: string;
  chartType: 'daily_context' | 'intraday_detail';
  ticker: string;
  startDate: string;
  endDate: string;
  chartData: string; // base64 PNG
  width: number;
  height: number;
  createdAt: string;
}

export interface ChartsResponse {
  charts: ChartData[];
}

// Claude Analysis API functions

export const claudeAnalysisApi = {
  /**
   * Generate chart preview without Claude analysis
   * Returns preview ID and generated charts
   */
  async generatePreview(request: AnalyzeChartsRequest): Promise<{ previewId: string; charts: ChartData[] }> {
    const response = await apiClient.post<{ previewId: string; charts: ChartData[] }>('/analysis/preview', {
      backtestSetId: request.backtestSetId,
      sampleIds: request.sampleIds
    });
    return response.data;
  },

  /**
   * Analyze existing preview charts with Claude
   * Uses preview ID from generatePreview()
   */
  async analyzePreview(previewId: string): Promise<{ success: boolean; analysisId: string }> {
    const response = await apiClient.post<{ success: boolean; analysisId: string }>(`/analysis/${previewId}/analyze`);
    return response.data;
  },

  /**
   * Start a new Claude analysis
   * Analyzes selected samples and generates strategy recommendations
   */
  async analyzeCharts(request: AnalyzeChartsRequest): Promise<AnalyzeChartsResponse> {
    const response = await apiClient.post<AnalyzeChartsResponse>('/analysis', {
      backtestSetId: request.backtestSetId,
      sampleIds: request.sampleIds
    });
    return response.data;
  },

  /**
   * Get complete analysis results
   * Returns full analysis including visual insights and strategies
   */
  async getAnalysis(analysisId: string): Promise<AnalysisResult> {
    const response = await apiClient.get<AnalysisResult>(`/analysis/${analysisId}`);
    return response.data;
  },

  /**
   * Poll for analysis status
   * Lightweight endpoint for checking if analysis is complete
   */
  async pollStatus(analysisId: string): Promise<AnalysisStatusResponse> {
    const response = await apiClient.get<AnalysisStatusResponse>(`/analysis/${analysisId}/status`);
    return response.data;
  },

  /**
   * Get all charts for an analysis
   * Returns generated charts with base64 image data
   */
  async getCharts(analysisId: string): Promise<ChartsResponse> {
    const response = await apiClient.get<ChartsResponse>(`/analysis/${analysisId}/charts`);
    return response.data;
  },
};

export default claudeAnalysisApi;
