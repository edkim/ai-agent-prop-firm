# Multi-Ticker & Earnings Support

## New Features

The backtesting engine now supports advanced strategies that:
1. **Reference multiple tickers** (e.g., only trade when QQQ is positive)
2. **Filter by earnings events** (e.g., only trade on earnings days)
3. **Check market conditions** across different securities

## Strategy Configuration

### Dependencies

Add other tickers your strategy needs to reference:

```json
{
  "ticker": "AAPL",
  "dependencies": ["QQQ", "SPY"],
  ...
}
```

The engine will automatically load historical data for all dependency tickers, synchronized to the same timestamps as your primary ticker.

### Require Earnings

Flag strategies that should only trade on earnings days:

```json
{
  "ticker": "AAPL",
  "requireEarnings": true,
  ...
}
```

The engine will load earnings events and make them available in expressions.

## New Expression Functions

### Cross-Ticker Functions

**`ticker(symbol)`** - Access OHLCV data from another ticker:
```javascript
ticker('QQQ').close > ticker('QQQ').open
```

**`ticker_is_up(symbol)`** - Check if ticker is positive on the day:
```javascript
ticker_is_up('QQQ')
```

**`ticker_is_down(symbol)`** - Check if ticker is negative on the day:
```javascript
ticker_is_down('SPY')
```

**`ticker_pct_change(symbol)`** - Get percent change from open:
```javascript
ticker_pct_change('QQQ') > 0.5  // QQQ up more than 0.5%
```

### Earnings Functions

**`has_earnings_today()`** - Returns true if stock has earnings today:
```javascript
has_earnings_today() AND rsi14 < 70
```

**`has_earnings_bmo()`** - Earnings before market open:
```javascript
has_earnings_bmo()  // Returns true for BMO earnings
```

**`has_earnings_amc()`** - Earnings after market close:
```javascript
has_earnings_amc()  // Returns true for AMC earnings
```

### Earnings Variables

- `has_earnings_today` - Boolean
- `earnings_time` - String ('BMO', 'AMC', or specific time)
- `is_earnings_bmo` - Boolean
- `is_earnings_amc` - Boolean

## Example Strategy: Earnings + Market Filter

This strategy only trades stocks on earnings days when the market (QQQ) is positive:

```json
{
  "name": "Earnings + Market Filter",
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
        "description": "Earnings before market open"
      },
      {
        "type": "expression",
        "expression": "ticker_is_up('QQQ')",
        "description": "Market is positive"
      },
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr14",
        "description": "Strong upward move"
      },
      {
        "type": "expression",
        "expression": "rsi14 < 80",
        "description": "Not overbought"
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
    "value": 50,
    "maxPositions": 1
  },

  "riskManagement": {
    "stopLoss": { "type": "PERCENT", "value": 3 },
    "takeProfit": { "type": "PERCENT", "value": 8 }
  }
}
```

## Strategy Logic Explained

This strategy:
1. ✅ Only activates on earnings days
2. ✅ Checks earnings were before market open (BMO)
3. ✅ Requires QQQ to be positive (market filter)
4. ✅ Looks for strong upward moves (> 2x ATR)
5. ✅ Avoids overbought conditions (RSI < 80)
6. ✅ Exits when momentum fades

## Testing the Feature

### 1. Fetch Data for Multiple Tickers

```bash
# Fetch AAPL data
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "timeframe": "5min",
    "from": "2024-01-01",
    "to": "2024-03-31"
  }'

# Fetch QQQ data (dependency)
curl -X POST http://localhost:3000/api/data/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "QQQ",
    "timeframe": "5min",
    "from": "2024-01-01",
    "to": "2024-03-31"
  }'
```

### 2. Add Earnings Events (Manual)

For now, you can manually add earnings events to test:

```sql
INSERT INTO earnings_events
  (ticker, report_date, time_of_day, fiscal_period, fiscal_year)
VALUES
  ('AAPL', '2024-02-01', 'BMO', 'Q1', '2024'),
  ('AAPL', '2024-05-02', 'AMC', 'Q2', '2024');
```

Or via your database management tool.

### 3. Create and Run the Strategy

```bash
# Create strategy
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

# Get results
curl http://localhost:3000/api/backtests/1
```

## Database Schema

### Earnings Events Table

```sql
CREATE TABLE earnings_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    fiscal_period TEXT,
    fiscal_year TEXT,
    report_date TEXT NOT NULL,        -- YYYY-MM-DD
    report_timestamp INTEGER,          -- Unix timestamp if available
    time_of_day TEXT,                  -- 'BMO', 'AMC', or specific time
    eps_estimate REAL,
    eps_actual REAL,
    revenue_estimate REAL,
    revenue_actual REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, report_date, fiscal_period)
);
```

## Advanced Use Cases

### Market Breadth Filters

Only trade when multiple market indices are aligned:

```json
{
  "dependencies": ["QQQ", "SPY", "IWM"],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "ticker_is_up('QQQ') AND ticker_is_up('SPY') AND ticker_is_up('IWM')",
        "description": "All major indices positive"
      }
    ]
  }
}
```

### Sector Rotation

Trade based on sector ETF performance:

```json
{
  "ticker": "NVDA",
  "dependencies": ["SMH"],  // Semiconductor ETF
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "ticker_pct_change('SMH') > 1.0",
        "description": "Semiconductor sector strong"
      }
    ]
  }
}
```

### Relative Strength

Compare stock performance to its sector:

```json
{
  "ticker": "AAPL",
  "dependencies": ["XLK"],  // Tech sector ETF
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "ticker_pct_change('AAPL') > ticker_pct_change('XLK') * 1.5",
        "description": "Outperforming sector by 50%"
      }
    ]
  }
}
```

## Performance Notes

- Dependency data is loaded once at backtest start
- Bars are synchronized by timestamp (closest match)
- Earnings data is pre-loaded and cached
- No performance penalty for multiple dependencies

## Limitations & Future Enhancements

**Current Limitations:**
- Earnings data must be manually added (Polygon earnings API integration pending)
- Dependency tickers must use the same timeframe as primary ticker
- Maximum of ~10 dependency tickers recommended for performance

**Coming Soon:**
- Automatic earnings calendar fetching from Polygon
- Cross-timeframe analysis (5min data with daily dependencies)
- Earnings surprise filters (actual vs estimate)
- Option flow integration
- News sentiment on earnings days

## API Reference

See full API documentation in [README.md](README.md)

Example files:
- `backend/earnings-market-filter-example.json` - Complete working example

---

**This enhancement makes the backtesting engine significantly more powerful for real-world trading strategies!**
