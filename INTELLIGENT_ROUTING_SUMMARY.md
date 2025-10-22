# Intelligent Backtest Routing System - Summary

## Overview

Successfully implemented an **AI-powered routing system** that analyzes natural language backtest requests and automatically determines the optimal execution strategy. This system makes the backtesting platform more flexible and user-friendly by handling various query types without manual script creation.

## Architecture

### 1. BacktestRouterService (`backend/src/services/backtest-router.service.ts`)

The core routing engine that analyzes natural language prompts and makes intelligent routing decisions.

**Key Capabilities:**
- Detects earnings-based queries
- Identifies date range patterns ("past 10 days", "last 2 weeks")
- Parses specific date lists
- Recognizes custom exit times ("noon", "12:00", etc.)
- Routes to appropriate execution strategy

**Routing Strategies:**
- `template-api` - Standard single-day backtests using existing templates
- `custom-dates` - Multi-day backtests with dynamic date injection
- `fully-custom` - Future: Complex custom scripts (not yet implemented)

### 2. DateQueryService (`backend/src/services/date-query.service.ts`)

Database query service for special date filtering, particularly for earnings-based backtests.

**Features:**
- Query earnings dates from database
- Filter by ticker, limit, and order
- Extensible for other date-based filters (dividends, splits, etc.)

### 3. Multi-Day Template (`backend/src/templates/orb-multiday.template.ts`)

Template that runs strategies across multiple dates and aggregates results.

**Capabilities:**
- Accepts array of specific dates
- Supports custom exit times
- Aggregates trades and metrics across all days
- Reports daily and overall performance

### 4. Intelligent API Endpoint (`/api/backtests/execute-intelligent`)

New endpoint in `backend/src/api/routes/backtests.ts` that provides a single interface for all backtest types.

**Request Format:**
```json
{
  "prompt": "Backtest CRML for the past 5 days, exit at noon",
  "ticker": "CRML",
  "strategyType": "orb",
  "timeframe": "5min",
  "config": {}
}
```

**Response Includes:**
- Routing decision (for transparency)
- Execution results
- Script path (for debugging)
- Execution time

## Query Types Supported

### 1. Single-Day Queries
**Examples:**
- "Run ORB on HOOD for 2025-07-31"
- "Test opening range breakout on Oct 15"
- "Backtest for today"

**Routing:** `template-api` or `custom-dates` with single date

### 2. Date Range Queries
**Examples:**
- "Backtest CRML for the past 10 days"
- "Test the last 2 weeks"
- "Run over the previous month"

**Routing:** `custom-dates` with generated date list

**Intelligence:** Automatically converts:
- Days → N trading days
- Weeks → N × 5 trading days
- Months → N × 21 trading days
- Excludes weekends

### 3. Specific Dates
**Examples:**
- "Test on 2025-10-10, 2025-10-15, 2025-10-20"
- "Run on Oct 8, Oct 10, Oct 15"
- "Backtest for these dates: 2025-10-13, 2025-10-14"

**Routing:** `custom-dates` with parsed date list

### 4. Custom Exit Times
**Examples:**
- "Exit at noon"
- "Close positions at 12:00"
- "Exit at 14:00"

**Intelligence:** Automatically extracts exit time and applies to strategy config

### 5. Earnings-Based Queries (Future)
**Examples:**
- "Test CRML's last 3 earnings days"
- "Backtest on earnings announcements"
- "Run on past 5 earnings dates"

**Routing:** `custom-dates` with earnings dates from database

**Note:** Requires earnings data in database (DateQueryService ready)

## Test Results

### Test 1: Simple Single-Day
**Prompt:** "Run opening range breakout on HOOD for 2025-07-31"

**Routing Decision:**
- Strategy: `custom-dates`
- Template: `orb-multiday`
- Dates: 1 date (2025-07-31)

**Result:** ✅ PASSED - 1 trade, -$2.64 P&L

### Test 2: Multi-Day with Custom Exit
**Prompt:** "Backtest CRML opening range for the past 5 trading days, exit at noon"

**Routing Decision:**
- Strategy: `custom-dates`
- Template: `orb-multiday`
- Dates: 5 dates (2025-10-15 to 2025-10-21)
- Exit Time: 12:00

**Result:** ✅ PASSED - 1 trade across 5 days, -$2.11 P&L, 0% win rate

### Test 3: Specific Dates
**Prompt:** "Test HOOD on 2025-10-10, 2025-10-15, 2025-10-20"

**Routing Decision:**
- Strategy: `custom-dates`
- Template: `orb-multiday`
- Dates: 3 dates specified

**Result:** ✅ PASSED - 0 trades (no breakouts on those days)

## Real-World Example: CRML 9-Day Backtest

**Query:** "Backtest CRML opening range breakout for the past 9 days with noon exit"

**Results:** (See `CRML_ORB_RESULTS.md` for full analysis)
- **Days Tested:** 9 (Oct 8-20, 2025)
- **Total Trades:** 4 (44.4% of days)
- **Win Rate:** 75% (3 wins, 1 loss)
- **Total P&L:** +$311 (100 shares)
- **Best Trade:** Oct 13 - +$3.16/share (+17.70%)
- **Worst Trade:** Oct 17 - -$2.11/share (-9.57%)

**Key Insight:** The intelligent router correctly:
1. Parsed "past 9 days" → generated 9 trading dates
2. Detected "noon exit" → applied 12:00 exit time
3. Routed to multi-day template
4. Executed and aggregated results

## Benefits

### 1. User Experience
- **Natural language queries** - No need to know API details
- **Automatic optimization** - System chooses best execution path
- **Transparent routing** - Response includes routing decision

### 2. Performance
- **Efficient execution** - Uses templates when possible
- **Batch processing** - Multi-day queries run in single script
- **Reduced overhead** - No multiple API calls for date ranges

### 3. Flexibility
- **Extensible** - Easy to add new query patterns
- **Template-based** - New templates can be added for different strategies
- **Database integration** - Earnings, dividends, splits can be added

### 4. Developer Experience
- **Single endpoint** - `/execute-intelligent` handles all cases
- **Consistent interface** - Same request format for all query types
- **Easy debugging** - Script path included in response

## File Structure

```
backend/
├── src/
│   ├── api/
│   │   └── routes/
│   │       └── backtests.ts                    # Added /execute-intelligent endpoint
│   ├── services/
│   │   ├── backtest-router.service.ts         # NEW: Core routing logic
│   │   ├── date-query.service.ts              # NEW: Date filtering service
│   │   ├── script-generator.service.ts        # Updated: Multi-day support
│   │   └── script-execution.service.ts        # Unchanged
│   ├── templates/
│   │   ├── orb-backtest.template.ts           # Existing single-day template
│   │   └── orb-multiday.template.ts           # NEW: Multi-day template
│   └── types/
│       └── script.types.ts                     # Updated: New types for routing
└── test-intelligent-routing.ts                 # Test suite

CRML_ORB_RESULTS.md                             # Real-world test results
2025-10-22.md                                   # Development plan
```

## Query Pattern Examples

### Date Ranges
```typescript
// Past N days
"past 10 days"           → Last 10 trading days
"last 5 trading days"    → Last 5 trading days
"previous 3 days"        → Last 3 trading days

// Weeks
"past 2 weeks"           → Last 10 trading days (2 × 5)
"last week"              → Last 5 trading days

// Months
"past month"             → Last 21 trading days
"last 2 months"          → Last 42 trading days
```

### Custom Exit Times
```typescript
"exit at noon"           → exitTime: "12:00"
"close at 12:00"         → exitTime: "12:00"
"exit at 14:30"          → exitTime: "14:30"
"exits at 11:00"         → exitTime: "11:00"
```

### Specific Dates
```typescript
"2025-10-10, 2025-10-15"               → ["2025-10-10", "2025-10-15"]
"on Oct 8, Oct 10, Oct 15"             → Parse month/day combinations
"test these dates: 2025-10-13, ..."    → Extract YYYY-MM-DD patterns
```

## Future Enhancements

### 1. Earnings Integration
```typescript
// Requires earnings data populated in database
"CRML's last 3 earnings days"
"backtest on earnings announcements"
"test past 5 earnings"
```

### 2. Additional Date Filters
```typescript
"dividend dates"
"stock split dates"
"gap up days > 5%"
"high volume days"
```

### 3. Complex Strategy Combinations
```typescript
"ORB with trailing stop on earnings days"
"multi-timeframe strategy for volatile days"
```

### 4. Time Period Analysis
```typescript
"compare Q1 vs Q2"
"test Mondays vs Fridays"
"morning session only"
```

### 5. Advanced Routing
- Machine learning-based routing decisions
- Performance-based template selection
- Automatic strategy optimization

## Conclusion

The intelligent routing system successfully transforms the backtesting platform from a rigid template-based system into a flexible, AI-powered tool that understands natural language queries. It handles:

✅ Single-day backtests
✅ Multi-day date ranges
✅ Specific date lists
✅ Custom exit times
✅ Template selection
✅ Script generation
✅ Automatic execution
✅ Result aggregation

This foundation enables future enhancements like earnings-based filtering, advanced date queries, and complex strategy combinations - all accessible through simple natural language prompts.
