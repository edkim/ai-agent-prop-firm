# AI-Powered Algorithmic Trading Platform

A sophisticated backtesting, pattern discovery, and **autonomous trading platform** that combines AI-powered script generation, natural language queries, and real-time trading execution with comprehensive risk management.

## 🎯 What Makes This Different

**Natural Language → Production Trading**

Describe patterns in plain English → AI generates TypeScript scanners → Finds setups in historical data → Autonomous agents trade them live with risk management.

```
"Find VWAP bounce setups on 5-minute charts with volume confirmation"
         ↓
✅ Intraday scanner generated (5min bars, VWAP calculation)
✅ 10 setups found (CTSH, ETSY, ZM - scores 70-73)
✅ Ready for autonomous agent execution
```

## ✨ Latest Updates

### Intraday Pattern Scanner - VWAP Support (2025-10-29) 🆕

**AI-Generated Intraday Scanners Now Fully Operational**

The platform now correctly generates and executes intraday pattern scanners using real 5-minute bar data, enabling sophisticated day trading pattern detection.

#### What's New

1. **Fixed Claude System Prompt** - Intraday Data Enforcement
   - Added critical warnings about VWAP requiring intraday data
   - Keyword detection (VWAP, 5-minute, intraday) triggers ohlcv_data usage
   - Explicit examples showing proper VWAP calculation
   - Validation checklist prevents daily data approximations
   - **Result:** Claude now generates proper cumulative VWAP formulas

2. **Scanner API Fixed** - Handles Both Daily & Intraday Results
   - Updated `scanner.service.ts` to handle `date` field (intraday) and `end_date` field (daily)
   - Fallback metrics creation when daily_metrics not available
   - Proper deduplication for intraday time-based matches
   - **Result:** API returns 10 VWAP setups instead of 0

3. **Data Infrastructure** - Tech Sector Universe
   - Backfilled 163,871 5-minute bars (30 days, 62 tickers)
   - Backfilled 15,931 daily bars (1 year, 64 tickers)
   - Fixed time_of_day field (11,584 bars updated)
   - Created tech_sector universe (65 S&P Technology stocks)
   - **Result:** Full intraday data pipeline operational

#### Verified Results

**Test Query:** "Find VWAP bounce setups on 5-minute charts with price bouncing from VWAP support"

**Scanner Generated:**
- ✅ Uses ohlcv_data table with timeframe='5min'
- ✅ Calculates true VWAP: `Σ(Typical Price × Volume) / Σ(Volume)`
- ✅ Filters by time_of_day (10 AM - 3 PM ET)
- ✅ Detects VWAP touches within 0.3%, volume confirmation 1.2x+
- ✅ Returns pattern strength scores (0-100)

**Matches Found (Last 5 Days):**
1. CTSH (Cognizant) - Score 73 - 10/28
2. ETSY - Score 73 - 10/27
3. DXC - Score 72 - 10/24
4. ZM (Zoom) - Score 70 - 10/28
5. INTC (Intel) - Score 66 - 10/29
6. ON Semi - Score 65 - 10/29

**Technical Details:**
- Scan time: 52 seconds
- Script size: 269 lines
- Patterns detected: 61 total, top 10 returned
- Confidence: AI correctly identifies intraday requirements

#### Files Changed
```
backend/src/services/claude.service.ts       - Enhanced system prompt (360+ lines)
backend/src/services/scanner.service.ts      - Fixed API result handling
backend/backfill-tech-sector-intraday.ts     - Fast parallel 5min backfill
backend/backfill-tech-sector-daily.ts        - Fast parallel daily backfill
backend/fix-time-of-day.ts                   - Populated time_of_day field
backend/create-tech-universe.ts              - Universe setup script
ai-convo-history/2025-10-29-vwap-bounce-scanner-prompt.md - Documentation
```

---

## 🚀 Platform Overview

### Core Capabilities

- 🤖 **Natural Language Pattern Discovery** - Describe patterns in English, AI generates TypeScript scanners
- ⚡ **Dual-Mode Scanning** - Fast SQL queries OR complex AI-generated temporal patterns
- 📊 **Intraday & Daily Analysis** - 5-minute bars for day trading, daily bars for swing strategies
- 🎯 **Autonomous Trading Agents** - Real-time pattern detection with AI-powered trade decisions
- 🛡️ **Comprehensive Risk Management** - Position limits, exposure caps, correlation checks, confidence scoring
- 📈 **Real Market Data** - Polygon.io integration (5min/daily bars, unlimited API)
- 📱 **Paper Trading** - TradeStation integration for live market testing
- 🎨 **Visual AI Analysis** - Claude Vision API for chart pattern recognition
- 💾 **Full Audit Trail** - All AI-generated scripts saved with metadata

---

## 🏗️ Architecture

### Data Flow: Natural Language → Live Trading

```
[Natural Language Query]
    "Find VWAP bounces on 5-minute charts"
         ↓
[Claude AI - Scanner Generation]
    → Generates TypeScript scanner
    → Uses ohlcv_data (5min bars)
    → Calculates VWAP properly
         ↓
[Script Execution]
    → Runs against historical data
    → Finds 10 CTSH, ETSY, ZM, INTC setups
         ↓
[Trading Agent - Real-Time]
    → Monitors live 5min bars
    → Detects same patterns in real-time
    → AI analyzes charts (Claude Vision)
         ↓
[Risk Checks]
    → Position size < $10K
    → Portfolio exposure < 50%
    → Daily loss limit not hit
    → Confidence > 70%
    → Correlation < 0.7
         ↓
[TradeStation Execution]
    → Places paper trading order
    → Monitors position (5-sec intervals)
    → Trailing stop protection
    → Auto-exit on conditions
```

### System Components

**Backend Services (18 services)**
```typescript
// Pattern Discovery
scanner.service.ts           // Dual-mode scanner (SQL + AI)
claude.service.ts            // Script generation (scanners + strategies)
script-execution.service.ts  // Safe TypeScript execution

// Intraday Data
polygon-intraday.service.ts  // 5-minute bar fetching
market-hours.service.ts      // Trading hours validation
intraday-backfill.service.ts // Bulk data loading

// Autonomous Trading (Phase 2)
realtime-scanner.service.ts  // Live pattern detection (6 patterns)
trade-optimizer.service.ts   // AI trade analysis (Claude Vision)
execution-engine.service.ts  // Risk checks + order placement

// Portfolio Management (Phase 3)
position-monitor.service.ts  // Real-time monitoring (5-sec)
trailing-stop.service.ts     // Dynamic profit protection
risk-metrics.service.ts      // Performance analytics

// Analysis & Visualization
claude-analysis.service.ts   // Visual pattern recognition
chart-generator.service.ts   // Server-side chart rendering
backtest-router.service.ts   // Strategy execution routing
```

**Database Schema**
```sql
-- Market Data
ohlcv_data           -- Intraday (5min) & daily bars
daily_metrics        -- Computed indicators (RSI, SMA, volume ratios)
universe             -- Stock groupings (tech_sector, russell2000, us-stocks)
universe_stocks      -- Universe membership

-- Pattern Discovery
scan_history         -- Natural language scan cache
scan_results         -- Pattern matches
backtest_sets        -- Pattern collections
claude_analyses      -- AI visual analysis results

-- Autonomous Trading
trading_agents       -- Agent configurations
live_signals         -- Real-time pattern detections
trade_recommendations -- AI trade proposals
executed_trades      -- Trade lifecycle tracking
portfolio_state      -- Real-time P&L and positions
agent_activity_log   -- Full audit trail
risk_metrics         -- Performance analytics
```

---

## 📋 Feature Deep Dive

### 1. Natural Language Scanner - Intraday Patterns

**Capability:** Generate custom scanners for complex intraday patterns

**Example Queries:**
```javascript
// VWAP Patterns
"Find VWAP bounce setups on 5-minute charts with price bouncing from VWAP support"

// Opening Range Breakouts
"Stocks breaking above first 30 minutes high with 2x volume"

// Momentum Continuation
"5-minute consolidation flags after 5% morning gap with volume drying up"

// Time-of-Day Patterns
"Afternoon breakouts between 2-3 PM with increasing volume"
```

**Generated Scanner Features:**
- Proper timeframe selection (ohlcv_data, timeframe='5min')
- Cumulative intraday indicators (VWAP, VWAP slope)
- Time-of-day filtering (market hours, specific windows)
- Multi-bar pattern detection (10+ bar context)
- Volume confirmation (ratio vs 20-bar average)
- Technical filters (RSI, distance from highs, trend alignment)
- Pattern strength scoring (0-100)

**Execution:**
```bash
POST /api/scanner/scan/natural
{
  "query": "Find VWAP bounce setups on 5-minute charts...",
  "universe": "tech_sector",
  "dateRange": { "start": "2025-10-24", "end": "2025-10-29" }
}

Response: 10 matches in 52 seconds
- CTSH: 73, ETSY: 73, DXC: 72, ZM: 70, INTC: 66
```

### 2. Autonomous Trading Agents

**6 Real-Time Pattern Types:**
1. Breakout with Volume Surge
2. Gap and Go
3. Cup and Handle
4. Bull Flag
5. **VWAP Bounce** (newly fixed!)
6. Momentum Surge

**Agent Configuration:**
```typescript
{
  name: "VWAP Day Trader",
  timeframe: "intraday",
  strategies: ["vwap-bounce"],
  riskLimits: {
    maxPositionSize: 10000,        // $10K per trade
    maxPortfolioExposure: 50,      // 50% capital max
    maxDailyLoss: 500,              // Stop at -$500/day
    maxConcurrentPositions: 5,     // 5 positions max
    minConfidenceScore: 70,        // AI confidence threshold
    maxCorrelation: 0.7            // Position diversification
  }
}
```

**Risk Checks (6 layers):**
1. ✅ Position Size - Within max limit
2. ✅ Portfolio Exposure - Total deployed capital
3. ✅ Daily Loss Limit - Circuit breaker
4. ✅ Concurrent Positions - Diversification
5. ✅ Confidence Score - AI conviction level
6. ✅ Correlation - Avoid clustered risk

**Trading Flow:**
```
Real-time 5min bar → Pattern detected (VWAP bounce, score 75)
    ↓
Claude Vision analyzes chart + portfolio context
    ↓
Trade recommendation: BUY CTSH, size $5K, confidence 82%
    ↓
6 risk checks: ALL PASS
    ↓
TradeStation order placed (paper trading)
    ↓
Position monitored (5-second intervals)
    ↓
Trailing stop: Activated at +2%, trails at 5%
    ↓
Exit: Trailing stop hit at +8.2% gain
```

### 3. AI-Powered Backtesting

**Natural Language Strategy Generation:**

Input:
```
"Short momentum stocks after hyperbolic moves.
Entry when price closes below VWAP.
Stop at previous day high.
Target 20%.
Max hold 10 days."
```

Output:
- Custom TypeScript backtest script
- Entry/exit logic with precise conditions
- Position sizing and risk management
- Trade-by-trade logs with timestamps
- P&L metrics and performance statistics
- Confidence score and assumptions documented

**Advanced Features:**
- Multi-timeframe analysis (daily context + intraday entry)
- Portfolio-level backtesting (multiple positions)
- Slippage and commission modeling
- Risk-adjusted metrics (Sharpe, Sortino)
- Equity curve generation

### 4. Visual AI Analysis (Claude Vision)

**Multi-Sample Chart Analysis:**
- Select 5-10 pattern matches
- Click "Analyze with Claude"
- AI analyzes dual charts (daily + intraday)
- Receives:
  - Common visual patterns
  - Entry/exit recommendations
  - Risk assessment
  - Strategy refinements

**Chart Types:**
- Daily: 30-day context window (1400x700px)
- Intraday: 5-min bars ±5 days around signal
- Volume overlays
- VWAP lines
- Moving averages (20, 50)
- Entry/exit markers

### 5. Dashboard & Monitoring

**Agent Dashboard - 6 Tabs:**
1. **Overview** - Status, portfolio, metrics, activity log
2. **Positions** - Open positions with P&L, trailing stops, manual close
3. **Signals** - Live pattern detections with AI recommendations
4. **Trades** - Historical trade log with filters
5. **Performance** - Equity curve, win/loss charts, statistics
6. **Settings** - Risk limits, strategy selection, agent config

**Real-Time Updates:**
- Portfolio state: Every 5 seconds
- Position P&L: Live updates
- Signal feed: As detected
- Activity log: Real-time events

---

## 🏃 Quick Start

### Prerequisites

```bash
Node.js 18+
Polygon.io API key (free tier: 5 calls/min, unlimited with paid)
Anthropic API key (Claude 3.7 Sonnet)
TradeStation account (optional, for paper trading)
```

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

Create `backend/.env`:
```env
# Required
POLYGON_API_KEY=your_polygon_key
ANTHROPIC_API_KEY=your_anthropic_key

# TradeStation (optional)
TRADESTATION_API_KEY=your_ts_key
TRADESTATION_API_SECRET=your_ts_secret
TRADESTATION_ACCOUNT_ID=SIM1234567M

# Tech Sector Watchlist (for intraday scanning)
WATCHLIST_TICKERS=AAPL,GOOGL,MSFT,AMZN,META,NVDA,TSLA,AMD,INTC,CSCO,ORCL,QCOM,AVGO,TXN,NFLX,CRM,ADBE,ACN,NOW,SHOP,ZM,ETSY,CTSH,DXC,WBD,ON,LRCX,MU,GOOG

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
- API: http://localhost:3000
- Docs: http://localhost:3000/api-docs

---

## 💾 Database Backup & Restore

**Important**: The 43MB database contains irreplaceable data (agent learning history, trading records, pattern collections). Automated backups protect against data loss.

### Quick Commands

```bash
# Backup database manually
cd backend && npm run backup

# Restore from most recent backup
cd backend && npm run restore:from-backup

# Restore from scratch (rebuilds with market data)
cd backend && npm run restore
```

### Automated Backups

Daily backups run automatically at 2:00 AM:
- **Location**: `~/Backups/ai-backtest/`
- **Retention**: Last 30 backups
- **Includes**: Database + generated scripts

**Setup** (one-time):
```bash
bash backend/helper-scripts/install-scheduled-backup.sh
```

**Verify**:
```bash
launchctl list | grep com.aibacktest.backup
ls -lth ~/Backups/ai-backtest/*.db | head -5
```

### Complete Documentation

See **[docs/DATABASE.md](docs/DATABASE.md)** for:
- Detailed backup/restore procedures
- Backfill scripts reference
- Troubleshooting guide
- Database schema overview

---

## 📖 Usage Examples

### Example 1: Find Intraday VWAP Bounces

```bash
curl -X POST http://localhost:3000/api/scanner/scan/natural \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Find VWAP bounce setups on 5-minute charts with price bouncing from VWAP support. Stock in uptrend, volume > 1.2x average, time between 10 AM - 3 PM ET",
    "universe": "tech_sector",
    "dateRange": {
      "start": "2025-10-24",
      "end": "2025-10-29"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "total_matches": 10,
  "scan_time_ms": 52323,
  "matches": [
    {
      "ticker": "CTSH",
      "date": "2025-10-28",
      "score": 73,
      "metrics": {
        "price": 68.2,
        "vwap": 68.0,
        "distance_from_vwap_percent": 0.3,
        "volume_ratio": 2.12,
        "rsi_14": 55.5
      }
    }
  ]
}
```

### Example 2: Create Autonomous Trading Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VWAP Bounce Hunter",
    "accountId": "SIM3113503M",
    "timeframe": "intraday",
    "strategies": ["vwap-bounce"],
    "riskLimits": {
      "maxPositionSize": 10000,
      "maxPortfolioExposure": 50,
      "maxDailyLoss": 500,
      "maxConcurrentPositions": 5,
      "minConfidenceScore": 70,
      "maxCorrelation": 0.7
    }
  }'
```

### Example 3: Backtest Strategy

```bash
curl -X POST http://localhost:3000/api/backtests/execute-intelligent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Buy VWAP bounces on AAPL. Entry when price bounces above VWAP with volume confirmation. Stop at -2%, target +5%. Max hold 2 days.",
    "ticker": "AAPL",
    "timeframe": "5min",
    "strategyType": "momentum"
  }'
```

---

## 🗺️ Roadmap & Next Steps

### ✅ Current Status: Phase 5 Complete

**Recent Achievements:**
- ✅ Intraday scanner generation (VWAP patterns)
- ✅ 5-minute bar data pipeline
- ✅ Tech sector universe (65 stocks)
- ✅ Natural language → execution pipeline
- ✅ Autonomous trading agents (6 patterns)
- ✅ Dashboard with real-time monitoring

### 🎯 Suggested Next Steps

#### **Priority 1: Expand Intraday Pattern Library**

**Goal:** Build comprehensive day trading pattern detection

**Tasks:**
1. **Opening Range Breakout (ORB)**
   - First 30-min range detection
   - Volume confirmation
   - Breakout timing (9:45-10:30 AM optimal)

2. **VWAP Rejection Shorts**
   - Price fails to reclaim VWAP
   - Multiple tests with declining volume
   - Entry on lower high below VWAP

3. **Time-Based Patterns**
   - Morning momentum (9:30-10:30)
   - Lunch consolidation (11:30-1:00)
   - Afternoon breakouts (2:00-3:30)
   - Power hour momentum (3:00-4:00)

4. **Multi-Timeframe Confirmation**
   - 1min aggressive entries
   - 5min primary timeframe
   - 15min trend confirmation
   - Daily higher timeframe bias

**Implementation:**
```typescript
// Add to realtime-scanner.service.ts patterns
{
  name: 'orb-breakout',
  description: 'First 30-min range breakout with volume',
  timeframes: ['1min', '5min'],
  requiredBars: 50,
  scanner: detectORBBreakout
}
```

#### **Priority 2: Enhanced Risk Management**

**Goal:** Improve position sizing and portfolio-level risk

**Tasks:**
1. **Dynamic Position Sizing**
   - Kelly Criterion integration (already built)
   - ATR-based sizing (volatility adjustment)
   - Account growth scaling
   - Drawdown reduction modes

2. **Portfolio Heat Management**
   - Sector exposure limits (max 30% per sector)
   - Market cap diversification
   - Beta-weighted exposure
   - Correlation clustering detection

3. **Adaptive Risk Limits**
   - Reduce size after losing streak
   - Increase confidence threshold after losses
   - Pause trading on daily loss limit
   - Auto-restart on new trading day

4. **Slippage & Commission Modeling**
   - Realistic fill simulation
   - Spread cost estimation
   - Time-of-day liquidity adjustment
   - Market impact modeling

**Implementation:**
```typescript
// Enhanced risk limits
riskLimits: {
  // Existing
  maxPositionSize: 10000,
  maxPortfolioExposure: 50,

  // New
  maxSectorExposure: 30,        // 30% per sector
  maxBetaWeightedDelta: 50000,  // Portfolio beta limit
  maxCorrelatedPositions: 3,    // Max 3 correlated stocks
  adaptiveScaling: true,        // Enable adaptive sizing
  slippageModel: 'realistic'    // Use slippage estimates
}
```

#### **Priority 3: Real-Time Data Optimization**

**Goal:** Reduce latency and improve data freshness

**Tasks:**
1. **WebSocket Integration**
   - Replace polling with WebSocket for bars
   - Eliminate 5-second delay
   - Real-time VWAP calculation
   - Sub-second pattern detection

2. **Data Caching Strategy**
   - Redis for hot data (current bars)
   - SQLite for cold data (historical)
   - In-memory lookups for active tickers
   - TTL-based cache invalidation

3. **Incremental VWAP Updates**
   - Don't recalculate full day on each bar
   - Maintain running cumulative sums
   - Update only new bar contribution
   - 10x speed improvement

4. **Parallel Pattern Scanning**
   - Scan multiple tickers concurrently
   - Use worker threads for heavy computation
   - Priority queue (active positions first)
   - Batched database writes

**Architecture:**
```
TradeStation WebSocket → [Kafka Queue] → Pattern Scanner Workers (4x)
                              ↓
                         Redis Cache (hot data)
                              ↓
                    SQLite (historical + audit trail)
```

#### **Priority 4: Paper Trading Validation**

**Goal:** Validate all patterns with real market data

**Tasks:**
1. **Forward Testing Framework**
   - Run agents on paper trading for 30 days
   - Track actual fills vs theoretical
   - Measure slippage and reject rates
   - Compare results to backtest expectations

2. **Pattern Performance Tracking**
   - Win rate by pattern type
   - Avg hold time by pattern
   - Best/worst time-of-day
   - Market condition correlation

3. **Strategy Leaderboard**
   - Rank patterns by Sharpe ratio
   - Identify high-conviction setups
   - Filter low-performing patterns
   - Optimize strategy mix per agent

4. **Alerts & Notifications**
   - Discord/Slack integration
   - Trade execution alerts
   - Daily performance summary
   - Risk limit warnings

#### **Priority 5: Advanced Analytics**

**Goal:** Deep insights into strategy performance

**Tasks:**
1. **Trade Attribution Analysis**
   - P&L breakdown by pattern type
   - Win/loss by time of day
   - Performance by market condition
   - Holding period analysis

2. **Market Regime Detection**
   - Volatility clustering (VIX levels)
   - Trend vs range-bound markets
   - High/low volume environments
   - Adapt strategy mix by regime

3. **Machine Learning Enhancements**
   - Train classifiers on historical patterns
   - Predict pattern success probability
   - Optimize entry/exit timing
   - Feature importance analysis

4. **Scenario Analysis**
   - Monte Carlo simulation
   - Stress testing (2008, 2020, 2022)
   - Drawdown recovery analysis
   - Capital allocation optimization

---

## 📊 Real Results

### Intraday VWAP Scanner (2025-10-29)

**Test:** Natural language intraday pattern detection

**Query:** "Find VWAP bounce setups on 5-minute charts with price bouncing from VWAP support"

**Results:**
- ✅ **10 matches found** (tech sector, 5 days)
- ✅ **Scan time:** 52 seconds
- ✅ **Pattern quality:** Scores 65-73 (high confidence)
- ✅ **Correct methodology:** Uses 5min bars, calculates cumulative VWAP
- ✅ **Time filtering:** 10 AM - 3 PM ET (optimal liquidity)

**Top Setups:**
1. CTSH (Cognizant) - 73 score, 10/28, 13:15
2. ETSY - 73 score, 10/27, 14:30
3. DXC - 72 score, 10/24, 11:45
4. ZM (Zoom) - 70 score, 10/28, 12:30

**Key Insights:**
- ✅ VWAP bounces are detectable with AI-generated scanners
- ✅ Volume confirmation (1.2-3.6x) critical for quality
- ✅ Distance from VWAP <0.3% indicates precision touch
- ✅ RSI 40-70 range filters out extremes
- ⚡ Ready for autonomous agent deployment

### Hyperbolic Short Strategy (2025-10-25)

**Test:** Mean reversion shorts after extreme upward moves

**Scanner Criteria:**
- 3+ consecutive up days
- 50%+ total gain
- 2x+ volume ratio

**Results:**
- ✅ **16 candidates found** (Russell 2000, 10 months)
- ✅ **4 backtested:** FUBO, PRAX, BYND, REPL
- ✅ **Win rate:** 67% (2 wins, 1 loss, 1 script error)
- ✅ **Average win:** +3.6%
- ⚠️ **Average loss:** -6.4%

**Key Insights:**
- ✅ Reversals after hyperbolic moves are real
- ⚠️ Entry timing critical (5-7 days post-peak optimal)
- ❌ 40% profit target too aggressive
- ✅ 20% target more realistic
- 📖 See: `ai-convo-history/2025-10-25-backtest-results-analysis.md`

---

## 🛠️ Development

### Backend Development

```bash
cd backend

# Development with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Database reset
rm backtesting.db && npm start
```

### Frontend Development

```bash
cd frontend

# Dev server with HMR
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Data Management

```bash
# Backfill tech sector (5-minute bars, 30 days)
cd backend
npx ts-node backfill-tech-sector-intraday.ts

# Backfill tech sector (daily bars, 1 year)
npx ts-node backfill-tech-sector-daily.ts

# Create universe
npx ts-node create-tech-universe.ts

# Fix time_of_day field (if needed)
npx ts-node fix-time-of-day.ts
```

---

## 📚 Documentation

### Technical Documentation
- **README.md** - This file (overview, quick start, roadmap)
- **ORIGINAL_REQUIREMENTS.md** - Initial project requirements
- **backend/src/services/** - Inline code documentation

### Analysis Documents
All in `ai-convo-history/`:
- **2025-10-29-vwap-bounce-scanner-prompt.md** - VWAP scanner prompts (5 variations)
- **2025-10-25-backtest-results-analysis.md** - Hyperbolic short strategy (67% win rate)
- **2025-10-26-scanner-script-persistence.md** - AI script saving implementation
- **2025-10-25-memory-management-fix.md** - Scanner streaming architecture

---

## 🐛 Troubleshooting

### Scanner Issues

**No matches found:**
```bash
# Verify universe exists
sqlite3 backend/backtesting.db "SELECT * FROM universe WHERE name='tech_sector'"

# Check data availability
sqlite3 backend/backtesting.db "SELECT ticker, COUNT(*) FROM ohlcv_data WHERE timeframe='5min' GROUP BY ticker"

# Run test scanner directly
cd backend
npx ts-node scanner-XXXXX.ts  # Use actual generated scanner file
```

**Script generation fails:**
```bash
# Check Claude API key
echo $ANTHROPIC_API_KEY

# Review generated script for errors
cat backend/claude-generated-scripts/scanner-*.ts

# Check system prompt updates
git log --oneline backend/src/services/claude.service.ts
```

### Data Issues

**Missing 5-minute bars:**
```bash
# Re-run backfill
cd backend
npx ts-node backfill-tech-sector-intraday.ts

# Check Polygon API status
curl "https://api.polygon.io/v2/aggs/ticker/AAPL/range/5/minute/2025-10-28/2025-10-29?apiKey=YOUR_KEY"
```

**time_of_day is NULL:**
```bash
cd backend
npx ts-node fix-time-of-day.ts

# Verify fix
sqlite3 backtesting.db "SELECT COUNT(*) FROM ohlcv_data WHERE timeframe='5min' AND time_of_day IS NULL"
```

### API Issues

**CORS errors:**
- Verify backend on port 3000
- Check `frontend/vite.config.ts` proxy settings
- Restart both frontend and backend

**Rate limits:**
- Polygon free tier: 5 calls/minute
- Use unlimited plan for production
- Add delays in backfill scripts

---

## 🤝 Contributing

This is an active research and development project. Areas for contribution:

1. **Pattern Library** - Add new intraday pattern detectors
2. **Risk Models** - Improve position sizing and portfolio risk
3. **AI Prompts** - Enhance Claude system prompts for better script generation
4. **Strategy Templates** - Contribute validated strategy scripts
5. **Documentation** - Add tutorials, examples, analysis reports

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

- **Anthropic Claude** - AI-powered script generation and visual analysis
- **Polygon.io** - Comprehensive market data API
- **TradeStation** - Paper trading and live execution
- **React + Vite** - Modern frontend framework
- **TailwindCSS v4** - Beautiful, responsive UI
- **Chart.js** - Server-side chart rendering

---

**Built with Claude Code** 🤖

*An autonomous trading platform where natural language becomes production trading strategies.*

*Last updated: 2025-10-29*
