# Phase 3: Portfolio Management - Implementation Plan
## Date: 2025-10-28

## Overview

Phase 3 builds comprehensive portfolio management capabilities on top of the Phase 2 trading agent brain. The goal is to monitor positions in real-time, manage exits intelligently, and track performance metrics.

## Phase 2 Completion Status ✅

### Services Complete
- **RealtimeScannerService**: 6 pattern types, multi-timeframe confirmation, quality scoring
- **TradeOptimizerService**: Claude AI analysis, position sizing, stop/target calculations
- **ExecutionEngineService**: 6 risk checks, order execution, portfolio tracking

### Infrastructure Ready
- Database: 9 tables including `executed_trades`, `portfolio_state`, `risk_metrics`
- API: 14 endpoints for agent management and monitoring
- TradeStation: Paper trading operational (SIM3113503M)

## Phase 3 Components

### 1. Position Monitor Service
**Purpose**: Real-time position monitoring and exit management

**Implementation**: `backend/src/services/position-monitor.service.ts`

**Core Methods**:
```typescript
class PositionMonitorService {
  // Main monitoring loop
  monitorPositions(): Promise<void>

  // Check individual position against exit conditions
  checkPosition(trade: ExecutedTrade, currentPrice: number): Promise<ExitDecision>

  // Exit condition checks
  private checkStopLoss(trade: ExecutedTrade, currentPrice: number): boolean
  private checkTakeProfit(trade: ExecutedTrade, currentPrice: number): boolean
  private checkTrailingStop(trade: ExecutedTrade, currentPrice: number): boolean
  private checkTimeExit(trade: ExecutedTrade): boolean

  // Execute exit order
  private executeExit(trade: ExecutedTrade, exitPrice: number, reason: string): Promise<void>

  // Update position prices
  private updatePositionPrices(agentId: string, ticker: string, currentPrice: number): Promise<void>
}
```

**Exit Conditions**:
1. **Stop Loss Hit**: Current price <= stop loss price
2. **Take Profit Hit**: Current price >= take profit price
3. **Trailing Stop Hit**: Price retraces from peak by threshold %
4. **Time Exit**: Held position longer than max hold time
5. **Manual Exit**: User closes position via API

**Monitoring Frequency**:
- Real-time updates via TradeStation WebSocket
- Fallback polling: Every 5 seconds
- Price update immediately triggers exit condition checks

**Position Update Flow**:
```
[TradeStation WebSocket]
    ↓ Price update
[PositionMonitorService.updatePositionPrices()]
    ↓ Update portfolio_state
[PositionMonitorService.checkPosition()]
    ↓ Evaluate exit conditions
[If exit triggered]
    ↓
[ExecuteExit()]
    ↓ Place TradeStation sell order
[Update executed_trades: status='CLOSED']
    ↓
[Update portfolio_state: remove position]
    ↓
[Calculate P&L and update daily metrics]
    ↓
[Log activity: POSITION_CLOSED]
```

### 2. Trailing Stop Service
**Purpose**: Dynamic stop loss adjustment to lock in profits

**Implementation**: `backend/src/services/trailing-stop.service.ts`

**Core Methods**:
```typescript
class TrailingStopService {
  // Enable trailing stop for position
  enableTrailingStop(tradeId: string, trailPercent: number): Promise<void>

  // Update trailing stop based on new price
  updateTrailingStop(trade: ExecutedTrade, currentPrice: number): Promise<number>

  // Calculate new trailing stop level
  private calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    highWaterMark: number,
    trailPercent: number,
    side: 'LONG' | 'SHORT'
  ): number

  // Check if trailing stop should be updated
  private shouldUpdateTrail(
    currentPrice: number,
    highWaterMark: number,
    side: 'LONG' | 'SHORT'
  ): boolean
}
```

**Trailing Stop Logic**:

For LONG positions:
```typescript
// Track highest price since entry
highWaterMark = Math.max(highWaterMark, currentPrice)

// Calculate trailing stop (% below high water mark)
trailingStop = highWaterMark * (1 - trailPercent / 100)

// Example: 5% trailing stop
// Entry: $100
// Price rises to $120 → highWaterMark = $120
// trailingStop = $120 * 0.95 = $114
// Price drops to $114 → EXIT
```

For SHORT positions:
```typescript
// Track lowest price since entry
lowWaterMark = Math.min(lowWaterMark, currentPrice)

// Calculate trailing stop (% above low water mark)
trailingStop = lowWaterMark * (1 + trailPercent / 100)
```

**Activation Rules**:
- Trailing stop activates when position reaches minimum profit threshold (e.g., +2%)
- Before activation, use fixed stop loss
- After activation, stop only moves in favorable direction (never wider)

**Database Storage**:
```sql
-- Add to executed_trades table
trailing_stop REAL,          -- Current trailing stop price
high_water_mark REAL,        -- Highest price reached (LONG)
low_water_mark REAL,         -- Lowest price reached (SHORT)
trailing_percent REAL,       -- Trailing stop percentage
trailing_active BOOLEAN      -- Is trailing stop enabled?
```

### 3. Risk Metrics Service
**Purpose**: Calculate and track performance metrics

**Implementation**: `backend/src/services/risk-metrics.service.ts`

**Core Methods**:
```typescript
class RiskMetricsService {
  // Calculate daily risk metrics
  calculateDailyMetrics(agentId: string, date: Date): Promise<RiskMetrics>

  // Update metrics after trade close
  updateMetricsAfterTrade(agentId: string, trade: ExecutedTrade): Promise<void>

  // Get historical metrics
  getMetrics(agentId: string, startDate: Date, endDate: Date): Promise<RiskMetrics[]>

  // Individual metric calculations
  private calculateSharpeRatio(returns: number[], riskFreeRate: number): number
  private calculateSortinoRatio(returns: number[], targetReturn: number): number
  private calculateMaxDrawdown(equityCurve: number[]): number
  private calculateProfitFactor(wins: number[], losses: number[]): number
  private calculateWinRate(wins: number, losses: number): number
}
```

**Metrics Calculated**:

**1. Exposure Metrics**:
- `totalExposure`: Sum of all open position values
- `maxPositionSize`: Largest single position
- `avgPositionSize`: Average position size

**2. P&L Metrics**:
- `dailyPnL`: Realized + unrealized P&L for the day
- `dailyPnLPercent`: Daily P&L as % of starting equity
- `cumulativePnL`: Total P&L since inception

**3. Risk Metrics**:
- `maxDrawdown`: Maximum peak-to-trough decline in equity
- `currentDrawdown`: Current decline from highest equity
- `sharpeRatio`: Risk-adjusted return (assumes 0% risk-free rate)
- `sortinoRatio`: Downside risk-adjusted return

**4. Trade Statistics**:
- `totalTrades`: Number of closed trades
- `winningTrades`: Number of profitable trades
- `losingTrades`: Number of losing trades
- `winRate`: Percentage of winning trades
- `avgWin`: Average profit on winning trades
- `avgLoss`: Average loss on losing trades
- `largestWin`: Biggest single win
- `largestLoss`: Biggest single loss
- `profitFactor`: Gross profit / gross loss

**Calculation Formulas**:

```typescript
// Sharpe Ratio (annualized, assuming 252 trading days)
sharpeRatio = (avgDailyReturn * 252) / (stdDevDailyReturns * sqrt(252))

// Sortino Ratio (only penalizes downside volatility)
sortinoRatio = (avgDailyReturn * 252) / (downside StdDev * sqrt(252))

// Max Drawdown
maxDrawdown = max((peak - trough) / peak) * 100

// Profit Factor
profitFactor = sum(allWins) / abs(sum(allLosses))

// Win Rate
winRate = (winningTrades / totalTrades) * 100
```

**Update Frequency**:
- After each trade closes: Update metrics immediately
- End of day: Calculate full daily snapshot
- Store in `risk_metrics` table with `metric_date`

### 4. Time-Based Exit Manager
**Purpose**: Close positions that have been held too long

**Implementation**: Integrated into `PositionMonitorService`

**Exit Rules**:

1. **Intraday Timeframe**:
   - Max hold: End of trading day (4:00 PM ET)
   - Auto-exit 5 minutes before market close (3:55 PM ET)

2. **Swing Timeframe**:
   - Max hold: 5 trading days
   - Exit on 6th day at market open

3. **Position Timeframe**:
   - Max hold: 20 trading days
   - Exit on 21st day at market open

**Time Exit Logic**:
```typescript
function checkTimeExit(trade: ExecutedTrade, timeframe: string): boolean {
  const now = new Date()
  const entryTime = new Date(trade.entryTime)
  const holdDuration = now.getTime() - entryTime.getTime()

  switch (timeframe) {
    case 'intraday':
      // Check if near market close (3:55 PM ET)
      const marketClose = getMarketCloseTime(now)
      const fiveMinutesBeforeClose = new Date(marketClose.getTime() - 5 * 60 * 1000)
      return now >= fiveMinutesBeforeClose

    case 'swing':
      // 5 trading days max
      const tradingDaysHeld = countTradingDays(entryTime, now)
      return tradingDaysHeld >= 5

    case 'position':
      // 20 trading days max
      const positionDaysHeld = countTradingDays(entryTime, now)
      return positionDaysHeld >= 20

    default:
      return false
  }
}
```

## System Integration

### Real-Time Monitoring Loop

```typescript
// Start monitoring when agent activates
async function startPositionMonitoring(agentId: string): Promise<void> {
  const interval = 5000 // 5 seconds

  setInterval(async () => {
    // Get all open trades for agent
    const openTrades = await executionEngine.getOpenTrades(agentId)

    for (const trade of openTrades) {
      // Get current price from TradeStation
      const currentPrice = await tradeStationService.getCurrentPrice(trade.ticker)

      // Update position in portfolio state
      await positionMonitor.updatePositionPrices(agentId, trade.ticker, currentPrice)

      // Check exit conditions
      const exitDecision = await positionMonitor.checkPosition(trade, currentPrice)

      if (exitDecision.shouldExit) {
        // Execute exit
        await positionMonitor.executeExit(
          trade,
          currentPrice,
          exitDecision.reason
        )

        // Update risk metrics
        await riskMetrics.updateMetricsAfterTrade(agentId, trade)
      } else if (exitDecision.updateTrailingStop) {
        // Update trailing stop
        await trailingStopService.updateTrailingStop(trade, currentPrice)
      }
    }
  }, interval)
}
```

### Position State Management

**Portfolio State Updates**:
```typescript
// Real-time position value updates
async function updatePositionPrices(
  agentId: string,
  ticker: string,
  currentPrice: number
): Promise<void> {
  const portfolioState = await tradingAgentService.getPortfolioState(agentId)
  const position = portfolioState.positions[ticker]

  if (position) {
    // Update current price
    position.currentPrice = currentPrice

    // Recalculate P&L
    position.pnl = (currentPrice - position.avgPrice) * position.shares
    position.pnlPercent = (position.pnl / (position.avgPrice * position.shares)) * 100

    // Update market value
    position.marketValue = currentPrice * position.shares

    // Recalculate total equity
    portfolioState.totalEquity = portfolioState.cash +
      Object.values(portfolioState.positions)
        .reduce((sum, pos) => sum + pos.marketValue, 0)

    // Update daily P&L (realized + unrealized)
    const realizedPnL = await getRealizedPnLToday(agentId)
    const unrealizedPnL = Object.values(portfolioState.positions)
      .reduce((sum, pos) => sum + pos.pnl, 0)

    portfolioState.dailyPnL = realizedPnL + unrealizedPnL
    portfolioState.dailyPnLPercent = (portfolioState.dailyPnL / portfolioState.totalEquity) * 100

    // Save updated state
    await savePortfolioState(agentId, portfolioState)
  }
}
```

## Database Schema Updates

### executed_trades Table Extensions

```sql
-- Add trailing stop columns
ALTER TABLE executed_trades ADD COLUMN trailing_stop REAL;
ALTER TABLE executed_trades ADD COLUMN high_water_mark REAL;
ALTER TABLE executed_trades ADD COLUMN low_water_mark REAL;
ALTER TABLE executed_trades ADD COLUMN trailing_percent REAL;
ALTER TABLE executed_trades ADD COLUMN trailing_active BOOLEAN DEFAULT 0;

-- Add time tracking
ALTER TABLE executed_trades ADD COLUMN last_price_update DATETIME;
ALTER TABLE executed_trades ADD COLUMN max_favorable_excursion REAL; -- Best price reached
ALTER TABLE executed_trades ADD COLUMN max_adverse_excursion REAL;   -- Worst price reached
```

### Indexes for Performance

```sql
-- Fast lookups for open positions
CREATE INDEX idx_executed_trades_agent_open ON executed_trades(agent_id, status)
WHERE status = 'OPEN';

-- Fast time-based queries
CREATE INDEX idx_risk_metrics_agent_date ON risk_metrics(agent_id, metric_date);

-- Activity log queries
CREATE INDEX idx_agent_activity_timestamp ON agent_activity_log(agent_id, timestamp DESC);
```

## API Routes

### Position Management Endpoints

```typescript
// GET /api/agents/:id/positions/open
// Get all open positions with real-time P&L

// POST /api/agents/:id/positions/:tradeId/trailing-stop
// Enable trailing stop for position
{
  "trailPercent": 5,  // Trail 5% from high water mark
  "activationPercent": 2  // Activate when position is +2%
}

// GET /api/agents/:id/metrics
// Get risk metrics
// Query params: ?startDate=2025-10-01&endDate=2025-10-28

// GET /api/agents/:id/metrics/latest
// Get latest daily metrics

// GET /api/agents/:id/equity-curve
// Get equity curve data for charting
```

## Implementation Order

### Day 1: Position Monitor Service (4-5 hours)
1. Create `PositionMonitorService` skeleton
2. Implement exit condition checks (stop, target, time)
3. Implement `executeExit()` method
4. Write `updatePositionPrices()` method
5. Test exit logic with mock trades

**Deliverable**: Positions automatically close when conditions met

### Day 2: Trailing Stop Service (3-4 hours)
1. Create `TrailingStopService`
2. Implement `calculateTrailingStop()` logic
3. Implement `updateTrailingStop()` method
4. Add database columns for trailing stop tracking
5. Test trailing stop behavior with price movements

**Deliverable**: Trailing stops lock in profits dynamically

### Day 3: Risk Metrics Service (4-5 hours)
1. Create `RiskMetricsService`
2. Implement all metric calculations (Sharpe, Sortino, drawdown, etc.)
3. Implement `calculateDailyMetrics()` method
4. Add end-of-day batch processing
5. Test metric calculations with sample trades

**Deliverable**: Full performance analytics dashboard ready

### Day 4: Integration & Testing (4-6 hours)
1. Integrate position monitoring into agent lifecycle
2. Start monitoring loop when agent activates
3. Stop monitoring when agent deactivates
4. End-to-end test: Entry → Hold → Exit cycle
5. Test edge cases: Market close, gaps, fast moves

**Deliverable**: Full trading cycle working end-to-end

### Day 5: API & Documentation (2-3 hours)
1. Add position management API endpoints
2. Add metrics API endpoints
3. Update README with Phase 3 features
4. Create example API requests
5. Write integration test suite

**Deliverable**: Complete API for portfolio management

## Testing Strategy

### Unit Tests
- Exit condition logic (stop loss, take profit, trailing stop)
- Metric calculations (Sharpe, Sortino, profit factor)
- Time-based exit rules
- Portfolio state updates

### Integration Tests
- Full trade lifecycle: Entry → Monitor → Exit
- Trailing stop activation and updates
- Daily metrics calculation
- Multi-position portfolio tracking

### Paper Trading Validation
1. Create test agent with conservative limits
2. Let agent run for 1 week
3. Monitor all position exits
4. Verify metrics accuracy
5. Check trailing stops working correctly

## Success Metrics

### Phase 3 Completion Criteria
- ✅ Position monitoring service running
- ✅ All exit conditions working (stop, target, trailing, time)
- ✅ Trailing stops lock in profits correctly
- ✅ Risk metrics calculated accurately
- ✅ API endpoints for portfolio management
- ✅ Full trade lifecycle tested end-to-end

### Performance Targets
- Position update latency: <1 second
- Exit order execution: <2 seconds from trigger
- Metrics calculation: <100ms
- Monitoring overhead: <5% CPU usage

## Risk Management Enhancements

### Exit Priority Order
1. **Stop Loss**: Always highest priority (prevent catastrophic loss)
2. **Trailing Stop**: Second priority (lock in profits)
3. **Take Profit**: Third priority (capture target gains)
4. **Time Exit**: Lowest priority (cleanup stale positions)

### Slippage Protection
```typescript
// Don't execute exit if price has gapped beyond limit
const maxSlippagePercent = 2
const expectedPrice = trade.stopLoss
const actualPrice = currentPrice
const slippage = Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100

if (slippage > maxSlippagePercent) {
  logger.warn(`High slippage detected: ${slippage}%, using market order`)
  // Still exit, but log for review
}
```

### Gap Handling
- If market gaps through stop loss, exit at market open
- Log gap amount for post-trade analysis
- Adjust risk limits if frequent gap-outs occur

## Configuration Options

**Position Monitor Config** (`.env`):
```bash
# Monitoring
POSITION_MONITOR_INTERVAL_MS=5000
POSITION_UPDATE_WEBSOCKET=true

# Exit Settings
ENABLE_TRAILING_STOPS=true
DEFAULT_TRAILING_PERCENT=5
TRAILING_ACTIVATION_PERCENT=2

# Time Exits
INTRADAY_EXIT_TIME=15:55:00  # 3:55 PM ET
SWING_MAX_DAYS=5
POSITION_MAX_DAYS=20

# Slippage
MAX_SLIPPAGE_PERCENT=2
```

## Next Steps After Phase 3

**Phase 4: Agent Dashboard** (Week 7-8)
- Live trading interface
- Real-time position visualization
- Signal feed with charts
- Performance analytics charts
- Manual trade controls

**Phase 5: Intelligence Layer** (Week 9-10)
- Strategy performance tracking
- Market regime detection
- Continuous learning from trade history
- Pattern quality feedback loop

## Files to Create

1. `backend/src/services/position-monitor.service.ts`
2. `backend/src/services/trailing-stop.service.ts`
3. `backend/src/services/risk-metrics.service.ts`
4. `backend/src/api/routes/portfolio.ts` (new routes file)
5. `backend/tests/services/position-monitor.test.ts`
6. `backend/tests/services/trailing-stop.test.ts`
7. `backend/tests/services/risk-metrics.test.ts`

## Dependencies

No new dependencies required - using existing:
- TradeStation API for price updates
- SQLite for data storage
- Existing service layer

## Status

**Phase 2**: ✅ Complete (Pattern detection, AI analysis, execution)
**Phase 3**: 🔄 Ready to start (Portfolio management)

**Next Action**: Begin implementing `PositionMonitorService`
