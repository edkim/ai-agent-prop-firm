# Polygon Backtesting Platform - Phase 1: Core Backend

A sophisticated backtesting platform for algorithmic trading strategies using Polygon.io market data.

## Overview

This is **Phase 1** of the project, which includes:
- ✅ TypeScript/Express backend with SQLite database
- ✅ Polygon.io API integration for historical market data
- ✅ Technical indicator calculations (SMA, EMA, RSI, ATR)
- ✅ Expression evaluation engine for strategy conditions
- ✅ Bar-by-bar backtesting simulation engine
- ✅ REST API for data management, strategies, and backtests

**Coming in Phase 2:** AI-powered conversational strategy builder with Claude/ChatGPT integration.

## Prerequisites

- Node.js 18+ and npm
- Polygon.io API key (free tier available at [polygon.io](https://polygon.io))

## Quick Start

### 1. Installation

```bash
# Install backend dependencies
cd backend
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Polygon API key:

```env
POLYGON_API_KEY=your_polygon_key_here
DATABASE_PATH=./backtesting.db
PORT=3000
NODE_ENV=development
```

### 3. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Or build and run production
npm run build
npm start
```

The server will start at `http://localhost:3000`

## API Documentation

### Health Check

```bash
GET /health
```

Returns server status.

### Data Management

#### Fetch Historical Data

```bash
POST /api/data/fetch
Content-Type: application/json

{
  "ticker": "AAPL",
  "timeframe": "1day",
  "from": "2023-01-01",
  "to": "2023-12-31"
}
```

Fetches and stores historical OHLCV data from Polygon.

**Timeframes:** `1min`, `5min`, `15min`, `30min`, `1hour`, `1day`, `1week`, `1month`

#### Get Stored Data

```bash
GET /api/data/{ticker}?timeframe=1day&from=1672531200000&to=1704067200000
```

Retrieves stored historical data. Timestamps are optional.

#### Check Data Availability

```bash
GET /api/data/{ticker}/check?timeframe=1day
```

Checks if data exists for the specified ticker and timeframe.

### Strategy Management

#### Create Strategy

```bash
POST /api/strategies
Content-Type: application/json

{
  "name": "SMA Crossover",
  "description": "Buy when price crosses above 50-day SMA",
  "ticker": "AAPL",
  "timeframe": "1day",
  "indicators": [
    {
      "type": "SMA",
      "id": "sma50",
      "params": {
        "period": 50,
        "source": "close"
      }
    }
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > sma50",
        "description": "Price above 50-day SMA"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close < sma50",
        "description": "Price below 50-day SMA"
      }
    ],
    "logic": "AND"
  },
  "positionSizing": {
    "method": "PERCENT_PORTFOLIO",
    "value": 100,
    "maxPositions": 1
  },
  "riskManagement": {
    "stopLoss": {
      "type": "PERCENT",
      "value": 5
    }
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
Content-Type: application/json

{
  "name": "Updated Strategy Name",
  ...
}
```

#### Delete Strategy

```bash
DELETE /api/strategies/{id}
```

### Backtest Management

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

Returns immediately with backtest ID. Backtest runs asynchronously.

#### Get All Backtests

```bash
GET /api/backtests
```

#### Get Backtest Results

```bash
GET /api/backtests/{id}
```

Returns complete backtest results including:
- Performance metrics (returns, Sharpe ratio, win rate, etc.)
- Equity curve
- Trade log
- Drawdown analysis

#### Delete Backtest

```bash
DELETE /api/backtests/{id}
```

## Strategy Configuration Reference

### Indicator Types

| Type | Parameters | Description |
|------|-----------|-------------|
| `SMA` | `period`, `source` | Simple Moving Average |
| `EMA` | `period`, `source` | Exponential Moving Average |
| `RSI` | `period`, `source` | Relative Strength Index |
| `ATR` | `period` | Average True Range |

### Condition Types

#### Expression Conditions

Use mathematical expressions with variables and functions:

```json
{
  "type": "expression",
  "expression": "close > sma50 AND rsi < 70"
}
```

**Available Variables:**
- `open`, `high`, `low`, `close`, `volume` - Current bar OHLCV
- `{indicatorId}` - Any indicator value (e.g., `sma50`, `rsi14`)
- `cash`, `equity` - Portfolio values
- `hasPosition`, `positionSize`, `entryPrice`, `unrealizedPnL`

**Available Functions:**
- `cross_above(a, b)` - Returns true when a crosses above b
- `cross_below(a, b)` - Returns true when a crosses below b
- `highest(n, source)` - Highest value in last n bars
- `lowest(n, source)` - Lowest value in last n bars
- `avg(n, source)` - Average of last n values
- `bars_ago(n, source)` - Value n bars ago
- `abs(x)`, `max(...)`, `min(...)` - Math functions

### Position Sizing Methods

| Method | Description |
|--------|-------------|
| `FIXED_AMOUNT` | Fixed dollar amount per trade |
| `PERCENT_PORTFOLIO` | Percentage of total equity |
| `RISK_BASED` | Based on risk per trade (TODO) |

### Risk Management

```json
{
  "stopLoss": {
    "type": "PERCENT",  // or "FIXED", "ATR"
    "value": 5          // 5% stop loss
  },
  "takeProfit": {
    "type": "PERCENT",
    "value": 10         // 10% take profit
  }
}
```

## Example Strategies

### 1. RSI Mean Reversion

```json
{
  "name": "RSI Mean Reversion",
  "ticker": "SPY",
  "timeframe": "1day",
  "indicators": [
    { "type": "RSI", "id": "rsi14", "params": { "period": 14 } }
  ],
  "entryRules": {
    "conditions": [
      { "type": "expression", "expression": "rsi14 < 30" }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      { "type": "expression", "expression": "rsi14 > 70" }
    ],
    "logic": "AND"
  },
  "positionSizing": {
    "method": "PERCENT_PORTFOLIO",
    "value": 100
  }
}
```

### 2. EMA Crossover with ATR Stop

```json
{
  "name": "EMA Crossover",
  "ticker": "AAPL",
  "timeframe": "1day",
  "indicators": [
    { "type": "EMA", "id": "ema12", "params": { "period": 12 } },
    { "type": "EMA", "id": "ema26", "params": { "period": 26 } },
    { "type": "ATR", "id": "atr14", "params": { "period": 14 } }
  ],
  "entryRules": {
    "conditions": [
      { "type": "expression", "expression": "ema12 > ema26" }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      { "type": "expression", "expression": "ema12 < ema26" }
    ],
    "logic": "AND"
  },
  "positionSizing": {
    "method": "PERCENT_PORTFOLIO",
    "value": 100
  },
  "riskManagement": {
    "stopLoss": {
      "type": "ATR",
      "value": 2
    }
  }
}
```

## Performance Metrics

The backtesting engine calculates comprehensive performance metrics:

### Returns
- Total Return ($ and %)
- Annualized Return
- CAGR (Compound Annual Growth Rate)

### Risk Metrics
- Maximum Drawdown ($ and %)
- Sharpe Ratio
- Sortino Ratio
- Standard Deviation of Returns

### Trade Statistics
- Total Trades
- Win Rate (%)
- Profit Factor (Gross Profit / Gross Loss)
- Average Win/Loss
- Largest Win/Loss
- Average Trade Duration
- Expectancy (Average P/L per trade)

## Project Structure

```
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── data.ts          # Data fetching endpoints
│   │   │   ├── strategies.ts    # Strategy CRUD
│   │   │   └── backtests.ts     # Backtest execution
│   │   └── server.ts            # Express server
│   ├── services/
│   │   ├── polygon.service.ts   # Polygon API client
│   │   ├── backtest.service.ts  # Backtesting engine
│   │   └── expression.service.ts # Expression evaluator
│   ├── indicators/
│   │   ├── base.ts              # Base indicator class
│   │   ├── sma.ts, ema.ts, rsi.ts, atr.ts
│   │   └── factory.ts           # Indicator factory
│   ├── database/
│   │   ├── schema.sql           # Database schema
│   │   └── db.ts                # Database connection
│   └── types/
│       ├── strategy.types.ts
│       └── backtest.types.ts
├── package.json
└── tsconfig.json
```

## Development

### Build

```bash
npm run build
```

### Type Checking

TypeScript will check types during development and build.

## Testing Strategy Workflow

1. **Fetch Historical Data**
   ```bash
   curl -X POST http://localhost:3000/api/data/fetch \
     -H "Content-Type: application/json" \
     -d '{
       "ticker": "AAPL",
       "timeframe": "1day",
       "from": "2023-01-01",
       "to": "2023-12-31"
     }'
   ```

2. **Create Strategy**
   ```bash
   curl -X POST http://localhost:3000/api/strategies \
     -H "Content-Type: application/json" \
     -d @strategy.json
   ```

3. **Run Backtest**
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

4. **View Results**
   ```bash
   curl http://localhost:3000/api/backtests/1
   ```

## Roadmap

### Phase 1 ✅ (Current)
- Core backend infrastructure
- Polygon API integration
- Basic indicators and backtesting

### Phase 2 (Next)
- Anthropic Claude API integration
- Conversational strategy builder
- AI-powered strategy generation

### Phase 3
- React frontend with chat interface
- Strategy visualization
- Interactive backtest results

### Phase 4
- Custom indicators (time-aligned calculations)
- Advanced risk management
- Performance optimization

## Troubleshooting

### Database Issues

If you encounter database errors, delete and recreate:

```bash
rm backtesting.db
npm run dev  # Database will be recreated
```

### Polygon API Rate Limits

Free tier has rate limits. If you hit limits:
- Wait a few minutes before retrying
- Reduce date ranges when fetching data
- Use stored data when possible

## License

MIT

## Contributing

This project is in active development. Phase 1 is complete. Stay tuned for Phase 2 with AI integration!
