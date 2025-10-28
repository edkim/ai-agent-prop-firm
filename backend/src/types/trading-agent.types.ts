/**
 * Trading Agent Types
 * Types for the autonomous trading agent system
 */

export interface TradingAgent {
  id: string;
  name: string;
  accountId: string; // TradeStation account ID
  timeframe: 'intraday' | 'swing' | 'position';
  strategies: string[]; // Pattern IDs to trade
  riskLimits: RiskLimits;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskLimits {
  maxPositionSize: number; // Max $ per trade
  maxPortfolioExposure: number; // Max % of capital in positions
  maxDailyLoss: number; // Stop trading if daily loss hits this
  maxConcurrentPositions: number; // Max number of open positions
  minConfidenceScore: number; // Min confidence to execute (0-100)
  maxCorrelation: number; // Max correlation with existing positions
}

export interface LiveSignal {
  id: string;
  agentId: string;
  ticker: string;
  patternType: string; // 'breakout-volume-surge', 'gap-and-go', etc.
  detectionTime: Date;
  signalData: SignalData;
  status: 'DETECTED' | 'ANALYZING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
}

export interface SignalData {
  currentPrice: number;
  volume: number;
  indicators: Record<string, number>; // RSI, VWAP, etc.
  patternQuality: number; // 0-100
  multiTimeframeConfirmed: boolean;
}

export interface TradeRecommendation {
  id: string;
  signalId: string;
  agentId: string;
  ticker: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  positionSize: number; // Number of shares
  stopLoss: number;
  takeProfit: number;
  confidenceScore: number; // 0-100
  reasoning: string; // Claude's explanation
  chartData?: string; // Base64 chart image
  riskChecks: RiskCheckResults;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
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

  // Entry
  entryTime: Date;
  entryPrice: number;
  positionSize: number;
  entryOrderId: string; // TradeStation order ID

  // Exit
  exitTime?: Date;
  exitPrice?: number;
  exitOrderId?: string;

  // P&L
  pnl?: number;
  pnlPercent?: number;

  // Risk management
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;

  // Exit reason
  exitReason?: 'STOP_HIT' | 'TARGET_HIT' | 'TIME_EXIT' | 'MANUAL_EXIT' | 'TRAILING_STOP';

  // Status
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';

  // Metadata
  patternType: string;
  confidenceScore: number;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioState {
  agentId: string;
  accountId: string;

  // Equity
  cash: number;
  positions: Record<string, Position>; // ticker -> position
  totalEquity: number;

  // Daily metrics
  dailyPnL: number;
  dailyPnLPercent: number;

  // Position metrics
  openTradeCount: number;
  totalExposure: number;

  lastUpdated: Date;
}

export interface Position {
  ticker: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  marketValue: number;
  entryTime: Date;
}

export interface RiskMetrics {
  id: string;
  agentId: string;
  metricDate: Date;

  // Exposure
  totalExposure: number;
  maxPositionSize: number;
  avgPositionSize: number;

  // Performance
  dailyPnL: number;
  dailyPnLPercent: number;
  cumulativePnL: number;

  // Risk
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;

  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;

  createdAt: Date;
}

export interface AgentActivity {
  id: string;
  agentId: string;
  activityType: 'SIGNAL_DETECTED' | 'TRADE_ANALYZED' | 'ORDER_PLACED' |
                 'POSITION_CLOSED' | 'RISK_LIMIT_HIT' | 'ERROR' | 'STATUS_CHANGE';
  ticker?: string;
  description: string;
  data?: Record<string, any>;
  timestamp: Date;
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
