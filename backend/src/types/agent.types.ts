/**
 * Multi-Agent Laboratory Type Definitions
 */

// ========================================
// Agent Core Types
// ========================================

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type TradingStyle = 'scalper' | 'day_trader' | 'swing_trader' | 'position_trader';
export type MarketCondition = 'trending' | 'ranging' | 'volatile';
export type AgentStatus = 'learning' | 'paper_trading' | 'live_trading' | 'paused';

export interface Personality {
  risk_tolerance: RiskTolerance;
  trading_style: TradingStyle;
  pattern_focus: string[]; // e.g., ['vwap_bounce', 'gap_fill', 'orb']
  market_conditions: MarketCondition[]; // Conditions agent trades in
}

export interface RiskConfig {
  max_position_size: number;
  max_daily_loss: number;
  max_portfolio_exposure: number;
  stop_loss_method: 'fixed_percent' | 'atr' | 'pattern_specific';
  position_sizing_method: 'fixed' | 'risk_based' | 'kelly';
}

export interface AgentBacktestConfig {
  max_signals_per_iteration: number;     // Max signals to backtest per iteration
  max_signals_per_ticker_date: number;   // Max signals per (ticker, date) combination
  max_signals_per_date: number;          // Max signals per unique date
  min_pattern_strength: number;          // Minimum pattern quality score (0-100)
  backtest_timeout_ms: number;           // Timeout per backtest in milliseconds
}

export interface ExitStrategyConfig {
  template: string; // 'conservative' | 'aggressive' | 'intraday_time' | 'atr_adaptive' | 'price_action'
  stopLossPercent?: number | null; // Fixed stop loss % (null = use template default)
  takeProfitPercent?: number | null; // Fixed take profit % (null = use template default)
  trailingStopPercent?: number | null; // For price_action template
  exitTime?: string | null; // For intraday_time template (e.g., "15:55")
  atrMultiplier?: number | null; // For atr_adaptive template
}

export interface TradingAgent {
  id: string;
  name: string;

  // Learning Laboratory fields
  instructions: string; // Natural language defining agent's focus
  system_prompt?: string; // Generated Claude prompt
  risk_tolerance: RiskTolerance;
  trading_style: TradingStyle;
  pattern_focus: string[];
  market_conditions: MarketCondition[];
  risk_config?: RiskConfig;
  universe?: string; // Universe name (e.g., 'Tech Sector', 'Russell 2000')

  // Status
  status: AgentStatus;
  active: boolean;

  // Paper/Live trading configuration
  exit_strategy_config?: ExitStrategyConfig; // Which execution template to use
  account_id?: string;
  timeframe: string; // 'intraday', 'swing', 'position'
  strategies?: string[]; // JSON array of strategy pattern IDs
  risk_limits?: any; // Legacy risk limits object

  // Timestamps
  created_at: string;
  updated_at: string;
}

// Database row type (with JSON fields as strings)
export interface TradingAgentRow {
  id: string;
  name: string;
  instructions: string | null;
  system_prompt: string | null;
  risk_tolerance: string | null;
  trading_style: string | null;
  pattern_focus: string | null; // JSON string
  market_conditions: string | null; // JSON string
  risk_config: string | null; // JSON string
  universe: string | null;
  status: string | null;
  active: number; // SQLite boolean
  exit_strategy_config: string | null; // JSON string - ExitStrategyConfig
  account_id: string | null;
  timeframe: string;
  strategies: string | null; // JSON string
  risk_limits: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

// ========================================
// Agent Knowledge Types
// ========================================

export type KnowledgeType = 'INSIGHT' | 'PARAMETER_PREF' | 'PATTERN_RULE';

export interface AgentKnowledge {
  id: string;
  agent_id: string;
  knowledge_type: KnowledgeType;
  pattern_type?: string; // e.g., 'vwap_bounce'
  insight: string; // Human-readable insight
  supporting_data?: any; // Stats, examples, evidence
  confidence: number; // 0-1
  learned_from_iteration: number;
  times_validated: number;
  last_validated?: string;
  created_at: string;
}

// ========================================
// Learning Iteration Types
// ========================================

export type IterationStatus = 'completed' | 'approved' | 'rejected' | 'improved_upon';

export interface AgentIteration {
  id: string;
  agent_id: string;
  iteration_number: number;

  // Strategy under test
  scan_script: string;
  execution_script: string;
  version_notes?: string;

  // Results
  signals_found: number;
  backtest_results: any; // Full BacktestResult JSON
  win_rate: number;
  sharpe_ratio: number;
  total_return: number;
  winning_template?: string; // Which execution template performed best (e.g., 'price_action')

  // Claude's analysis
  expert_analysis: string;
  refinements_suggested: Refinement[];

  // Status
  iteration_status: IterationStatus;

  created_at: string;
}

export interface Refinement {
  type: 'scan_filter' | 'parameter_adjustment' | 'exit_rule' | 'missing_data' | 'execution_timing' | 'exit_strategy' | 'position_sizing';
  description: string;
  reasoning: string;
  projected_improvement?: string;
  specific_changes?: any; // Structured changes to apply
}

export interface ExpertAnalysis {
  summary: string;
  working_elements: AnalysisElement[];
  failure_points: FailurePoint[];
  missing_context: MissingContext[];
  parameter_recommendations: ParameterRecommendation[];
  execution_analysis?: ExecutionAnalysis; // Analysis of exit strategy performance
  projected_performance: {
    current: { winRate: number; sharpe: number };
    withRefinements: { winRate: number; sharpe: number };
    confidence: number;
  };
}

export interface ExecutionAnalysis {
  template_comparison: string; // Which templates worked best and why
  exit_timing_issues: string[]; // Problems with exit timing
  stop_loss_effectiveness: string; // Assessment of stop loss placement
  take_profit_effectiveness: string; // Assessment of take profit targets
  suggested_improvements: string[]; // Specific execution improvements
}

export interface AnalysisElement {
  element: string;
  evidence: string;
  confidence: number;
}

export interface FailurePoint {
  issue: string;
  evidence: string;
  impact: string;
  suggestedFix: string;
}

export interface MissingContext {
  dataType: string;
  reasoning: string;
  recommendation: string;
}

export interface ParameterRecommendation {
  parameter: string;
  currentValue: any;
  recommendedValue: any;
  expectedImprovement: string;
}

// ========================================
// Strategy Version Types
// ========================================

export interface AgentStrategy {
  id: string;
  agent_id: string;
  version: string; // "v1.0", "v1.1", "v2.0"

  // Strategy scripts
  scan_script: string;
  execution_script: string;

  // Performance metrics
  backtest_sharpe: number;
  backtest_win_rate: number;
  backtest_total_return: number;

  // Version control
  is_current_version: boolean;
  parent_version?: string;
  changes_from_parent?: string;

  created_at: string;
}

// ========================================
// Market Context Types
// ========================================

export type LevelType = 'SUPPORT' | 'RESISTANCE' | 'PIVOT';
export type CalculationMethod = 'PIVOT' | 'SWING' | 'FIBONACCI' | 'HORIZONTAL';

export interface SupportResistanceLevel {
  id: string;
  ticker: string;
  level_type: LevelType;
  price: number;
  strength: number; // 0-100
  first_touch_date?: string;
  last_touch_date?: string;
  touch_count: number;
  calculation_method: CalculationMethod;
  timeframe?: string;
  created_at: string;
  updated_at: string;
}

export interface PivotLevels {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface PivotPointsCache {
  ticker: string;
  date: string;
  timeframe: string;
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  created_at: string;
}

export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface NewsEvent {
  id: string;
  ticker: string;
  published_at: string;
  headline: string;
  summary?: string;
  source?: string;
  url?: string;
  sentiment?: Sentiment;
  impact_score?: number; // 0-100
  created_at: string;
}

export type MarketRegimeType = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

export interface MarketRegime {
  date: string;
  vix_close: number;
  spy_close: number;
  spy_change_percent: number;
  regime: MarketRegimeType;
  volatility_percentile: number; // 0-100
  created_at: string;
}

export interface MarketContext {
  ticker: string;
  date: string;
  time?: string;

  // Support/Resistance
  nearestSupport?: {
    price: number;
    strength: number;
    distance: number; // % from current price
  };
  nearestResistance?: {
    price: number;
    strength: number;
    distance: number;
  };
  pivotPoints?: PivotLevels;

  // News/Catalysts
  recentNews?: NewsEvent[];
  hasEarnings?: boolean;
  earningsDetails?: any;

  // Market Regime
  marketRegime?: MarketRegimeType;
  vix?: number;
  spyTrend?: 'bullish' | 'bearish' | 'neutral';

  // Volume/Price Context
  volumeRatio?: number;
  pricePosition?: 'near_high' | 'near_low' | 'middle';
  dayRange?: number;
}

// ========================================
// API Request/Response Types
// ========================================

export interface CreateAgentRequest {
  name?: string;
  instructions: string;
}

export interface CreateAgentResponse {
  success: boolean;
  agent: TradingAgent;
  detectedPersonality: Personality;
}

export interface StartIterationRequest {
  agent_id: string;
}

export interface IterationResult {
  iteration: AgentIteration;
  strategy: {
    scanScript: string;
    executionScript: string;
    rationale: string;
  };
  scanResults: any[];
  backtestResults: any;
  analysis: ExpertAnalysis;
  refinements: Refinement[];
}

export interface ApplyRefinementsRequest {
  agent_id: string;
  iteration_id: string;
  approved: boolean;
}

export interface ApplyRefinementsResponse {
  success: boolean;
  new_version: AgentStrategy;
  message: string;
}
