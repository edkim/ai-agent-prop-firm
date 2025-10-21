# Quick Start Guide

## Get Started in 3 Steps

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure API Key

Edit `.env` in the project root and add your Polygon API key:

```env
POLYGON_API_KEY=your_actual_key_here
```

Get a free API key at: https://polygon.io

### 3. Start the Server

```bash
npm run dev
```

Server will start at: http://localhost:3000

## Test the Installation

```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok","timestamp":"..."}`

## Try Your First Backtest

### Step 1: Fetch Data

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

### Step 2: Create a Simple SMA Strategy

```bash
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple SMA Strategy",
    "description": "Buy when price is above 50-day SMA",
    "ticker": "SPY",
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
  }'
```

Returns: `{"success":true,"strategyId":1}`

### Step 3: Run the Backtest

```bash
curl -X POST http://localhost:3000/api/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": 1,
    "startDate": "2023-01-01",
    "endDate": "2023-12-31",
    "initialCapital": 10000,
    "commission": 1,
    "slippage": 0.1
  }'
```

Returns: `{"success":true,"backtestId":1}`

### Step 4: View Results

```bash
curl http://localhost:3000/api/backtests/1 | python -m json.tool
```

## What You'll See

The backtest results include:

- **Metrics**: Total return, Sharpe ratio, max drawdown, win rate, etc.
- **Equity Curve**: Portfolio value over time
- **Trade Log**: All trades with entry/exit prices and P/L
- **Performance Stats**: Winning/losing trades, profit factor, expectancy

## Next Steps

- Read the full [README.md](README.md) for detailed API documentation
- See [PHASE1_COMPLETE.md](PHASE1_COMPLETE.md) for a complete feature list
- Explore the `requirements.md` to see what's coming in Phase 2 and 3

## Available Indicators

- `SMA` - Simple Moving Average
- `EMA` - Exponential Moving Average
- `RSI` - Relative Strength Index
- `ATR` - Average True Range

## Available Timeframes

- `1min`, `5min`, `15min`, `30min`, `1hour`
- `1day`, `1week`, `1month`

## Tips

1. **Start with daily data** - It's faster to fetch and easier to test
2. **Use SPY or AAPL** - Highly liquid tickers with reliable data
3. **Keep strategies simple** - Start with one or two indicators
4. **Check data first** - Use `/api/data/:ticker/check` to verify data exists

## Troubleshooting

**Server won't start?**
- Check that Node.js 18+ is installed
- Make sure port 3000 is available
- Verify all dependencies installed correctly

**Can't fetch data?**
- Check your Polygon API key in `.env`
- Free tier has rate limits - wait a minute between requests
- Make sure dates are in YYYY-MM-DD format

**Backtest fails?**
- Ensure you've fetched data for the ticker and timeframe
- Check that startDate/endDate match available data
- Verify strategy JSON is valid

## Support

- Check the [README.md](README.md) for detailed documentation
- Review example strategies in the README
- Examine the TypeScript code in `backend/src/`

---

**You're all set!** Start building and testing your trading strategies. 🚀
