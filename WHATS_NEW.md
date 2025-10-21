# What's New: Multi-Ticker & Earnings Support

## Overview

I've enhanced the backtesting engine to support your request for strategies that:
- ✅ **Check if QQQ (or any ETF) is positive on the day**
- ✅ **Filter trades by earnings release events**
- ✅ **Reference multiple tickers in strategy conditions**

This makes it possible to build much more sophisticated, real-world trading strategies!

## What Was Added

### 1. Multi-Ticker Support

Strategies can now reference data from multiple tickers simultaneously.

**Example:**
```json
{
  "ticker": "AAPL",
  "dependencies": ["QQQ", "SPY"],
  ...
}
```

The backtest engine automatically loads and synchronizes data for all dependency tickers.

### 2. Earnings Event Tracking

New database table and API methods for storing and querying earnings events.

**Features:**
- Track earnings by date and time (BMO/AMC)
- Store EPS and revenue estimates vs actuals
- Filter strategies to only trade on earnings days

### 3. Enhanced Expression Functions

**Cross-Ticker Functions:**
- `ticker_is_up('QQQ')` - Check if QQQ is positive
- `ticker_is_down('SPY')` - Check if SPY is negative
- `ticker_pct_change('QQQ')` - Get percent change from open
- `ticker('QQQ').close` - Access any OHLCV value

**Earnings Functions:**
- `has_earnings_today()` - Returns true if earnings today
- `has_earnings_bmo()` - Returns true if earnings before market open
- `has_earnings_amc()` - Returns true if earnings after market close

### 4. Database Schema Updates

New table: `earnings_events`
```sql
CREATE TABLE earnings_events (
    ticker TEXT NOT NULL,
    report_date TEXT NOT NULL,
    time_of_day TEXT,  -- 'BMO', 'AMC', or specific time
    eps_estimate REAL,
    eps_actual REAL,
    revenue_estimate REAL,
    revenue_actual REAL,
    ...
);
```

### 5. Updated Strategy Types

Strategies now support:
- `dependencies: string[]` - Additional tickers to load
- `requireEarnings: boolean` - Only trade on earnings days

## Your Exact Use Case

Here's how to build the strategy you described:

```json
{
  "name": "Earnings + QQQ Filter",
  "ticker": "AAPL",
  "timeframe": "5min",

  "dependencies": ["QQQ"],
  "requireEarnings": true,

  "indicators": [
    { "type": "RSI", "id": "rsi14", "params": { "period": 14 } },
    { "type": "ATR", "id": "atr14", "params": { "period": 14 } }
  ],

  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "has_earnings_today() AND has_earnings_bmo()",
        "description": "Stock has earnings this morning"
      },
      {
        "type": "expression",
        "expression": "ticker_is_up('QQQ')",
        "description": "QQQ is positive on the day"
      },
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr14",
        "description": "Stock showing strong momentum"
      }
    ],
    "logic": "AND"
  },

  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) < 0.5 * atr14",
        "description": "Momentum fading"
      }
    ],
    "logic": "OR"
  },

  "positionSizing": {
    "method": "PERCENT_PORTFOLIO",
    "value": 50
  },

  "riskManagement": {
    "stopLoss": { "type": "PERCENT", "value": 3 },
    "takeProfit": { "type": "PERCENT", "value": 8 }
  }
}
```

## How It Works

### During Backtesting

1. **Load primary ticker data** (AAPL in your case)
2. **Load dependency data** (QQQ)
3. **Load earnings events** (if `requireEarnings: true`)
4. **For each bar:**
   - Synchronize dependency ticker bars by timestamp
   - Check if there's an earnings event on this date
   - Evaluate entry/exit conditions with full context
   - Execute trades based on all conditions

### Expression Evaluation

When evaluating `ticker_is_up('QQQ')`:
1. Find QQQ bar closest to current AAPL timestamp
2. Compare QQQ's close vs open
3. Return true if close > open

When evaluating `has_earnings_today()`:
1. Extract date from current bar timestamp
2. Look up earnings event for that date
3. Return true if found

## Testing It Out

### 1. Fetch Data

```bash
# Fetch AAPL 5-minute data
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "timeframe": "5min",
    "from": "2024-01-01",
    "to": "2024-03-31"
  }'

# Fetch QQQ 5-minute data
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "QQQ",
    "timeframe": "5min",
    "from": "2024-01-01",
    "to": "2024-03-31"
  }'
```

### 2. Add Earnings Events

For testing, manually insert earnings events:

```sql
INSERT INTO earnings_events
  (ticker, report_date, time_of_day, fiscal_period, fiscal_year)
VALUES
  ('AAPL', '2024-02-01', 'BMO', 'Q1', '2024'),
  ('AAPL', '2024-05-02', 'AMC', 'Q2', '2024');
```

You can do this by:
- Connecting to `backtesting.db` with a SQLite browser
- Or adding a helper endpoint to insert earnings

### 3. Create and Run Strategy

```bash
# Use the example file I created
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d @backend/earnings-market-filter-example.json

# Run backtest
curl -X POST http://localhost:3000/api/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": 1,
    "startDate": "2024-01-01",
    "endDate": "2024-03-31",
    "initialCapital": 10000
  }'

# View results
curl http://localhost:3000/api/backtests/1
```

## Other Cool Use Cases

### Market Breadth Filter

Only trade when all major indices are positive:

```json
{
  "dependencies": ["QQQ", "SPY", "IWM"],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "ticker_is_up('QQQ') AND ticker_is_up('SPY') AND ticker_is_up('IWM')",
        "description": "All indices positive"
      }
    ]
  }
}
```

### Sector Rotation

Only trade when the sector is strong:

```json
{
  "ticker": "NVDA",
  "dependencies": ["SMH"],  // Semiconductor ETF
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "ticker_pct_change('SMH') > 1.0",
        "description": "Sector momentum > 1%"
      }
    ]
  }
}
```

### Relative Strength

Trade stocks outperforming their sector:

```json
{
  "ticker": "AAPL",
  "dependencies": ["XLK"],  // Tech ETF
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "ticker_pct_change('AAPL') > ticker_pct_change('XLK') * 1.5"
      }
    ]
  }
}
```

## Files Added/Modified

**New Files:**
- `MULTI_TICKER_EARNINGS.md` - Full documentation
- `WHATS_NEW.md` - This file
- `backend/earnings-market-filter-example.json` - Working example

**Modified Files:**
- `backend/src/database/schema.sql` - Added earnings_events table
- `backend/src/types/strategy.types.ts` - Added dependencies, requireEarnings, EarningsEvent type
- `backend/src/services/polygon.service.ts` - Added earnings methods
- `backend/src/services/expression.service.ts` - Added cross-ticker and earnings functions
- `backend/src/services/backtest.service.ts` - Load multi-ticker and earnings data

## Next Steps

### Automatic Earnings Fetching

The Polygon API integration is ready, but you'll need to either:
1. Use Polygon's earnings calendar API (if available with your tier)
2. Or manually populate earnings data for testing

### Adding More Functions

You could easily extend this to add:
- `ticker_volume('QQQ')` - Check volume conditions
- `ticker_range('SPY')` - Get high-low range
- `sector_strength('XLK')` - Sector momentum
- `correlation('AAPL', 'QQQ')` - Correlation calculations

### UI Enhancement (Phase 3)

When we build the frontend, we can add:
- Earnings calendar visualization
- Multi-ticker chart comparisons
- Market condition indicators

## Documentation

Full documentation:
- **[MULTI_TICKER_EARNINGS.md](MULTI_TICKER_EARNINGS.md)** - Complete guide
- **[README.md](README.md)** - Updated with new features
- **Example file:** `backend/earnings-market-filter-example.json`

---

**You now have a professional-grade backtesting engine that supports complex, multi-dimensional trading strategies!** 🚀
