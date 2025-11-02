/**
 * Types for dynamic script generation and execution
 */

/**
 * Script execution result
 */
export interface ScriptExecutionResult {
  success: boolean;
  data?: BacktestScriptOutput;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTime?: number;
}

/**
 * Standard output format for backtest scripts
 */
export interface BacktestScriptOutput {
  backtest: {
    ticker: string;
    date: string;
    strategy: string;
    config: Record<string, any>;
  };
  trades: ScriptTrade[];
  metrics: ScriptMetrics;
  summary: string;
}

/**
 * Trade information from script output
 */
export interface ScriptTrade {
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  pnl: number;
  pnl_percent: number;
  exit_reason: string;
  max_gain?: number;
  max_loss?: number;
  highest_price?: number;
}

/**
 * Metrics from script output
 */
export interface ScriptMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_percent: number;
  avg_pnl?: number;
  avg_winner?: number;
  avg_loser?: number;
  profit_factor?: number;
  max_favorable_excursion?: number;
  max_adverse_excursion?: number;
}

/**
 * Script generation parameters
 */
export interface ScriptGenerationParams {
  strategyType: 'orb' | 'momentum' | 'mean-reversion' | 'custom' | 'signal_based';
  ticker: string;

  // Date selection options (use one)
  date?: string;                          // Single day
  dateRange?: {                           // Consecutive date range
    from: string;
    to: string;
  };
  specificDates?: string[];               // Non-contiguous specific dates

  timeframe: string;
  config: ORBScriptConfig | Record<string, any>;
}

/**
 * Opening Range Breakout script configuration
 */
export interface ORBScriptConfig {
  openingRangeMinutes?: number;
  trailingStopPct?: number;
  marketFilterTicker?: string;
  requireEarnings?: boolean;
  exitTime?: string;                      // Custom exit time (e.g., "12:00" for noon)
  exitStrategy?: 'market-close' | 'fixed-time' | 'trailing-stop';
}

/**
 * Script execution request (API endpoint)
 */
export interface ScriptExecutionRequest {
  scriptTemplate: 'orb' | 'momentum' | 'mean-reversion';
  parameters: {
    ticker: string;
    date: string;
    timeframe?: string;
    [key: string]: any;
  };
}

/**
 * Script execution response (API endpoint)
 */
export interface ScriptExecutionResponse {
  success: boolean;
  executionId: string;
  results?: BacktestScriptOutput;
  executionTime?: number;
  scriptPath?: string;
  error?: string;
}

/**
 * Script execution log for monitoring
 */
export interface ScriptExecutionLog {
  id: string;
  template: string;
  parameters: Record<string, any>;
  success: boolean;
  executionTime: number;
  stdout: string;
  stderr: string;
  error?: string;
  createdAt: Date;
}

/**
 * Date query filter for special dates
 */
export interface DateQueryFilter {
  type: 'earnings' | 'all-trading-days' | 'specific';
  ticker?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  customDates?: string[];
}

/**
 * Routing decision from BacktestRouter
 */
export interface RoutingDecision {
  strategy: 'template-api' | 'custom-dates' | 'claude-generated' | 'fully-custom';
  reason: string;
  dates?: string[];
  useTemplate?: string;
  customScript?: string;
  assumptions?: string[];        // List of assumptions made during script generation
  confidence?: number;            // Confidence level (0-1) in the generated script
  userPrompt?: string;            // Original user prompt for Claude-generated scripts
}

/**
 * Token usage information from Claude API
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  max_tokens: number;
  utilization_percent: string;
  stop_reason: string;
}

/**
 * Claude script generation response
 */
export interface ClaudeScriptGenerationResponse {
  script: string;
  assumptions: string[];
  confidence: number;
  indicators?: string[];          // List of indicators used in the script
  explanation?: string;           // Human-readable explanation of the strategy
  dates: string[];                // Dates to test (determined by Claude based on prompt)
  dateReasoning?: string;         // Explanation of why these dates were chosen
  tokenUsage?: TokenUsage;        // Token usage stats from the API call
}
