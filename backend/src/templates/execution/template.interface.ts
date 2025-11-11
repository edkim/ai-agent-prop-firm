/**
 * Execution Template Interface
 *
 * Defines reusable exit strategies that can be applied to any scanner signals.
 * Templates are parameterized to allow customization without code regeneration.
 */

export interface ExecutionTemplate {
  name: string;
  description: string;
  category: 'scalping' | 'swing' | 'time_based' | 'volatility_adaptive' | 'price_action';

  parameters: {
    [key: string]: number | string | boolean;
  };

  metadata: {
    idealFor: string[];
    riskLevel: 'low' | 'medium' | 'high';
    avgHoldTime: string;
    winRateTarget: number;
  };

  /**
   * Generate the execution code for this template.
   * This is the core logic that will be injected into backtest scripts.
   *
   * The code should handle:
   * - Position entry based on scanner signals
   * - Exit logic (stops, targets, trailing stops)
   * - Risk management
   * - Result tracking
   */
  generateExecutionCode(): string;
}

/**
 * Scanner signal structure (passed from scanner to execution)
 */
export interface ScannerSignal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength?: number;
  direction?: 'LONG' | 'SHORT';
  metrics?: { [key: string]: any };
}

/**
 * Trade result structure (returned by execution)
 */
export interface TradeResult {
  date: string;
  ticker: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  quantity?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}
