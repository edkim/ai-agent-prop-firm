# Database Redundancy Analysis
**Date:** 2025-11-10

## Executive Summary

Analyzed all database tables to identify redundant or unused tables. Found 14 empty tables (0 records), categorized into three groups based on code references and system requirements.

## Table Categories

### 🗑️ SAFE TO REMOVE (4 tables)

These tables have **0 records** and **NO code references**:

| Table | Records | Code References | Notes |
|-------|---------|----------------|-------|
| `conversations` | 0 | None | Planned for "Phase 2 - AI integration" but never implemented |
| `pivot_points_cache` | 0 | None | Mentioned in schema but no service uses it |
| `support_resistance_levels` | 0 | None | Mentioned in schema but no service uses it |
| `tradestation_orders` | 0 | None | TradeStation integration not implemented |

**Recommendation:** These can be safely removed from the schema to reduce database complexity.

---

### ⚠️ KEEP - Autonomous Trading Infrastructure (7 tables)

These tables are **empty but actively referenced** by the autonomous trading system. They will be populated when live/paper trading agents generate signals and execute trades:

| Table | Records | Used By | Purpose |
|-------|---------|---------|---------|
| `trade_recommendations` | 0 | execution-engine.service.ts<br>trade-optimizer.service.ts<br>trading-agent.ts routes | AI-generated trade recommendations |
| `live_signals` | 0 | realtime-scanner.service.ts<br>trade-optimizer.service.ts<br>trading-agent.ts routes | Real-time pattern detections |
| `executed_trades` | 0 | position-monitor.service.ts<br>execution-engine.service.ts<br>trailing-stop.service.ts<br>risk-metrics.service.ts<br>trading-agent.ts routes | Live/paper trade execution records |
| `strategy_recommendations` | 0 | claude-analysis.service.ts<br>batch-backtest.service.ts | Claude-generated strategy suggestions |
| `risk_metrics` | 0 | risk-metrics.service.ts | Historical risk tracking |
| `analysis_charts` | 0 | claude-analysis.service.ts | Cached charts for Claude analysis |
| `chart_thumbnails` | 0 | chart-generator.service.ts | Chart image cache |

**Why they're empty:**
- Paper trading agents are just starting to monitor tickers (recently fixed watchlist issue)
- Autonomous trading system (`AUTO_EXECUTION_ENABLED=true`) not yet activated in production
- These tables will populate once agents start detecting patterns and making trades

**Recommendation:** KEEP all these tables. They are part of active infrastructure.

---

### ✅ KEEP - Catalyst/Context Data (3 tables)

These tables are referenced for market context but may remain mostly empty:

| Table | Records | Used By | Purpose |
|-------|---------|---------|---------|
| `earnings_events` | 0 | polygon.service.ts | Earnings catalyst tracking |
| `news_events` | 25 | None currently | News catalyst tracking (some data present) |
| `market_regime` | 0 | None currently | VIX/SPY regime tracking |

**Recommendation:** KEEP for now. These provide valuable context for trading decisions, even if not fully populated yet.

---

## Core Active Tables (with significant data)

These tables are actively used and contain substantial data:

| Table | Records | Purpose |
|-------|---------|---------|
| `ohlcv_data` | 4,989,733 | Market price/volume data (core dataset) |
| `daily_metrics` | 958,345 | Pre-computed metrics for scanning |
| `agent_knowledge` | 211 | Learning Laboratory knowledge base |
| `agent_iterations` | 56 | Learning Laboratory experiment history |
| `trading_agents` | 8 | All agents (learning/paper/live) |
| `scan_history` | Varies | Scanner execution history |
| `backtests` | Varies | Backtest results |
| `batch_backtest_results` | Varies | Batch backtest data |

---

## Recommendations

### Immediate Actions

1. **Remove 4 unused tables:**
   ```sql
   DROP TABLE IF EXISTS conversations;
   DROP TABLE IF EXISTS pivot_points_cache;
   DROP TABLE IF EXISTS support_resistance_levels;
   DROP TABLE IF EXISTS tradestation_orders;
   ```

2. **Update schema.sql** to reflect removal of these tables

3. **Remove related indexes** (if any) for dropped tables

### Do NOT Remove

- All autonomous trading tables (even though empty) - they're part of active infrastructure
- Catalyst/context tables (earnings_events, news_events, market_regime) - provide valuable context

---

## Notes

### About `trade_recommendations` and `strategy_recommendations`

User specifically asked about these two tables:

- **`trade_recommendations`**: Used by execution engine for AI-generated trade decisions. Will populate when paper/live trading agents detect signals and Claude analyzes them for trade opportunities.

- **`strategy_recommendations`**: Used by Claude analysis service and batch backtest system. Populated when users request Claude to analyze chart patterns and suggest strategies.

Both are **essential infrastructure** despite being empty. They're waiting for:
1. Paper trading agents to generate signals (watchlist just fixed)
2. Users to request Claude strategy analysis
3. Autonomous trading mode to be enabled

---

## Database Size Impact

Removing the 4 unused tables will have minimal storage impact but will:
- ✅ Reduce schema complexity
- ✅ Remove confusion about unused features
- ✅ Clean up codebase
- ✅ Prevent future developers from using deprecated tables

Current database size dominated by:
- `ohlcv_data`: ~4.9M records (market data)
- `daily_metrics`: ~958K records (computed metrics)

---

## Implementation Plan

```bash
# 1. Backup database
cp backtesting.db backtesting.db.backup-2025-11-10

# 2. Create migration script
cat > backend/migrations/2025-11-10-remove-unused-tables.sql << 'EOF'
-- Remove unused tables (no code references, no data)
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS pivot_points_cache;
DROP TABLE IF EXISTS support_resistance_levels;
DROP TABLE IF EXISTS tradestation_orders;
EOF

# 3. Apply migration
sqlite3 backtesting.db < backend/migrations/2025-11-10-remove-unused-tables.sql

# 4. Update schema.sql
# (Remove the CREATE TABLE statements for these 4 tables)

# 5. Test application
npm run dev
```

---

## Conclusion

Out of 14 empty tables analyzed:
- **4 can be removed** (truly unused)
- **7 must be kept** (autonomous trading infrastructure)
- **3 should be kept** (market context data)

The database schema is actually quite lean - most "empty" tables are waiting to be populated by active systems that were recently deployed or are about to be enabled.
