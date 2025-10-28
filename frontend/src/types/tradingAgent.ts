/**
 * Trading Agent Types
 * Frontend types for the autonomous trading agent system
 * These types mirror the backend types but with string dates for JSON parsing
 */

export interface TradingAgent {
  id: string;
  name: string;
  accountId: string;
  timeframe: 'intraday' | 'swing' | 'position';
  strategies: string[];
  riskLimits: RiskLimits;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RiskLimits {
  maxPositionSize: number;
  maxPortfolioExposure: number;
  maxDailyLoss: number;
  maxConcurrentPositions: number;
  minConfidenceScore: number;
  maxCorrelation: number;
}

export interface LiveSignal {
  id: string;
  agentId: string;
  ticker: string;
  patternType: string;
  detectionTime: string;
  signalData: SignalData;
  status: 'DETECTED' | 'ANALYZING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
}

export interface SignalData {
  currentPrice: number;
  volume: number;
  indicators: Record<string, number>;
  patternQuality: number;
  multiTimeframeConfirmed: boolean;
}

export interface TradeRecommendation {
  id: string;
  signalId: string;
  agentId: string;
  ticker: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  confidenceScore: number;
  reasoning: string;
  chartData?: string;
  riskChecks: RiskCheckResults;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface RiskCheckResults {
  positionSize: { passed: boolean; reason?: string };
  portfolioExposure: { passed: boolean; reason?: string };
  dailyLoss: { passed: boolean; reason?: string };
  concurrentPositions: { passed: boolean; reason?: string };
  confidenceScore: { passed: boolean; reason?: string };
  correlation: { passed: boolean; reason?: string };
}

export interface ExecutedTrade {
  id: string;
  agentId: string;
  recommendationId: string;
  ticker: string;
  side: 'LONG' | 'SHORT';
  entryTime: string;
  entryPrice: number;
  positionSize: number;
  entryOrderId: string;
  exitTime?: string;
  exitPrice?: number;
  exitOrderId?: string;
  pnl?: number;
  pnlPercent?: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  exitReason?: 'STOP_HIT' | 'TARGET_HIT' | 'TIME_EXIT' | 'MANUAL_EXIT' | 'TRAILING_STOP';
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  patternType: string;
  confidenceScore: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioState {
  agentId: string;
  accountId: string;
  cash: number;
  positions: Record<string, Position>;
  totalEquity: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  openTradeCount: number;
  totalExposure: number;
  lastUpdated: string;
}

export interface Position {
  ticker: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  marketValue: number;
  entryTime: string;
}

export interface RiskMetrics {
  id: string;
  agentId: string;
  metricDate: string;
  totalExposure: number;
  maxPositionSize: number;
  avgPositionSize: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  cumulativePnL: number;
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  createdAt: string;
}

export interface AgentActivity {
  id: string;
  agentId: string;
  activityType: 'SIGNAL_DETECTED' | 'TRADE_ANALYZED' | 'ORDER_PLACED' |
                 'POSITION_CLOSED' | 'RISK_LIMIT_HIT' | 'ERROR' | 'STATUS_CHANGE';
  ticker?: string;
  description: string;
  data?: Record<string, any>;
  timestamp: string;
}

export interface CreateAgentRequest {
  name: string;
  accountId: string;
  timeframe: 'intraday' | 'swing' | 'position';
  strategies: string[];
  riskLimits: RiskLimits;
}

export interface UpdateAgentRequest {
  name?: string;
  strategies?: string[];
  riskLimits?: Partial<RiskLimits>;
  active?: boolean;
}

export interface EquityCurveDataPoint {
  date: string;
  equity: number;
}
