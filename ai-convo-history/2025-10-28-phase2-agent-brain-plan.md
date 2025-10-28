# Phase 2: Agent Brain - Implementation Plan
## Date: 2025-10-28

## Overview

Phase 2 builds the intelligent decision-making layer on top of the Phase 1 foundation. The goal is to create an autonomous system that detects patterns in real-time, analyzes them with Claude AI, and executes trades based on risk-managed decisions.

## Phase 1 Completion Status ✅

### Infrastructure Complete
- **TradeStation API Integration**: OAuth authentication, account/position/order endpoints working
- **Database Schema**: All 9 tables created (trading_agents, realtime_bars, live_signals, trade_recommendations, executed_trades, portfolio_state, risk_metrics, tradestation_orders, agent_activity_log)
- **Trading Agent Service**: Full CRUD operations for agents, portfolio state management, activity logging
- **Paper Trading Account**: SIM3113503M operational with $101k cash, $395k buying power
- **TypeScript Types**: Comprehensive interfaces in `trading-agent.types.ts`

### Tested and Working
- GET /api/agents/accounts
- GET /api/agents/account
- GET /api/agents/positions
- POST /api/agents/orders
- Test trade placed: 1 share SPY market buy order

## Phase 2 Components

### 1. Pattern Recognition Engine
**Purpose**: Real-time pattern detection on market data streams

**Implementation**: `backend/src/services/realtime-scanner.service.ts`

**Core Methods**:
```typescript
class RealtimeScannerService {
  // Main scanning loop
  scanForPatterns(bar: OHLCVBar): Promise<LiveSignal[]>

  // Pattern maturity validation
  checkPatternMaturity(pattern: Pattern): boolean

  // Pattern quality scoring (0-100)
  scorePattern(pattern: Pattern): number

  // Multi-timeframe confirmation
  multiTimeframeConfirmation(ticker: string, patternType: string): boolean

  // Signal emission
  emitSignal(signal: LiveSignal): Promise<void>

  // Deduplication
  isDuplicateSignal(ticker: string, patternType: string, timeWindow: number): boolean
}
```

**Pattern Types to Detect**:
- `breakout-volume-surge`: High volume breakout above resistance
- `gap-and-go`: Gap up with continuation momentum
- `cup-and-handle`: Cup and handle pattern completion
- `bull-flag`: Consolidation after strong move
- `vwap-bounce`: Bounce off VWAP support
- `momentum-surge`: Rapid price acceleration with volume

**Data Sources**:
- Use existing backtest pattern definitions from `backend/src/database/schema.sql` (scans table)
- Query `realtime_bars` table for OHLCV data
- Calculate technical indicators: RSI, VWAP, volume ratios, ATR

**Signal Flow**:
1. Receive real-time bar from TradeStation WebSocket
2. Insert into `realtime_bars` table
3. Run pattern detection algorithms
4. Score pattern quality (0-100)
5. Check multi-timeframe confirmation (1m, 5m, 15m)
6. If pattern mature and confirmed → emit LiveSignal
7. Insert signal into `live_signals` table with status='DETECTED'

**Deduplication Logic**:
- Check for duplicate signals within 5-minute window
- Same ticker + same pattern type = duplicate
- Update existing signal instead of creating new one

### 2. AI Trade Optimizer
**Purpose**: Claude analyzes signals and generates trade recommendations

**Implementation**: `backend/src/services/trade-optimizer.service.ts`

**Core Methods**:
```typescript
class TradeOptimizerService {
  // Main analysis entry point
  analyzeSignal(signal: LiveSignal, agent: TradingAgent): Promise<TradeRecommendation>

  // Chart generation for Claude Vision
  generateChartForSignal(ticker: string, timeframe: string): Promise<Buffer>

  // Claude API call with vision
  callClaudeVision(chart: Buffer, signal: LiveSignal, portfolioState: PortfolioState): Promise<ClaudeAnalysis>

  // Position sizing
  calculatePositionSize(confidenceScore: number, accountEquity: number, riskLimits: RiskLimits): number

  // Stop loss calculation
  calculateStopLoss(entryPrice: number, patternType: string, atr: number): number

  // Take profit calculation
  calculateTakeProfit(entryPrice: number, patternType: string, riskReward: number): number

  // Correlation check
  checkCorrelation(ticker: string, existingPositions: Record<string, Position>): number
}
```

**Claude Vision Prompt Structure**:
```
You are a professional day trader analyzing a potential trade setup.

PATTERN DETECTED: {patternType}
TICKER: {ticker}
CURRENT PRICE: ${currentPrice}
VOLUME: {volume} (avg: {avgVolume})

TECHNICAL INDICATORS:
- RSI: {rsi}
- VWAP: ${vwap}
- Volume Ratio: {volumeRatio}x
- ATR: ${atr}

MULTI-TIMEFRAME CONFIRMATION: {confirmed ? 'YES' : 'NO'}

PORTFOLIO CONTEXT:
- Current Cash: ${cash}
- Open Positions: {openPositions}
- Daily P&L: ${dailyPnL} ({dailyPnLPercent}%)
- Total Exposure: ${totalExposure}

CHART: [attached]

Please analyze this setup and provide:
1. Confidence Score (0-100): How strong is this setup?
2. Entry Price: Optimal entry point
3. Stop Loss: Where would you exit if wrong?
4. Take Profit: Primary target
5. Position Size: Recommended shares (max ${maxPositionSize} per trade)
6. Reasoning: 2-3 sentence explanation of why this trade makes sense or should be avoided

Format response as JSON:
{
  "confidenceScore": 85,
  "entryPrice": 150.25,
  "stopLoss": 148.50,
  "takeProfit": 153.00,
  "positionSize": 100,
  "reasoning": "Strong breakout with volume surge above key resistance..."
}
```

**Chart Generation**:
- Use library like `chart.js` or `d3` to generate PNG chart
- Include: candlesticks, volume bars, VWAP, support/resistance levels
- Timeframe: Last 50 bars + real-time bar
- Save as base64 string in `trade_recommendations.chart_data`

**Position Sizing Algorithm** (Kelly Criterion Modified):
```typescript
function calculatePositionSize(
  confidenceScore: number,
  accountEquity: number,
  riskLimits: RiskLimits
): number {
  // Base risk: 1% of equity per trade
  const baseRisk = accountEquity * 0.01;

  // Scale by confidence (50-100 maps to 0.5x-2x)
  const confidenceMultiplier = (confidenceScore - 50) / 25;
  const adjustedRisk = baseRisk * (1 + confidenceMultiplier);

  // Cap at maxPositionSize
  return Math.min(adjustedRisk, riskLimits.maxPositionSize);
}
```

### 3. Execution Decision Engine
**Purpose**: Apply risk checks and execute approved trades

**Implementation**: `backend/src/services/execution-engine.service.ts`

**Core Methods**:
```typescript
class ExecutionEngineService {
  // Main decision entry point
  processRecommendation(recommendation: TradeRecommendation): Promise<ExecutionResult>

  // All risk checks
  runRiskChecks(recommendation: TradeRecommendation, agent: TradingAgent): Promise<RiskCheckResults>

  // Individual risk checks
  private checkPositionSize(positionSize: number, maxSize: number): CheckResult
  private checkPortfolioExposure(newExposure: number, totalEquity: number, maxExposure: number): CheckResult
  private checkDailyLoss(currentDailyPnL: number, maxLoss: number): CheckResult
  private checkConcurrentPositions(currentCount: number, maxCount: number): CheckResult
  private checkConfidenceScore(score: number, minScore: number): CheckResult
  private checkCorrelation(correlation: number, maxCorrelation: number): CheckResult

  // Execution
  private executeOrder(recommendation: TradeRecommendation): Promise<ExecutedTrade>

  // Rejection handling
  private rejectRecommendation(recommendation: TradeRecommendation, reason: string): void
}
```

**Risk Check Details**:

1. **Position Size Check**:
   ```typescript
   if (recommendation.positionSize * recommendation.entryPrice > agent.riskLimits.maxPositionSize) {
     return { passed: false, reason: `Position size $${positionSize} exceeds limit $${maxPositionSize}` };
   }
   ```

2. **Portfolio Exposure Check**:
   ```typescript
   const portfolioState = await this.tradingAgentService.getPortfolioState(agent.id);
   const newExposure = portfolioState.totalExposure + (positionSize * entryPrice);
   const exposurePercent = (newExposure / portfolioState.totalEquity) * 100;

   if (exposurePercent > agent.riskLimits.maxPortfolioExposure) {
     return { passed: false, reason: `Portfolio exposure ${exposurePercent}% exceeds limit ${maxExposure}%` };
   }
   ```

3. **Daily Loss Check**:
   ```typescript
   const portfolioState = await this.tradingAgentService.getPortfolioState(agent.id);

   if (portfolioState.dailyPnL < -agent.riskLimits.maxDailyLoss) {
     return { passed: false, reason: `Daily loss $${Math.abs(dailyPnL)} hit limit $${maxDailyLoss}. Trading halted.` };
   }
   ```

4. **Concurrent Positions Check**:
   ```typescript
   const portfolioState = await this.tradingAgentService.getPortfolioState(agent.id);

   if (portfolioState.openTradeCount >= agent.riskLimits.maxConcurrentPositions) {
     return { passed: false, reason: `Already at max ${maxConcurrentPositions} positions` };
   }
   ```

5. **Confidence Score Check**:
   ```typescript
   if (recommendation.confidenceScore < agent.riskLimits.minConfidenceScore) {
     return { passed: false, reason: `Confidence ${score} below threshold ${minScore}` };
   }
   ```

6. **Correlation Check**:
   ```typescript
   const portfolioState = await this.tradingAgentService.getPortfolioState(agent.id);
   const correlation = await this.tradeOptimizerService.checkCorrelation(
     recommendation.ticker,
     portfolioState.positions
   );

   if (correlation > agent.riskLimits.maxCorrelation) {
     return { passed: false, reason: `Correlation ${correlation} exceeds limit ${maxCorrelation}` };
   }
   ```

**Execution Flow**:
```
1. Receive TradeRecommendation from AI Trade Optimizer
2. Update status to 'ANALYZING'
3. Run all 6 risk checks
4. Save risk check results to trade_recommendations.risk_checks (JSON)
5. If all checks pass:
   a. Update status to 'APPROVED'
   b. Call TradeStation API to place order
   c. Insert into executed_trades table
   d. Update portfolio_state
   e. Log activity: ORDER_PLACED
   f. Update status to 'EXECUTED'
6. If any check fails:
   a. Update status to 'REJECTED'
   b. Log activity: RISK_LIMIT_HIT with reason
   c. Return rejection details
```

## System Integration

### Data Flow Diagram
```
[TradeStation WebSocket]
    ↓ Real-time bars
[realtime_bars table]
    ↓
[RealtimeScannerService]
    ↓ Pattern detected
[live_signals table] (status='DETECTED')
    ↓
[TradeOptimizerService]
    ↓ Claude analyzes
[trade_recommendations table] (status='PENDING')
    ↓
[ExecutionEngineService]
    ↓ Risk checks
[trade_recommendations] (status='APPROVED/REJECTED')
    ↓ If approved
[TradeStation API] → Place order
    ↓
[executed_trades table] (status='OPEN')
    ↓
[portfolio_state table] (updated)
```

### Agent Lifecycle

**Agent Creation**:
```typescript
POST /api/agents
{
  "name": "Breakout Hunter",
  "accountId": "SIM3113503M",
  "timeframe": "intraday",
  "strategies": ["breakout-volume-surge", "gap-and-go"],
  "riskLimits": {
    "maxPositionSize": 10000,
    "maxPortfolioExposure": 50,
    "maxDailyLoss": 500,
    "maxConcurrentPositions": 5,
    "minConfidenceScore": 70,
    "maxCorrelation": 0.7
  }
}
```

**Agent Activation**:
```typescript
PATCH /api/agents/{agentId}
{ "active": true }

// This triggers:
1. Initialize portfolio state from TradeStation account
2. Start scanning for patterns (strategies array)
3. Begin processing signals
4. Start monitoring existing positions
```

**Agent Monitoring**:
```typescript
GET /api/agents/{agentId}/activity
// Returns recent activity log

GET /api/agents/{agentId}/portfolio
// Returns current portfolio state

GET /api/agents/{agentId}/signals
// Returns live signals (pending analysis)

GET /api/agents/{agentId}/recommendations
// Returns trade recommendations

GET /api/agents/{agentId}/trades
// Returns executed trades
```

## Implementation Order

### Week 1: Pattern Recognition Engine (Days 1-3)
1. Create `RealtimeScannerService`
2. Implement basic pattern detection (start with 2 patterns)
3. Write pattern scoring logic
4. Implement multi-timeframe confirmation
5. Test signal emission
6. Add deduplication logic

**Deliverable**: Scanner detects breakout and gap-and-go patterns in real-time

### Week 1: AI Trade Optimizer (Days 4-5)
1. Create `TradeOptimizerService`
2. Implement chart generation
3. Integrate Claude API with vision
4. Write position sizing logic
5. Implement stop loss / take profit calculations
6. Test Claude analysis on historical patterns

**Deliverable**: Claude generates trade recommendations with reasoning

### Week 2: Execution Decision Engine (Days 1-2)
1. Create `ExecutionEngineService`
2. Implement all 6 risk checks
3. Write execution logic (TradeStation order placement)
4. Add rejection logging
5. Test risk check edge cases

**Deliverable**: Engine executes approved trades and rejects risky ones

### Week 2: Integration Testing (Days 3-4)
1. End-to-end test: pattern detection → analysis → execution
2. Test risk limit scenarios
3. Test multiple concurrent signals
4. Test portfolio state updates
5. Verify activity logging

**Deliverable**: Full pipeline working with paper trading account

### Week 2: API Routes (Day 5)
1. Create agent management routes
2. Create signal monitoring routes
3. Create recommendation review routes
4. Create trade monitoring routes
5. Add WebSocket for real-time updates

**Deliverable**: REST API for agent control and monitoring

## Testing Strategy

### Unit Tests
- Pattern detection algorithms
- Position sizing calculations
- Risk check logic
- Stop loss / take profit calculations

### Integration Tests
- Scanner → Optimizer → Execution flow
- TradeStation API order placement
- Database operations (signal/recommendation/trade CRUD)
- Portfolio state updates

### Paper Trading Validation
1. Run agent for 1 week with conservative limits:
   - Max position size: $1,000
   - Max 2 concurrent positions
   - Min confidence: 80
   - Max daily loss: $200
2. Monitor all executions manually
3. Verify all risk checks working correctly
4. Track win rate and P&L

## Risk Management Rules

### Position-Level Limits
- Max 2% of equity per trade
- Stop loss always set (no exceptions)
- Take profit at 2:1 risk/reward minimum

### Portfolio-Level Limits
- Max 50% equity deployed at any time
- Max 5 concurrent positions
- Daily loss limit: 5% of starting equity

### Signal Quality Gates
- Minimum confidence score: 70
- Multi-timeframe confirmation required
- Pattern maturity check (no partial patterns)
- Maximum correlation: 0.7 with existing positions

### Trading Halt Conditions
- Daily loss limit hit → stop for the day
- 3 consecutive losses → pause for 1 hour
- Technical error → halt and alert

## Success Metrics

### Phase 2 Completion Criteria
- ✅ Scanner detects 6 pattern types in real-time
- ✅ Claude analyzes signals and generates recommendations
- ✅ All 6 risk checks implemented and tested
- ✅ Orders placed automatically in paper account
- ✅ Portfolio state tracked accurately
- ✅ Activity log complete for all actions
- ✅ REST API for agent management working
- ✅ 1 week of successful paper trading

### Performance Targets
- Pattern detection latency: <500ms from bar arrival
- Claude analysis time: <3 seconds per signal
- Order execution time: <1 second after approval
- Signal-to-trade conversion rate: 30-50% (most rejected by risk checks is healthy)

## Next Steps After Phase 2

**Phase 3: Portfolio Management** (Week 5-6)
- Position monitoring and exit management
- Trailing stops
- Time-based exits
- P&L tracking
- Risk metric calculations

**Phase 4: Agent Dashboard** (Week 7-8)
- Live trading interface
- Real-time portfolio visualization
- Signal feed with charts
- Manual trade approval/rejection
- Performance analytics

## Technical Notes

### Claude API Configuration
- Model: `claude-3-5-sonnet-20241022` (vision support)
- Max tokens: 2048
- Temperature: 0.3 (more conservative for trading)
- System prompt: Day trader persona
- Include chart image + signal data + portfolio context

### Database Indexes Needed
```sql
CREATE INDEX idx_live_signals_status ON live_signals(status);
CREATE INDEX idx_live_signals_agent ON live_signals(agent_id, status);
CREATE INDEX idx_trade_recommendations_status ON trade_recommendations(status);
CREATE INDEX idx_executed_trades_agent_status ON executed_trades(agent_id, status);
CREATE INDEX idx_realtime_bars_ticker_timeframe ON realtime_bars(ticker, timeframe, timestamp);
```

### Error Handling
- All services must have try/catch blocks
- Log all errors to `agent_activity_log` with type='ERROR'
- Graceful degradation: If Claude API fails, use rule-based fallback
- Retry logic: 3 attempts for transient failures
- Circuit breaker: Disable agent if 10 consecutive errors

### Configuration
- All timeouts configurable via environment variables
- Risk limits stored per agent (not hardcoded)
- Pattern detection thresholds configurable
- Claude API key in environment (not committed)

## Files to Create

1. `backend/src/services/realtime-scanner.service.ts`
2. `backend/src/services/trade-optimizer.service.ts`
3. `backend/src/services/execution-engine.service.ts`
4. `backend/src/api/routes/trading-agent.ts` (already exists, extend)
5. `backend/src/utils/chart-generator.ts`
6. `backend/src/utils/technical-indicators.ts`
7. `backend/src/utils/correlation.ts`
8. `backend/tests/services/realtime-scanner.test.ts`
9. `backend/tests/services/trade-optimizer.test.ts`
10. `backend/tests/services/execution-engine.test.ts`

## Dependencies to Add

```json
{
  "chart.js": "^4.4.0",
  "canvas": "^2.11.2",
  "technicalindicators": "^3.1.0",
  "@anthropic-ai/sdk": "^0.17.0"
}
```

## Environment Variables

```bash
# Claude AI
ANTHROPIC_API_KEY=sk-ant-...

# Risk Defaults
DEFAULT_MAX_POSITION_SIZE=10000
DEFAULT_MAX_PORTFOLIO_EXPOSURE=50
DEFAULT_MAX_DAILY_LOSS=500
DEFAULT_MAX_CONCURRENT_POSITIONS=5
DEFAULT_MIN_CONFIDENCE_SCORE=70
DEFAULT_MAX_CORRELATION=0.7

# Scanner Config
PATTERN_SCAN_INTERVAL_MS=1000
PATTERN_MATURITY_MIN_BARS=20
MULTI_TIMEFRAME_CONFIRMATION=true

# Optimizer Config
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=2048
CLAUDE_TEMPERATURE=0.3
CHART_GENERATION_BARS=50

# Execution Config
ORDER_TIMEOUT_MS=10000
RISK_CHECK_ENABLED=true
AUTO_EXECUTION_ENABLED=true
```

## Status

**Phase 1**: ✅ Complete (TradeStation integration, database schema, agent service)
**Phase 2**: 🔄 Ready to start (all planning complete)

**Next Action**: Begin implementing `RealtimeScannerService`
