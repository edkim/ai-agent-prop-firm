# AI-Powered Algorithmic Trading Backtest Platform

A sophisticated backtesting, pattern discovery, and **autonomous trading platform** combining AI-powered script generation, natural language query support, and intelligent strategy analysis for algorithmic trading.

## 🚀 Overview

This platform enables traders to discover, backtest, and validate trading strategies using natural language queries and AI-generated code. It combines traditional SQL-based pattern scanning with Claude AI for complex temporal pattern detection, custom strategy generation, and **real-time autonomous trading**.

### Key Capabilities

- 🤖 **AI-Powered Pattern Discovery** - Natural language scanner generates custom TypeScript code for complex pattern detection
- ⚡ **High-Performance SQL Scanner** - Memory-safe streaming scanner for quick pattern searches across universes
- 📊 **Dynamic Strategy Generation** - Claude generates custom backtest scripts from plain English descriptions
- 🔍 **Pattern Analysis** - Sample sets management for tracking and validating discovered patterns
- 💾 **Script Persistence** - All AI-generated code saved with metadata for audit trail and reuse
- 📈 **Real Market Data** - Polygon.io integration for intraday and daily data
- 🎯 **Autonomous Trading Agents** - AI-powered agents for real-time pattern detection and trade execution
- 🛡️ **Risk Management** - Multi-layer risk checks with configurable limits per agent
- 📱 **Paper Trading** - TradeStation integration for live market testing

## ✨ What's New

### Phase 5: Autonomous Trading Agents (2025-10-28) 🆕

**Agent Brain - Real-Time Decision Making**

The platform now includes autonomous trading agents that detect patterns in real-time and execute trades automatically with Claude AI analysis and comprehensive risk management.

#### Core Services

1. **RealtimeScannerService** - Pattern Detection Engine
   - 6 pattern types: Breakout with Volume Surge, Gap and Go, Cup and Handle, Bull Flag, VWAP Bounce, Momentum Surge
   - Technical indicators: RSI, VWAP, Volume Ratio, ATR, SMA (20, 50)
   - Multi-timeframe confirmation (1m, 5m, 15m)
   - Pattern quality scoring (0-100)
   - Signal deduplication (5-minute window)

2. **TradeOptimizerService** - AI Trade Analyzer
   - Claude Vision API integration for chart analysis
   - Position sizing with Kelly Criterion
   - Stop loss/take profit calculations
   - Correlation checking with existing positions
   - Fallback rule-based analysis if Claude API fails

3. **ExecutionEngineService** - Risk Checks & Execution
   - 6 risk checks: Position size, Portfolio exposure, Daily loss limit, Concurrent positions, Confidence score, Correlation
   - TradeStation API order placement
   - Portfolio state tracking
   - Trade lifecycle management (entry/exit)
   - Activity logging for full audit trail

#### Agent Configuration

```typescript
{
  "name": "Breakout Hunter",
  "accountId": "SIM3113503M",  // TradeStation paper trading
  "timeframe": "intraday",
  "strategies": ["breakout-volume-surge", "gap-and-go"],
  "riskLimits": {
    "maxPositionSize": 10000,        // Max $ per trade
    "maxPortfolioExposure": 50,      // Max % of capital deployed
    "maxDailyLoss": 500,              // Stop trading if hit
    "maxConcurrentPositions": 5,     // Max open positions
    "minConfidenceScore": 70,        // Min AI confidence (0-100)
    "maxCorrelation": 0.7            // Max correlation with existing positions
  }
}
```

#### API Endpoints

**Agent Management:**
- `POST /api/agents` - Create new trading agent
- `GET /api/agents` - List all agents
- `GET /api/agents/:id` - Get agent details + portfolio
- `PATCH /api/agents/:id` - Update agent configuration
- `DELETE /api/agents/:id` - Delete agent
- `POST /api/agents/:id/activate` - Start agent trading
- `POST /api/agents/:id/deactivate` - Stop agent trading

**Monitoring:**
- `GET /api/agents/:id/signals` - Live pattern detections
- `GET /api/agents/:id/recommendations` - AI trade recommendations
- `GET /api/agents/:id/trades` - Executed trades
- `GET /api/agents/:id/activity` - Activity log
- `GET /api/agents/:id/portfolio` - Current portfolio state

**Manual Control:**
- `POST /api/agents/:id/recommendations/:recommendationId/approve` - Approve trade
- `POST /api/agents/:id/recommendations/:recommendationId/reject` - Reject trade
- `POST /api/agents/:id/trades/:tradeId/close` - Close position

#### Data Flow

```
[TradeStation WebSocket]
    ↓ Real-time bars
[RealtimeScannerService]
    ↓ Pattern detected (scored 0-100)
[live_signals table] → status='DETECTED'
    ↓
[TradeOptimizerService]
    ↓ Claude analyzes chart + signal + portfolio
[trade_recommendations table] → status='PENDING'
    ↓
[ExecutionEngineService]
    ↓ Run 6 risk checks
[risk_checks: PASS/FAIL]
    ↓ If all pass
[TradeStation API] → Place order
    ↓
[executed_trades table] → status='OPEN'
    ↓
[portfolio_state table] → Updated
```

#### Status

**Phase 1 (Real-Time Foundation):** ✅ Complete
- TradeStation OAuth integration
- Account/position/order endpoints
- Paper trading operational (SIM3113503M)
- Database schema (9 tables)

**Phase 2 (Agent Brain):** ✅ Complete
- Pattern recognition engine (6 patterns)
- AI trade optimizer (Claude Vision)
- Execution engine (6 risk checks)
- API routes (14 endpoints)

**Phase 3 (Portfolio Management):** ✅ Complete
- Position monitoring (real-time, 5-second intervals)
- Trailing stops (dynamic profit protection)
- Risk metrics (Sharpe, Sortino, drawdown, win rate)
- Performance analytics (equity curve, statistics)
- API routes (21 total endpoints)

**Next Phase (Agent Dashboard):**
- Live trading interface
- Real-time position visualization
- Performance analytics charts
- Manual trade controls

### Phase 6: Portfolio Management (2025-10-28) 🆕

**Real-Time Position Monitoring & Exit Management**

Building on the autonomous trading agent brain, Phase 3 adds comprehensive portfolio management with real-time monitoring, dynamic stop management, and performance analytics.

#### Core Services

1. **PositionMonitorService** - Real-Time Position Monitoring
   - Monitors all open positions every 5 seconds
   - 4 exit conditions: Stop loss, Take profit, Trailing stop, Time-based
   - Real-time portfolio state updates (P&L, equity, exposure)
   - Slippage protection (max 2% threshold)
   - Automatic exit execution via TradeStation
   - Start/stop monitoring per agent

2. **TrailingStopService** - Dynamic Profit Protection
   - Trailing stop activation at profit threshold (default +2%)
   - High/low water mark tracking
   - Automatic tightening as price moves favorably
   - Never widens (only moves in favorable direction)
   - ATR-based optimal trail percent calculation
   - Statistics tracking (avg trail%, avg activation profit)

3. **RiskMetricsService** - Performance Analytics
   - Daily metrics calculation (exposure, P&L, risk, trade stats)
   - Sharpe ratio (risk-adjusted returns, annualized)
   - Sortino ratio (downside risk only, annualized)
   - Maximum drawdown & current drawdown tracking
   - Win rate, profit factor, avg win/loss
   - Equity curve generation for charting
   - Auto-update after each trade close

#### Exit Priority System

1. **Stop Loss** (highest priority) - Prevent catastrophic loss
2. **Trailing Stop** - Lock in profits dynamically
3. **Take Profit** - Capture target gains
4. **Time Exit** (lowest priority) - Cleanup stale positions

Time-based exit rules:
- Intraday: Close 5 minutes before market close (3:55 PM ET)
- Swing: Max 5 trading days
- Position: Max 20 trading days

#### API Endpoints (7 new)

**Position Monitoring:**
- `POST /api/agents/:id/monitor/start` - Start monitoring
- `POST /api/agents/:id/monitor/stop` - Stop monitoring

**Trailing Stops:**
- `POST /api/agents/:id/trades/:tradeId/trailing-stop` - Enable trailing stop
  ```json
  {
    "trailPercent": 5,
    "activationPercent": 2
  }
  ```

**Risk Metrics:**
- `GET /api/agents/:id/metrics` - Get metrics for date range
- `GET /api/agents/:id/metrics/latest` - Get latest daily metrics
- `GET /api/agents/:id/equity-curve` - Get equity curve data
- `POST /api/agents/:id/metrics/calculate` - Manually calculate metrics

#### Performance Metrics

**Calculated Metrics:**
- Exposure: Total, max position, avg position
- P&L: Daily, cumulative, daily %
- Risk: Max drawdown, current drawdown, Sharpe, Sortino
- Trade stats: Total, wins, losses, win rate, avg win/loss, largest win/loss, profit factor

**Formulas:**
```typescript
// Sharpe Ratio (annualized)
sharpeRatio = (avgDailyReturn * 252) / (stdDev * sqrt(252))

// Sortino Ratio (downside deviation only)
sortinoRatio = (avgDailyReturn * 252) / (downsideStdDev * sqrt(252))

// Max Drawdown
maxDrawdown = max((peak - trough) / peak) * 100

// Profit Factor
profitFactor = totalWins / totalLosses
```

#### Status

**Phase 3:** ✅ Complete (3 services, 1,340 lines of code)
- PositionMonitorService: Real-time monitoring, 4 exit types
- TrailingStopService: Dynamic stop management
- RiskMetricsService: Full performance analytics

**API Growth:** 14 → 21 endpoints (+50%)

### Phase 4: Visual Analysis & Chart Generation (2025-10-26)

### Claude Visual AI Analysis (2025-10-26)
- **🎨 Visual pattern recognition** using Claude Vision API
- **📊 Dual-chart generation** (daily context + intraday detail)
- **🤖 AI-powered insights** from multi-sample chart analysis
- **📈 1400x700px charts** with volume bars and price overlays
- **💡 Strategy recommendations** based on visual patterns
- Select multiple samples → "Analyze with Claude" → Get trading insights
- Daily charts: 30-day context window for pattern discovery
- Intraday charts: 5-min bars ±5 days around signal for entry/exit analysis

### Chart Thumbnails (2025-10-26)
- **On-demand chart generation** for all scan results
- Server-side rendering with ChartJS (300x150px thumbnails)
- SQLite caching for instant chart retrieval
- Click "Chart" button in results table to view price charts
- 30-day historical view for pattern analysis
- ~100-200ms generation, <10ms cached lookups

### Enhanced Scanner UI
- Actions column in results table
- Inline chart display (expand/collapse)
- One-click "Save to Backtest Set" dropdown
- Real-time chart loading with progress indicators
- Seamless integration with existing scanner workflow

### Phase 3 Features (Completed)
- Scanner script persistence with metadata
- Sample sets management (CRUD operations)
- Memory-safe streaming (10K default limit)
- Natural language scanner and backtest generation
- Full audit trail for AI-generated code

## 📋 Features

### 1. Dual-Mode Pattern Scanner

#### SQL Scanner (Fast & Free)
- **Speed:** 1-2 seconds typical
- **Use case:** Well-defined technical criteria
- **Filters:** Price change, volume, RSI, SMA, consecutive days
- **Memory:** Streaming execution, handles unlimited results safely

**Example:**
```json
{
  "universe": "russell2000",
  "start_date": "2025-01-01",
  "end_date": "2025-10-25",
  "min_consecutive_up_days": 3,
  "min_change_percent": 50,
  "min_volume_ratio": 2
}
```

#### Natural Language Scanner (AI-Powered)
- **Capability:** Complex temporal patterns, multi-step logic
- **Use case:** "Stocks that went up 100%+ in 3 days, then dropped 20%+"
- **Process:** Claude generates custom TypeScript code
- **Persistence:** Scripts saved to `backend/claude-generated-scripts/`

**Example:**
```json
{
  "query": "Find stocks in 2025 that have gone up 100% or more in 3 days, followed by -20% or more",
  "universe": "russell2000",
  "dateRange": {
    "start": "2025-01-01",
    "end": "2025-10-25"
  }
}
```

### 2. AI-Powered Backtesting

Describe strategies in plain English and Claude generates executable TypeScript:

**Input:**
```
Short FUBO after hyperbolic move on Jan 6, 2025.
Entry: when price closes below previous day low.
Stop loss: previous day high.
Take profit: 40%.
Max hold: 15 days.
```

**Output:**
- Custom backtest script with entry/exit logic
- Automatic date range selection
- Documented assumptions and confidence score
- Full trade logs and performance metrics
- Saved script for review and reuse

### 3. Backtest Sets Management

Organize and track discovered patterns:
- Create collections of promising setups
- Track scan history and results
- Add notes and tags to patterns
- Frontend UI for visual management
- API for programmatic access

### 4. Pattern Analysis Workflow

1. **Discover:** Use scanner to find patterns across universe
2. **Collect:** Save promising candidates to sample sets
3. **Backtest:** Generate and run strategy scripts on patterns
4. **Validate:** Analyze results and refine parameters
5. **Scale:** Apply validated strategies across new patterns

## 🏃 Quick Start

### Prerequisites

- Node.js 18+
- Polygon.io API key ([Get free key](https://polygon.io))
- Anthropic API key for Claude integration ([Get key](https://console.anthropic.com))

### Installation

```bash
# Clone repository
git clone https://github.com/edkim/ai-backtest.git
cd ai-backtest

# Backend setup
cd backend
npm install

# Frontend setup
cd ../frontend
npm install
```

### Configuration

Create `.env` in backend directory:

```env
# Required
POLYGON_API_KEY=your_polygon_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Optional
DATABASE_PATH=./backtesting.db
PORT=3000
NODE_ENV=development
```

### Start Platform

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## 📖 Usage Examples

### Scanner API

#### Regular Scan (SQL-based)
```bash
POST /api/scanner/scan
Content-Type: application/json

{
  "universe": "russell2000",
  "start_date": "2025-01-01",
  "end_date": "2025-10-25",
  "min_consecutive_up_days": 3,
  "min_change_percent": 50,
  "min_volume_ratio": 2,
  "limit": 100
}
```

**Response:** 16 matches in ~1.6 seconds

#### Natural Language Scan (AI-powered)
```bash
POST /api/scanner/scan/natural
Content-Type: application/json

{
  "query": "Find stocks with hyperbolic moves followed by 20%+ reversals",
  "universe": "russell2000",
  "dateRange": {
    "start": "2025-01-01",
    "end": "2025-10-25"
  }
}
```

**Response:** 50 matches in ~15 seconds + generated script saved

### Backtest API

#### Intelligent Backtest Execution
```bash
POST /api/backtests/execute-intelligent
Content-Type: application/json

{
  "prompt": "Short FUBO after Jan 6 hyperbolic move. Entry when close < prev low. Stop at prev high. 40% target. Max 15 days.",
  "ticker": "FUBO",
  "timeframe": "1day",
  "strategyType": "orb"
}
```

**Response includes:**
- Trade-by-trade logs
- P&L metrics
- Script path and metadata
- Claude's assumptions
- Confidence score

### Backtest Sets API

```bash
# Create sample set
POST /api/scanner/backtest-sets
{
  "name": "Hyperbolic Reversals 2025",
  "description": "100%+ gains followed by 20%+ drops",
  "pattern_type": "mean_reversion"
}

# Add scan result
POST /api/scanner/backtest-sets/{id}/results
{
  "ticker": "FUBO",
  "start_date": "2025-01-02",
  "end_date": "2025-01-13",
  "peak_date": "2025-01-06",
  "notes": "251% gain, 53x volume, RSI 91.5"
}

# Get all sample sets
GET /api/scanner/backtest-sets

# Get results for a set
GET /api/scanner/backtest-sets/{id}/results
```

## 🏗️ Architecture

### Backend Stack

**Core Services:**
- `scanner.service.ts` - Dual-mode scanner (SQL + AI)
- `claude.service.ts` - AI script generation
- `claude-analysis.service.ts` - Visual AI pattern analysis
- `backtest-router.service.ts` - Intelligent strategy routing
- `script-execution.service.ts` - Safe TypeScript execution
- `backtest-set.service.ts` - Pattern collection management
- `chart-generator.service.ts` - Server-side chart rendering
- `polygon-intraday.service.ts` - 5-min bar data fetching
- `universe-data.service.ts` - Market data management

**API Routes:**
- `/api/scanner/*` - Pattern scanning endpoints
- `/api/backtests/*` - Strategy backtesting
- `/api/analysis/*` - Claude visual analysis
- `/api/charts/*` - Chart generation and thumbnails
- `/api/data/*` - Market data management
- `/api/scanner/backtest-sets/*` - Sample sets CRUD

**Data Storage:**
- SQLite database for market data and metrics
- Script files: `backend/claude-generated-scripts/`
- Metadata: JSON files paired with each script

### Frontend Stack

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **Styling:** TailwindCSS v4
- **API Client:** Axios
- **Components:**
  - `BacktestForm.tsx` - Natural language strategy input
  - `ResultsDisplay.tsx` - Trade logs and metrics
  - `BacktestSetManager.tsx` - Pattern collection UI

## 📊 Real Results

### Hyperbolic Short Strategy (2025 Analysis)

**Test:** Mean reversion shorts after extreme upward moves

**Scanner Query:**
- 3+ consecutive up days
- 50%+ total gain
- 2x+ volume ratio

**Results:**
- **16 candidates found** (Russell 2000, 10 months)
- **4 backtested:** FUBO, PRAX, BYND, REPL
- **Win rate:** 67% (2 wins, 1 loss, 1 script error)
- **Average win:** +3.6%
- **Average loss:** -6.4%

**Key Insights:**
- ✅ Reversals are real (67% of hyperbolic moves reversed)
- ⚠️ Entry timing critical (5-7 days after peak optimal)
- ❌ 40% profit target too aggressive (0% hit rate)
- ✅ 20% target more realistic based on actual price action
- ⚠️ AI script generation has 25% failure rate (needs improvement)

**See:** `ai-convo-history/2025-10-25-backtest-results-analysis.md`

## 📁 Project Structure

```
ai-backtest/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── scanner.ts           # Scanner endpoints
│   │   │   │   ├── backtests.ts         # Backtest endpoints
│   │   │   │   ├── backtest-sets.ts       # Sample sets CRUD
│   │   │   │   └── data.ts              # Data management
│   │   │   └── server.ts
│   │   ├── services/
│   │   │   ├── scanner.service.ts       # Dual-mode scanner
│   │   │   ├── claude.service.ts        # AI integration
│   │   │   ├── backtest-router.service.ts  # Strategy routing
│   │   │   ├── script-execution.service.ts # Script runner
│   │   │   ├── backtest-set.service.ts    # Pattern management
│   │   │   ├── polygon.service.ts       # Market data
│   │   │   └── universe-data.service.ts # Universe management
│   │   ├── database/
│   │   │   ├── db.ts                    # SQLite connection
│   │   │   └── schema.sql               # Database schema
│   │   └── types/
│   │       ├── scanner.types.ts
│   │       ├── backtest.types.ts
│   │       └── backtest-set.types.ts
│   ├── claude-generated-scripts/       # AI-generated code
│   │   ├── scanner-*.ts                 # Scanner scripts
│   │   ├── scanner-*.json               # Scanner metadata
│   │   ├── claude-*-{ticker}.ts         # Backtest scripts
│   │   └── claude-*-{ticker}.json       # Backtest metadata
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BacktestForm.tsx
│   │   │   ├── ResultsDisplay.tsx
│   │   │   └── BacktestSetManager.tsx     # NEW
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── backtestSetsApi.ts         # NEW
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── ai-convo-history/                    # Analysis & documentation
│   ├── 2025-10-25-backtest-results-analysis.md
│   ├── 2025-10-25-memory-management-fix.md
│   ├── 2025-10-26-scanner-script-persistence.md
│   └── ...
├── ORIGINAL_REQUIREMENTS.md
└── README.md
```

## 🛠️ Development

### Backend Development

```bash
cd backend

# Development with auto-reload
npm run dev

# TypeScript compilation
npm run build

# Production
npm start
```

### Frontend Development

```bash
cd frontend

# Dev server with HMR
npm run dev

# Production build
npm run build

# Preview production
npm run preview
```

### Database Management

```bash
# Reset database
rm backend/backtesting.db
cd backend && npm start  # Auto-recreates

# Populate Russell 2000 universe
cd backend
npx ts-node populate-russell2000.ts

# Backfill historical data
POST /api/scanner/universes/russell2000/backfill
{
  "start_date": "2025-01-01",
  "end_date": "2025-10-25",
  "batch_size": 10
}
```

## 📚 Documentation

### Core Documentation
- **README.md** - This file (overview and quick start)
- **ORIGINAL_REQUIREMENTS.md** - Original project requirements

### Analysis & Insights
- **2025-10-25-backtest-results-analysis.md** - Hyperbolic short strategy results (67% win rate)
- **2025-10-25-memory-management-fix.md** - Scanner streaming implementation
- **2025-10-26-scanner-script-persistence.md** - Script saving implementation
- **2025-10-26-scanner-log-verification.md** - Natural language scanner execution

### Historical
All dated markdown files in `ai-convo-history/` folder document features, decisions, and analysis.

## 🐛 Troubleshooting

### Scanner Issues

**Memory errors:**
- Scanner now uses streaming - should not occur
- Default 10K limit prevents runaway queries
- Check query validation warnings in logs

**Script generation fails:**
- Current 25% failure rate for complex patterns
- Check `claude-generated-scripts/` for error details
- Retry or simplify query

### Backend Issues

**Database:**
```bash
rm backend/backtesting.db
cd backend && npm start
```

**TypeScript errors:**
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Frontend Issues

**Build errors:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**CORS:**
- Verify backend on port 3000
- Check `vite.config.ts` proxy config

### API Issues

**Polygon rate limits:**
- Free tier: 5 calls/minute
- Use cached data when possible
- Implement delays between requests

**Anthropic API:**
- Monitor credit balance
- Each scan/backtest consumes tokens
- Script generation: ~$0.02-0.10 per execution

## 🗺️ Roadmap

### Current Status: Phase 4 In Progress ⚡

**Phase 3 Complete:**
- ✅ Dual-mode scanner (SQL + AI)
- ✅ Scanner script persistence
- ✅ Sample sets management
- ✅ Memory-safe streaming
- ✅ Scan history tracking
- ✅ Natural language backtesting
- ✅ Script metadata and audit trail

**Phase 4 Complete:**
- ✅ **Claude Visual AI Analysis** - Pattern recognition using Claude Vision API
  - Multi-sample chart analysis with AI insights
  - Dual-chart generation (daily + intraday)
  - Strategy recommendations from visual patterns
  - 1400x700px charts with volume overlays
- ✅ **Chart Thumbnails** - On-demand chart generation for scan results
  - Server-side chart rendering with ChartJS
  - SQLite caching for instant retrieval
  - Inline chart display in scanner results
  - One-click save to sample sets
- ✅ **US Stocks Universe** - Full market data backfill support
  - 6,059 US stocks (common, ADRs, preferred)
  - Automated 5-year historical data backfill
  - Batch processing with configurable rates

**Next Priorities:**

### Phase 5: Advanced Features

- Real-time pattern detection
- Portfolio-level backtesting
- Strategy comparison framework
- Interactive parameter optimization
- WebSocket for live updates
- Multi-timeframe chart analysis
- Export to CSV/PDF
- Dark mode

## 🤝 Contributing

This is an active research project. Key areas for contribution:

1. **AI Script Generation:** Improve Claude prompts for better script quality
2. **Pattern Detection:** Add new scanner filters and pattern types
3. **Strategy Library:** Contribute validated strategy templates
4. **Documentation:** Analysis documents and use cases
5. **Testing:** Validate strategies across different market conditions

## 📄 License

MIT

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/edkim/ai-backtest/issues)
- **Analysis:** See `ai-convo-history/` folder
- **Examples:** Hyperbolic short strategy analysis shows complete workflow

## 🙏 Acknowledgments

- **Polygon.io** - Market data API
- **Anthropic Claude** - AI script generation
- **React & Vite** - Frontend framework
- **TailwindCSS** - UI styling

---

**Built with Claude Code** - AI-powered pattern discovery and strategy backtesting platform

*Last updated: 2025-10-27*
