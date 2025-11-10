/**
 * Script to create a Gap Down Day Trading Agent
 *
 * This agent specializes in trading stocks that gap down at market open,
 * looking for bounce/recovery opportunities or continuation patterns.
 */

import { AgentManagementService } from './src/services/agent-management.service';
import { CreateAgentRequest } from './src/types/agent.types';

async function createGapDownAgent() {
  const agentMgmt = new AgentManagementService();

  const request: CreateAgentRequest = {
    name: 'Gap Down Specialist',
    instructions: `You are a day trader specializing in gap down trading strategies.

Your focus is on stocks that open significantly lower than their previous close (gap downs of 2-10%).

TRADING APPROACH:
- Timeframe: Intraday only, close all positions before 3:55 PM ET
- Risk Tolerance: Moderate - willing to take calculated risks on gap recoveries
- Position sizing: Risk-based with tight stops

PATTERN FOCUS:
1. Gap Fill Reversals: Stocks that gap down but show strength and attempt to fill the gap
   - Look for oversold conditions on RSI (< 30)
   - Strong volume on the recovery
   - No fundamental catalyst for the gap (just profit-taking or technical selling)

2. Support Bounces: Gaps down to key support levels (prior consolidation, VWAP, major moving averages)
   - Watch for reversal candles at support
   - Volume confirmation on bounce
   - Previous resistance becoming new support

3. Dead Cat Bounces (SHORT): When gap down is on bad news/earnings miss
   - Initial panic bounce provides short entry
   - Look for failed recovery at VWAP or prior consolidation
   - Volume declining on bounce attempts

ENTRY CRITERIA:
- For LONG reversals:
  * Gap down 2-10% (not catastrophic gaps > 15%)
  * Price holds above key support level
  * Green candle with volume in first 15 minutes
  * RSI showing bullish divergence
  * No major negative catalyst

- For SHORT continuations:
  * Gap down on bad news/earnings
  * Initial bounce fails at resistance (VWAP, prior low)
  * Decreasing volume on bounce
  * Market/sector weakness confirmation

EXIT RULES:
- LONG positions:
  * Target 1: 50% gap fill (take 50% off)
  * Target 2: 80-100% gap fill (remaining position)
  * Stop: Below recent low or support level (typically 0.3-0.5%)
  * Time exit: 3:55 PM ET regardless of profit/loss

- SHORT positions:
  * Target: New LOD or -2% from entry
  * Stop: Above initial bounce high or VWAP
  * Quick exits - don't hold shorts into strength

MARKET CONDITIONS:
- Prefer ranging to slightly bullish market conditions for gap fill longs
- Prefer bearish/volatile conditions for short plays
- Avoid extremely volatile VIX > 30 days unless very selective

RISK MANAGEMENT:
- Never risk more than 0.5% of account per trade
- Maximum 2 concurrent positions
- Daily loss limit of $1000
- If stopped out twice in same pattern, stop trading that pattern for the day

QUALITY OVER QUANTITY:
- Look for 2-5 high quality setups per day
- Avoid chasing - wait for proper entries at support/resistance
- Best setups typically occur 9:45-11:00 AM and 2:00-3:30 PM
- Avoid the first 15 minutes unless very obvious setup

Remember: Gap downs create opportunity through fear and overreaction.
Your edge is identifying when the selling is overdone (reversal longs) or
when the initial bounce is a trap (continuation shorts).`,
  };

  console.log('Creating Gap Down Day Trading Agent...\n');

  try {
    const result = await agentMgmt.createAgent(request);

    if (result.success && result.agent) {
      console.log('✅ Agent created successfully!\n');
      console.log('Agent Details:');
      console.log(`  ID: ${result.agent.id}`);
      console.log(`  Name: ${result.agent.name}`);
      console.log(`  Status: ${result.agent.status}`);
      console.log(`  Trading Style: ${result.agent.trading_style}`);
      console.log(`  Risk Tolerance: ${result.agent.risk_tolerance}`);
      console.log(`  Pattern Focus: ${result.agent.pattern_focus.join(', ')}`);
      console.log(`  Market Conditions: ${result.agent.market_conditions.join(', ')}`);
      console.log(`  Timeframe: ${result.agent.timeframe}`);

      if (result.agent.risk_config) {
        console.log('\nRisk Configuration:');
        console.log(`  Max Position Size: $${result.agent.risk_config.max_position_size}`);
        console.log(`  Max Daily Loss: $${result.agent.risk_config.max_daily_loss}`);
        console.log(`  Max Portfolio Exposure: ${(result.agent.risk_config.max_portfolio_exposure * 100).toFixed(0)}%`);
        console.log(`  Stop Loss Method: ${result.agent.risk_config.stop_loss_method}`);
        console.log(`  Position Sizing: ${result.agent.risk_config.position_sizing_method}`);
      }

      console.log('\nDetected Personality:');
      console.log(JSON.stringify(result.detectedPersonality, null, 2));

      console.log('\n📝 Next Steps:');
      console.log(`  1. Start a learning iteration: POST /api/agents/${result.agent.id}/iterations/start`);
      console.log(`  2. Review backtest results and refine strategy`);
      console.log(`  3. Graduate to paper trading when performance is consistent`);
      console.log(`  4. Monitor paper trading performance before going live`);

    } else {
      console.error('❌ Failed to create agent:', result);
    }
  } catch (error) {
    console.error('❌ Error creating agent:', error);
    process.exit(1);
  }
}

// Run the script
createGapDownAgent()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
