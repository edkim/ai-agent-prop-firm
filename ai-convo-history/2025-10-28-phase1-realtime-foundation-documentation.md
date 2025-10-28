# Phase 1: Real-Time Foundation - Documentation

**Date:** 2025-10-28
**Branch:** `phase1-realtime-foundation`
**Status:** ✅ Complete

---

## Overview

Phase 1 establishes the foundational infrastructure for the AI Trading Agent system. This phase focuses on real-time data streaming, broker integration, and agent management - the core building blocks needed before implementing trading logic.

### What Was Built

1. **Real-Time Data Pipeline** - Live market data streaming via Polygon WebSocket
2. **TradeStation API Integration** - OAuth authentication and paper trading support
3. **Trading Agent Management** - Configuration system for multiple competing agents
4. **Database Schema** - 9 new tables for live trading infrastructure
5. **Market Hours Detection** - US market session tracking and validation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase 1 Architecture                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐         ┌──────────────┐                 │
│  │  Polygon    │────────▶│  Real-Time   │                 │
│  │  WebSocket  │  Bars   │  Data Service│                 │
│  └─────────────┘         └──────┬───────┘                 │
│                                  │                          │
│                                  ▼                          │
│                          ┌──────────────┐                  │
│                          │   Database   │                  │
│                          │ (realtime_   │                  │
│                          │   bars)      │                  │
│                          └──────────────┘                  │
│                                                             │
│  ┌─────────────┐         ┌──────────────┐                 │
│  │ TradeStation│◀───────▶│ TradeStation │                 │
│  │    API      │  OAuth  │   Service    │                 │
│  └─────────────┘         └──────┬───────┘                 │
│                                  │                          │
│                                  ▼                          │
│                          ┌──────────────┐                  │
│                          │Trading Agent │                  │
│                          │   Service    │                  │
│                          └──────┬───────┘                  │
│                                  │                          │
│                                  ▼                          │
│                          ┌──────────────┐                  │
│                          │   Database   │                  │
│                          │ (agents,     │                  │
│                          │  portfolio)  │                  │
│                          └──────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables (9 total)

#### 1. `trading_agents`
Stores agent configurations and risk limits.

```sql
CREATE TABLE trading_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL UNIQUE,
    timeframe TEXT NOT NULL, -- 'intraday', 'swing', 'position'
    strategies TEXT NOT NULL, -- JSON array
    risk_limits TEXT NOT NULL, -- JSON object
    active BOOLEAN DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME
);
```

**Example Agent Configuration:**
```json
{
  "id": "agent-123",
  "name": "Intraday Momentum Hunter",
  "accountId": "TS_PAPER_001",
  "timeframe": "intraday",
  "strategies": ["breakout-volume-surge", "gap-and-go"],
  "riskLimits": {
    "maxPositionSize": 10000,
    "maxDailyLoss": 500,
    "maxConcurrentPositions": 5,
    "minConfidenceScore": 75,
    "maxPortfolioExposure": 50,
    "maxCorrelation": 0.7
  },
  "active": true
}
```

#### 2. `realtime_bars`
Stores live market data from Polygon WebSocket.

```sql
CREATE TABLE realtime_bars (
    ticker TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL, high REAL, low REAL, close REAL,
    volume INTEGER,
    timeframe TEXT NOT NULL,
    received_at DATETIME,
    PRIMARY KEY (ticker, timestamp, timeframe)
);
```

#### 3. `live_signals`
Records real-time pattern detections.

```sql
CREATE TABLE live_signals (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    ticker TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    detection_time DATETIME NOT NULL,
    signal_data TEXT, -- JSON
    status TEXT DEFAULT 'DETECTED',
    created_at DATETIME,
    updated_at DATETIME
);
```

**Status Values:** `DETECTED`, `ANALYZING`, `EXECUTED`, `REJECTED`, `EXPIRED`

#### 4. `trade_recommendations`
AI-generated trade analysis and decisions.

```sql
CREATE TABLE trade_recommendations (
    id TEXT PRIMARY KEY,
    signal_id TEXT,
    agent_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    side TEXT NOT NULL, -- 'LONG', 'SHORT'
    entry_price REAL,
    position_size INTEGER,
    stop_loss REAL,
    take_profit REAL,
    confidence_score INTEGER, -- 0-100
    reasoning TEXT, -- Claude's explanation
    chart_data TEXT, -- Base64 chart
    risk_checks TEXT, -- JSON
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME,
    updated_at DATETIME
);
```

#### 5. `executed_trades`
Live and paper trade records with P&L tracking.

```sql
CREATE TABLE executed_trades (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    recommendation_id TEXT,
    ticker TEXT NOT NULL,
    side TEXT NOT NULL,
    entry_time DATETIME,
    entry_price REAL,
    position_size INTEGER,
    exit_time DATETIME,
    exit_price REAL,
    pnl REAL,
    pnl_percent REAL,
    stop_loss REAL,
    take_profit REAL,
    exit_reason TEXT, -- STOP_HIT, TARGET_HIT, TIME_EXIT, MANUAL_EXIT
    status TEXT DEFAULT 'OPEN',
    pattern_type TEXT,
    confidence_score INTEGER,
    notes TEXT,
    created_at DATETIME,
    updated_at DATETIME
);
```

#### 6. `portfolio_state`
Per-agent position and equity tracking.

```sql
CREATE TABLE portfolio_state (
    agent_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    cash REAL DEFAULT 0,
    positions TEXT, -- JSON
    total_equity REAL DEFAULT 0,
    daily_pnl REAL DEFAULT 0,
    daily_pnl_percent REAL DEFAULT 0,
    open_trade_count INTEGER DEFAULT 0,
    total_exposure REAL DEFAULT 0,
    last_updated DATETIME
);
```

#### 7. `risk_metrics`
Historical performance and risk tracking.

```sql
CREATE TABLE risk_metrics (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    metric_date DATE NOT NULL,
    total_exposure REAL,
    daily_pnl REAL,
    cumulative_pnl REAL,
    max_drawdown REAL,
    sharpe_ratio REAL,
    total_trades INTEGER,
    winning_trades INTEGER,
    losing_trades INTEGER,
    win_rate REAL,
    avg_win REAL,
    avg_loss REAL,
    profit_factor REAL,
    created_at DATETIME
);
```

#### 8. `tradestation_orders`
Order audit trail for TradeStation.

```sql
CREATE TABLE tradestation_orders (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    trade_id TEXT,
    order_id TEXT NOT NULL, -- TradeStation order ID
    ticker TEXT NOT NULL,
    side TEXT NOT NULL, -- BUY, SELL, SELLSHORT, BUYTOCOVER
    order_type TEXT NOT NULL, -- MARKET, LIMIT, STOP, STOPLIMIT
    quantity INTEGER NOT NULL,
    limit_price REAL,
    stop_price REAL,
    status TEXT NOT NULL,
    filled_quantity INTEGER DEFAULT 0,
    avg_fill_price REAL,
    submitted_at DATETIME NOT NULL,
    filled_at DATETIME,
    response_data TEXT, -- JSON
    error_message TEXT,
    created_at DATETIME,
    updated_at DATETIME
);
```

#### 9. `agent_activity_log`
Complete audit trail of agent actions.

```sql
CREATE TABLE agent_activity_log (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    ticker TEXT,
    description TEXT NOT NULL,
    data TEXT, -- JSON
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Activity Types:** `SIGNAL_DETECTED`, `TRADE_ANALYZED`, `ORDER_PLACED`, `POSITION_CLOSED`, `RISK_LIMIT_HIT`, etc.

---

## Services

### 1. Real-Time Data Service

**File:** `backend/src/services/realtime-data.service.ts`

Manages WebSocket connection to Polygon.io for live market data.

#### Key Methods:

```typescript
// Connect to Polygon WebSocket
await realtimeDataService.connect();

// Subscribe to tickers
await realtimeDataService.subscribeToTickers(['TSLA', 'AAPL', 'SPY']);

// Register callback for bar updates
realtimeDataService.onBarUpdate((bar) => {
  console.log(`New bar: ${bar.ticker} @ ${bar.close}`);
});

// Get recent bars from database
const bars = realtimeDataService.getRecentBars('TSLA', '1min', 100);

// Get connection status
const status = realtimeDataService.getStatus();
// { connected: true, subscribedTickers: ['TSLA', 'AAPL'], reconnectAttempts: 0 }

// Disconnect
await realtimeDataService.disconnect();
```

#### Features:

- **Automatic Reconnection** - Exponential backoff (up to 10 attempts)
- **Data Validation** - Price checks, staleness detection
- **Database Persistence** - All bars stored in `realtime_bars` table
- **Multi-Ticker Support** - Subscribe/unsubscribe dynamically
- **Callback System** - Real-time processing via registered callbacks

#### Configuration:

```env
POLYGON_API_KEY=your_polygon_key_here
```

---

### 2. Market Hours Service

**File:** `backend/src/services/market-hours.service.ts`

Detects US stock market trading hours and sessions.

#### Key Methods:

```typescript
// Check if market is open
const isOpen = marketHoursService.isMarketOpen();

// Get current session
const session = marketHoursService.getCurrentSession();
// Returns: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED'

// Get detailed market hours
const hours = marketHoursService.getCurrentMarketHours();
// {
//   session: 'REGULAR',
//   isOpen: true,
//   nextOpen: null,
//   nextClose: Date(2025-10-28T20:00:00Z)
// }

// Check if we should trade
const shouldTrade = marketHoursService.shouldTradeIntraday();
// Only returns true during regular hours (9:30 AM - 4:00 PM EST)

// Get human-readable status
const status = marketHoursService.getStatusString();
// "Regular Trading Hours"

// Log status to console
marketHoursService.logStatus();
```

#### Features:

- **Market Sessions** - Pre-market (4:00-9:30 AM), Regular (9:30 AM-4:00 PM), After-hours (4:00-8:00 PM)
- **Holiday Detection** - 2025 US market holidays
- **Weekend Detection** - Automatic
- **Timezone Handling** - Converts to EST/EDT automatically
- **Trading Eligibility** - Separate checks for intraday vs swing trading

---

### 3. TradeStation Service

**File:** `backend/src/services/tradestation.service.ts`

Handles OAuth authentication and order execution with TradeStation.

#### Authentication Flow:

```typescript
// Step 1: Get authorization URL
const { authUrl, state } = tradestationService.getAuthorizationUrl('random_state_123');
// User visits authUrl and authorizes

// Step 2: Exchange code for tokens
await tradestationService.authenticate(authorizationCode);
// Tokens are stored in database and auto-refresh

// Check authentication status
const status = tradestationService.getAuthStatus();
// {
//   authenticated: true,
//   accountId: 'TS_PAPER_001',
//   expiresIn: 3540
// }
```

#### Account & Position Management:

```typescript
// Get account information
const account = await tradestationService.getAccount();
// {
//   accountId: 'TS_PAPER_001',
//   name: 'Paper Trading Account',
//   type: 'Margin',
//   cash: 100000,
//   equity: 105340,
//   buyingPower: 200000
// }

// Get current positions
const positions = await tradestationService.getPositions();
// [
//   {
//     symbol: 'TSLA',
//     quantity: 100,
//     averagePrice: 242.50,
//     currentPrice: 245.80,
//     marketValue: 24580,
//     unrealizedPnL: 330,
//     unrealizedPnLPercent: 1.36
//   }
// ]
```

#### Order Placement:

```typescript
// Place market order
const order = await tradestationService.placeOrder({
  symbol: 'TSLA',
  side: 'Buy',
  orderType: 'Market',
  quantity: 100
});

// Place limit order
const limitOrder = await tradestationService.placeOrder({
  symbol: 'AAPL',
  side: 'Buy',
  orderType: 'Limit',
  quantity: 50,
  limitPrice: 178.50,
  timeInForce: 'DAY'
});

// Place stop-limit order
const stopLimitOrder = await tradestationService.placeOrder({
  symbol: 'SPY',
  side: 'Sell',
  orderType: 'StopLimit',
  quantity: 100,
  stopPrice: 450.00,
  limitPrice: 449.50
});

// Get order status
const status = await tradestationService.getOrderStatus(order.orderId);
// {
//   orderId: '12345',
//   symbol: 'TSLA',
//   status: 'Filled',
//   filledQuantity: 100,
//   averageFillPrice: 245.65,
//   filledTime: '2025-10-28T14:35:22Z'
// }

// Cancel order
await tradestationService.cancelOrder(order.orderId);
```

#### Features:

- **OAuth 2.0 Authentication** - Secure token management
- **Automatic Token Refresh** - Tokens stored in database and refreshed before expiry
- **Paper Trading Support** - Use `TRADESTATION_ENV=sim` for paper account
- **Order Types** - Market, Limit, Stop, StopLimit
- **Time in Force** - DAY, GTC, IOC
- **Error Handling** - Comprehensive error messages and logging

#### Configuration:

```env
TRADESTATION_API_KEY=your_api_key
TRADESTATION_API_SECRET=your_api_secret
TRADESTATION_ACCOUNT_ID=your_paper_account_id
TRADESTATION_REDIRECT_URI=http://localhost:3000/auth/callback
TRADESTATION_ENV=sim  # 'sim' for paper, 'live' for real money
```

---

### 4. Trading Agent Service

**File:** `backend/src/services/trading-agent.service.ts`

Manages trading agent configurations and operations.

#### Agent Creation:

```typescript
// Create a new agent
const agent = tradingAgentService.createAgent({
  name: 'Intraday Momentum Hunter',
  accountId: 'TS_PAPER_001',
  timeframe: 'intraday',
  strategies: ['breakout-volume-surge', 'gap-and-go'],
  riskLimits: {
    maxPositionSize: 10000,
    maxDailyLoss: 500,
    maxConcurrentPositions: 5,
    minConfidenceScore: 75,
    maxPortfolioExposure: 50,
    maxCorrelation: 0.7
  }
});

// Initialize portfolio state
tradingAgentService.initializePortfolioState(agent.id, agent.accountId, 100000);
```

#### Agent Management:

```typescript
// Get agent by ID
const agent = tradingAgentService.getAgent(agentId);

// Get all agents
const allAgents = tradingAgentService.getAllAgents();

// Get active agents only
const activeAgents = tradingAgentService.getAllAgents(true);

// Get agents by timeframe
const intradayAgents = tradingAgentService.getAgentsByTimeframe('intraday');

// Update agent configuration
tradingAgentService.updateAgent(agentId, {
  riskLimits: {
    maxPositionSize: 15000 // Increase position size
  }
});

// Activate/deactivate agent
tradingAgentService.setAgentActive(agentId, false);

// Delete agent
tradingAgentService.deleteAgent(agentId);
```

#### Portfolio State:

```typescript
// Get portfolio state
const portfolio = tradingAgentService.getPortfolioState(agentId);
// {
//   cash: 95340,
//   positions: { 'TSLA': { shares: 100, avgPrice: 242.50, ... } },
//   totalEquity: 105340,
//   dailyPnL: 780,
//   openTradeCount: 3,
//   totalExposure: 24580
// }
```

#### Activity Logging:

```typescript
// Log agent activity
tradingAgentService.logActivity(
  agentId,
  'SIGNAL_DETECTED',
  'Breakout pattern detected with 4x volume',
  'TSLA',
  { pattern: 'breakout', volume: '4.2x', price: 245.50 }
);

// Get recent activity
const activity = tradingAgentService.getRecentActivity(agentId, 50);
```

#### Features:

- **Risk Limit Validation** - Ensures all limits are within valid ranges
- **Pattern-Based Filtering** - Get agents interested in specific patterns
- **Portfolio Tracking** - Per-agent position and equity management
- **Activity Logging** - Complete audit trail of agent actions
- **Multi-Agent Support** - Multiple agents can run simultaneously

---

## API Endpoints

### Agent Management

#### Create Agent
```http
POST /api/agents
Content-Type: application/json

{
  "name": "Intraday Momentum Hunter",
  "accountId": "TS_PAPER_001",
  "timeframe": "intraday",
  "strategies": ["breakout-volume-surge", "gap-and-go"],
  "riskLimits": {
    "maxPositionSize": 10000,
    "maxDailyLoss": 500,
    "maxConcurrentPositions": 5,
    "minConfidenceScore": 75,
    "maxPortfolioExposure": 50,
    "maxCorrelation": 0.7
  }
}

Response: 201 Created
{
  "id": "agent-abc123",
  "name": "Intraday Momentum Hunter",
  "active": true,
  ...
}
```

#### List Agents
```http
GET /api/agents?active=true

Response: 200 OK
{
  "agents": [
    { "id": "agent-abc123", "name": "Intraday Momentum Hunter", ... },
    { "id": "agent-def456", "name": "Swing Mean Reversion", ... }
  ]
}
```

#### Get Agent Details
```http
GET /api/agents/{agentId}

Response: 200 OK
{
  "agent": {
    "id": "agent-abc123",
    "name": "Intraday Momentum Hunter",
    "accountId": "TS_PAPER_001",
    "timeframe": "intraday",
    "strategies": ["breakout-volume-surge"],
    "riskLimits": { ... },
    "active": true,
    "createdAt": "2025-10-28T12:00:00Z",
    "updatedAt": "2025-10-28T12:00:00Z"
  },
  "portfolioState": {
    "cash": 95340,
    "positions": { "TSLA": { ... } },
    "totalEquity": 105340,
    "dailyPnL": 780,
    "openTradeCount": 3
  }
}
```

#### Update Agent
```http
PATCH /api/agents/{agentId}
Content-Type: application/json

{
  "riskLimits": {
    "maxPositionSize": 15000
  }
}

Response: 200 OK
{
  "id": "agent-abc123",
  "riskLimits": {
    "maxPositionSize": 15000,
    ...
  },
  ...
}
```

#### Activate/Deactivate Agent
```http
POST /api/agents/{agentId}/activate
POST /api/agents/{agentId}/deactivate

Response: 200 OK
{
  "message": "Agent activated"
}
```

#### Delete Agent
```http
DELETE /api/agents/{agentId}

Response: 200 OK
{
  "message": "Agent deleted successfully"
}
```

#### Get Agent Activity
```http
GET /api/agents/{agentId}/activity?limit=100

Response: 200 OK
{
  "activity": [
    {
      "id": "activity-123",
      "activityType": "SIGNAL_DETECTED",
      "ticker": "TSLA",
      "description": "Breakout pattern detected",
      "data": { "pattern": "breakout", ... },
      "timestamp": "2025-10-28T14:30:00Z"
    },
    ...
  ]
}
```

#### Get Portfolio State
```http
GET /api/agents/{agentId}/portfolio

Response: 200 OK
{
  "cash": 95340,
  "positions": {
    "TSLA": {
      "shares": 100,
      "avgPrice": 242.50,
      "currentPrice": 245.80,
      "pnl": 330
    }
  },
  "totalEquity": 105340,
  "dailyPnL": 780,
  "openTradeCount": 3,
  "totalExposure": 24580
}
```

### TradeStation Authentication

#### Get Authorization URL
```http
GET /api/agents/auth/url

Response: 200 OK
{
  "authUrl": "https://sim-signin.tradestation.com/authorize?...",
  "state": "abc123"
}
```

#### Handle OAuth Callback
```http
POST /api/agents/auth/callback
Content-Type: application/json

{
  "code": "authorization_code_from_tradestation"
}

Response: 200 OK
{
  "message": "Authentication successful"
}
```

#### Check Auth Status
```http
GET /api/agents/auth/status

Response: 200 OK
{
  "authenticated": true,
  "accountId": "TS_PAPER_001",
  "expiresIn": 3540
}
```

---

## Setup Guide

### Prerequisites

1. **Node.js 18+** installed
2. **Polygon.io API Key** ([Get free key](https://polygon.io))
3. **Anthropic API Key** ([Get key](https://console.anthropic.com))
4. **TradeStation Developer Account** ([Register here](https://developer.tradestation.com/))

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

**New Dependencies Added:**
- `@polygon.io/client-js` - Polygon WebSocket client
- `ws` - WebSocket support
- `qs` - Query string encoding for OAuth

### Step 2: Configure Environment

Create `.env` file in project root:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Database
DATABASE_PATH=./backend/backtesting.db

# Server
PORT=3000
NODE_ENV=development

# Polygon.io (Market Data)
POLYGON_API_KEY=your_polygon_api_key_here

# Anthropic (AI Analysis)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# TradeStation (Trading)
TRADESTATION_API_KEY=your_tradestation_api_key
TRADESTATION_API_SECRET=your_tradestation_api_secret
TRADESTATION_ACCOUNT_ID=your_paper_account_id
TRADESTATION_REDIRECT_URI=http://localhost:3000/auth/callback
TRADESTATION_ENV=sim  # Use 'sim' for paper trading
```

### Step 3: Get TradeStation Credentials

1. Go to [TradeStation Developer Portal](https://developer.tradestation.com/)
2. Create an application
3. Get your API Key and Secret
4. Set redirect URI to `http://localhost:3000/auth/callback`
5. Create a paper trading account if you don't have one

### Step 4: Start the Server

```bash
cd backend
npm run dev
```

Server will start on `http://localhost:3000`

### Step 5: Initialize Database

The database will auto-initialize with the new schema on first run. Verify tables exist:

```bash
sqlite3 backend/backtesting.db
.tables
```

You should see the new tables:
- `trading_agents`
- `realtime_bars`
- `live_signals`
- `trade_recommendations`
- `executed_trades`
- `portfolio_state`
- `risk_metrics`
- `tradestation_orders`
- `agent_activity_log`

### Step 6: Authenticate with TradeStation

1. **Get Authorization URL:**
```bash
curl http://localhost:3000/api/agents/auth/url
```

2. **Visit the URL** in your browser and authorize

3. **Copy the authorization code** from the redirect URL

4. **Complete authentication:**
```bash
curl -X POST http://localhost:3000/api/agents/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "YOUR_AUTHORIZATION_CODE"}'
```

5. **Verify authentication:**
```bash
curl http://localhost:3000/api/agents/auth/status
```

Should return:
```json
{
  "authenticated": true,
  "accountId": "TS_PAPER_001",
  "expiresIn": 3600
}
```

### Step 7: Create Your First Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Intraday Momentum Hunter",
    "accountId": "TS_PAPER_001",
    "timeframe": "intraday",
    "strategies": ["breakout-volume-surge", "gap-and-go"],
    "riskLimits": {
      "maxPositionSize": 10000,
      "maxDailyLoss": 500,
      "maxConcurrentPositions": 5,
      "minConfidenceScore": 75,
      "maxPortfolioExposure": 50,
      "maxCorrelation": 0.7
    }
  }'
```

### Step 8: Test Real-Time Data (Optional)

```bash
# In Node REPL or test script:
const realtimeDataService = require('./backend/src/services/realtime-data.service').default;

// Connect
await realtimeDataService.connect();

// Subscribe to tickers
await realtimeDataService.subscribeToTickers(['SPY', 'TSLA']);

// Register callback
realtimeDataService.onBarUpdate((bar) => {
  console.log(`${bar.ticker}: $${bar.close} @ ${new Date(bar.timestamp)}`);
});

// Check status
console.log(realtimeDataService.getStatus());
```

---

## Testing

### Manual Testing Checklist

#### Real-Time Data Service

- [ ] WebSocket connects successfully
- [ ] Can subscribe to tickers
- [ ] Receives live bars during market hours
- [ ] Bars are stored in database
- [ ] Automatic reconnection works after disconnect
- [ ] Data validation prevents bad bars

#### TradeStation Service

- [ ] OAuth flow completes successfully
- [ ] Tokens are stored in database
- [ ] Can get account information
- [ ] Can get current positions
- [ ] Can place market orders (paper account)
- [ ] Can place limit orders (paper account)
- [ ] Can check order status
- [ ] Can cancel orders
- [ ] Tokens refresh automatically before expiry

#### Trading Agent Service

- [ ] Can create agents
- [ ] Risk limits are validated
- [ ] Portfolio state is initialized
- [ ] Can update agent configuration
- [ ] Can activate/deactivate agents
- [ ] Activity logging works
- [ ] Can delete agents

#### Market Hours Service

- [ ] Correctly detects market sessions
- [ ] Identifies holidays
- [ ] Handles weekends
- [ ] Returns accurate time until open/close
- [ ] Trading eligibility checks work

### Integration Tests

```typescript
// Example integration test for agent creation + portfolio init
describe('Trading Agent Integration', () => {
  it('should create agent and initialize portfolio', async () => {
    // Create agent
    const agent = tradingAgentService.createAgent({
      name: 'Test Agent',
      accountId: 'TEST_001',
      timeframe: 'intraday',
      strategies: ['test-pattern'],
      riskLimits: {
        maxPositionSize: 5000,
        maxDailyLoss: 250,
        maxConcurrentPositions: 3,
        minConfidenceScore: 70,
        maxPortfolioExposure: 30,
        maxCorrelation: 0.6
      }
    });

    expect(agent.id).toBeDefined();
    expect(agent.active).toBe(true);

    // Initialize portfolio
    tradingAgentService.initializePortfolioState(agent.id, agent.accountId, 100000);

    // Verify portfolio state
    const portfolio = tradingAgentService.getPortfolioState(agent.id);
    expect(portfolio?.cash).toBe(100000);
    expect(portfolio?.totalEquity).toBe(100000);

    // Cleanup
    tradingAgentService.deleteAgent(agent.id);
  });
});
```

---

## Troubleshooting

### Real-Time Data Issues

**Problem:** WebSocket not connecting

**Solution:**
- Verify `POLYGON_API_KEY` is set correctly
- Check if using correct tier (free tier uses `delayed.polygon.io`)
- Check firewall/network settings

**Problem:** Not receiving bars

**Solution:**
- Verify market is open (`marketHoursService.isMarketOpen()`)
- Check if subscribed to tickers
- Verify tickers are valid symbols
- Check backend logs for errors

**Problem:** Frequent disconnections

**Solution:**
- Check internet connection stability
- Verify API key is valid and not rate-limited
- Check logs for error messages

### TradeStation Issues

**Problem:** OAuth flow fails

**Solution:**
- Verify redirect URI matches exactly in TradeStation app settings
- Check API key and secret are correct
- Ensure using correct environment (sim vs live)
- Check TradeStation service status

**Problem:** "Not authenticated" errors

**Solution:**
- Complete OAuth flow first
- Check token expiry: `GET /api/agents/auth/status`
- Tokens should refresh automatically - check logs
- Re-authenticate if needed

**Problem:** Order placement fails

**Solution:**
- Verify account ID is correct
- Check if paper trading account is active
- Verify sufficient buying power
- Check order parameters (quantity, price, etc.)
- Review TradeStation API response in logs

### Database Issues

**Problem:** Tables not created

**Solution:**
```bash
# Backup database
cp backend/backtesting.db backend/backtesting.db.backup

# Check schema
sqlite3 backend/backtesting.db
.schema trading_agents

# If table missing, restart server (auto-creates tables)
npm run dev
```

**Problem:** Database locked errors

**Solution:**
- Ensure only one server instance is running
- Close any SQLite GUI tools
- Restart server

---

## What's Next - Phase 2: Agent Brain

Phase 1 provides the foundation. Phase 2 will implement the trading logic:

### Phase 2.1: Pattern Recognition Engine
- Real-time pattern scanner
- Convert historical patterns to real-time detection
- Multi-timeframe confirmation
- Pattern quality scoring

### Phase 2.2: AI Trade Optimizer
- Claude analyzes each signal with chart
- Generates trade plans (entry, exit, position size)
- Confidence scoring (0-100)
- Market context evaluation

### Phase 2.3: Execution Decision Engine
- Risk checks before execution
- Auto-execution if all checks pass
- Rejection logging with reasons
- Order submission to TradeStation

**Estimated Timeline:** Phase 2 - 2 weeks

---

## Key Files Created

### Services
- `backend/src/services/realtime-data.service.ts` - Real-time data streaming
- `backend/src/services/market-hours.service.ts` - Market session detection
- `backend/src/services/tradestation.service.ts` - TradeStation API integration
- `backend/src/services/trading-agent.service.ts` - Agent management

### API Routes
- `backend/src/api/routes/trading-agent.ts` - Agent management endpoints

### Database
- `backend/src/database/schema.sql` - Updated with 9 new tables

### Configuration
- `.env.example` - Updated with TradeStation variables

---

## Summary

Phase 1 establishes the complete infrastructure needed for an AI trading agent:

✅ **Real-time data pipeline** - Live market data streaming
✅ **Broker integration** - Paper trading with TradeStation
✅ **Agent management** - Multi-agent configuration system
✅ **Database schema** - Complete data model for live trading
✅ **Market detection** - Session tracking and trading eligibility

**Total Lines of Code:** ~1,800 lines
**Services Created:** 4
**API Endpoints:** 12
**Database Tables:** 9

The foundation is solid and ready for Phase 2 implementation!

---

**Branch:** `phase1-realtime-foundation`
**Status:** ✅ Complete and documented
**Next:** Phase 2 - Agent Brain (Pattern Detection + AI Analysis)
