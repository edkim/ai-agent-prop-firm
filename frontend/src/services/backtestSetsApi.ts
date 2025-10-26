/**
 * Backtest Sets API Client (Phase 3)
 * Handles communication with backtest-sets backend endpoints
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
  timeout: 30000, // 30 second timeout
});

// Type definitions matching backend types

export interface BacktestSet {
  id: string;
  name: string;
  description?: string;
  pattern_type?: string;
  total_samples: number;
  created_at: string;
  updated_at: string;
}

export interface Sample {
  id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  backtest_set_id?: string;
  source_scan_id?: string;
  notes?: string;
  metadata?: SampleMetadata;
  created_at: string;
}

export interface SampleMetadata {
  max_gain_pct?: number;
  peak_date?: string;
  volume_spike_ratio?: number;
  pattern_duration_days?: number;
  [key: string]: any;
}

export interface CreateBacktestSetRequest {
  name: string;
  description?: string;
  pattern_type?: string;
}

export interface UpdateBacktestSetRequest {
  name?: string;
  description?: string;
  pattern_type?: string;
}

export interface CreateSampleRequest {
  ticker: string;
  start_date: string;
  end_date: string;
  peak_date?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateSampleRequest {
  notes?: string;
  tags?: string[];
  peak_date?: string;
}

export interface GetBacktestSetsResponse {
  backtest_sets: BacktestSet[];
  total: number;
}

export interface GetSamplesResponse {
  samples: Sample[];
  total: number;
}

// Backtest Sets API functions

export const backtestSetsApi = {
  // ============ Backtest Sets ============

  /**
   * Get all sample sets
   */
  async getBacktestSets(): Promise<GetBacktestSetsResponse> {
    const response = await apiClient.get<GetBacktestSetsResponse>('/backtest-sets');
    return response.data;
  },

  /**
   * Get a specific sample set
   */
  async getBacktestSet(id: string): Promise<BacktestSet> {
    const response = await apiClient.get<BacktestSet>(`/backtest-sets/${id}`);
    return response.data;
  },

  /**
   * Create a new sample set
   */
  async createBacktestSet(data: CreateBacktestSetRequest): Promise<BacktestSet> {
    const response = await apiClient.post<BacktestSet>('/backtest-sets', data);
    return response.data;
  },

  /**
   * Update a sample set
   */
  async updateBacktestSet(id: string, data: UpdateBacktestSetRequest): Promise<BacktestSet> {
    const response = await apiClient.patch<BacktestSet>(`/backtest-sets/${id}`, data);
    return response.data;
  },

  /**
   * Delete a sample set
   */
  async deleteBacktestSet(id: string): Promise<void> {
    await apiClient.delete(`/backtest-sets/${id}`);
  },

  // ============ Samples ============

  /**
   * Get all samples in a sample set
   */
  async getSamples(setId: string): Promise<GetSamplesResponse> {
    const response = await apiClient.get<GetSamplesResponse>(`/backtest-sets/${setId}/samples`);
    return response.data;
  },

  /**
   * Get a specific sample
   */
  async getSample(setId: string, sampleId: string): Promise<Sample> {
    const response = await apiClient.get<Sample>(`/backtest-sets/${setId}/samples/${sampleId}`);
    return response.data;
  },

  /**
   * Add a sample to a sample set
   */
  async addSample(setId: string, data: CreateSampleRequest): Promise<Sample> {
    const response = await apiClient.post<Sample>(`/backtest-sets/${setId}/samples`, data);
    return response.data;
  },

  /**
   * Update a sample
   */
  async updateSample(setId: string, sampleId: string, data: UpdateSampleRequest): Promise<Sample> {
    const response = await apiClient.patch<Sample>(
      `/backtest-sets/${setId}/samples/${sampleId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a sample
   */
  async deleteSample(setId: string, sampleId: string): Promise<void> {
    await apiClient.delete(`/backtest-sets/${setId}/samples/${sampleId}`);
  },
};

export default backtestSetsApi;
