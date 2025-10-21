# Production Backtesting System - Implementation Guide

## Current System Overview

Your backend already has a **production-ready backtesting infrastructure**:

### ✅ What Already Exists

1. **API Endpoints** (`src/api/routes/backtests.ts`)
   - `POST /api/backtests` - Run a backtest
   - `GET /api/backtests` - List all backtests
   - `GET /api/backtests/:id` - Get backtest results
   - `DELETE /api/backtests/:id` - Delete backtest

2. **Backtest Engine** (`src/services/backtest.service.ts`)
   - Bar-by-bar simulation
   - Indicator calculation
   - Entry/exit rule evaluation
   - Position management
   - Risk management (stop loss, take profit, trailing stops)
   - Performance metrics (Sharpe, Sortino, win rate, etc.)
   - Equity curve tracking

3. **Database Schema**
   - `strategies` table - Strategy configurations
   - `backtests` table - Backtest runs and results
   - `trades` table - Individual trades
   - `ohlcv_data` table - Price data

4. **Features**
   - Multi-ticker support (dependencies like QQQ)
   - Earnings-based strategies (`requireEarnings: true`)
   - Trailing stops (`riskManagement.trailingStop`)
   - Custom indicators
   - Expression-based rules

## The Gap: Opening Range Breakout Logic

The current system uses **rule-based configuration**, but Opening Range Breakout requires:

1. **Stateful logic** - Track opening range high/low
2. **Time-based conditions** - Only calculate OR during 9:30-9:35 AM
3. **Sequential logic** - Can't enter until AFTER opening range is established

### Solution Options

---

## Option 1: Custom Strategy Type (Recommended)

Extend the strategy system to support custom strategy classes alongside rule-based strategies.

### Implementation

```typescript
// src/strategies/base.strategy.ts
export abstract class BaseStrategy {
  abstract name: string;
  abstract description: string;

  // Initialize strategy state
  abstract init(bars: OHLCVBar[], config: any): void;

  // Check if should enter on this bar
  abstract checkEntry(context: EvaluationContext): boolean;

  // Check if should exit on this bar
  abstract checkExit(context: EvaluationContext): boolean;

  // Optional: Calculate position size
  calculatePositionSize?(context: EvaluationContext): number;

  // Optional: Calculate stop loss
  calculateStopLoss?(position: Position, context: EvaluationContext): number;
}
```

```typescript
// src/strategies/opening-range-breakout.strategy.ts
export class OpeningRangeBreakoutStrategy extends BaseStrategy {
  name = 'Opening Range Breakout';
  description = '5-minute opening range breakout with optional market filter';

  private openingRangeHigh: number = 0;
  private openingRangeLow: number = 0;
  private openingRangeEstablished: boolean = false;

  // Strategy-specific config
  private config: {
    openingRangeMinutes: number; // e.g., 5 for 9:30-9:35
    marketFilterTicker?: string; // e.g., 'QQQ'
    trailingStopPercent?: number; // e.g., 2.5
    requireEarnings?: boolean;
  };

  constructor(config: any) {
    super();
    this.config = {
      openingRangeMinutes: config.openingRangeMinutes || 5,
      marketFilterTicker: config.marketFilterTicker,
      trailingStopPercent: config.trailingStopPercent,
      requireEarnings: config.requireEarnings || false,
    };
  }

  init(bars: OHLCVBar[], config: any): void {
    // Find opening range bar (9:30 AM)
    const openingBarIndex = bars.findIndex(bar =>
      bar.timeOfDay === '09:30' || bar.timeOfDay === '13:30'
    );

    if (openingBarIndex !== -1) {
      const openingBar = bars[openingBarIndex];
      this.openingRangeHigh = openingBar.high;
      this.openingRangeLow = openingBar.low;
      this.openingRangeEstablished = true;
    }
  }

  checkEntry(context: EvaluationContext): boolean {
    // Can't enter until opening range is established
    if (!this.openingRangeEstablished) return false;

    // Can't enter before 9:35 AM
    const currentTime = context.currentBar.timeOfDay || '';
    if (currentTime < '09:35' && currentTime >= '09:30') return false;

    // Check if earnings filter is required
    if (this.config.requireEarnings && !context.earningsToday) {
      return false;
    }

    // Check breakout
    const breakout = context.currentBar.high > this.openingRangeHigh;

    if (!breakout) return false;

    // Check market filter if configured
    if (this.config.marketFilterTicker && context.dependencyBars) {
      const filterBar = context.dependencyBars.get(this.config.marketFilterTicker);
      if (!filterBar) return false;

      // Find opening bar for filter ticker
      const filterOpeningBar = context.dependencyData?.get(this.config.marketFilterTicker)?.find(
        bar => bar.timeOfDay === '09:30' || bar.timeOfDay === '13:30'
      );

      if (!filterOpeningBar) return false;

      // Check if filter ticker is positive
      const filterPositive = filterBar.close > filterOpeningBar.open;
      if (!filterPositive) return false;
    }

    return true;
  }

  checkExit(context: EvaluationContext): boolean {
    // Exit at market close (4:00 PM)
    const currentTime = context.currentBar.timeOfDay || '';
    if (currentTime === '16:00' || currentTime === '20:00') {
      return true;
    }

    // Trailing stop handled by risk management system
    return false;
  }

  calculateStopLoss(position: Position, context: EvaluationContext): number | undefined {
    if (!this.config.trailingStopPercent) return undefined;

    // Trailing stop will be managed by the backtest engine
    // Return initial stop level
    return position.entryPrice * (1 - this.config.trailingStopPercent / 100);
  }
}
```

### Strategy Registration

```typescript
// src/strategies/registry.ts
export class StrategyRegistry {
  private static strategies = new Map<string, typeof BaseStrategy>();

  static register(type: string, strategyClass: typeof BaseStrategy): void {
    this.strategies.set(type, strategyClass);
  }

  static create(type: string, config: any): BaseStrategy {
    const StrategyClass = this.strategies.get(type);
    if (!StrategyClass) {
      throw new Error(`Unknown strategy type: ${type}`);
    }
    return new StrategyClass(config);
  }
}

// Register built-in strategies
StrategyRegistry.register('opening-range-breakout', OpeningRangeBreakoutStrategy);
```

### API Usage

```typescript
// POST /api/backtests
{
  "strategyType": "opening-range-breakout",
  "strategyConfig": {
    "ticker": "HOOD",
    "timeframe": "5min",
    "openingRangeMinutes": 5,
    "marketFilterTicker": "QQQ",
    "trailingStopPercent": 2.5,
    "requireEarnings": true
  },
  "startDate": "2025-07-31",
  "endDate": "2025-07-31",
  "initialCapital": 100000,
  "commission": 1.0,
  "slippage": 0.05
}
```

### Database Schema Update

```sql
-- Add strategy_type column to strategies table
ALTER TABLE strategies ADD COLUMN strategy_type TEXT DEFAULT 'rule-based';

-- Values: 'rule-based', 'opening-range-breakout', 'custom'
```

---

## Option 2: Enhanced Rule System

Extend the expression system to support stateful variables and time-based conditions.

### New Expression Functions

```typescript
// Add to expression.service.ts
const functions = {
  // ... existing functions

  // Opening range functions
  OR_HIGH: (context: EvaluationContext, minutes: number = 5) => {
    // Calculate opening range high for first N minutes
    const openingBars = context.bars.slice(0, minutes);
    return Math.max(...openingBars.map(b => b.high));
  },

  OR_LOW: (context: EvaluationContext, minutes: number = 5) => {
    const openingBars = context.bars.slice(0, minutes);
    return Math.min(...openingBars.map(b => b.low));
  },

  TIME_AFTER: (context: EvaluationContext, time: string) => {
    return (context.currentBar.timeOfDay || '') > time;
  },

  DEPENDENCY_POSITIVE: (context: EvaluationContext, ticker: string) => {
    const depBar = context.dependencyBars?.get(ticker);
    const depBars = context.dependencyData?.get(ticker);
    if (!depBar || !depBars || depBars.length === 0) return false;
    return depBar.close > depBars[0].open;
  },
};
```

### Strategy Configuration (JSON)

```json
{
  "name": "HOOD ORB Post-Earnings",
  "ticker": "HOOD",
  "timeframe": "5min",
  "dependencies": ["QQQ"],
  "requireEarnings": true,
  "indicators": [],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "TIME_AFTER('09:35')"
      },
      {
        "type": "expression",
        "expression": "currentBar.high > OR_HIGH(5)"
      },
      {
        "type": "expression",
        "expression": "DEPENDENCY_POSITIVE('QQQ')"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "currentBar.timeOfDay === '16:00'"
      }
    ],
    "logic": "OR"
  },
  "positionSizing": {
    "method": "PERCENT_PORTFOLIO",
    "value": 100,
    "maxPositions": 1
  },
  "riskManagement": {
    "trailingStop": {
      "type": "PERCENT",
      "value": 2.5
    }
  }
}
```

**Pros**: No code changes to backtest engine
**Cons**: Expression system becomes complex, harder to test/debug

---

## Option 3: Hybrid Approach (Recommended for Production)

Combine both approaches:
- Use **custom strategies** for complex logic (ORB, mean reversion, etc.)
- Keep **rule-based strategies** for simple strategies
- Share the same backtest engine and infrastructure

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend UI                       │
│  - Strategy Builder (visual for rule-based)         │
│  - Custom Strategy Selector                          │
│  - Backtest Configuration                            │
│  - Results Dashboard                                 │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│              API Layer (Express)                     │
│  POST /api/backtests                                 │
│  GET  /api/backtests/:id                            │
│  POST /api/strategies (save configuration)           │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│          Backtest Service (Core Engine)              │
│  - Load strategy (rule-based or custom)              │
│  - Fetch market data                                 │
│  - Bar-by-bar simulation                             │
│  - Position management                               │
│  - Performance metrics                               │
└────────┬────────────────────────────┬────────────────┘
         │                            │
         ▼                            ▼
┌──────────────────┐        ┌──────────────────────┐
│  Rule-Based      │        │  Custom Strategies   │
│  Strategies      │        │  Registry            │
│  - Expression    │        │  - ORB               │
│    Evaluator     │        │  - Mean Reversion    │
│  - Indicator     │        │  - Pairs Trading     │
│    Factory       │        │  - Earnings Plays    │
└──────────────────┘        └──────────────────────┘
         │                            │
         └────────────┬───────────────┘
                      ▼
         ┌─────────────────────────┐
         │      Database           │
         │  - strategies           │
         │  - backtests            │
         │  - trades               │
         │  - ohlcv_data           │
         └─────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Core Custom Strategy Support (2-3 days)

1. Create `BaseStrategy` abstract class
2. Implement `OpeningRangeBreakoutStrategy`
3. Create `StrategyRegistry`
4. Update `BacktestService` to support both types
5. Add `strategy_type` column to database

### Phase 2: API Integration (1-2 days)

1. Update backtest API to accept custom strategies
2. Add validation for strategy configurations
3. Update database queries
4. Add tests

### Phase 3: Additional Strategies (ongoing)

1. Mean Reversion
2. Momentum Breakout
3. Pairs Trading
4. Earnings-based strategies

### Phase 4: Advanced Features (1-2 weeks)

1. Strategy optimization (parameter sweep)
2. Walk-forward analysis
3. Monte Carlo simulation
4. Multi-ticker portfolio backtesting
5. Risk-adjusted position sizing

---

## Example: Running ORB Backtest via API

### 1. Save Strategy Configuration

```bash
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HOOD ORB Post-Earnings with QQQ Filter",
    "description": "5-min opening range breakout, day after earnings, 2.5% trailing stop",
    "strategyType": "opening-range-breakout",
    "config": {
      "ticker": "HOOD",
      "timeframe": "5min",
      "openingRangeMinutes": 5,
      "marketFilterTicker": "QQQ",
      "trailingStopPercent": 2.5,
      "requireEarnings": true
    }
  }'
```

Response:
```json
{
  "success": true,
  "strategyId": 1
}
```

### 2. Run Backtest

```bash
curl -X POST http://localhost:3000/api/backtests \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": 1,
    "startDate": "2025-07-31",
    "endDate": "2025-07-31",
    "initialCapital": 100000,
    "commission": 1.0,
    "slippage": 0.05
  }'
```

Response:
```json
{
  "success": true,
  "backtestId": 42,
  "message": "Backtest started"
}
```

### 3. Check Results

```bash
curl http://localhost:3000/api/backtests/42
```

Response:
```json
{
  "backtest": {
    "id": 42,
    "strategyName": "HOOD ORB Post-Earnings with QQQ Filter",
    "status": "COMPLETED",
    "metrics": {
      "totalReturn": 1.20,
      "totalReturnPercent": 1.14,
      "totalTrades": 1,
      "winRate": 100,
      "profitFactor": 999,
      "sharpeRatio": 2.34,
      "maxDrawdownPercent": 0.15
    },
    "trades": [
      {
        "ticker": "HOOD",
        "side": "LONG",
        "entryTimestamp": 1722418500000,
        "entryPrice": 105.13,
        "exitTimestamp": 1722420000000,
        "exitPrice": 106.33,
        "pnl": 1.20,
        "pnlPercent": 1.14,
        "exitReason": "TRAILING_STOP"
      }
    ],
    "equityCurve": [...],
    "completedAt": "2025-10-21T18:00:00Z"
  }
}
```

---

## Benefits of Production System

### vs Custom Scripts

| Aspect | Custom Scripts | Production System |
|--------|---------------|-------------------|
| **Scalability** | One-off runs | Batch processing, queue |
| **Reusability** | Copy-paste code | Saved configurations |
| **Monitoring** | Console logs | Database tracking |
| **Persistence** | None | All results stored |
| **Testing** | Manual | Automated tests |
| **Optimization** | Manual iteration | Parameter sweep API |
| **Collaboration** | Share files | API + UI |
| **Deployment** | Local only | Web accessible |

### Key Advantages

1. **Reproducibility**: Every backtest is stored with exact parameters
2. **Auditability**: Track what strategies were tested and when
3. **Scalability**: Run 100s of backtests in parallel
4. **Integration**: Connect to frontend, alerting, live trading
5. **Version Control**: Strategy configurations in database
6. **Access Control**: User permissions, rate limiting
7. **Performance**: Optimized queries, caching, indexes

---

## Next Steps

1. **Choose approach**: Custom strategies (recommended) or enhanced expressions
2. **Implement base classes** for custom strategies
3. **Port ORB logic** from scripts to strategy class
4. **Add API endpoints** for custom strategy types
5. **Create frontend UI** for strategy selection and results
6. **Add tests** for critical paths
7. **Deploy** to staging environment

Let me know which option you'd like to pursue and I can help implement it!
