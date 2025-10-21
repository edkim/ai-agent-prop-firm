# Production API Usage Example

## Quick Start: Run the ORB Backtest via API

Here's exactly how you'd run our Opening Range Breakout backtest in production:

### 1. Start the Server

```bash
cd /Users/edwardkim/Code/ai-backtest/backend
npm run dev
```

Server starts on http://localhost:3000

### 2. First, Ensure Data is Available

```bash
# Fetch HOOD data
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "HOOD",
    "timeframe": "5min",
    "from": "2025-07-31",
    "to": "2025-07-31"
  }'

# Fetch QQQ data (for filter)
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "QQQ",
    "timeframe": "5min",
    "from": "2025-07-31",
    "to": "2025-07-31"
  }'
```

### 3. Option A: Using Existing Rule-Based System (Limited)

**Current system supports trailing stops but NOT opening range logic yet.**

You can run a basic momentum breakout:

```bash
curl -X POST http://localhost:3000/api/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": 1,
    "startDate": "2025-07-31",
    "endDate": "2025-07-31",
    "initialCapital": 100000,
    "commission": 1.0
  }'
```

### 3. Option B: After Implementing Custom Strategies (Future)

Once we implement the custom strategy system:

```bash
# Create ORB Strategy
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HOOD ORB Post-Earnings 2.5% Trail",
    "description": "5-min opening range breakout with QQQ filter",
    "strategyType": "opening-range-breakout",
    "ticker": "HOOD",
    "timeframe": "5min",
    "config": {
      "openingRangeMinutes": 5,
      "marketFilterTicker": "QQQ",
      "requireEarnings": true,
      "trailingStopPercent": 2.5
    }
  }'
```

Response:
```json
{
  "success": true,
  "strategyId": 5
}
```

```bash
# Run Backtest
curl -X POST http://localhost:3000/api/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": 5,
    "startDate": "2025-07-01",
    "endDate": "2025-08-31",
    "initialCapital": 100000,
    "commission": 1.0,
    "slippage": 0.05
  }'
```

Response:
```json
{
  "success": true,
  "backtestId": 123,
  "message": "Backtest started"
}
```

```bash
# Get Results (poll until status is COMPLETED)
curl http://localhost:3000/api/backtests/123 | jq .
```

---

## Example Response

```json
{
  "backtest": {
    "id": 123,
    "strategyId": 5,
    "strategyName": "HOOD ORB Post-Earnings 2.5% Trail",
    "config": {
      "startDate": "2025-07-01",
      "endDate": "2025-08-31",
      "initialCapital": 100000,
      "commission": 1.0,
      "slippage": 0.05
    },
    "status": "COMPLETED",
    "metrics": {
      "totalReturn": 1200.00,
      "totalReturnPercent": 1.20,
      "annualizedReturn": 7.23,
      "cagr": 7.45,
      "maxDrawdown": 150.00,
      "maxDrawdownPercent": 0.15,
      "sharpeRatio": 2.34,
      "sortinoRatio": 3.12,
      "winRate": 100.0,
      "profitFactor": 999.0,
      "totalTrades": 1,
      "winningTrades": 1,
      "losingTrades": 0,
      "averageWin": 1200.00,
      "averageLoss": 0,
      "largestWin": 1200.00,
      "largestLoss": 0,
      "averageTradeDuration": 25,
      "expectancy": 1200.00
    },
    "trades": [
      {
        "id": 1,
        "ticker": "HOOD",
        "side": "LONG",
        "entryTimestamp": 1722418500000,
        "entryPrice": 105.13,
        "exitTimestamp": 1722420000000,
        "exitPrice": 106.33,
        "quantity": 951,
        "commission": 1.0,
        "pnl": 1141.20,
        "pnlPercent": 1.14,
        "exitReason": "TRAILING_STOP",
        "bars": 25
      }
    ],
    "equityCurve": [
      {"timestamp": 1722418500000, "equity": 100000, "cash": 100000, "positionValue": 0},
      {"timestamp": 1722418800000, "equity": 100500, "cash": 0, "positionValue": 100500},
      {"timestamp": 1722419100000, "equity": 101200, "cash": 0, "positionValue": 101200},
      {"timestamp": 1722419400000, "equity": 100800, "cash": 0, "positionValue": 100800},
      {"timestamp": 1722420000000, "equity": 101141.20, "cash": 101141.20, "positionValue": 0}
    ],
    "error": null,
    "createdAt": "2025-10-21T18:00:00Z",
    "completedAt": "2025-10-21T18:00:05Z"
  }
}
```

---

## Batch Backtesting Multiple Trailing Stops

Once implemented, you could optimize parameters:

```bash
# Test trailing stops: 1.5%, 2.0%, 2.5%, 3.0%
for stop in 1.5 2.0 2.5 3.0; do
  curl -X POST http://localhost:3000/api/backtests \
    -H "Content-Type: application/json" \
    -d "{
      \"strategyType\": \"opening-range-breakout\",
      \"strategyConfig\": {
        \"ticker\": \"HOOD\",
        \"timeframe\": \"5min\",
        \"openingRangeMinutes\": 5,
        \"marketFilterTicker\": \"QQQ\",
        \"trailingStopPercent\": $stop
      },
      \"startDate\": \"2025-07-31\",
      \"endDate\": \"2025-07-31\",
      \"initialCapital\": 100000
    }"
done

# Compare results
curl http://localhost:3000/api/backtests | jq '.backtests[] | {stop: .config.strategyConfig.trailingStopPercent, pnl: .metrics.totalReturn}'
```

---

## Web UI Integration (Future)

Once you have a frontend:

### Strategy Builder UI
```
┌─────────────────────────────────────────────────┐
│ Create New Backtest                             │
├─────────────────────────────────────────────────┤
│                                                  │
│ Strategy Type: [Opening Range Breakout ▼]       │
│                                                  │
│ Configuration:                                   │
│   Ticker:             [HOOD          ]          │
│   Timeframe:          [5min ▼]                  │
│   Opening Range:      [5] minutes               │
│                                                  │
│ Filters:                                         │
│   ☑ Earnings Required                           │
│   ☑ Market Filter     [QQQ          ]          │
│                                                  │
│ Risk Management:                                 │
│   Trailing Stop:      [2.5] %                   │
│                                                  │
│ Backtest Period:                                 │
│   Start Date:         [2025-07-31  ]           │
│   End Date:           [2025-07-31  ]           │
│                                                  │
│ Capital:              [$100,000     ]           │
│ Commission:           [$1.00 per trade]         │
│                                                  │
│            [Run Backtest]  [Save Strategy]      │
└─────────────────────────────────────────────────┘
```

### Results Dashboard
```
┌─────────────────────────────────────────────────┐
│ Backtest Results: HOOD ORB Post-Earnings        │
├─────────────────────────────────────────────────┤
│                                                  │
│ Performance Summary                              │
│ ┌─────────────┬─────────────┬─────────────┐    │
│ │ Total P&L   │ Return %    │ Win Rate    │    │
│ │ $1,141.20   │ +1.14%      │ 100%        │    │
│ └─────────────┴─────────────┴─────────────┘    │
│                                                  │
│ ┌─────────────┬─────────────┬─────────────┐    │
│ │ Sharpe      │ Max DD      │ # Trades    │    │
│ │ 2.34        │ -0.15%      │ 1           │    │
│ └─────────────┴─────────────┴─────────────┘    │
│                                                  │
│ Equity Curve                                     │
│ ┌─────────────────────────────────────────┐    │
│ │ 101,500 ┤                ╭─╮            │    │
│ │ 101,000 ┤          ╭─────╯ ╰──╮         │    │
│ │ 100,500 ┤     ╭────╯           ╰───     │    │
│ │ 100,000 ┼─────╯                         │    │
│ │         └─────┬─────┬─────┬─────┬──────┤    │
│ │              9:45  10:00  10:15  10:30  │    │
│ └─────────────────────────────────────────┘    │
│                                                  │
│ Trades (1)                                       │
│ ┌───┬────────┬──────┬──────┬──────┬────────┐   │
│ │ # │ Entry  │ Exit │ P&L  │ P&L% │ Reason │   │
│ ├───┼────────┼──────┼──────┼──────┼────────┤   │
│ │ 1 │ 105.13 │106.33│1141.2│1.14% │Trail   │   │
│ └───┴────────┴──────┴──────┴──────┴────────┘   │
│                                                  │
│     [Export CSV]  [Compare]  [Run Again]        │
└─────────────────────────────────────────────────┘
```

---

## Key Differences: Scripts vs Production

| Feature | Custom Scripts | Production API |
|---------|---------------|----------------|
| **Run Time** | 2-3 seconds | 2-3 seconds |
| **Storage** | None | Database |
| **Access** | Local only | HTTP endpoint |
| **Reusability** | Copy code | Save config |
| **History** | None | All runs tracked |
| **Sharing** | Send files | Send link |
| **Batch** | Write loops | API calls |
| **UI** | Terminal | Web dashboard |
| **Monitoring** | Console.log | Database queries |

## Implementation Effort

- **Custom Strategy System**: 2-3 days
- **API Integration**: 1 day
- **Testing**: 1 day
- **Frontend (optional)**: 3-5 days

**Total**: ~1 week for full production system

---

## Immediate Next Steps

1. Choose architecture (I recommend custom strategies)
2. Create base strategy class
3. Implement ORB strategy
4. Update backtest service
5. Test with our HOOD example
6. Deploy!
