# Quick Reference: Multi-Ticker & Earnings

## Your Strategy: Earnings + QQQ Filter

```json
{
  "name": "Earnings + QQQ Filter",
  "ticker": "AAPL",
  "timeframe": "5min",
  "dependencies": ["QQQ"],
  "requireEarnings": true,

  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "has_earnings_today() AND has_earnings_bmo()"
      },
      {
        "type": "expression",
        "expression": "ticker_is_up('QQQ')"
      }
    ],
    "logic": "AND"
  }
}
```

## Available Functions

### Cross-Ticker
- `ticker_is_up('QQQ')` - Is QQQ positive?
- `ticker_is_down('SPY')` - Is SPY negative?
- `ticker_pct_change('QQQ')` - QQQ % change
- `ticker('QQQ').close` - QQQ close price

### Earnings
- `has_earnings_today()` - Earnings today?
- `has_earnings_bmo()` - Before market open?
- `has_earnings_amc()` - After market close?

## Quick Start

```bash
# 1. Fetch data
curl -X POST http://localhost:3000/api/data/fetch \
  -d '{"ticker":"AAPL","timeframe":"5min","from":"2024-02-01","to":"2024-02-29"}'

curl -X POST http://localhost:3000/api/data/fetch \
  -d '{"ticker":"QQQ","timeframe":"5min","from":"2024-02-01","to":"2024-02-29"}'

# 2. Create strategy
curl -X POST http://localhost:3000/api/strategies \
  -d @backend/earnings-market-filter-example.json

# 3. Run backtest
curl -X POST http://localhost:3000/api/backtests \
  -d '{"strategyId":1,"startDate":"2024-02-01","endDate":"2024-02-29","initialCapital":10000}'

# 4. Get results
curl http://localhost:3000/api/backtests/1
```

## Sample Earnings Data

Already loaded for you:
- AAPL: 2024-02-01 (BMO), 2024-05-02 (AMC)
- NVDA: 2024-02-21 (AMC), 2024-05-22 (AMC)
- MSFT: 2024-01-30 (AMC), 2024-04-25 (AMC)

## Full Documentation

- **[FEATURE_COMPLETE.md](FEATURE_COMPLETE.md)** - Complete guide
- **[MULTI_TICKER_EARNINGS.md](MULTI_TICKER_EARNINGS.md)** - API reference
- **[WHATS_NEW.md](WHATS_NEW.md)** - Feature overview
