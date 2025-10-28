/**
 * Trade Optimizer Service
 * Uses Claude AI to analyze signals and generate trade recommendations
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';
import { TradingAgentService } from './trading-agent.service';
import {
  LiveSignal,
  TradeRecommendation,
  TradingAgent,
  PortfolioState,
  Position,
  RiskCheckResults
} from '../types/trading-agent.types';

interface ClaudeAnalysis {
  confidenceScore: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  reasoning: string;
}

interface OHLCVBar {
  ticker: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
}

export class TradeOptimizerService {
  private db: DatabaseService;
  private tradingAgentService: TradingAgentService;
  private anthropic: Anthropic;

  constructor() {
    this.db = new DatabaseService();
    this.tradingAgentService = new TradingAgentService();

    // Initialize Anthropic client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Main analysis entry point
   */
  async analyzeSignal(signal: LiveSignal, agent: TradingAgent): Promise<TradeRecommendation> {
    try {
      console.log(`[TradeOptimizer] 🤖 Analyzing signal: ${signal.patternType} on ${signal.ticker}`);

      // Get portfolio state for context
      const portfolioState = await this.tradingAgentService.getPortfolioState(agent.id);
      if (!portfolioState) {
        throw new Error(`Portfolio state not found for agent ${agent.id}`);
      }

      // Generate chart for Claude Vision
      const chartBase64 = await this.generateChartForSignal(signal.ticker, agent.timeframe);

      // Call Claude AI
      const analysis = await this.callClaudeVision(signal, portfolioState, chartBase64);

      // Calculate correlation with existing positions
      const correlation = this.checkCorrelation(signal.ticker, portfolioState.positions);

      // Initialize risk checks (will be filled by ExecutionEngine)
      const riskChecks: RiskCheckResults = {
        positionSize: { passed: false },
        portfolioExposure: { passed: false },
        dailyLoss: { passed: false },
        concurrentPositions: { passed: false },
        confidenceScore: { passed: false },
        correlation: { passed: false }
      };

      // Create trade recommendation
      const recommendation: TradeRecommendation = {
        id: uuidv4(),
        signalId: signal.id,
        agentId: agent.id,
        ticker: signal.ticker,
        side: 'LONG', // Currently only supporting long positions
        entryPrice: analysis.entryPrice,
        positionSize: analysis.positionSize,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        confidenceScore: analysis.confidenceScore,
        reasoning: analysis.reasoning,
        chartData: chartBase64,
        riskChecks,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to database
      await this.saveRecommendation(recommendation);

      // Update signal status
      await this.updateSignalStatus(signal.id, 'ANALYZING');

      console.log(`[TradeOptimizer] ✅ Recommendation created: ${signal.ticker} @ $${analysis.entryPrice} (confidence: ${analysis.confidenceScore})`);

      return recommendation;

    } catch (error) {
      console.error('[TradeOptimizer] Error analyzing signal:', error);

      // Update signal to rejected
      await this.updateSignalStatus(signal.id, 'REJECTED');

      throw error;
    }
  }

  /**
   * Generate chart for Claude Vision analysis
   */
  private async generateChartForSignal(ticker: string, timeframe: string): Promise<string> {
    try {
      // For now, return placeholder
      // TODO: Implement actual chart generation using chart.js or similar

      // Get recent bars for analysis
      const bars = await this.getHistoricalBars(ticker, timeframe, 50);

      // Generate simple text-based chart representation
      const chartText = this.generateTextChart(bars);

      // In production, you would:
      // 1. Use chart.js with node-canvas to generate PNG
      // 2. Include candlesticks, volume, VWAP, support/resistance
      // 3. Return base64 encoded image

      return Buffer.from(chartText).toString('base64');

    } catch (error) {
      console.error('[TradeOptimizer] Chart generation error:', error);
      return '';
    }
  }

  /**
   * Generate simple text chart (placeholder for actual chart)
   */
  private generateTextChart(bars: OHLCVBar[]): string {
    if (bars.length === 0) return 'No data available';

    const lines = ['PRICE CHART', '===========', ''];

    lines.push(`Ticker: ${bars[0].ticker}`);
    lines.push(`Timeframe: ${bars[0].timeframe}`);
    lines.push(`Bars: ${bars.length}`);
    lines.push('');

    // Last 10 bars
    const recentBars = bars.slice(-10);
    lines.push('Recent Bars:');
    lines.push('Timestamp          | Open    | High    | Low     | Close   | Volume');
    lines.push('-------------------|---------|---------|---------|---------|----------');

    for (const bar of recentBars) {
      const date = new Date(bar.timestamp * 1000).toISOString();
      lines.push(
        `${date} | ${bar.open.toFixed(2).padStart(7)} | ${bar.high.toFixed(2).padStart(7)} | ` +
        `${bar.low.toFixed(2).padStart(7)} | ${bar.close.toFixed(2).padStart(7)} | ${bar.volume.toString().padStart(8)}`
      );
    }

    // Price statistics
    const closes = bars.map(b => b.close);
    const currentPrice = closes[closes.length - 1];
    const high = Math.max(...bars.map(b => b.high));
    const low = Math.min(...bars.map(b => b.low));

    lines.push('');
    lines.push('Statistics:');
    lines.push(`Current Price: $${currentPrice.toFixed(2)}`);
    lines.push(`High: $${high.toFixed(2)}`);
    lines.push(`Low: $${low.toFixed(2)}`);
    lines.push(`Range: ${((high - low) / low * 100).toFixed(2)}%`);

    return lines.join('\n');
  }

  /**
   * Call Claude AI with vision for trade analysis
   */
  private async callClaudeVision(
    signal: LiveSignal,
    portfolioState: PortfolioState,
    chartBase64: string
  ): Promise<ClaudeAnalysis> {
    try {
      const systemPrompt = `You are a professional day trader analyzing potential trade setups.
Your job is to evaluate the quality of the setup and provide specific trade parameters.
Be conservative - only recommend trades with clear edge and favorable risk/reward.
Always consider the current portfolio context and risk management.`;

      const userPrompt = `
PATTERN DETECTED: ${signal.patternType}
TICKER: ${signal.ticker}
CURRENT PRICE: $${signal.signalData.currentPrice}
VOLUME: ${signal.signalData.volume}

TECHNICAL INDICATORS:
${Object.entries(signal.signalData.indicators).map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`).join('\n')}

PATTERN QUALITY: ${signal.signalData.patternQuality}/100
MULTI-TIMEFRAME CONFIRMED: ${signal.signalData.multiTimeframeConfirmed ? 'YES' : 'NO'}

PORTFOLIO CONTEXT:
- Current Cash: $${portfolioState.cash.toFixed(2)}
- Total Equity: $${portfolioState.totalEquity.toFixed(2)}
- Open Positions: ${portfolioState.openTradeCount}
- Daily P&L: $${portfolioState.dailyPnL.toFixed(2)} (${portfolioState.dailyPnLPercent.toFixed(2)}%)
- Total Exposure: $${portfolioState.totalExposure.toFixed(2)}

EXISTING POSITIONS:
${Object.keys(portfolioState.positions).length > 0
  ? Object.values(portfolioState.positions).map(pos =>
      `- ${pos.ticker}: ${pos.shares} shares @ $${pos.avgPrice.toFixed(2)} (P&L: $${pos.pnl.toFixed(2)})`
    ).join('\n')
  : '- None'
}

CHART DATA:
${Buffer.from(chartBase64, 'base64').toString('utf-8')}

Please analyze this setup and provide your recommendation in JSON format:
{
  "confidenceScore": <0-100>,
  "entryPrice": <price>,
  "stopLoss": <price>,
  "takeProfit": <price>,
  "positionSize": <number of shares>,
  "reasoning": "<2-3 sentence explanation>"
}

Guidelines:
- Confidence score should reflect setup quality (70+ = strong, 50-70 = moderate, <50 = weak)
- Entry price should be current price or slightly better
- Stop loss should be below key support (1-3% risk typical)
- Take profit should be at resistance or 2:1 risk/reward minimum
- Position size based on 1-2% account risk
- Consider if adding to existing positions makes sense
- If setup is poor quality, give low confidence score (<50)
`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '2048'),
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.3'),
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });

      // Parse Claude's response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[TradeOptimizer] Could not parse Claude response:', content.text);
        throw new Error('Could not extract JSON from Claude response');
      }

      const analysis: ClaudeAnalysis = JSON.parse(jsonMatch[0]);

      // Validate response
      if (!this.validateAnalysis(analysis)) {
        throw new Error('Invalid analysis from Claude');
      }

      return analysis;

    } catch (error) {
      console.error('[TradeOptimizer] Claude API error:', error);

      // Fallback to rule-based analysis
      console.log('[TradeOptimizer] Using fallback rule-based analysis');
      return this.fallbackAnalysis(signal, portfolioState);
    }
  }

  /**
   * Validate Claude's analysis
   */
  private validateAnalysis(analysis: ClaudeAnalysis): boolean {
    return (
      typeof analysis.confidenceScore === 'number' &&
      analysis.confidenceScore >= 0 &&
      analysis.confidenceScore <= 100 &&
      typeof analysis.entryPrice === 'number' &&
      analysis.entryPrice > 0 &&
      typeof analysis.stopLoss === 'number' &&
      analysis.stopLoss > 0 &&
      typeof analysis.takeProfit === 'number' &&
      analysis.takeProfit > 0 &&
      typeof analysis.positionSize === 'number' &&
      analysis.positionSize > 0 &&
      typeof analysis.reasoning === 'string' &&
      analysis.reasoning.length > 10
    );
  }

  /**
   * Fallback rule-based analysis when Claude fails
   */
  private fallbackAnalysis(signal: LiveSignal, portfolioState: PortfolioState): ClaudeAnalysis {
    const currentPrice = signal.signalData.currentPrice;
    const patternQuality = signal.signalData.patternQuality;
    const atr = signal.signalData.indicators.atr || currentPrice * 0.02; // Default 2% if no ATR

    // Calculate stop loss (1.5 ATR below entry)
    const stopLoss = currentPrice - (atr * 1.5);

    // Calculate take profit (2:1 risk/reward)
    const riskPerShare = currentPrice - stopLoss;
    const takeProfit = currentPrice + (riskPerShare * 2);

    // Position sizing: 1% account risk
    const accountRisk = portfolioState.totalEquity * 0.01;
    const positionSize = Math.floor(accountRisk / riskPerShare);

    // Confidence based on pattern quality and multi-timeframe confirmation
    let confidenceScore = patternQuality;
    if (signal.signalData.multiTimeframeConfirmed) {
      confidenceScore = Math.min(100, confidenceScore + 10);
    }

    return {
      confidenceScore,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      positionSize,
      reasoning: `Rule-based analysis: ${signal.patternType} pattern with ${patternQuality} quality. ` +
                 `Risk/reward ratio 2:1 with stop at $${stopLoss.toFixed(2)} and target at $${takeProfit.toFixed(2)}.`
    };
  }

  /**
   * Calculate position size using Kelly Criterion (modified)
   */
  calculatePositionSize(
    confidenceScore: number,
    accountEquity: number,
    maxPositionSize: number
  ): number {
    // Base risk: 1% of equity per trade
    const baseRisk = accountEquity * 0.01;

    // Scale by confidence (50-100 maps to 0.5x-2x)
    const confidenceMultiplier = Math.max(0.5, (confidenceScore - 50) / 25);
    const adjustedRisk = baseRisk * confidenceMultiplier;

    // Cap at maxPositionSize
    return Math.min(adjustedRisk, maxPositionSize);
  }

  /**
   * Calculate stop loss based on ATR
   */
  calculateStopLoss(entryPrice: number, atr: number): number {
    // Standard: 1.5 ATR below entry
    return entryPrice - (atr * 1.5);
  }

  /**
   * Calculate take profit
   */
  calculateTakeProfit(entryPrice: number, stopLoss: number, riskReward: number = 2): number {
    const riskPerShare = entryPrice - stopLoss;
    return entryPrice + (riskPerShare * riskReward);
  }

  /**
   * Check correlation with existing positions
   */
  checkCorrelation(ticker: string, existingPositions: Record<string, Position>): number {
    // Simple correlation: same sector/industry
    // In production, use actual correlation calculation

    if (Object.keys(existingPositions).length === 0) {
      return 0; // No positions, no correlation
    }

    // Check if ticker already in positions
    if (existingPositions[ticker]) {
      return 1.0; // Perfect correlation with itself
    }

    // For now, assume low correlation
    // TODO: Implement actual correlation calculation using historical price data
    return 0.3;
  }

  /**
   * Save recommendation to database
   */
  private async saveRecommendation(recommendation: TradeRecommendation): Promise<void> {
    const query = `
      INSERT INTO trade_recommendations (
        id, signal_id, agent_id, ticker, side, entry_price, position_size,
        stop_loss, take_profit, confidence_score, reasoning, chart_data,
        risk_checks, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      recommendation.id,
      recommendation.signalId,
      recommendation.agentId,
      recommendation.ticker,
      recommendation.side,
      recommendation.entryPrice,
      recommendation.positionSize,
      recommendation.stopLoss,
      recommendation.takeProfit,
      recommendation.confidenceScore,
      recommendation.reasoning,
      recommendation.chartData || '',
      JSON.stringify(recommendation.riskChecks),
      recommendation.status,
      recommendation.createdAt.toISOString(),
      recommendation.updatedAt.toISOString()
    ]);
  }

  /**
   * Update signal status
   */
  private async updateSignalStatus(signalId: string, status: string): Promise<void> {
    const query = `
      UPDATE live_signals
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `;

    await this.db.run(query, [status, signalId]);
  }

  /**
   * Get historical bars from database
   */
  private async getHistoricalBars(ticker: string, timeframe: string, limit: number): Promise<OHLCVBar[]> {
    const query = `
      SELECT * FROM realtime_bars
      WHERE ticker = ? AND timeframe = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = await this.db.all(query, [ticker, timeframe, limit]);
    return rows.reverse().map(row => ({
      ticker: row.ticker,
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      timeframe: row.timeframe
    }));
  }

  /**
   * Get recommendation by ID
   */
  async getRecommendation(recommendationId: string): Promise<TradeRecommendation | null> {
    const query = `SELECT * FROM trade_recommendations WHERE id = ?`;
    const row = await this.db.get(query, [recommendationId]);

    if (!row) return null;

    return {
      id: row.id,
      signalId: row.signal_id,
      agentId: row.agent_id,
      ticker: row.ticker,
      side: row.side,
      entryPrice: row.entry_price,
      positionSize: row.position_size,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      confidenceScore: row.confidence_score,
      reasoning: row.reasoning,
      chartData: row.chart_data,
      riskChecks: JSON.parse(row.risk_checks),
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Get pending recommendations for agent
   */
  async getPendingRecommendations(agentId: string): Promise<TradeRecommendation[]> {
    const query = `
      SELECT * FROM trade_recommendations
      WHERE agent_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC
    `;

    const rows = await this.db.all(query, [agentId]);

    return rows.map(row => ({
      id: row.id,
      signalId: row.signal_id,
      agentId: row.agent_id,
      ticker: row.ticker,
      side: row.side,
      entryPrice: row.entry_price,
      positionSize: row.position_size,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      confidenceScore: row.confidence_score,
      reasoning: row.reasoning,
      chartData: row.chart_data,
      riskChecks: JSON.parse(row.risk_checks),
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }
}
