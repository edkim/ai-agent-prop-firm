/**
 * Scanner API Client Service
 * Handles communication with scanner backend endpoints
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/scanner`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

// Types
export type ScanResult = {
  success: boolean;
  matches: ScanMatch[];
  criteria: ScanCriteria;
  total_matches: number;
  scan_time_ms: number;
}

export type ScanMatch = {
  ticker: string;
  date: string;
  time?: string; // Optional time field for intraday signals (e.g., "13:15")
  metrics: DailyMetrics;
  score?: number;
}

export type DailyMetrics = {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_percent?: number;
  volume_ratio?: number;
  rsi_14?: number;
  sma_20?: number;
  sma_50?: number;
  consecutive_up_days?: number;
  consecutive_down_days?: number;
}

export type ScanCriteria = {
  universe?: string;
  tickers?: string[];
  start_date?: string;
  end_date?: string;
  min_change_percent?: number;
  max_change_percent?: number;
  min_volume_ratio?: number;
  max_volume_ratio?: number;
  min_consecutive_up_days?: number;
  min_consecutive_down_days?: number;
  price_above_sma20?: boolean;
  price_below_sma20?: boolean;
  min_rsi?: number;
  max_rsi?: number;
  limit?: number;
}

export type Universe = {
  id: number;
  name: string;
  description?: string;
  total_stocks: number;
  created_at: string;
  updated_at: string;
}

// Scanner API functions
export const scannerApi = {
  // Natural language scan
  async naturalLanguageScan(query: string, universe?: string): Promise<ScanResult> {
    const response = await apiClient.post('/scan/natural', {
      query,
      universe: universe || 'russell2000',
    });
    return response.data;
  },

  // Structured criteria scan
  async scan(criteria: ScanCriteria): Promise<ScanResult> {
    const response = await apiClient.post('/scan', criteria);
    return response.data;
  },

  // Get all universes
  async getUniverses(): Promise<{ success: boolean; universes: Universe[] }> {
    const response = await apiClient.get('/universes');
    return response.data;
  },

  // Backfill universe data
  async backfillUniverse(
    universeName: string,
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/universes/${universeName}/backfill`, {
      start_date: startDate,
      end_date: endDate,
      batch_size: 10,
    });
    return response.data;
  },
};
