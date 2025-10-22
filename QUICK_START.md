# Quick Start Guide

Get started with the AI-powered backtesting platform in minutes!

## Prerequisites

- Node.js 18+ and npm
- Polygon.io API key ([Get one free](https://polygon.io))

## Get Started in 5 Minutes

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure API Key

Create/edit `.env` in the project root:

```env
POLYGON_API_KEY=your_actual_key_here
DATABASE_PATH=./backtesting.db
PORT=3000
```

### 3. Start Both Servers

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

- Backend: http://localhost:3000
- Frontend: http://localhost:5173 (or 5174, 5175 if port is in use)

### 4. Open the Web Interface

Navigate to **http://localhost:5173** in your browser.

You'll see a clean, modern interface with:
- Natural language query input
- Ticker symbol field
- Example prompts to get started
- Real-time results display

## Your First Backtest (Web UI)

1. **Enter ticker**: `HOOD`
2. **Enter prompt**: `Backtest for the past 10 trading days`
3. **Click "Run Backtest"**
4. **View results**: Metrics, trades, and routing decision!

### Example Queries

The platform understands natural language:

```
"Backtest CRML for the past 5 days, exit at noon"
"Test HOOD on 2025-07-31"
"Run ORB on NVDA for 2025-10-10, 2025-10-15, 2025-10-20"
"Test opening range breakout for the last 2 weeks"
```

## Your First Backtest (API)

If you prefer the API directly:

### Intelligent Routing Endpoint (Recommended)

```bash
curl -X POST http://localhost:3000/api/backtests/execute-intelligent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Backtest HOOD for the past 10 trading days",
    "ticker": "HOOD",
    "strategyType": "orb",
    "timeframe": "5min"
  }'
```

The AI will automatically:
- Parse your natural language query
- Determine the optimal execution strategy
- Generate appropriate date ranges
- Execute the backtest
- Return comprehensive results

### Response Format

```json
{
  "success": true,
  "executionId": "uuid",
  "results": {
    "trades": [...],
    "metrics": {
      "total_trades": 15,
      "win_rate": 60.0,
      "total_pnl": 45.23,
      ...
    }
  },
  "routing": {
    "strategy": "custom-dates",
    "reason": "Date range query detected: 10 trading days",
    "dates": ["2025-10-08", "2025-10-09", ...]
  },
  "executionTime": 1234
}
```

## Supported Query Types

### Date Ranges
- `"past 10 days"` - Last 10 trading days
- `"last 2 weeks"` - Last 10 trading days (2 × 5)
- `"previous month"` - Last ~21 trading days

### Specific Dates
- `"2025-10-10, 2025-10-15, 2025-10-20"`
- `"on Oct 8, Oct 10, Oct 15"`

### Custom Exit Times
- `"exit at noon"` - Close positions at 12:00 PM
- `"close at 14:00"` - Close positions at 2:00 PM

### Combined Queries
- `"Test past 5 days, exit at noon"`
- `"Backtest for Oct 15, Oct 20, exit at 14:00"`

## Available Strategies

Currently supported:
- **ORB (Opening Range Breakout)** - 5-minute opening range strategy
  - Entry: Price breaks above 9:30-9:35 AM high
  - Exit: Configurable (market close, noon, custom time)
  - Optional: Trailing stops, market filters

## Test the Installation

```bash
# Backend health check
curl http://localhost:3000/health

# Should return: {"status":"ok","timestamp":"..."}

# Frontend check - open in browser
open http://localhost:5173
```

## What You'll See

The backtest results include:

- **Routing Decision** - How the AI interpreted your query
- **Performance Metrics** - Total trades, win rate, P&L
- **Trade Details** - Entry/exit prices, times, and reasons
- **Daily Breakdown** - Results for each trading day
- **Summary Text** - Human-readable summary

## Advanced: Legacy API Workflow

For advanced users who want full control:

### 1. Fetch Data

```bash
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "SPY",
    "timeframe": "1day",
    "from": "2023-01-01",
    "to": "2023-12-31"
  }'
```

### 2. Create Strategy

```bash
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple SMA Strategy",
    "ticker": "SPY",
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
  }'
```

### 3. Run Backtest

```bash
curl -X POST http://localhost:3000/api/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": 1,
    "startDate": "2023-01-01",
    "endDate": "2023-12-31",
    "initialCapital": 10000
  }'
```

### 4. View Results

```bash
curl http://localhost:3000/api/backtests/1 | python -m json.tool
```

## Tech Stack

- **Backend**: Node.js + TypeScript + Express + SQLite
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Data**: Polygon.io API for market data
- **Strategy**: Dynamic script generation with intelligent routing
- **UI**: Modern, responsive interface with natural language input

## Available Indicators

- `SMA` - Simple Moving Average
- `EMA` - Exponential Moving Average
- `RSI` - Relative Strength Index
- `ATR` - Average True Range

## Available Timeframes

- Intraday: `1min`, `5min`, `15min`, `30min`, `1hour`
- Daily+: `1day`, `1week`, `1month`

## Tips

1. **Start with the Web UI** - Easiest way to get started
2. **Use natural language** - The AI understands plain English
3. **Start simple** - Try "past 10 days" before complex queries
4. **Check existing data** - The platform uses cached market data
5. **Try popular tickers** - HOOD, CRML, NVDA, AAPL have good data

## Troubleshooting

### Backend won't start?
- Check Node.js 18+ is installed: `node --version`
- Verify port 3000 is available
- Check `.env` file exists with API key

### Frontend won't load?
- Ensure backend is running first
- Check console for errors (F12 in browser)
- Try different port if 5173 is occupied

### No results from backtest?
- Verify you have market data for the ticker
- Check that dates are valid trading days
- Ensure ticker symbol is correct (uppercase)

### API errors?
- Check Polygon API key is valid
- Free tier has rate limits - wait between requests
- Verify date formats (YYYY-MM-DD)

## Next Steps

- **Explore examples** - Click example prompts in the UI
- **Read documentation** - Check [README.md](README.md) for details
- **View results** - See [CRML_ORB_RESULTS.md](CRML_ORB_RESULTS.md) for real examples
- **Learn routing** - Read [INTELLIGENT_ROUTING_SUMMARY.md](INTELLIGENT_ROUTING_SUMMARY.md)
- **Frontend details** - Check [FRONTEND_COMPLETE.md](FRONTEND_COMPLETE.md)

## Support & Documentation

- **Quick Start**: This file
- **Full API Docs**: [README.md](README.md)
- **Routing System**: [INTELLIGENT_ROUTING_SUMMARY.md](INTELLIGENT_ROUTING_SUMMARY.md)
- **Frontend Guide**: [FRONTEND_COMPLETE.md](FRONTEND_COMPLETE.md)
- **Real Examples**: [CRML_ORB_RESULTS.md](CRML_ORB_RESULTS.md)

---

**You're all set!** Open http://localhost:5173 and start backtesting! 🚀
