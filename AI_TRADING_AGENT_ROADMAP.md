# AI Trading Agent Roadmap

**Last Updated:** 2025-10-27
**Status:** Planning Phase
**Goal:** Transform backtesting platform into an AI trading agent system with autonomous execution capabilities

---

## Target Architecture

**Agent Profile:**
- **Autonomy:** Semi-autonomous (executes trades within risk limits)
- **Broker:** TradeStation API (paper trading → eventual IBKR migration)
- **Strategy:** Hybrid (pattern discovery + AI optimization)
- **Timeframe:** Intraday (minutes to hours) initially, swing trading agents to follow

**Key Design Principles:**
1. **Preserves existing manual functionality** - Agent features are additive, not replacement
2. **Multi-agent ready** - Architecture supports multiple competing agents from day one
3. **Safety-first** - Multiple risk checks before execution
4. **Full observability** - Every decision logged with AI reasoning
5. **Human oversight** - Dashboard shows everything, kill switch always available

---

## Current State (Phase 4 Complete)

✅ **Existing Infrastructure:**
- Dual-mode pattern scanner (SQL + AI)
- Claude visual analysis with strategy recommendations
- Batch backtesting across multiple strategies and samples
- Automatic intraday data fetching (Polygon API)
- Chart generation and caching
- Backtest sets management
- Database schema with market data, strategies, and results

**What We Have:**
- Historical pattern discovery tools
- Backtesting validation framework
- Claude AI integration for strategy generation
- 5-minute intraday data pipeline

**What We Need:**
- Real-time data streaming
- Live trade execution
- Portfolio management
- Risk monitoring
- Agent decision engine

---

## Phase 1: Real-Time Foundation (Week 1-2)

### 1.1 Real-Time Data Pipeline

**Objective:** Stream live market data for pattern detection

**Implementation:**
- WebSocket integration with Polygon.io for live 1-min/5-min bars
- Real-time OHLCV data ingestion and storage
- Market hours detection (pre-market, regular, after-hours)
- Trading session management
- Data quality monitoring (detect stale/incorrect feeds)

**New Services:**
```typescript
// backend/src/services/realtime-data.service.ts
- connectToPolygonWebSocket()
- subscribeToTickers(tickers: string[])
- handleBarUpdate(bar: OHLCVBar)
- detectMarketHours()
- validateDataQuality()
```

**Database Changes:**
```sql
CREATE TABLE realtime_bars (
  ticker TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume INTEGER,
  timeframe TEXT,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, timestamp, timeframe)
);

CREATE INDEX idx_realtime_bars_ticker_time
  ON realtime_bars(ticker, timestamp);
```

### 1.2 TradeStation API Integration

**Objective:** Connect to paper trading account for order execution

**Implementation:**
- OAuth 2.0 authentication flow
- Paper account connection and validation
- Order placement (market, limit, stop, stop-limit)
- Position and account status monitoring
- Order execution confirmation handling
- Fill price and timing capture

**New Services:**
```typescript
// backend/src/services/tradestation.service.ts
- authenticate()
- getAccountInfo()
- placeOrder(order: Order)
- cancelOrder(orderId: string)
- getPositions()
- getOrderStatus(orderId: string)
- streamAccountUpdates()
```

**Environment Variables:**
```env
TRADESTATION_API_KEY=your_key
TRADESTATION_API_SECRET=your_secret
TRADESTATION_ACCOUNT_ID=your_paper_account_id
TRADESTATION_REDIRECT_URI=http://localhost:3000/auth/callback
```

### 1.3 Database Extensions

**New Tables:**
```sql
-- Live pattern detections
CREATE TABLE live_signals (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  detection_time TIMESTAMP NOT NULL,
  signal_data TEXT,  -- JSON: prices, indicators, etc.
  status TEXT DEFAULT 'DETECTED',  -- DETECTED, ANALYZING, EXECUTED, REJECTED, EXPIRED
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI trade recommendations
CREATE TABLE trade_recommendations (
  id TEXT PRIMARY KEY,
  signal_id TEXT,
  agent_id TEXT,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,  -- LONG, SHORT
  entry_price REAL,
  position_size INTEGER,
  stop_loss REAL,
  take_profit REAL,
  confidence_score INTEGER,
  reasoning TEXT,  -- Claude's explanation
  status TEXT DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED, EXECUTED
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (signal_id) REFERENCES live_signals(id)
);

-- Executed trades (live/paper)
CREATE TABLE executed_trades (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  recommendation_id TEXT,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_time TIMESTAMP,
  entry_price REAL,
  position_size INTEGER,
  exit_time TIMESTAMP,
  exit_price REAL,
  pnl REAL,
  pnl_percent REAL,
  stop_loss REAL,
  take_profit REAL,
  exit_reason TEXT,  -- STOP_HIT, TARGET_HIT, TIME_EXIT, MANUAL_EXIT
  tradestation_order_id TEXT,
  status TEXT DEFAULT 'OPEN',  -- OPEN, CLOSED
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recommendation_id) REFERENCES trade_recommendations(id)
);

-- Portfolio state per agent
CREATE TABLE portfolio_state (
  agent_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  cash REAL DEFAULT 0,
  positions TEXT,  -- JSON: {ticker: {shares, avgPrice, currentPrice, pnl}}
  total_equity REAL,
  daily_pnl REAL,
  open_trade_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk metrics tracking
CREATE TABLE risk_metrics (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  total_exposure REAL,
  max_drawdown REAL,
  daily_var REAL,  -- Value at Risk
  sharpe_ratio REAL,
  win_rate REAL,
  avg_win REAL,
  avg_loss REAL,
  largest_win REAL,
  largest_loss REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Deliverables:**
- ✅ Real-time data streaming from Polygon WebSocket
- ✅ TradeStation paper account connected
- ✅ Database schema ready for live trading
- ✅ Basic order placement working (market orders)

---

## Phase 2: Agent Brain (Week 3-4)

### 2.1 Pattern Recognition Engine

**Objective:** Detect patterns in real-time as they form

**Implementation:**
- Convert existing SQL scanner to real-time mode
- Pattern maturity detection (forming vs confirmed)
- Multi-timeframe confirmation (1-min, 5-min, 15-min alignment)
- Pattern quality scoring based on historical backtest win rates
- Signal deduplication (don't trigger same pattern twice)

**New Services:**
```typescript
// backend/src/services/realtime-scanner.service.ts
- scanForPatterns(bar: OHLCVBar)
- checkPatternMaturity(pattern: Pattern)
- scorePattern(pattern: Pattern): number
- multiTimeframeConfirmation(ticker: string): boolean
- emitSignal(signal: LiveSignal)
```

**Pattern Examples:**
- Gap-and-go (stock gaps up >3% with volume)
- Breakout with volume surge (breaks resistance + 3x volume)
- Intraday reversal (V-bottom with volume confirmation)
- VWAP bounce (bounces off VWAP with momentum)

### 2.2 AI Trade Optimizer

**Objective:** Claude analyzes each signal and generates optimal trade plan

**Implementation:**
- Claude Vision API integration for real-time chart analysis
- Trade plan generation (entry, exit, position size)
- Market context evaluation (trending, ranging, volatile)
- Confidence scoring (0-100)
- Risk-adjusted position sizing using Kelly Criterion

**New Services:**
```typescript
// backend/src/services/trade-optimizer.service.ts
- analyzeSignal(signal: LiveSignal): Promise<TradeRecommendation>
- generateChartForSignal(ticker: string): Buffer
- callClaudeVision(chart: Buffer, signal: LiveSignal): ClaudeAnalysis
- calculatePositionSize(confidence: number, accountEquity: number): number
- checkCorrelation(newTrade: Trade, existingPositions: Position[]): number
```

**Claude Prompt Template:**
```typescript
const prompt = `
You are analyzing a live intraday trading signal.

Ticker: ${ticker}
Pattern: ${patternType}
Current Price: ${currentPrice}
Signal Time: ${signalTime}

[Chart image shows last 2 hours of 5-min bars]

Task:
1. Evaluate if this is a high-quality setup
2. Determine optimal entry price
3. Set stop-loss level (risk management)
4. Set take-profit target (reward)
5. Recommend position size (% of account)
6. Assign confidence score (0-100)

Consider:
- Pattern quality vs historical examples
- Current market conditions (VIX, SPY trend)
- Volume and liquidity
- Time of day (avoid lunch chop, prefer first/last hour)
- Risk/reward ratio (minimum 2:1)

Return JSON:
{
  "shouldTrade": boolean,
  "confidence": number,
  "entry": { "price": number, "type": "market|limit" },
  "stopLoss": number,
  "takeProfit": number,
  "positionSize": number,
  "reasoning": "Detailed explanation",
  "risks": ["Risk 1", "Risk 2"]
}
`;
```

### 2.3 Execution Decision Engine

**Objective:** Apply risk checks and execute trades automatically

**Implementation:**
- Pre-trade risk validation
- Auto-execution if all checks pass
- Rejection logging with reason codes
- Order submission to TradeStation
- Execution confirmation handling

**Risk Checks:**
```typescript
interface RiskLimits {
  maxPositionSize: number;        // e.g., $10,000 per trade
  maxPortfolioExposure: number;   // e.g., 50% of capital
  maxDailyLoss: number;           // e.g., -$500 stop trading
  maxConcurrentPositions: number; // e.g., 5 trades max
  minConfidenceScore: number;     // e.g., 70 (0-100 scale)
  maxCorrelation: number;         // e.g., 0.7 (don't overlap similar trades)
}

async function executeTradeIfSafe(recommendation: TradeRecommendation): Promise<void> {
  const checks = [
    checkPositionSize(recommendation),
    checkPortfolioExposure(recommendation),
    checkDailyLoss(),
    checkConcurrentPositions(),
    checkConfidenceScore(recommendation),
    checkCorrelation(recommendation)
  ];

  const results = await Promise.all(checks);

  if (results.every(r => r.passed)) {
    await executeOrder(recommendation);
    logger.info('✅ Trade executed:', recommendation);
  } else {
    const failures = results.filter(r => !r.passed);
    logger.warn('❌ Trade rejected:', failures.map(f => f.reason));
    await logRejection(recommendation, failures);
  }
}
```

**Deliverables:**
- ✅ Real-time pattern scanner running continuously
- ✅ Claude analyzes every signal with chart
- ✅ Risk checks prevent unsafe trades
- ✅ Auto-execution working with full audit trail

---

## Phase 3: Portfolio Management (Week 5-6)

### 3.1 Position Manager

**Objective:** Monitor open trades and manage exits

**Implementation:**
- Real-time P&L tracking per position
- Stop-loss monitoring (exit if hit)
- Take-profit monitoring (exit if hit)
- Trailing stop implementation
- Time-based exits (e.g., close all positions at 3:55 PM for day trades)
- Partial exits (scale out at targets)

**New Services:**
```typescript
// backend/src/services/position-manager.service.ts
- monitorPositions(): Promise<void>  // Runs every 30 seconds
- checkStopLoss(position: Position, currentPrice: number): boolean
- checkTakeProfit(position: Position, currentPrice: number): boolean
- updateTrailingStop(position: Position, currentPrice: number): void
- closePosition(position: Position, reason: string): Promise<void>
- scaleOut(position: Position, percent: number): Promise<void>
```

**Exit Logic:**
```typescript
async function monitorPositions() {
  const openPositions = await getOpenPositions();

  for (const position of openPositions) {
    const currentPrice = await getCurrentPrice(position.ticker);

    // Check stop loss
    if (position.side === 'LONG' && currentPrice <= position.stopLoss) {
      await closePosition(position, 'STOP_HIT');
      continue;
    }

    // Check take profit
    if (position.side === 'LONG' && currentPrice >= position.takeProfit) {
      await closePosition(position, 'TARGET_HIT');
      continue;
    }

    // Check time exit (intraday only)
    if (isEndOfDay() && position.isIntraday) {
      await closePosition(position, 'TIME_EXIT');
      continue;
    }

    // Update trailing stop if in profit
    if (position.trailingStop && currentPrice > position.entryPrice * 1.02) {
      updateTrailingStop(position, currentPrice);
    }
  }
}
```

### 3.2 Risk Manager

**Objective:** Monitor portfolio-level risk and enforce limits

**Implementation:**
- Calculate portfolio exposure in real-time
- Track daily P&L and stop trading if limit hit
- Calculate rolling Sharpe ratio
- Max drawdown tracking
- Dynamic position sizing based on recent performance

**Risk Metrics:**
```typescript
interface PortfolioRisk {
  totalExposure: number;        // Sum of all position values
  netDelta: number;             // Net long/short exposure
  dailyPnL: number;             // Today's realized + unrealized P&L
  dailyPnLPercent: number;      // P&L as % of account equity
  maxDrawdown: number;          // Peak to trough
  sharpeRatio: number;          // Rolling 30-day
  winRate: number;              // Last 30 trades
  avgWin: number;
  avgLoss: number;
}

async function checkRiskLimits(): Promise<RiskStatus> {
  const metrics = await calculatePortfolioRisk();

  // Emergency stop if daily loss limit hit
  if (metrics.dailyPnL <= -config.maxDailyLoss) {
    await pauseAgent('DAILY_LOSS_LIMIT_HIT');
    await sendAlert('🚨 Agent paused: Daily loss limit reached');
    return { safe: false, reason: 'Daily loss limit' };
  }

  // Reduce position sizes if losing streak
  if (metrics.winRate < 0.4 && recentTrades.length >= 10) {
    await reducePositionSizes(0.5);  // Cut sizes in half
    await sendAlert('⚠️ Position sizes reduced due to losing streak');
  }

  return { safe: true };
}
```

### 3.3 Trade Lifecycle Management

**Objective:** Handle full trade lifecycle from entry to exit

**State Machine:**
```
SIGNAL_DETECTED → ANALYZING → APPROVED → ORDERING → FILLED → OPEN → CLOSING → CLOSED
                              ↓
                           REJECTED
```

**Implementation:**
```typescript
// backend/src/services/trade-lifecycle.service.ts
class TradeLifecycle {
  async processSignal(signal: LiveSignal) {
    // 1. Signal detected
    await updateSignalStatus(signal.id, 'ANALYZING');

    // 2. Claude analysis
    const recommendation = await tradeOptimizer.analyzeSignal(signal);

    if (!recommendation.shouldTrade) {
      await updateSignalStatus(signal.id, 'REJECTED');
      await logRejection(signal, recommendation.reasoning);
      return;
    }

    // 3. Risk checks
    const riskCheck = await executionEngine.validateRisk(recommendation);

    if (!riskCheck.passed) {
      await updateSignalStatus(signal.id, 'REJECTED');
      await logRejection(signal, riskCheck.failures);
      return;
    }

    // 4. Place order
    await updateSignalStatus(signal.id, 'ORDERING');
    const order = await tradestationService.placeOrder(recommendation);

    // 5. Wait for fill
    const fill = await waitForFill(order.orderId, timeout = 60000);

    if (!fill) {
      await cancelOrder(order.orderId);
      await updateSignalStatus(signal.id, 'REJECTED');
      return;
    }

    // 6. Create position record
    const position = await createPosition(fill);
    await updateSignalStatus(signal.id, 'EXECUTED');

    // 7. Monitor position (handled by position manager)
    await positionManager.addToMonitoring(position);
  }
}
```

**Deliverables:**
- ✅ Position monitoring with stop/target management
- ✅ Portfolio risk tracking and limits
- ✅ Full trade lifecycle automation
- ✅ Emergency stop mechanism working

---

## Phase 4: Agent Dashboard (Week 7-8)

### 4.1 Live Trading Interface

**New Frontend Pages:**

#### 📊 Agent Status Dashboard
```typescript
// frontend/src/components/AgentDashboard.tsx
interface AgentDashboard {
  agentStatus: 'RUNNING' | 'PAUSED' | 'STOPPED';
  currentPositions: Position[];
  todayTrades: Trade[];
  liveSignals: LiveSignal[];
  riskMetrics: RiskMetrics;
  performance: {
    dailyPnL: number;
    weeklyPnL: number;
    monthlyPnL: number;
    winRate: number;
    sharpeRatio: number;
  };
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  🤖 Agent: Intraday Momentum Hunter          [●] RUNNING    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Portfolio                      Risk Metrics                │
│  ─────────                      ────────────                │
│  Equity: $103,240 (+3.2%)       Exposure: 42% ✅           │
│  Cash: $58,760                  Daily P&L: +$780 ✅        │
│  Positions: 3/5                 Max DD: -2.1% ✅            │
│                                 Win Rate: 64% ✅            │
│                                                             │
│  Open Positions                                             │
│  ──────────────                                             │
│  TSLA  100 @ $242.50  →  $245.80  +$330 (+1.4%)  [Close]  │
│  NVDA   50 @ $485.20  →  $487.10  +$ 95 (+0.4%)  [Close]  │
│  AMD   200 @ $ 98.30  →  $ 99.50  +$240 (+1.2%)  [Close]  │
│                                                             │
│  Today's Trades (5 closed)                                  │
│  ──────────────────────                                     │
│  ✅ AAPL  +$340  (Entry: $178.20, Exit: $179.90, +0.95%)   │
│  ✅ META  +$220  (Entry: $321.50, Exit: $323.30, +0.56%)   │
│  ❌ GOOGL -$180  (Entry: $142.80, Exit: $141.60, -0.84%)   │
│                                                             │
│  Active Signals (2 monitoring)                              │
│  ─────────────────────────                                  │
│  🔔 ROKU - Gap and Go - Analyzing...                       │
│  👁️  SPY  - VWAP Bounce - Watching for confirmation        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 🔔 Trade Recommendations
```typescript
// frontend/src/components/TradeRecommendations.tsx
interface RecommendationCard {
  id: string;
  ticker: string;
  pattern: string;
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  reasoning: string;
  chart: string;  // base64 image
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
}
```

**UI:**
```
┌─────────────────────────────────────────────────────────────┐
│  🎯 Trade Recommendations                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TSLA - Breakout with Volume Surge                         │
│  Confidence: 82/100  ⭐⭐⭐⭐                                │
│  ─────────────────────────────────────                      │
│  Entry:  $245.50 (Limit)                                   │
│  Stop:   $242.00 (-1.4%)                                   │
│  Target: $252.00 (+2.6%)                                   │
│  R:R:    1.9:1                                             │
│                                                             │
│  [Chart showing 5-min bars with breakout pattern]          │
│                                                             │
│  Claude's Analysis:                                         │
│  "Clean breakout above $244 resistance with 4x volume.     │
│   Price consolidating just above breakout level - good     │
│   for entry. SPY trending up, VIX low. First hour of       │
│   trading - high liquidity. Pattern has 76% win rate       │
│   historically. Recommend 100 shares ($24,550 position)."  │
│                                                             │
│  Risks:                                                     │
│  • Could be false breakout (low volume after initial surge)│
│  • Near market open (higher volatility)                    │
│                                                             │
│  [Execute] [Reject] [Modify]                               │
│                                                             │
│  Status: ⏳ Pending approval (Auto-exec in 30s)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 📈 Portfolio View
```typescript
// frontend/src/components/PortfolioView.tsx
- Equity curve (real-time)
- Position breakdown (pie chart)
- Risk exposure heatmap
- Performance attribution (which patterns winning?)
- Trade history calendar
```

### 4.2 Controls & Configuration

**Agent Control Panel:**
```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️  Agent Configuration                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent Status                                               │
│  ────────────                                               │
│  [●] RUNNING    [ ] PAUSED    [ ] STOPPED                  │
│                                                             │
│  🚨 Emergency Stop  [STOP ALL TRADING]                      │
│                                                             │
│  Risk Limits                                                │
│  ───────────                                                │
│  Max Position Size:    [$10,000  ] per trade              │
│  Max Daily Loss:       [$   500  ] stop trading           │
│  Max Concurrent Positions: [5] trades                      │
│  Min Confidence Score: [70]% (0-100)                       │
│                                                             │
│  Active Strategies                                          │
│  ─────────────────                                          │
│  ✅ Breakout with Volume Surge                             │
│  ✅ Gap and Go                                             │
│  ✅ VWAP Bounce                                            │
│  ⬜ Intraday Reversal (disabled - testing)                 │
│  ⬜ Opening Range Breakout (disabled - low win rate)       │
│                                                             │
│  Trading Hours                                              │
│  ─────────────                                              │
│  Market Open: 9:30 AM   First Trade: [9:45 AM]            │
│  Market Close: 4:00 PM  Last Trade:  [3:30 PM]            │
│                                                             │
│  [Save Configuration]  [Reset to Defaults]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Monitoring & Alerts

**Real-time Updates:**
- WebSocket connection to backend
- Live position P&L updates (every 30 seconds)
- Signal notifications (toast/sound)
- Trade execution confirmations
- Risk alerts (approaching limits)

**Notification System:**
```typescript
// backend/src/services/notification.service.ts
interface Notification {
  type: 'SIGNAL' | 'TRADE' | 'RISK_ALERT' | 'EXECUTION' | 'ERROR';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data?: any;
}

async function sendNotification(notification: Notification) {
  // Frontend WebSocket
  await wsService.broadcast('notification', notification);

  // Email (critical only)
  if (notification.priority === 'CRITICAL') {
    await emailService.send({
      to: config.alertEmail,
      subject: `🚨 ${notification.type}`,
      body: notification.message
    });
  }

  // SMS (critical only, optional)
  if (config.smsEnabled && notification.priority === 'CRITICAL') {
    await smsService.send(notification.message);
  }

  // Slack webhook (optional)
  if (config.slackWebhook) {
    await axios.post(config.slackWebhook, {
      text: notification.message,
      attachments: notification.data
    });
  }
}
```

**Alert Examples:**
- 🔔 "New signal: TSLA breakout detected (82% confidence)"
- ✅ "Trade executed: Bought 100 TSLA @ $245.50"
- 🎯 "Target hit: Sold 100 TSLA @ $252.00 (+$650)"
- ⚠️ "Risk warning: 4/5 positions open"
- 🚨 "CRITICAL: Daily loss limit approaching (-$450 / -$500)"
- ❌ "Stop hit: Sold 50 NVDA @ $483.20 (-$100)"

**Deliverables:**
- ✅ Agent dashboard with live positions and P&L
- ✅ Trade recommendation feed with Claude analysis
- ✅ Configuration panel for risk limits and strategies
- ✅ Real-time alerts via WebSocket, email, SMS

---

## Phase 5: Intelligence Layer (Week 9-10)

### 5.1 Strategy Performance Tracking

**Objective:** Monitor which patterns are working in live trading

**Implementation:**
- Compare live results vs backtest expectations
- Track pattern hit rate over time
- Detect edge degradation early
- Auto-disable underperforming patterns

**Pattern Performance Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│  📊 Strategy Performance (Last 30 Days)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pattern                    Trades  Win%  Avg P&L  Status  │
│  ──────────────────────────────────────────────────────────│
│  Breakout + Volume Surge      23   65%   +$142    ✅ Active│
│  Gap and Go                   18   72%   +$186    ✅ Active│
│  VWAP Bounce                  15   53%   +$ 45    ⚠️  Watch │
│  Opening Range Breakout        8   25%   -$ 78    ❌ Paused│
│                                                             │
│  Backtest vs Live Comparison                                │
│  ───────────────────────────                                │
│  Pattern: Breakout + Volume Surge                           │
│  Backtest Win Rate: 68% ✅                                  │
│  Live Win Rate:     65% ✅ (within expected variance)      │
│                                                             │
│  Pattern: Opening Range Breakout                            │
│  Backtest Win Rate: 61% ⚠️                                 │
│  Live Win Rate:     25% ❌ (significant degradation!)      │
│  → Auto-disabled after 8 consecutive losses                │
│                                                             │
│  [View Detailed Analytics]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Auto-disable Logic:**
```typescript
async function checkPatternHealth() {
  const patterns = await getActivePatterns();

  for (const pattern of patterns) {
    const liveStats = await getLiveStats(pattern.id, days = 30);
    const backtestStats = await getBacktestStats(pattern.id);

    // Check if win rate significantly worse than backtest
    const winRateGap = backtestStats.winRate - liveStats.winRate;

    if (winRateGap > 0.20) {  // 20% worse
      await disablePattern(pattern.id);
      await sendAlert(`⚠️ Pattern disabled: ${pattern.name} (live ${liveStats.winRate}% vs backtest ${backtestStats.winRate}%)`);
    }

    // Check for losing streak
    const recentTrades = await getRecentTrades(pattern.id, limit = 10);
    const consecutiveLosses = countConsecutiveLosses(recentTrades);

    if (consecutiveLosses >= 5) {
      await pausePattern(pattern.id);
      await sendAlert(`🚨 Pattern paused: ${pattern.name} (5 consecutive losses)`);
    }
  }
}
```

### 5.2 Market Regime Detection

**Objective:** Adapt trading strategies to current market conditions

**Implementation:**
- Daily market analysis by Claude
- Regime classification (trending, ranging, volatile, quiet)
- Strategy selection based on regime
- Position sizing adjustment by volatility

**Claude Market Analysis Prompt:**
```typescript
const marketAnalysisPrompt = `
Analyze current market conditions:

Market Data (Last 5 Days):
- SPY: ${spyData}
- VIX: ${vixData}
- Volume: ${volumeData}
- Sector Performance: ${sectorData}

Recent News Headlines:
${newsHeadlines}

Questions:
1. What is the current market regime?
   - Trending up/down?
   - Range-bound?
   - High/low volatility?
   - Risk-on or risk-off?

2. Which trading strategies are best suited for this environment?
   - Breakouts (trending markets)
   - Mean reversion (ranging markets)
   - Momentum (strong trends)

3. Should we adjust position sizes?
   - VIX > 20 → reduce size
   - VIX < 15 → normal size

4. Any sectors showing unusual strength/weakness?

5. Recommended risk level for today (Conservative/Normal/Aggressive)?

Return JSON:
{
  "regime": "trending_up" | "trending_down" | "ranging" | "volatile",
  "confidence": number,
  "recommendedStrategies": string[],
  "positionSizeMultiplier": number,
  "riskLevel": "conservative" | "normal" | "aggressive",
  "reasoning": string
}
`;
```

**Regime-Based Strategy Selection:**
```typescript
async function adjustStrategiesForRegime() {
  const regime = await detectMarketRegime();

  if (regime.type === 'trending_up') {
    // Enable momentum and breakout strategies
    await enablePattern('breakout-volume-surge');
    await enablePattern('gap-and-go');
    await disablePattern('mean-reversion-short');
  }

  if (regime.type === 'ranging') {
    // Enable mean reversion, disable breakouts
    await enablePattern('vwap-bounce');
    await enablePattern('oversold-bounce');
    await disablePattern('breakout-volume-surge');
  }

  if (regime.volatility === 'high') {
    // Reduce position sizes by 50%
    await updateRiskLimits({
      positionSizeMultiplier: 0.5
    });
  }

  logger.info(`📊 Strategies adjusted for ${regime.type} regime`);
}
```

### 5.3 Continuous Learning

**Objective:** Agent improves over time based on results

**Implementation:**
- Nightly batch analysis of day's trades
- Update pattern quality scores
- Identify new patterns from winning trades
- Generate improvement recommendations

**Nightly Analysis:**
```typescript
async function nightlyReview() {
  const todayTrades = await getTodayTrades();

  // 1. Performance summary
  const summary = {
    totalTrades: todayTrades.length,
    winners: todayTrades.filter(t => t.pnl > 0).length,
    losers: todayTrades.filter(t => t.pnl < 0).length,
    totalPnL: sum(todayTrades.map(t => t.pnl)),
    avgWin: avg(todayTrades.filter(t => t.pnl > 0).map(t => t.pnl)),
    avgLoss: avg(todayTrades.filter(t => t.pnl < 0).map(t => t.pnl))
  };

  // 2. Claude analysis
  const analysis = await claudeAnalyze(`
    Review today's trading:

    Trades: ${todayTrades.length}
    Win Rate: ${(summary.winners / summary.totalTrades * 100).toFixed(1)}%
    P&L: $${summary.totalPnL.toFixed(2)}

    Winners (${summary.winners}):
    ${todayTrades.filter(t => t.pnl > 0).map(formatTrade)}

    Losers (${summary.losers}):
    ${todayTrades.filter(t => t.pnl < 0).map(formatTrade)}

    Questions:
    1. What did the winning trades have in common?
    2. What patterns should we avoid?
    3. Were there any execution issues (bad fills, late entries)?
    4. Should we adjust any parameters?
    5. Recommendations for tomorrow?
  `);

  // 3. Update pattern scores
  await updatePatternScores(todayTrades);

  // 4. Send report
  await sendReport({
    summary,
    analysis,
    recommendations: analysis.recommendations
  });

  logger.info('📝 Nightly review complete');
}
```

**Weekly Strategy Review:**
```typescript
async function weeklyReview() {
  const weekTrades = await getWeekTrades();

  const review = await claudeAnalyze(`
    Weekly trading review:

    This Week:
    - Trades: ${weekTrades.length}
    - Win Rate: ${calculateWinRate(weekTrades)}%
    - Total P&L: $${calculateTotalPnL(weekTrades)}
    - Sharpe Ratio: ${calculateSharpe(weekTrades)}

    By Strategy:
    ${formatStrategyBreakdown(weekTrades)}

    Questions:
    1. Which strategies performed best/worst?
    2. Any patterns showing edge degradation?
    3. Should we add/remove any strategies?
    4. Are we properly sized for current volatility?
    5. Any new patterns worth backtesting?

    Provide:
    - Strategy rankings
    - Disable recommendations
    - New pattern ideas
    - Risk adjustment recommendations
  `);

  await applyWeeklyAdjustments(review);
}
```

**Deliverables:**
- ✅ Pattern performance tracking vs backtests
- ✅ Market regime detection with strategy adaptation
- ✅ Nightly and weekly AI-powered reviews
- ✅ Continuous improvement loop

---

## Phase 6: Production Readiness (Week 11-12)

### 6.1 Robustness & Reliability

**Connection Failure Handling:**
```typescript
class ReconnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  async handleDisconnection(service: string) {
    logger.error(`❌ ${service} disconnected`);

    // Pause trading during reconnection
    await pauseAgent('CONNECTION_LOST');

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);

      logger.info(`🔄 Reconnecting to ${service} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      await sleep(delay);

      try {
        await this.reconnect(service);
        logger.info(`✅ ${service} reconnected`);
        this.reconnectAttempts = 0;

        // Verify agent state before resuming
        await verifyAgentState();
        await resumeAgent();
        return;
      } catch (error) {
        logger.error(`Failed to reconnect: ${error.message}`);
      }
    }

    // Max attempts reached - critical alert
    await sendCriticalAlert(`🚨 Failed to reconnect to ${service} after ${this.maxReconnectAttempts} attempts`);
    await stopAgent('CONNECTION_FAILURE');
  }
}
```

**Data Feed Validation:**
```typescript
class DataValidator {
  private lastBarTime: Map<string, number> = new Map();

  validateBar(ticker: string, bar: OHLCVBar): boolean {
    // Check for stale data
    const now = Date.now();
    const barAge = now - bar.timestamp;

    if (barAge > 60000) {  // More than 1 minute old
      logger.warn(`⚠️ Stale data for ${ticker}: ${barAge}ms old`);
      return false;
    }

    // Check for duplicate bars
    const lastTime = this.lastBarTime.get(ticker);
    if (lastTime === bar.timestamp) {
      logger.warn(`⚠️ Duplicate bar for ${ticker}`);
      return false;
    }

    // Check for gaps
    if (lastTime && bar.timestamp - lastTime > 300000) {  // 5 min gap
      logger.warn(`⚠️ Data gap for ${ticker}: ${(bar.timestamp - lastTime) / 1000}s`);
    }

    // Check for invalid prices
    if (bar.close <= 0 || bar.high < bar.low || bar.close > bar.high || bar.close < bar.low) {
      logger.error(`❌ Invalid bar for ${ticker}:`, bar);
      return false;
    }

    this.lastBarTime.set(ticker, bar.timestamp);
    return true;
  }
}
```

**Disaster Recovery:**
```typescript
async function handleServerCrash() {
  // On restart, check for orphaned trades
  const openPositions = await tradestationService.getPositions();
  const dbPositions = await database.getOpenPositions();

  // Find positions not in database (opened during crash?)
  const orphaned = openPositions.filter(pos =>
    !dbPositions.find(dbPos => dbPos.ticker === pos.ticker)
  );

  if (orphaned.length > 0) {
    logger.warn(`⚠️ Found ${orphaned.length} orphaned positions:`, orphaned);

    // Add to database with unknown entry price
    for (const pos of orphaned) {
      await database.insertPosition({
        ticker: pos.ticker,
        shares: pos.shares,
        entryPrice: pos.avgPrice,  // Use current avg price
        entryTime: new Date(),
        status: 'OPEN',
        note: 'Recovered after server restart'
      });
    }
  }

  // Verify all database positions still exist
  for (const dbPos of dbPositions) {
    const exists = openPositions.find(pos => pos.ticker === dbPos.ticker);

    if (!exists) {
      logger.warn(`⚠️ Position ${dbPos.ticker} in database but not in broker`);
      // Was it closed externally?
      await database.updatePosition(dbPos.id, {
        status: 'CLOSED',
        exitTime: new Date(),
        exitReason: 'EXTERNAL_CLOSE'
      });
    }
  }

  logger.info('✅ Disaster recovery complete');
}
```

**Audit Trail:**
```typescript
// Log every decision with full context
async function logDecision(decision: Decision) {
  await database.insert('audit_log', {
    timestamp: new Date(),
    type: decision.type,
    ticker: decision.ticker,
    action: decision.action,
    reasoning: decision.reasoning,
    claudeResponse: decision.claudeResponse,
    riskChecks: decision.riskChecks,
    outcome: decision.outcome,
    metadata: JSON.stringify(decision.metadata)
  });
}

// Examples:
logDecision({
  type: 'SIGNAL_DETECTED',
  ticker: 'TSLA',
  action: 'ANALYZE',
  reasoning: 'Breakout pattern detected with 4x volume',
  metadata: { pattern: 'breakout', volume: '4.2x', price: 245.50 }
});

logDecision({
  type: 'TRADE_EXECUTION',
  ticker: 'TSLA',
  action: 'BUY',
  reasoning: 'High confidence (82%), all risk checks passed',
  claudeResponse: '...',
  riskChecks: { positionSize: 'PASS', dailyLoss: 'PASS', ... },
  outcome: 'EXECUTED'
});

logDecision({
  type: 'TRADE_REJECTION',
  ticker: 'NVDA',
  action: 'REJECT',
  reasoning: 'Max concurrent positions limit (5/5)',
  riskChecks: { concurrentPositions: 'FAIL' },
  outcome: 'REJECTED'
});
```

### 6.2 Testing & Validation

**Paper Trading Validation Period:**
```
Week 1-2: Initial testing
- Verify all patterns detected correctly
- Confirm orders placed accurately
- Check P&L calculations

Week 3-4: Performance validation
- Compare results to backtests
- Verify edge is real (not backtest overfitting)
- Monitor for execution slippage

Metrics to Track:
✅ System uptime > 99%
✅ Order fill rate > 95%
✅ Win rate within 5% of backtest
✅ Sharpe ratio > 1.0
✅ Max drawdown < 10%
✅ No critical errors
```

**Stress Testing:**
```typescript
// Simulate rapid signals
async function stressTestSignalProcessing() {
  const signals = generateRandomSignals(100);

  const startTime = Date.now();
  await Promise.all(signals.map(s => processSignal(s)));
  const endTime = Date.now();

  const avgProcessingTime = (endTime - startTime) / signals.length;

  logger.info(`Processed ${signals.length} signals in ${endTime - startTime}ms`);
  logger.info(`Average: ${avgProcessingTime.toFixed(2)}ms per signal`);

  // Should handle 100 signals in < 30 seconds
  assert(endTime - startTime < 30000, 'Signal processing too slow');
}

// Simulate connection loss during active trades
async function stressTestConnectionFailure() {
  // Open positions
  await placeTestTrades(5);

  // Disconnect data feed
  await dataService.disconnect();

  // Wait 30 seconds
  await sleep(30000);

  // Reconnect
  await dataService.reconnect();

  // Verify positions still tracked
  const positions = await getOpenPositions();
  assert(positions.length === 5, 'Lost positions during disconnect');

  // Verify P&L still updating
  await sleep(60000);
  const updatedPositions = await getOpenPositions();
  assert(updatedPositions[0].pnl !== positions[0].pnl, 'P&L not updating');
}
```

**Performance Benchmarks:**
```
Compare against:
- Buy and hold SPY
- Buy and hold QQQ
- Simple moving average crossover
- Random entry/exit

Goal: Beat all benchmarks on risk-adjusted basis (Sharpe > 1.5)
```

### 6.3 Migration to IBKR (Optional Future Phase)

**Broker Abstraction Layer:**
```typescript
// backend/src/services/broker/interface.ts
interface IBroker {
  authenticate(): Promise<void>;
  getAccount(): Promise<Account>;
  placeOrder(order: Order): Promise<OrderConfirmation>;
  cancelOrder(orderId: string): Promise<void>;
  getPositions(): Promise<Position[]>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
  streamMarketData(tickers: string[]): AsyncIterator<MarketData>;
}

// backend/src/services/broker/tradestation.service.ts
class TradestationBroker implements IBroker {
  // TradeStation-specific implementation
}

// backend/src/services/broker/ibkr.service.ts
class IBKRBroker implements IBroker {
  // IBKR-specific implementation
}

// backend/src/services/broker/factory.ts
function createBroker(type: 'tradestation' | 'ibkr'): IBroker {
  switch (type) {
    case 'tradestation':
      return new TradestationBroker();
    case 'ibkr':
      return new IBKRBroker();
  }
}
```

**Migration Steps:**
1. Implement IBKR adapter following IBroker interface
2. Test with IBKR paper account
3. Run parallel testing (TradeStation + IBKR paper) for 30 days
4. Compare results
5. Gradually migrate live capital

**Deliverables:**
- ✅ Robust error handling and auto-recovery
- ✅ Data validation preventing bad trades
- ✅ Complete audit trail for all decisions
- ✅ 30+ days paper trading validation
- ✅ Stress testing passed
- ✅ Ready for live capital (optional)

---

## Multi-Agent Support

### Architecture for Multiple Agents

**Agent Configuration:**
```typescript
interface TradingAgent {
  id: string;
  name: string;
  accountId: string;              // Different TradeStation account per agent
  timeframe: 'intraday' | 'swing' | 'position';
  strategies: string[];           // Pattern IDs to trade
  riskLimits: RiskLimits;
  active: boolean;
  createdAt: Date;
}

// Database
CREATE TABLE trading_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  timeframe TEXT NOT NULL,
  strategies TEXT NOT NULL,      -- JSON array
  risk_limits TEXT NOT NULL,     -- JSON object
  active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

// All trading tables reference agent_id
ALTER TABLE executed_trades ADD COLUMN agent_id TEXT REFERENCES trading_agents(id);
ALTER TABLE live_signals ADD COLUMN agent_id TEXT REFERENCES trading_agents(id);
ALTER TABLE portfolio_state ADD COLUMN agent_id TEXT REFERENCES trading_agents(id);
```

### Example: Intraday vs Swing Agents

```typescript
const agents = [
  {
    id: 'agent-intraday-1',
    name: 'Intraday Momentum Hunter',
    accountId: 'TS_PAPER_001',
    timeframe: 'intraday',
    strategies: [
      'breakout-volume-surge',
      'gap-and-go',
      'vwap-bounce'
    ],
    riskLimits: {
      maxPositionSize: 10000,
      maxDailyLoss: 500,
      maxConcurrentPositions: 5,
      minConfidenceScore: 75
    }
  },
  {
    id: 'agent-swing-1',
    name: 'Swing Mean Reversion',
    accountId: 'TS_PAPER_002',
    timeframe: 'swing',
    strategies: [
      'hyperbolic-short',
      'oversold-bounce',
      'daily-reversal'
    ],
    riskLimits: {
      maxPositionSize: 20000,
      maxDailyLoss: 1000,
      maxConcurrentPositions: 3,
      minConfidenceScore: 70
    }
  },
  {
    id: 'agent-swing-2',
    name: 'Swing Trend Following',
    accountId: 'TS_PAPER_003',
    timeframe: 'swing',
    strategies: [
      'daily-breakout',
      'weekly-momentum',
      'sector-rotation'
    ],
    riskLimits: {
      maxPositionSize: 25000,
      maxDailyLoss: 1200,
      maxConcurrentPositions: 4,
      minConfidenceScore: 70
    }
  }
];
```

### Agent Comparison Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  🏆 Agent Performance Leaderboard (Last 30 Days)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Rank  Agent                    Trades  Win%    P&L   Sharpe│
│  ────  ─────────────────────────────────────────────────────│
│   🥇   Swing Mean Reversion        18   72%  +$2,100   2.1 │
│   🥈   Intraday Momentum          127   61%  +$3,240   1.8 │
│   🥉   Swing Trend Following       15   53%  +$  890   1.2 │
│                                                             │
│  [Equity Curves Chart - All Agents]                         │
│  [Correlation Matrix]                                       │
│  [Strategy Attribution Breakdown]                           │
│                                                             │
│  Agent Competition Mode: Enabled                            │
│  Capital Allocation:                                        │
│  • Swing MR:      40% ($40k) - Top performer               │
│  • Intraday:      35% ($35k) - High volume, good Sharpe    │
│  • Swing TF:      25% ($25k) - Probation (low Sharpe)      │
│                                                             │
│  Recommendation: Allocate more capital to Swing MR          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Signal Routing to Multiple Agents

```typescript
async function processSignal(signal: LiveSignal) {
  // Find agents interested in this pattern
  const interestedAgents = await getInterestedAgents(signal.patternType);

  logger.info(`📡 Signal detected: ${signal.ticker} - ${signal.patternType}`);
  logger.info(`   ${interestedAgents.length} agent(s) interested`);

  // Each agent evaluates independently
  const evaluations = await Promise.all(
    interestedAgents.map(async agent => {
      const recommendation = await analyzeSignalForAgent(agent, signal);
      return { agent, recommendation };
    })
  );

  // Execute trades for each agent that approves
  for (const { agent, recommendation } of evaluations) {
    if (recommendation.shouldTrade) {
      await executeTradeForAgent(agent, recommendation);
    }
  }
}
```

### Agent Competition Framework

```typescript
async function weeklyCompetition() {
  const agents = await getAllAgents();
  const performances = await Promise.all(
    agents.map(async agent => ({
      agent,
      metrics: await calculateAgentMetrics(agent.id, days = 30)
    }))
  );

  // Rank by Sharpe ratio
  performances.sort((a, b) => b.metrics.sharpe - a.metrics.sharpe);

  // Reallocate capital based on performance
  const totalCapital = 100000;
  const allocations = allocateCapitalByPerformance(performances, totalCapital);

  // Claude analysis
  const analysis = await claudeAnalyze(`
    Agent competition results:

    ${performances.map(p => `
      ${p.agent.name}:
      - Trades: ${p.metrics.totalTrades}
      - Win Rate: ${p.metrics.winRate}%
      - Sharpe: ${p.metrics.sharpe}
      - Max DD: ${p.metrics.maxDrawdown}%
    `).join('\n')}

    Questions:
    1. Which agent strategies are working best?
    2. Are any agents underperforming and should be paused?
    3. Should we adjust capital allocations?
    4. Any new strategy ideas based on winning patterns?
  `);

  // Apply recommendations
  await applyCompetitionResults(allocations, analysis);

  // Send report
  await sendWeeklyReport({
    rankings: performances,
    allocations,
    analysis
  });
}
```

### Benefits of Multi-Agent Design

1. **Risk Diversification**
   - Different timeframes (intraday, swing, position)
   - Different strategy types (momentum, mean reversion, trend)
   - Uncorrelated returns

2. **A/B Testing**
   - Same pattern, different parameters
   - Compare execution approaches
   - Test risk management variations

3. **Market Regime Adaptation**
   - Trending markets → trend-following agent performs better
   - Choppy markets → mean-reversion agent shines
   - Automatically shift capital to winning agents

4. **Easy Scaling**
   - Add new agent = new config + new account
   - Disable underperformers without affecting others
   - Clone successful agents with parameter tweaks

---

## Preserving Manual Functionality

### Current Workflow (Preserved)
```
User Manual Actions:
1. Scanner (historical pattern search)
2. Save results to Backtest Sets
3. Visual Analysis (Claude analyzes 1-3 samples)
4. Batch Backtest (test strategies across samples)
5. Review results, refine strategies
```

### Agent Workflow (Added)
```
Automated Agent Actions:
1. Real-time scanner detects patterns
2. AI analyzes signal with chart
3. Risk checks validate safety
4. Auto-execute if approved
5. Monitor position and exit
6. Nightly review and learning
```

### Shared Infrastructure
- Pattern definitions (same patterns used by manual and agent)
- Claude visual analysis
- Backtest validation system
- Database and chart services
- Risk management rules

### UI Organization
```
Navigation:
├── 📊 Scanner (existing - manual mode)
│   ├── SQL Scanner
│   ├── Natural Language Scanner
│   └── Scan History
│
├── 🎨 Visual Analysis (existing - Claude chart analysis)
│   └── Analysis Results
│
├── 📁 Backtest Sets (existing - sample management)
│   ├── Create Set
│   ├── Manage Samples
│   └── Batch Backtest
│
├── 🤖 Trading Agent (NEW)
│   ├── Dashboard (live positions, P&L, status)
│   ├── Signals (patterns being monitored)
│   ├── Recommendations (AI trade ideas)
│   ├── Configuration (risk limits, strategies)
│   └── Performance (agent analytics)
│
└── 📈 Portfolio (NEW)
    ├── All Positions (manual + agent)
    ├── Trade History
    ├── Performance Attribution
    └── Risk Analytics
```

### Benefits of Dual Mode

1. **Research & Development**
   - Manual mode for discovering new patterns
   - Backtest validation before giving to agent
   - Compare manual discretionary vs agent performance

2. **Gradual Rollout**
   - Start with manual mode (current state)
   - Add agent for proven strategies only
   - Expand agent capabilities over time

3. **Human Oversight**
   - Monitor agent decisions in real-time
   - Override if needed
   - Learn from agent's successes/failures

4. **Hybrid Approach**
   - Agent handles high-frequency patterns
   - Human handles complex discretionary setups
   - Best of both worlds

---

## Implementation Roadmap

### Stage 1: Single Intraday Agent (Weeks 1-12)
Build complete infrastructure with one agent:
- Real-time data and execution
- Pattern detection and AI analysis
- Risk management and monitoring
- Dashboard and controls
- 30-day paper trading validation

### Stage 2: Add Swing Agent (Week 13)
Leverage existing infrastructure:
- Create swing agent configuration
- Add daily timeframe patterns
- Connect second TradeStation account
- Add agent comparison dashboard
- Run both agents in parallel

### Stage 3: Agent Competition (Weeks 14-15)
Framework for multiple competing agents:
- Performance attribution
- Dynamic capital allocation
- Agent tournament mode
- Strategy cross-pollination (share winning patterns)
- Automated agent optimization

### Stage 4: Production (Week 16+)
Deploy to live capital (optional):
- Start with small capital ($5-10k)
- Scale gradually based on performance
- Consider IBKR migration
- Add more agents/strategies

---

## Success Metrics

### Phase 1-3: System Reliability
- ✅ Uptime > 99%
- ✅ No critical errors
- ✅ Orders execute correctly
- ✅ Positions tracked accurately
- ✅ P&L calculations correct

### Phase 4-5: Agent Activity
- ✅ Detecting 10+ signals per day
- ✅ Executing 3-5 trades per day
- ✅ Following risk limits
- ✅ All patterns being monitored

### Phase 6: Edge Validation (30-Day Paper Trading)
- ✅ Win rate > 55%
- ✅ Sharpe ratio > 1.0
- ✅ Max drawdown < 10%
- ✅ Results within 10% of backtest expectations
- ✅ No systematic execution issues

### Production (Optional)
- ✅ Beating buy-and-hold SPY (risk-adjusted)
- ✅ Consistent positive returns
- ✅ Agents competing effectively
- ✅ Continuous improvement evident

---

## Next Steps

### Immediate Actions (Week 1)
1. **Set up TradeStation API credentials**
   - Create developer account
   - Get API keys
   - Set up OAuth flow
   - Test paper account connection

2. **Polygon WebSocket Integration**
   - Implement real-time data streaming
   - Create signal queue
   - Test pattern detection in real-time

3. **Database Schema Updates**
   - Add tables for live signals, trades, portfolio
   - Migrate existing data if needed
   - Set up indexes for performance

4. **Basic Agent Loop**
   - Pattern detection → signal queue
   - Claude analysis → recommendation
   - Risk check → execute/reject
   - Log everything

### First Milestone (End of Week 2)
- ✅ Real-time data streaming working
- ✅ Paper trades executing successfully
- ✅ Agent dashboard showing live positions
- ✅ Risk limits being enforced
- ✅ Ready to start pattern monitoring

---

## Technical Stack

**Backend:**
- Existing: Node.js, TypeScript, Express, SQLite
- New: WebSocket (Polygon), TradeStation REST API

**Frontend:**
- Existing: React 18, TypeScript, Vite, TailwindCSS
- New: WebSocket (real-time updates), chart libraries (lightweight-charts)

**Infrastructure:**
- Development: Local server (existing)
- Production: VPS or cloud instance with 99.9% uptime
- Monitoring: Logging, alerts, error tracking

**APIs:**
- Polygon.io: Real-time market data (WebSocket)
- TradeStation: Paper/live trading (REST + WebSocket)
- Anthropic Claude: AI analysis and decision-making

---

## Risk Disclosure

This system is for **educational and research purposes**. Key risks:

1. **Technical Risk**: Software bugs could cause incorrect trades
2. **Market Risk**: Strategies may not perform as expected in live markets
3. **Execution Risk**: Slippage, failed orders, connection issues
4. **Model Risk**: AI recommendations may be wrong
5. **Regulatory Risk**: Ensure compliance with all trading regulations

**Recommendations:**
- Start with paper trading only
- Validate for 30+ days before any live capital
- Start small if going live ($5-10k max initially)
- Monitor closely during first weeks
- Have emergency stop mechanism ready
- Consult financial/legal advisors as needed

---

## Conclusion

This roadmap transforms the current backtesting platform into a sophisticated AI trading agent system while preserving all existing manual functionality. The phased approach allows for:

1. **Incremental development** - Build and validate each component
2. **Risk mitigation** - Paper trading first, extensive validation
3. **Flexibility** - Multiple agents, multiple strategies, easy to extend
4. **Learning** - Continuous improvement based on results
5. **Scalability** - Add agents/strategies as proven

The hybrid approach (manual + autonomous agent) provides the best of both worlds: human creativity and discretion combined with AI-powered execution and learning.

**Estimated Timeline:** 12-16 weeks from start to validated paper trading system

**Ready to begin?** Start with Phase 1.1: Real-Time Data Pipeline
