/**
 * Learning Agent Management Service
 * Handles creation, configuration, and CRUD operations for learning laboratory agents
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/db';
import {
  TradingAgent,
  TradingAgentRow,
  Personality,
  RiskTolerance,
  TradingStyle,
  MarketCondition,
  RiskConfig,
  CreateAgentRequest,
  CreateAgentResponse,
} from '../types/agent.types';
import { ClaudeService } from './claude.service';

export class LearningAgentManagementService {
  private claudeService: ClaudeService;

  constructor() {
    this.claudeService = new ClaudeService();
  }

  /**
   * Create a new trading agent from natural language instructions
   */
  async createAgent(request: CreateAgentRequest): Promise<CreateAgentResponse> {
    const db = getDatabase();

    // Step 1: Extract personality traits from instructions
    const personality = await this.extractPersonality(request.instructions);

    // Step 2: Generate system prompt for this agent
    const agent: TradingAgent = {
      id: uuidv4(),
      name: request.name || this.generateAgentName(personality),
      instructions: request.instructions,
      risk_tolerance: personality.risk_tolerance,
      trading_style: personality.trading_style,
      pattern_focus: personality.pattern_focus,
      market_conditions: personality.market_conditions,
      status: 'learning',
      active: true,
      discovery_mode: true, // Enable fast signal discovery by default
      timeframe: this.getTimeframeFromStyle(personality.trading_style),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const system_prompt = await this.generateSystemPrompt(agent);
    agent.system_prompt = system_prompt;

    // Step 3: Set default risk config based on personality
    const risk_config = this.generateDefaultRiskConfig(personality);
    agent.risk_config = risk_config;

    // Step 4: Insert into database
    const insertStmt = db.prepare(`
      INSERT INTO learning_agents (
        id, name, instructions, system_prompt, risk_tolerance, trading_style,
        pattern_focus, market_conditions, risk_config, status, active,
        discovery_mode, timeframe, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      agent.id,
      agent.name,
      agent.instructions,
      agent.system_prompt,
      agent.risk_tolerance,
      agent.trading_style,
      JSON.stringify(agent.pattern_focus),
      JSON.stringify(agent.market_conditions),
      JSON.stringify(agent.risk_config),
      agent.status,
      agent.active ? 1 : 0,
      agent.discovery_mode ? 1 : 0,
      agent.timeframe,
      agent.created_at,
      agent.updated_at
    );

    console.log(`✅ Created agent: ${agent.name} (${agent.id})`);

    return {
      success: true,
      agent,
      detectedPersonality: personality,
    };
  }

  /**
   * Extract personality traits from natural language instructions using Claude
   */
  async extractPersonality(instructions: string): Promise<Personality> {
    const prompt = `You are analyzing trading agent instructions to extract personality traits.

Instructions:
"${instructions}"

Extract the following traits and return ONLY a JSON object:

{
  "risk_tolerance": "conservative" | "moderate" | "aggressive",
  "trading_style": "scalper" | "day_trader" | "swing_trader" | "position_trader",
  "pattern_focus": ["array", "of", "pattern", "types"],
  "market_conditions": ["trending", "ranging", "volatile"]
}

Guidelines:
- risk_tolerance: Look for words like "conservative", "moderate", "aggressive", "tight stops", "wide stops"
- trading_style: Infer from holding period, timeframes mentioned (scalper = seconds/minutes, day_trader = hours, swing = days, position = weeks/months)
- pattern_focus: Extract specific setups mentioned (vwap_bounce, gap_fill, breakout, reversal, etc.)
- market_conditions: Infer from preferences (avoid volatility = ["trending", "ranging"], thrive in volatility = ["volatile"])

Return ONLY valid JSON, no explanation.`;

    try {
      const response = await this.claudeService.generateCompletion(prompt, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
      });

      const parsed = JSON.parse(response);
      return parsed as Personality;
    } catch (error) {
      console.error('Error extracting personality:', error);
      // Return default personality
      return {
        risk_tolerance: 'moderate',
        trading_style: 'day_trader',
        pattern_focus: ['general'],
        market_conditions: ['trending', 'ranging'],
      };
    }
  }

  /**
   * Generate Claude system prompt for this specific agent
   */
  async generateSystemPrompt(agent: TradingAgent): Promise<string> {
    const riskProfile = this.getRiskProfile(agent.risk_tolerance);
    const styleProfile = this.getStyleProfile(agent.trading_style);

    return `You are an expert day trader specializing in technical pattern-based trading.

YOUR PERSONALITY AND STYLE:
${agent.instructions}

CORE TRAITS:
- Risk Tolerance: ${agent.risk_tolerance} ${riskProfile}
- Trading Style: ${agent.trading_style} ${styleProfile}
- Pattern Focus: ${agent.pattern_focus.join(', ')}
- Market Conditions: ${agent.market_conditions.join(', ')}

YOUR TRADING PHILOSOPHY:
- Every pattern has key levels where stops should be placed
- Support/resistance levels are critical for targets and stops
- Volume confirms price action - require volume confirmation when relevant
- Time of day matters - avoid first 5 minutes, last 10 minutes unless specifically testing those periods
- News/catalysts can invalidate technical patterns
- Risk management is paramount - always define stop loss first
- Exit rules are as important as entry rules

WHEN GENERATING STRATEGIES:
1. Identify the pattern's key reference points (VWAP, prior bar, LOD, HOD, support/resistance)
2. Place stops at logical invalidation points, not arbitrary percentages
3. Use multi-target approach when appropriate: First target at obvious level, second at next key level
4. Consider partial exits - lock in profits while letting runners work
5. Account for spread and slippage
6. Match strategy complexity to your trading style (scalpers need simple, quick decisions)

YOUR CURRENT KNOWLEDGE BASE (grows over time):
{AGENT_KNOWLEDGE}

AVAILABLE DATA FOR ANALYSIS:
- OHLCV data (multiple timeframes)
- Technical indicators (SMA, EMA, RSI, ATR, VWAP)
- Volume metrics and ratios
- Support/resistance levels
- Market regime (VIX, SPY trend)
- News events and catalysts
- Earnings dates

PATTERN TYPES YOU UNDERSTAND:
- VWAP crosses and bounces
- Opening Range Breakouts (ORB)
- Gap and Go / Gap Fill
- Failed breakouts and reversals
- Capitulation moves and bounces
- Support/resistance bounces
- Volume surge breakouts
- Mean reversion setups

When analyzing scan results or backtests, always think like a ${agent.trading_style} with ${agent.risk_tolerance} risk tolerance.
Provide actionable insights based on YOUR experience and personality.`;
  }

  /**
   * Get agent by ID
   */
  async getAgent(id: string): Promise<TradingAgent | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM learning_agents WHERE id = ?').get(id) as TradingAgentRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToAgent(row);
  }

  /**
   * List all agents
   */
  async listAgents(activeOnly: boolean = true): Promise<TradingAgent[]> {
    const db = getDatabase();
    const query = activeOnly
      ? 'SELECT * FROM learning_agents WHERE active = 1 ORDER BY created_at DESC'
      : 'SELECT * FROM learning_agents ORDER BY created_at DESC';

    const rows = db.prepare(query).all() as TradingAgentRow[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Update agent
   */
  async updateAgent(id: string, updates: Partial<TradingAgent>): Promise<TradingAgent> {
    const db = getDatabase();
    const agent = await this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.instructions !== undefined) {
      updateFields.push('instructions = ?');
      values.push(updates.instructions);
    }
    if (updates.risk_tolerance !== undefined) {
      updateFields.push('risk_tolerance = ?');
      values.push(updates.risk_tolerance);
    }
    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.active !== undefined) {
      updateFields.push('active = ?');
      values.push(updates.active ? 1 : 0);
    }

    updateFields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const updateQuery = `UPDATE learning_agents SET ${updateFields.join(', ')} WHERE id = ?`;
    db.prepare(updateQuery).run(...values);

    console.log(`✅ Updated agent: ${id}`);

    return (await this.getAgent(id))!;
  }

  /**
   * Delete agent
   */
  async deleteAgent(id: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM learning_agents WHERE id = ?').run(id);
    console.log(`✅ Deleted agent: ${id}`);
  }

  // ========================================
  // Helper Methods
  // ========================================

  private rowToAgent(row: TradingAgentRow): TradingAgent {
    return {
      id: row.id,
      name: row.name,
      instructions: row.instructions || '',
      system_prompt: row.system_prompt || undefined,
      risk_tolerance: (row.risk_tolerance as RiskTolerance) || 'moderate',
      trading_style: (row.trading_style as TradingStyle) || 'day_trader',
      pattern_focus: row.pattern_focus ? JSON.parse(row.pattern_focus) : [],
      market_conditions: row.market_conditions ? JSON.parse(row.market_conditions) : [],
      risk_config: row.risk_config ? JSON.parse(row.risk_config) : undefined,
      universe: row.universe || undefined,
      status: (row.status as any) || 'learning',
      active: row.active === 1,
      discovery_mode: row.discovery_mode === 1,
      account_id: row.account_id || undefined,
      timeframe: row.timeframe,
      strategies: row.strategies ? JSON.parse(row.strategies) : undefined,
      risk_limits: row.risk_limits ? JSON.parse(row.risk_limits) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private generateAgentName(personality: Personality): string {
    const styleMap = {
      scalper: 'Scalper',
      day_trader: 'Day Trader',
      swing_trader: 'Swing Trader',
      position_trader: 'Position Trader',
    };

    const focusName = personality.pattern_focus[0]
      ? personality.pattern_focus[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      : 'Pattern';

    return `${focusName} ${styleMap[personality.trading_style]}`;
  }

  private getTimeframeFromStyle(style: TradingStyle): string {
    const map = {
      scalper: 'intraday',
      day_trader: 'intraday',
      swing_trader: 'swing',
      position_trader: 'position',
    };
    return map[style];
  }

  private getRiskProfile(tolerance: RiskTolerance): string {
    const profiles = {
      conservative: '(tight stops 0.15-0.3%, high win rate focus, quick profit taking)',
      moderate: '(balanced stops 0.3-0.5%, mixed win rate and profit factor)',
      aggressive: '(wider stops 0.5-1.0%, profit factor focus, let winners run)',
    };
    return profiles[tolerance];
  }

  private getStyleProfile(style: TradingStyle): string {
    const profiles = {
      scalper: '(seconds to minutes, quick in and out, high frequency)',
      day_trader: '(minutes to hours, close by EOD, moderate frequency)',
      swing_trader: '(days to weeks, hold through overnight, lower frequency)',
      position_trader: '(weeks to months, trend following, very selective)',
    };
    return profiles[style];
  }

  private generateDefaultRiskConfig(personality: Personality): RiskConfig {
    const configs: Record<RiskTolerance, RiskConfig> = {
      conservative: {
        max_position_size: 100,
        max_daily_loss: 500,
        max_portfolio_exposure: 0.3,
        stop_loss_method: 'pattern_specific',
        position_sizing_method: 'risk_based',
      },
      moderate: {
        max_position_size: 200,
        max_daily_loss: 1000,
        max_portfolio_exposure: 0.5,
        stop_loss_method: 'atr',
        position_sizing_method: 'risk_based',
      },
      aggressive: {
        max_position_size: 300,
        max_daily_loss: 2000,
        max_portfolio_exposure: 0.7,
        stop_loss_method: 'atr',
        position_sizing_method: 'kelly',
      },
    };

    return configs[personality.risk_tolerance];
  }
}
