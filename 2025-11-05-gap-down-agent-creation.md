# Gap Down Trading Agent - Creation Plan
**Date:** 2025-11-05

## Overview
Created a specialized AI trading agent focused on day trading gap down patterns. The agent identifies stocks that open significantly lower than their previous close and trades either reversal opportunities or continuation patterns.

## High-Level Plan

### 1. ✅ Explored Codebase Architecture
- Analyzed the agent management system
- Understood the dual-mode agent structure:
  - **Learning Agents**: For strategy development and backtesting
  - **Trading Agents**: For live/paper execution
- Identified key components:
  - `AgentManagementService` - Agent CRUD operations
  - `AgentLearningService` - Learning iteration orchestration
  - `ClaudeService` - AI-powered strategy generation
  - API routes at `/api/learning-agents` and `/api/agents`

### 2. ✅ Designed Gap Down Trading Strategy
Created comprehensive strategy instructions covering:

**Pattern Focus:**
- **Gap Fill Reversals**: Oversold gaps with recovery potential
- **Support Bounces**: Gaps to key technical levels
- **Dead Cat Bounces (SHORT)**: Failed bounces after bad news

**Entry Criteria:**
- LONG reversals: 2-10% gap down, support hold, volume confirmation, no major catalyst
- SHORT continuations: Bad news gap, failed bounce at resistance, volume decline

**Exit Rules:**
- LONG positions: 50% profit at half gap fill, 80-100% at full fill, stops below support
- SHORT positions: Target new LOD or -2%, stops above bounce high
- Time exit: 3:55 PM ET for all positions

**Risk Management:**
- Max 0.5% risk per trade
- Maximum 2 concurrent positions
- $1000 daily loss limit
- Pattern-specific stop-loss after 2 consecutive losses

### 3. ✅ Created Gap Down Agent
**Agent ID:** `5dc3c49f-188e-48f5-9244-485ec7f67175`

**Configuration:**
- **Name**: Gap Down Specialist
- **Status**: learning
- **Trading Style**: day_trader
- **Risk Tolerance**: moderate
- **Timeframe**: intraday
- **Max Position Size**: $200
- **Max Daily Loss**: $1000
- **Max Portfolio Exposure**: 50%

**Implementation Approach:**
- Created TypeScript script using API endpoint
- Used `/api/learning-agents/create` endpoint
- AI automatically extracted personality traits from natural language instructions
- System generated appropriate risk configuration

## Next Steps

### Immediate Actions
1. **Start Learning Iteration**
   ```bash
   curl -X POST http://localhost:3000/api/learning-agents/5dc3c49f-188e-48f5-9244-485ec7f67175/iterations/start
   ```
   - Agent will generate scan script to identify gap down patterns
   - Execute backtest across historical data
   - Analyze performance and suggest refinements

2. **Review Iteration Results**
   - Check win rate and Sharpe ratio
   - Analyze which patterns worked best
   - Review Claude's expert analysis and refinement suggestions

3. **Iterative Refinement**
   - Apply approved refinements from Claude
   - Re-run backtests with improved strategy
   - Continue until performance metrics are consistent

4. **Graduate to Paper Trading**
   - Once backtest performance is satisfactory
   - Monitor live market performance with paper trading
   - Ensure strategy works in real-time conditions

5. **Live Trading (Optional)**
   - Only after consistent paper trading success
   - Start with small position sizes
   - Gradually scale up as confidence builds

## Technical Details

### Files Created
1. `/backend/create-gap-down-agent-api.ts` - TypeScript script for agent creation
2. `/backend/create-gap-down-agent.sh` - Shell script (unused, API approach preferred)
3. This plan document

### Agent Personality Extraction
Claude AI automatically detected from instructions:
- Risk tolerance: moderate
- Trading style: day_trader
- Pattern focus: general (could be refined to "gap_down" specifically)
- Market conditions: trending, ranging

### Risk Configuration Auto-Generated
Based on moderate risk tolerance:
- Stop loss method: ATR-based
- Position sizing: risk-based
- Conservative portfolio exposure limits

## Strategy Characteristics

### What Makes This Strategy Unique
1. **Dual-Direction Trading**: Can trade both long reversals and short continuations
2. **Time-Focused**: Intraday only, avoids overnight risk
3. **Context-Aware**: Distinguishes between technical gaps and news-driven gaps
4. **Quality Over Quantity**: Targets 2-5 high-quality setups per day
5. **Pattern-Specific Stops**: Adjusts stops based on pattern type and market structure

### Expected Edge
- Exploits fear and overreaction in gap down scenarios
- Identifies when selling is overdone (long reversals)
- Identifies when initial bounces are traps (short continuations)
- Uses volume and technical levels for confirmation

### Ideal Market Conditions
- **Long Reversals**: Ranging to slightly bullish overall market
- **Short Continuations**: Bearish or volatile market conditions
- **Avoid**: Extremely volatile days (VIX > 30) unless very selective

## Monitoring Plan

### Key Metrics to Track
- Win rate (target: > 55%)
- Average win vs average loss (target: > 1.5:1)
- Sharpe ratio (target: > 1.0)
- Maximum drawdown
- Pattern-specific performance (which gap patterns work best)

### Review Schedule
- Daily: Review trades and exits
- Weekly: Analyze pattern performance
- Monthly: Overall strategy assessment and major adjustments

## Risk Controls Built-In

1. **Position Level**: Max 0.5% risk per trade, stops below support/above resistance
2. **Daily Level**: $1000 max daily loss, pattern-specific stops after 2 losses
3. **Portfolio Level**: Max 2 concurrent positions, 50% max portfolio exposure
4. **Time-Based**: Mandatory exits at 3:55 PM, avoid first 15 minutes

## Conclusion

Successfully created a specialized gap down trading agent with comprehensive strategy instructions. The agent is now ready to begin learning iterations where it will:
1. Generate pattern detection code
2. Backtest across historical gap down scenarios
3. Learn from results and refine approach
4. Gradually improve strategy through AI-guided iteration

The combination of human expertise (strategy framework) and AI capabilities (pattern detection, optimization) creates a powerful system for developing and executing gap down trading strategies.

---

**Agent ID for Reference:** `5dc3c49f-188e-48f5-9244-485ec7f67175`
**Creation Date:** 2025-11-05
**Status:** Ready for first learning iteration
