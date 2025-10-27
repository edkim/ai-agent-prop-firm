/**
 * Charts API Client Service
 * Handles communication with charts backend endpoints
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';

// API base URL - defaults to localhost during development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/charts`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Type definitions

export interface ChartThumbnailRequest {
  ticker: string;
  startDate: string;
  endDate: string;
  signalDate?: string; // Optional: when to change line color from blue to green
}

export interface ChartThumbnailResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  chartData: string; // base64 PNG
  width: number;
  height: number;
}

export interface ChartCacheStats {
  totalCached: number;
  tickers: string[];
}

// Charts API functions

export const chartsApi = {
  /**
   * Generate a chart thumbnail for a ticker and date range
   */
  async generateThumbnail(request: ChartThumbnailRequest): Promise<ChartThumbnailResponse> {
    const response = await apiClient.post<ChartThumbnailResponse>('/thumbnail', request);
    return response.data;
  },

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<ChartCacheStats> {
    const response = await apiClient.get<ChartCacheStats>('/stats');
    return response.data;
  },

  /**
   * Clear all cached thumbnails
   */
  async clearCache(): Promise<{ success: boolean; cleared: number }> {
    const response = await apiClient.delete<{ success: boolean; cleared: number }>('/cache');
    return response.data;
  },
};

export default chartsApi;
