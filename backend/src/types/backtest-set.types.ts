/**
 * Backtest Set Types (Phase 3)
 *
 * Sample sets are curated collections of trading patterns found through scanner results.
 * Users can save interesting patterns to sample sets for later analysis with Claude.
 */

export interface BacktestSet {
  id: string; // UUID
  name: string;
  description?: string;
  pattern_type?: string; // e.g., 'capitulatory', 'breakout', 'reversal'
  total_samples: number;
  created_at: string;
  updated_at: string;
}

export interface Sample {
  id: string; // UUID
  ticker: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  backtest_set_id?: string;
  source_scan_id?: string; // Optional: which scan found this
  notes?: string;
  metadata?: SampleMetadata;
  created_at: string;
}

export interface SampleMetadata {
  max_gain_pct?: number;
  peak_date?: string;
  volume_spike_ratio?: number;
  pattern_duration_days?: number;
  [key: string]: any; // Allow additional custom fields
}

export interface ScanHistory {
  id: string; // UUID
  user_prompt: string;
  universe_id?: string;
  date_range_start?: string; // YYYY-MM-DD
  date_range_end?: string; // YYYY-MM-DD
  matches_found?: number;
  execution_time_ms?: number;
  created_at: string;
}

// Request/Response types for API

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
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  backtest_set_id?: string;
  source_scan_id?: string;
  notes?: string;
  metadata?: SampleMetadata;
}

export interface UpdateSampleRequest {
  notes?: string;
  metadata?: SampleMetadata;
}

export interface GetSamplesResponse {
  samples: Sample[];
  total: number;
}

export interface GetBacktestSetsResponse {
  backtest_sets: BacktestSet[];
  total: number;
}
