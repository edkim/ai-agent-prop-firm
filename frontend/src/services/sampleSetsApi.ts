/**
 * Sample Sets API Client (Phase 3)
 * Handles communication with sample-sets backend endpoints
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

export interface SampleSet {
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
  sample_set_id?: string;
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

export interface CreateSampleSetRequest {
  name: string;
  description?: string;
  pattern_type?: string;
}

export interface UpdateSampleSetRequest {
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

export interface GetSampleSetsResponse {
  sample_sets: SampleSet[];
  total: number;
}

export interface GetSamplesResponse {
  samples: Sample[];
  total: number;
}

// Sample Sets API functions

export const sampleSetsApi = {
  // ============ Sample Sets ============

  /**
   * Get all sample sets
   */
  async getSampleSets(): Promise<GetSampleSetsResponse> {
    const response = await apiClient.get<GetSampleSetsResponse>('/sample-sets');
    return response.data;
  },

  /**
   * Get a specific sample set
   */
  async getSampleSet(id: string): Promise<SampleSet> {
    const response = await apiClient.get<SampleSet>(`/sample-sets/${id}`);
    return response.data;
  },

  /**
   * Create a new sample set
   */
  async createSampleSet(data: CreateSampleSetRequest): Promise<SampleSet> {
    const response = await apiClient.post<SampleSet>('/sample-sets', data);
    return response.data;
  },

  /**
   * Update a sample set
   */
  async updateSampleSet(id: string, data: UpdateSampleSetRequest): Promise<SampleSet> {
    const response = await apiClient.patch<SampleSet>(`/sample-sets/${id}`, data);
    return response.data;
  },

  /**
   * Delete a sample set
   */
  async deleteSampleSet(id: string): Promise<void> {
    await apiClient.delete(`/sample-sets/${id}`);
  },

  // ============ Samples ============

  /**
   * Get all samples in a sample set
   */
  async getSamples(setId: string): Promise<GetSamplesResponse> {
    const response = await apiClient.get<GetSamplesResponse>(`/sample-sets/${setId}/samples`);
    return response.data;
  },

  /**
   * Get a specific sample
   */
  async getSample(setId: string, sampleId: string): Promise<Sample> {
    const response = await apiClient.get<Sample>(`/sample-sets/${setId}/samples/${sampleId}`);
    return response.data;
  },

  /**
   * Add a sample to a sample set
   */
  async addSample(setId: string, data: CreateSampleRequest): Promise<Sample> {
    const response = await apiClient.post<Sample>(`/sample-sets/${setId}/samples`, data);
    return response.data;
  },

  /**
   * Update a sample
   */
  async updateSample(setId: string, sampleId: string, data: UpdateSampleRequest): Promise<Sample> {
    const response = await apiClient.patch<Sample>(
      `/sample-sets/${setId}/samples/${sampleId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a sample
   */
  async deleteSample(setId: string, sampleId: string): Promise<void> {
    await apiClient.delete(`/sample-sets/${setId}/samples/${sampleId}`);
  },
};

export default sampleSetsApi;
