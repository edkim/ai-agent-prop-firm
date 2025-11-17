# Scanner Templates

Working scanner templates for fast iteration. Instead of generating scanners from scratch with Claude (slow, expensive, often broken), start with these proven patterns and modify parameters.

## Available Templates

### 1. Gap Down VWAP Reclaim (`gap-down-vwap-reclaim.ts`)

**Pattern:** Stock gaps down at open, then reclaims VWAP intraday
**Edge:** Mean reversion after panic selling
**Win Rate:** ~55-60% (historical)
**Best Markets:** Tech stocks, high beta names

**Quick Parameters to Adjust:**
```typescript
const MIN_GAP_PERCENT = 2.0;      // Try: 1.5, 2.0, 3.0
const MIN_VOLUME_RATIO = 1.5;     // Try: 1.2, 1.5, 2.0
const MIN_VWAP_CROSSES = 1;       // Try: 1, 2
const LOOKBACK_BARS = 20;         // Try: 10, 20, 30
```

**Iteration Workflow:**
1. Start with default parameters
2. Run backtest, check results
3. Too many signals? Increase MIN_GAP_PERCENT or MIN_VWAP_CROSSES
4. Too few signals? Decrease MIN_GAP_PERCENT or MIN_VOLUME_RATIO
5. Poor win rate? Try requiring more VWAP crosses (stronger confirmation)

## How to Use Templates

### Method 1: Direct Testing (Fastest)
```bash
# Test template directly
SCAN_TICKERS=AAPL,TSLA,NVDA \
SCAN_START_DATE=2025-01-10 \
SCAN_END_DATE=2025-01-15 \
npx ts-node src/templates/scanners/gap-down-vwap-reclaim.ts
```

### Method 2: Copy and Modify
```bash
# Copy template to your own file
cp src/templates/scanners/gap-down-vwap-reclaim.ts my-gap-scanner-v2.ts

# Edit parameters
# Test it
npx ts-node my-gap-scanner-v2.ts
```

### Method 3: Use Debug API
```bash
# Debug on single ticker/date
curl -X POST http://localhost:3000/api/scanner-debug \
  -H "Content-Type: application/json" \
  -d '{
    "scannerCode": "<paste scanner code>",
    "ticker": "AAPL",
    "date": "2025-01-15",
    "explain": true
  }'
```

### Method 4: Quick Validation
```bash
# Check if scanner finds any signals
curl -X POST http://localhost:3000/api/scanner-debug/validate \
  -H "Content-Type: application/json" \
  -d '{
    "scannerCode": "<paste scanner code>",
    "tickers": ["AAPL", "TSLA", "NVDA"],
    "dates": ["2025-01-10", "2025-01-13"]
  }'
```

## Best Practices for Fast Iteration

### 1. Start Simple
- Use a template instead of generating from scratch
- Test on 3-5 tickers first (AAPL, TSLA, NVDA, AMD, MSFT)
- Test on 2-3 days first
- Expand to full universe once working

### 2. Debug Smart
- Use `/api/scanner-debug` to see what scanner sees on specific ticker/date
- Use `/api/scanner-debug/validate` before full backtest
- Check `sampleBars` to verify data is correct
- Check `debugLogs` to understand logic flow

### 3. Iterate Fast
- Change ONE parameter at a time
- Run quick validation (10 seconds) not full backtest (60 seconds)
- Document what worked/didn't work
- Build intuition for which parameters matter

### 4. Optimize Systematically
Once you have a working pattern:
1. **Entry Optimization:** Gap size, VWAP crosses, volume filters
2. **Execution Optimization:** Stops, targets, position sizing
3. **Filter Optimization:** Time of day, market conditions, RS filters

## Common Issues

### "No signals found"
1. Check if data exists for ticker/date
2. Reduce filter thresholds (gap size, volume ratio)
3. Debug on known gapping stock (TSLA, NVDA)
4. Look at `sampleBars` - is there actually a gap?

### "Too many signals (low quality)"
1. Increase gap size requirement
2. Require more VWAP crosses
3. Increase volume ratio requirement
4. Add time-of-day filter (avoid first/last 30min)

### "Signals but poor win rate"
1. Problem is likely execution, not entry
2. Test different execution templates (conservative vs aggressive)
3. Consider tighter stops or wider targets
4. Add filters (RS, proximity to resistance)

## Next Steps

1. **Week 1:** Get gap-down template profitable
   - Iterate on parameters
   - Optimize execution
   - Test on paper

2. **Week 2:** Add second pattern
   - Opening range breakout
   - VWAP fade at resistance
   - Build template library

3. **Week 3+:** Add sophistication
   - Relative strength filters
   - Support/resistance levels
   - Multi-timeframe confirmation

## Performance Tracking

Log your iterations in a simple spreadsheet:
- Parameters tested
- Signals found
- Win rate
- Profit factor
- Notes

This builds intuition and prevents testing same thing twice.
