# AI-Powered Algorithmic Trading Backtest Platform

A sophisticated backtesting platform with natural language query support, intelligent routing, and dynamic script generation for algorithmic trading strategies.

## Overview

This platform combines:
- ✅ **React + TypeScript frontend** with natural language interface
- ✅ **Intelligent routing system** that analyzes queries and optimizes execution
- ✅ **Dynamic script generation** for complex, multi-day backtests
- ✅ **Opening Range Breakout (ORB) strategy** with customizable parameters
- ✅ **TypeScript/Express backend** with SQLite database
- ✅ **Polygon.io integration** for real market data
- ✅ **RESTful API** for programmatic access

## Features

### Natural Language Interface
Describe your backtests in plain English:
- "Backtest CRML for the past 5 days, exit at noon"
- "Test HOOD on 2025-07-31"
- "Run opening range breakout for the last 2 weeks"

### Intelligent Routing
The platform automatically:
- Parses natural language queries
- Determines optimal execution strategy
- Generates date ranges from phrases like "past 10 days"
- Detects custom exit times ("noon", "14:00")
- Routes to appropriate backend implementation

### Supported Query Types
- **Date ranges**: "past 10 days", "last 2 weeks", "previous month"
- **Specific dates**: "2025-10-10, 2025-10-15, 2025-10-20"
- **Custom exits**: "exit at noon", "close at 14:00"
- **Combined**: "Test past 5 days, exit at noon"

### Web Interface
Modern, responsive UI with:
- Natural language query input
- Real-time backtest execution
- Performance metrics dashboard
- Trade-by-trade breakdown
- Routing decision transparency

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Polygon.io API key ([Get free key](https://polygon.io))

### Installation

```bash
# Clone the repository
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

Create `.env` in project root:

```env
POLYGON_API_KEY=your_polygon_key_here
DATABASE_PATH=./backtesting.db
PORT=3000
NODE_ENV=development
```

### Start the Platform

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Access the web interface:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Usage

### Web Interface (Recommended)

1. Open http://localhost:5173
2. Enter ticker symbol (e.g., `HOOD`, `CRML`, `NVDA`)
3. Describe your backtest in natural language
4. Click "Run Backtest"
5. View comprehensive results

**Example queries:**
- `Backtest for the past 10 trading days`
- `Test past 5 days, exit at noon`
- `Run on 2025-10-10, 2025-10-15, 2025-10-20`

### API Usage

#### Intelligent Routing Endpoint (Recommended)

```bash
POST /api/backtests/execute-intelligent
Content-Type: application/json

{
  "prompt": "Backtest CRML for past 5 days, exit at noon",
  "ticker": "CRML",
  "strategyType": "orb",
  "timeframe": "5min",
  "config": {}
}
```

**Response:**
```json
{
  "success": true,
  "executionId": "uuid",
  "results": {
    "trades": [...],
    "metrics": {
      "total_trades": 4,
      "win_rate": 75.0,
      "total_pnl": 3.11,
      "avg_pnl": 0.78,
      ...
    },
    "summary": "..."
  },
  "routing": {
    "strategy": "custom-dates",
    "reason": "Date range query detected: 5 trading days",
    "dates": ["2025-10-15", "2025-10-16", ...]
  },
  "executionTime": 1234
}
```

## Architecture

### Backend Components

**Intelligent Routing System**
- `BacktestRouterService` - Analyzes queries and determines execution strategy
- `DateQueryService` - Database queries for earnings and special dates
- `ScriptGeneratorService` - Dynamic TypeScript script generation
- `ScriptExecutionService` - Executes generated scripts safely

**Routing Strategies**
- `template-api` - Standard single-day backtests
- `custom-dates` - Multi-day with date injection
- `fully-custom` - Future: Complex custom scripts

**Templates**
- `orb-backtest.template.ts` - Single-day ORB strategy
- `orb-multiday.template.ts` - Multi-day aggregation

### Frontend Components

**Tech Stack**
- React 18 + TypeScript
- Vite (build tool & dev server)
- TailwindCSS v4 (styling)
- Axios (API communication)

**Components**
- `BacktestForm` - Natural language input interface
- `ResultsDisplay` - Results visualization with metrics & trades
- `App` - Main application container

## API Documentation

### Health Check

```bash
GET /health
```

Returns: `{"status":"ok","timestamp":"..."}`

### Intelligent Backtest Execution

```bash
POST /api/backtests/execute-intelligent
```

**Request:**
```json
{
  "prompt": "string",      // Natural language query
  "ticker": "string",      // Stock ticker
  "strategyType": "orb",   // Strategy type (default: orb)
  "timeframe": "5min",     // Timeframe (default: 5min)
  "config": {}             // Optional config overrides
}
```

**Routing Decision:**
The system automatically:
1. Parses the prompt for date patterns
2. Detects exit time specifications
3. Generates appropriate date lists
4. Selects optimal template
5. Executes backtest
6. Returns results with routing transparency

### Data Management

#### Fetch Historical Data

```bash
POST /api/data/fetch
Content-Type: application/json

{
  "ticker": "AAPL",
  "timeframe": "5min",
  "from": "2025-01-01",
  "to": "2025-12-31"
}
```

**Supported Timeframes:**
- Intraday: `1min`, `5min`, `15min`, `30min`, `1hour`
- Daily+: `1day`, `1week`, `1month`

#### Get Stored Data

```bash
GET /api/data/{ticker}?timeframe=5min&from=1672531200000&to=1704067200000
```

#### Check Data Availability

```bash
GET /api/data/{ticker}/check?timeframe=5min
```

### Legacy Strategy Management

For advanced users who want full control:

#### Create Strategy

```bash
POST /api/strategies
Content-Type: application/json

{
  "name": "SMA Crossover",
  "ticker": "AAPL",
  "timeframe": "1day",
  "indicators": [
    {
      "type": "SMA",
      "id": "sma50",
      "params": {"period": 50, "source": "close"}
    }
  ],
  "entryRules": {
    "conditions": [
      {"type": "expression", "expression": "close > sma50"}
    ]
  },
  "exitRules": {
    "conditions": [
      {"type": "expression", "expression": "close < sma50"}
    ]
  },
  "positionSizing": {
    "method": "PERCENT_PORTFOLIO",
    "value": 100
  }
}
```

#### Get All Strategies

```bash
GET /api/strategies
```

#### Get Strategy by ID

```bash
GET /api/strategies/{id}
```

#### Update Strategy

```bash
PUT /api/strategies/{id}
```

#### Delete Strategy

```bash
DELETE /api/strategies/{id}
```

### Legacy Backtest Management

#### Run Backtest

```bash
POST /api/backtests
Content-Type: application/json

{
  "strategyId": 1,
  "startDate": "2023-01-01",
  "endDate": "2023-12-31",
  "initialCapital": 10000,
  "commission": 1,
  "slippage": 0.1
}
```

#### Get All Backtests

```bash
GET /api/backtests
```

#### Get Backtest Results

```bash
GET /api/backtests/{id}
```

Returns complete results including metrics, equity curve, and trade log.

#### Delete Backtest

```bash
DELETE /api/backtests/{id}
```

## Opening Range Breakout (ORB) Strategy

### Description

The ORB strategy:
1. Identifies the high/low of the first 5-minute bar (9:30-9:35 AM EST)
2. Enters long when price breaks above the opening range high
3. Exits at market close (configurable to noon, custom time, etc.)
4. Optional: Trailing stops, market filters

### Customization

Through natural language:
- **Exit time**: "exit at noon", "close at 14:00"
- **Date range**: "past 10 days", "last 2 weeks"
- **Specific dates**: "2025-10-10, 2025-10-15"

Through API config:
```json
{
  "config": {
    "exitTime": "12:00",
    "trailingStopPct": 2.0,
    "marketFilterTicker": "QQQ"
  }
}
```

## Supported Indicators

| Indicator | Description | Parameters |
|-----------|-------------|------------|
| `SMA` | Simple Moving Average | `period`, `source` |
| `EMA` | Exponential Moving Average | `period`, `source` |
| `RSI` | Relative Strength Index | `period`, `source` |
| `ATR` | Average True Range | `period` |

## Performance Metrics

The platform calculates:

**Returns**
- Total Return ($ and %)
- Average P&L per trade
- Win rate

**Risk Metrics**
- Maximum drawdown
- Sharpe ratio
- Standard deviation

**Trade Statistics**
- Total trades
- Winning/losing trades
- Largest win/loss
- Average win/loss
- Profit factor

## Real-World Examples

See [CRML_ORB_RESULTS.md](CRML_ORB_RESULTS.md) for a detailed 9-day backtest showing:
- 75% win rate
- +$311 profit on 100 shares
- Trade-by-trade breakdown
- Analysis and insights

## Project Structure

```
ai-backtest/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── data.ts
│   │   │   │   ├── strategies.ts
│   │   │   │   └── backtests.ts        # Intelligent routing endpoint
│   │   │   └── server.ts
│   │   ├── services/
│   │   │   ├── polygon.service.ts
│   │   │   ├── backtest.service.ts
│   │   │   ├── backtest-router.service.ts   # NEW: Intelligent routing
│   │   │   ├── date-query.service.ts        # NEW: Date filtering
│   │   │   ├── script-generator.service.ts   # NEW: Dynamic scripts
│   │   │   └── script-execution.service.ts   # NEW: Script runner
│   │   ├── templates/
│   │   │   ├── orb-backtest.template.ts
│   │   │   └── orb-multiday.template.ts     # NEW: Multi-day template
│   │   └── types/
│   │       ├── strategy.types.ts
│   │       ├── backtest.types.ts
│   │       └── script.types.ts              # NEW: Script types
│   └── package.json
├── frontend/                                  # NEW: React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── BacktestForm.tsx
│   │   │   └── ResultsDisplay.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── QUICK_START.md                            # Updated
├── README.md                                 # This file (updated)
├── INTELLIGENT_ROUTING_SUMMARY.md           # Routing documentation
├── FRONTEND_COMPLETE.md                     # Frontend documentation
└── CRML_ORB_RESULTS.md                      # Real backtest example
```

## Development

### Backend Development

```bash
cd backend

# Development with auto-reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

### Frontend Development

```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Type Checking

Both frontend and backend use TypeScript with strict mode enabled.

## Documentation

- **[QUICK_START.md](QUICK_START.md)** - Get started in 5 minutes
- **[INTELLIGENT_ROUTING_SUMMARY.md](INTELLIGENT_ROUTING_SUMMARY.md)** - Routing system details
- **[FRONTEND_COMPLETE.md](FRONTEND_COMPLETE.md)** - Frontend architecture
- **[CRML_ORB_RESULTS.md](CRML_ORB_RESULTS.md)** - Real backtest example
- **[DYNAMIC_SCRIPT_GENERATION.md](DYNAMIC_SCRIPT_GENERATION.md)** - Script generation details

## Troubleshooting

### Database Issues

Delete and recreate:
```bash
rm backtesting.db
cd backend && npm start  # Database auto-recreates
```

### Polygon API Rate Limits

Free tier limits:
- Wait between requests
- Reduce date ranges
- Use cached data

### Frontend Build Errors

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### CORS Issues

Vite proxy is configured for `/api` routes. If you encounter CORS:
- Verify backend is running on port 3000
- Check `vite.config.ts` proxy settings

## Roadmap

### Current (Phase 2) ✅
- React + TypeScript frontend
- Intelligent routing system
- Natural language query support
- Dynamic script generation
- Multi-day backtesting

### Phase 3 (Next)
- Equity curve visualization
- Strategy comparison
- Historical backtest management
- Export to CSV/PDF
- Dark mode

### Phase 4 (Future)
- Real-time progress updates
- WebSocket integration
- Advanced parameter optimization
- Portfolio-level backtesting
- Custom indicator builder

## Contributing

This project is in active development. Contributions welcome!

## License

MIT

## Support

- **Issues**: [GitHub Issues](https://github.com/edkim/ai-backtest/issues)
- **Documentation**: See docs folder
- **Examples**: Check CRML_ORB_RESULTS.md

---

Built with ❤️ using React, TypeScript, Node.js, and Polygon.io
