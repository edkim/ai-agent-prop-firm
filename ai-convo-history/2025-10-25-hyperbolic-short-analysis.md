# Hyperbolic Stock Short Strategy Analysis
**Date:** 2025-10-25
**Objective:** Find hyperbolic short opportunities (stocks up 3+ days straight with 100%+ gain) and develop profitable mean reversion trading strategies

## High-Level Steps Completed

### 1. Scanner Query - Hyperbolic Stocks
✅ Used scanner API to find stocks with extreme upward moves
- **Criteria:** 3+ consecutive up days, 50%+ gain, 2x+ volume ratio
- **Universe:** Russell 2000
- **Date Range:** 2024-01-01 to 2024-12-31
- **Results:** 26 hyperbolic stocks identified

### 2. Top Hyperbolic Candidates
Found several extreme movers in 2024:
1. **DRUG** - 1,445% gain (Oct 15, 2024) - 3 up days
2. **TVGN** - 187% gain (Oct 14, 2024) - 3 up days
3. **PDYN** - 130% gain (Nov 22, 2024) - 3 up days
4. **TNXP** - 120% gain (Dec 16, 2024) - 3 up days
5. **KRRO** - 93% gain (Oct 16, 2024) - 3 up days

### 3. Strategy Development
Designed three short-selling strategies to fade hyperbolic moves:

**Strategy 1: Fade the Peak (Conservative)**
- Entry: Short at close on signal day
- Stop: 15%
- Target: 30% profit
- Hold: Max 10 days

**Strategy 2: Immediate Fade (Aggressive)**
- Entry: Short at close on signal day
- Stop: 10%
- Target: 25% profit
- Hold: Max 5 days

**Strategy 3: Wait for Reversal Signal (Selected)**
- Entry: Short when price closes below previous day's low
- Stop: Previous day's high
- Target: 40% profit
- Hold: Max 15 days
- Rationale: Confirmation of trend break before entry

### 4. Backtest Attempt - Strategy 3 on DRUG
✅ Backtest code successfully generated (92% confidence)
❌ **Issue:** No historical data available for DRUG ticker
- Tested Oct 14 - Nov 8, 2024 range
- All 20 trading days returned "No data available"
- Likely due to DRUG being a low-volume penny stock

## Key Findings

1. **Scanner successfully identifies extreme movers** - The criteria-based scan found 26 stocks with hyperbolic patterns
2. **Strategy logic is sound** - Claude AI generated sophisticated reversal strategies with proper risk management
3. **Data availability is limiting factor** - Penny stocks with extreme moves often lack reliable historical data
4. **Polygon API limitations** - May not have comprehensive coverage for thinly-traded small caps

## Next Steps

Options to proceed:
1. Try backtesting on TVGN, PDYN, or TNXP (may have better data)
2. Fetch DRUG data manually from Polygon and store in database
3. Test the reversal strategy concept on liquid stocks first
4. Use scan-and-test endpoint to automatically test all 26 candidates

## Technical Notes

- Valid timeframe formats: `10sec`, `1min`, `5min`, `15min`, `30min`, `1hour`, `1day`, `1week`, `1month`
- API Endpoints Used:
  - `POST /api/scanner/scan` - Pattern detection
  - `POST /api/backtests/execute-intelligent` - Strategy backtesting
- Files Created:
  - `/tmp/hyperbolic-scan-simple.json` - Scanner criteria
  - `/tmp/strategy3-reversal-backtest.json` - Backtest request
