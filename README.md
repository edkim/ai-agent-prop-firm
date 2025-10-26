# AI-Powered Algorithmic Trading Backtest Platform

A sophisticated backtesting and pattern discovery platform combining AI-powered script generation, natural language query support, and intelligent strategy analysis for algorithmic trading.

## 🚀 Overview

This platform enables traders to discover, backtest, and validate trading strategies using natural language queries and AI-generated code. It combines traditional SQL-based pattern scanning with Claude AI for complex temporal pattern detection and custom strategy generation.

### Key Capabilities

- 🤖 **AI-Powered Pattern Discovery** - Natural language scanner generates custom TypeScript code for complex pattern detection
- ⚡ **High-Performance SQL Scanner** - Memory-safe streaming scanner for quick pattern searches across universes
- 📊 **Dynamic Strategy Generation** - Claude generates custom backtest scripts from plain English descriptions
- 🔍 **Pattern Analysis** - Sample sets management for tracking and validating discovered patterns
- 💾 **Script Persistence** - All AI-generated code saved with metadata for audit trail and reuse
- 📈 **Real Market Data** - Polygon.io integration for intraday and daily data

## ✨ What's New (Phase 4)

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
- One-click "Save to Sample Set" dropdown
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

### 3. Sample Sets Management

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

### Sample Sets API

```bash
# Create sample set
POST /api/scanner/sample-sets
{
  "name": "Hyperbolic Reversals 2025",
  "description": "100%+ gains followed by 20%+ drops",
  "pattern_type": "mean_reversion"
}

# Add scan result
POST /api/scanner/sample-sets/{id}/results
{
  "ticker": "FUBO",
  "start_date": "2025-01-02",
  "end_date": "2025-01-13",
  "peak_date": "2025-01-06",
  "notes": "251% gain, 53x volume, RSI 91.5"
}

# Get all sample sets
GET /api/scanner/sample-sets

# Get results for a set
GET /api/scanner/sample-sets/{id}/results
```

## 🏗️ Architecture

### Backend Stack

**Core Services:**
- `scanner.service.ts` - Dual-mode scanner (SQL + AI)
- `claude.service.ts` - AI script generation
- `backtest-router.service.ts` - Intelligent strategy routing
- `script-execution.service.ts` - Safe TypeScript execution
- `sample-set.service.ts` - Pattern collection management
- `universe-data.service.ts` - Market data management

**API Routes:**
- `/api/scanner/*` - Pattern scanning endpoints
- `/api/backtests/*` - Strategy backtesting
- `/api/data/*` - Market data management
- `/api/scanner/sample-sets/*` - Sample sets CRUD

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
  - `SampleSetManager.tsx` - Pattern collection UI

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
│   │   │   │   ├── sample-sets.ts       # Sample sets CRUD
│   │   │   │   └── data.ts              # Data management
│   │   │   └── server.ts
│   │   ├── services/
│   │   │   ├── scanner.service.ts       # Dual-mode scanner
│   │   │   ├── claude.service.ts        # AI integration
│   │   │   ├── backtest-router.service.ts  # Strategy routing
│   │   │   ├── script-execution.service.ts # Script runner
│   │   │   ├── sample-set.service.ts    # Pattern management
│   │   │   ├── polygon.service.ts       # Market data
│   │   │   └── universe-data.service.ts # Universe management
│   │   ├── database/
│   │   │   ├── db.ts                    # SQLite connection
│   │   │   └── schema.sql               # Database schema
│   │   └── types/
│   │       ├── scanner.types.ts
│   │       ├── backtest.types.ts
│   │       └── sample-set.types.ts
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
│   │   │   └── SampleSetManager.tsx     # NEW
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── sampleSetsApi.ts         # NEW
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

**Phase 4 Progress:**
- ✅ **Chart Thumbnails** - On-demand chart generation for scan results
  - Server-side chart rendering with ChartJS
  - SQLite caching for instant retrieval
  - Inline chart display in scanner results
  - One-click save to sample sets

### Phase 4: Quality & Reliability (Remaining)

**Next Priorities:**
1. **Script Generation Improvements**
   - Reduce 25% failure rate
   - TypeScript validation before execution
   - Retry logic with error feedback
   - Template library for common patterns

2. **Strategy Parameter Optimization**
   - Automated parameter testing
   - Historical validation across sample sets
   - Win rate and risk/reward analysis

3. **Enhanced Pattern Discovery**
   - Multi-pattern scanning in single query
   - Pattern correlation analysis
   - Automated sample set population

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

*Last updated: 2025-10-26*
