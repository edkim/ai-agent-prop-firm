/**
 * Strategy and Trading Type Definitions
 */

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay?: string; // e.g., "10:30"
  dayOfWeek?: number; // 0-6
}

export interface IndicatorConfig {
  type: 'SMA' | 'EMA' | 'RSI' | 'ATR' | 'MACD' | 'BOLLINGER' | 'STOCHASTIC' | 'CUSTOM';
  id: string; // Unique identifier for this indicator instance
  params: Record<string, any>;
  calculation?: CustomIndicatorCalculation;
  description?: string;
}

export interface CustomIndicatorCalculation {
  method: string;
  params: Record<string, any>;
}

export interface StrategyCondition {
  type: 'expression' | 'indicator_compare' | 'price_compare';
  expression?: string; // For expression type
  indicator1?: string; // For indicator_compare
  indicator2?: string; // For indicator_compare
  operator?: 'GT' | 'LT' | 'GTE' | 'LTE' | 'EQ' | 'CROSS_ABOVE' | 'CROSS_BELOW';
  value?: number;
  description?: string;
}

export interface StrategyRules {
  conditions: StrategyCondition[];
  logic: 'AND' | 'OR'; // How to combine conditions
}

export interface PositionSizing {
  method: 'FIXED_AMOUNT' | 'PERCENT_PORTFOLIO' | 'RISK_BASED';
  value: number; // Dollar amount, percentage (0-100), or risk percentage
  maxPositions?: number;
}

export interface RiskManagement {
  stopLoss?: {
    type: 'PERCENT' | 'FIXED' | 'ATR';
    value: number;
  };
  takeProfit?: {
    type: 'PERCENT' | 'FIXED' | 'ATR';
    value: number;
  };
  trailingStop?: {
    type: 'PERCENT' | 'ATR';
    value: number;
  };
}

export interface Strategy {
  id?: number;
  name: string;
  description?: string;
  strategyType?: 'rule-based' | 'custom'; // 'rule-based' for expression-based, 'custom' for coded strategies
  customStrategyType?: string; // e.g., 'opening-range-breakout' for custom strategies
  ticker: string;
  timeframe: '1min' | '5min' | '15min' | '30min' | '1hour' | '1day' | '1week' | '1month';
  dependencies?: string[]; // Additional tickers needed for strategy (e.g., ['QQQ', 'SPY'])
  indicators: IndicatorConfig[];
  entryRules: StrategyRules;
  exitRules: StrategyRules;
  positionSizing: PositionSizing;
  riskManagement?: RiskManagement;
  allowShort?: boolean;
  requireEarnings?: boolean; // Strategy only trades on earnings days
  customConfig?: any; // Configuration for custom strategies
  createdAt?: string;
  updatedAt?: string;
}

export interface IndicatorValue {
  timestamp: number;
  indicatorId: string;
  value: number | { [key: string]: number }; // Single value or object for multi-value indicators
}

export interface EvaluationContext {
  currentBar: OHLCVBar;
  currentIndex: number;
  bars: OHLCVBar[];
  indicators: Map<string, number | { [key: string]: number }>;
  position?: Position;
  portfolio: {
    cash: number;
    equity: number;
  };
  // Multi-ticker support
  dependencyData?: Map<string, OHLCVBar[]>; // ticker -> bars
  dependencyBars?: Map<string, OHLCVBar>; // ticker -> current bar
  // Earnings support
  earningsToday?: boolean;
  earningsTime?: 'BMO' | 'AMC' | string; // Before market open, after market close, or specific time
}

export interface Position {
  ticker: string;
  entryPrice: number;
  quantity: number;
  side: 'LONG' | 'SHORT';
  entryTimestamp: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number; // Dynamic trailing stop price
  highestPrice?: number; // Highest price achieved (for trailing stop tracking)
}

export interface EarningsEvent {
  id?: number;
  ticker: string;
  fiscalPeriod?: string;
  fiscalYear?: string;
  reportDate: string; // YYYY-MM-DD
  reportTimestamp?: number;
  timeOfDay?: 'BMO' | 'AMC' | string;
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimate?: number;
  revenueActual?: number;
}
