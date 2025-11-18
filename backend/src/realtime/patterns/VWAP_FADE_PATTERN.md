# VWAP Fade Pattern

## Overview

The VWAP Fade pattern identifies weak stocks that open with initial movement but then fade below VWAP and stay there throughout the trading session. This is a classic weakness signature, especially effective in risk-off market environments.

## Pattern Characteristics

**What the scanner looks for:**
- Stock opens (may show initial strength or weakness)
- Fails to hold gains or continues lower
- **60-80%+ of 5-minute bars trade BELOW VWAP**
- Few meaningful recovery attempts (crosses back above VWAP)
- Gradually grinds lower throughout the session
- Maximum deviation below VWAP indicates institutional selling

## Signal Levels

The pattern has three severity levels:

### EMERGING (60-69% bars below VWAP)
- Early weakness detected
- Pattern is forming but not confirmed
- **Use case:** Early warning, monitor closely

### CONFIRMED (70-79% bars below VWAP)
- Clear weakness established
- ≤2 recovery attempts
- **Use case:** High-probability short entry, expect continuation

### EXTREME (80%+ bars below VWAP)
- Severe persistent weakness
- Max deviation > $0.50 below VWAP
- **Use case:** Very high conviction short, institutional distribution

## Best Market Conditions

✅ **Works best when:**
- Market is risk-off (QQQ, SPY negative)
- During intraday fades (10:00 AM - 3:00 PM ET)
- Stock has decent volume (not penny stocks)
- Using 5-minute RTH bars
- Daily chart shows downtrend context

❌ **Avoid when:**
- Strong market uptrend (QQQ rallying hard)
- Low volume periods (pre-market, after-hours)
- Micro-cap stocks with overnight news gaps
- Stock is in a strong daily uptrend

## Signal Metadata

When a signal is detected, you'll see:

```
🚨 SIGNAL DETECTED
════════════════════════════════════════════════════════
Pattern:     VWAP Fade
Ticker:      ETHE
Time:        14:35:12 (14:35:00)
Confidence:  85%
────────────────────────────────────────────────────────
Entry:       $22.48
Stop:        $22.93 (+2.00%)
Target:      $21.98 (-2.23%)
Risk/Reward: 2.2:1
────────────────────────────────────────────────────────
Metadata:
  status: EXTREME
  percentBarsBelow: 82.5
  barsBelow: 33
  totalBars: 40
  currentVwap: 22.91
  percentBelowVwap: 1.88
  maxDeviation: 0.65
  recoveryAttempts: 1
  fadeFromOpen: 3.25
  sessionOpen: 23.20
  minutesIntoSession: 200
  prevDayClose: 23.85
  riskReward: 2.22
════════════════════════════════════════════════════════
```

## Key Metrics Explained

### percentBarsBelow
**What:** Percentage of analyzed bars where close < VWAP
**Range:** 60-100%
**Ideal:** 70-85% (sweet spot for trading)

### maxDeviation
**What:** Largest gap between price and VWAP
**Significance:** Higher = more institutional selling
**Threshold:** >$0.50 triggers EXTREME status

### recoveryAttempts
**What:** Number of times price closed above VWAP after being below
**Ideal:** 0-2 attempts (shows price can't reclaim VWAP)
**Warning:** >3 attempts = weakening pattern

### fadeFromOpen
**What:** How far stock has fallen from session open
**Context:** Combined with VWAP weakness = momentum exhaustion

### Confidence Score (0-100)
Weighted calculation:
- **50%** - Consistency (% bars below VWAP)
- **30%** - Max deviation (how far below VWAP)
- **20%** - Recovery resistance (fewer attempts = stronger)

## Trading Applications

### Short Entry Strategy
1. Wait for CONFIRMED or EXTREME status
2. Verify market context (QQQ negative)
3. Enter short at current price
4. Stop: 0.2% above VWAP (invalidation if reclaimed)
5. Target: Extension of max deviation below current price

### Risk Management
- Pattern invalidates if price reclaims and holds above VWAP
- Best risk/reward during 10:00 AM - 2:00 PM window
- Consider scaling out as pattern strengthens (CONFIRMED → EXTREME)

### Example Trade: ETHE
**Setup:**
- Daily chart: Strong downtrend, below all major MAs
- QQQ: Down 1.2% (risk-off)
- Intraday: 82.5% of bars below VWAP
- Status: EXTREME

**Execution:**
- Entry: $22.48
- Stop: $22.93 (above VWAP)
- Target: $21.98
- Risk/Reward: 2.2:1
- Result: ✓ Worked (closed $22.10)

## Integration with Other Patterns

The VWAP Fade pattern works well when combined with:

### Daily Context
- Stock below 200-day MA (downtrend)
- Recent gap down (continuation)
- High volume distribution days

### Intraday Confirmation
- New Session Low pattern (price making new lows)
- Gap and Hold failure (gap up that immediately fails)
- RSI < 40 (momentum weakness)

### Market Context
- QQQ/SPY negative (risk-off environment)
- VIX elevated (volatility, fear)
- Sector rotation out of growth

## Analysis Window

The pattern analyzes the **last 40 bars (200 minutes)** or all available bars if less than 40:
- Minimum: 15 bars (75 minutes) to generate signal
- Optimal: Full session data (78 bars = 390 minutes RTH)
- Uses only RTH bars (09:30-16:00 ET)

## Real-Time Behavior

**Scan frequency:** Every 5 minutes (configurable)

**State tracking:**
- Signals persist across scans
- Status can escalate (EMERGING → CONFIRMED → EXTREME)
- You'll be alerted when patterns strengthen

**Example progression:**
```
10:30 - EMERGING (62% below VWAP)
11:00 - CONFIRMED (71% below VWAP) [ALERT]
14:00 - EXTREME (83% below VWAP) [ESCALATION ALERT]
```

## Watchlist Configuration

Default watchlist includes crypto-adjacent and weak stocks:

```typescript
// Crypto-adjacent (excellent for fade patterns)
'ETHE', 'GBTC', 'MSTR', 'MARA', 'CLSK', 'RIOT'

// Volatility tickers
'UVXY', 'SOXL', 'TQQQ'

// Indices (for market context)
'QQQ', 'SPY', 'IWM'
```

Override via environment variable:
```bash
SCAN_TICKERS=ETHE,MARA,CLSK,RIOT npm run realtime
```

## Performance Expectations

### Signal Frequency (in risk-off conditions)
- **EXTREME:** 2-5 per day
- **CONFIRMED:** 5-15 per day
- **EMERGING:** 10-30 per day

### Win Rate Context
- **Standalone:** Moderate (this is a confirmation pattern)
- **With momentum weakness:** High
- **During market downtrends:** Very high
- **In risk-off environment:** Excellent

### Best Performance Windows
- **10:00-11:30 AM ET:** Morning fade after failed rally
- **1:00-3:00 PM ET:** Afternoon grind lower
- **Avoid:** First 30 minutes (choppy), last 15 minutes (close positioning)

## Historical Backtest Integration

The pattern can be backtested using your existing framework:

```typescript
import { VWAPFade } from './patterns/vwap-fade';

// Test on historical intraday data
const state = {
  ticker: 'ETHE',
  bars: historicalIntradayBars,  // 5-minute RTH bars
  indicators: {
    vwap: calculatedVWAP,
    // ... other indicators
  },
  metadata: {
    prevDayClose: 23.85,
    todayOpen: 23.20,
    // ...
  }
};

const signal = VWAPFade.scan(state);

if (signal && signal.confidence >= 70) {
  // Backtest the trade setup
}
```

## Troubleshooting

**No signals detected:**
- Verify market is open (RTH hours)
- Check if market is actually weak (QQQ/SPY down)
- Ensure tickers have volume and are moving
- Pattern may not be present (market rallying)

**Too many false signals:**
- Increase minimum bars threshold (edit pattern minBars)
- Only trade CONFIRMED or EXTREME status
- Add market context filter (require QQQ < -0.5%)
- Filter by daily trend (require below 200MA)

**Pattern strength seems off:**
- Verify VWAP calculation is correct
- Check that RTH filtering is working
- Ensure using 5-minute bars (not 1-min or 15-min)
- Pattern works best 90+ minutes into session

## Advanced Usage

### Custom Confidence Thresholds

Edit `vwap-fade.ts` to adjust scoring weights:

```typescript
const confidence = Math.floor(
  consistencyScore * 0.5 +  // Adjust this (default 50%)
  deviationScore * 0.3 +    // Adjust this (default 30%)
  recoveryScore * 0.2       // Adjust this (default 20%)
);
```

### Market Context Integration

To add automatic QQQ checking (coming soon):

```typescript
// In shouldScan():
const qqqDown = marketState.getState('QQQ')?.metadata?.fadeFromOpen > 0.5;
if (!qqqDown) return false;
```

### Custom Alert Filters

In alert-manager, add filtering:

```typescript
if (signal.pattern === 'VWAP Fade') {
  // Only alert CONFIRMED+ in risk-off
  if (signal.confidence < 70) return;
  if (marketSentiment !== 'RISK_OFF') return;
}
```

## See Also

- **New Session Low:** Often fires alongside VWAP Fade
- **Gap and Hold:** Inverse pattern (gap up that holds)
- **Real-time Scanner README:** Setup and configuration
- **Pattern Registry:** How to enable/disable patterns
