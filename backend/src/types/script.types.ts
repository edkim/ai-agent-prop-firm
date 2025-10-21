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
  profit_factor?: number;
  max_favorable_excursion?: number;
  max_adverse_excursion?: number;
}

/**
 * Script generation parameters
 */
export interface ScriptGenerationParams {
  strategyType: 'orb' | 'momentum' | 'mean-reversion' | 'custom';
  ticker: string;
  date: string;
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
