# Real-Time Pattern Scanner

Live pattern scanning system that watches market data in real-time and alerts when patterns are detected.

## ⚠️ CRITICAL REQUIREMENTS

**Before using in production, read this:**

### Regular Trading Hours (RTH) Only
- By default, all metadata (prevDayClose, todayOpen, VWAP) uses **RTH bars only** (09:30-16:00 ET)
- Extended hours bars are received but filtered out of calculations
- Each bar has an `isRTH` boolean flag
- Patterns expecting RTH data will work correctly
- If you need extended hours data, filter explicitly: `bars.filter(b => !b.isRTH)`

### Timezone Handling
- **All timestamps normalized to Eastern Time (ET)**
- Works correctly regardless of server location
- Handles EDT/EST transitions automatically
- Bar.date = YYYY-MM-DD in ET
- Bar.time = HH:MM:SS in ET
- Never use local machine timezone for day boundaries

### Startup Requirements
- **⚠️ NO AUTOMATIC BACKFILL YET**: Starting mid-session = almost no bars
- **Best practice**: Start before 09:30 ET to accumulate full session data
- **Alternative**: Patterns need 20-50 bars to function; wait ~2 hours after startup
- **Coming soon**: Automatic backfill of current session on startup

### In-Memory State
- **All data stored in RAM** (sliding window of 300 bars per ticker)
- **Crash = lose all state** (no persistence yet)
- **Recovery**: Restart and wait for bars to accumulate
- Memory usage: ~50MB for 500 tickers

### Rate Limits
- Polygon websocket: No explicit rate limits documented
- REST API backfill (when implemented): 5 requests/minute on free tier
- No automatic backoff yet (coming soon)

## Architecture

```
┌─────────────────┐
│  Polygon WS     │ → 5-min bars for tickers
└────────┬────────┘
         ↓
┌─────────────────┐
│  Market State   │ → In-memory sliding window (100 bars per ticker)
└────────┬────────┘
         ↓
┌─────────────────────────────────┐
│  Pattern Scanners (concurrent)   │
│  - Gap and Hold                  │
│  - New Session Low               │
│  - New Session High              │
│  - VWAP Fade                     │
└────────┬────────────────────────┘
         ↓
┌─────────────────┐
│  Alert System   │ → Console, Discord, etc.
└─────────────────┘
```

## Quick Start

```bash
# Run the scanner
npm run realtime

# Run with auto-reload (dev mode)
npm run realtime:dev

# Specify custom tickers
SCAN_TICKERS=AAPL,MSFT,GOOGL npm run realtime

# Crypto/weak stock watchlist (good for VWAP Fade pattern)
SCAN_TICKERS=MARA,CLSK,RIOT,ETHE,MSTR,GBTC npm run realtime
```

## Active Patterns

The scanner currently includes 4 real-time patterns:

### 1. Gap and Hold
Detects gap-up patterns that hold above VWAP, indicating strong momentum continuation.
- **Signal:** Stock gaps up 2%+ and maintains above VWAP
- **Best for:** Morning strength, trend continuation
- **Bias:** Long

### 2. New Session Low
Detects when price breaks below session low, signaling potential breakdown or reversal.
- **Signal:** Price makes new low for current session
- **Best for:** Breakdown momentum, reversal setups
- **Bias:** Short/Reversal

### 3. New Session High
Detects when price breaks above session high, signaling potential breakout.
- **Signal:** Price makes new high for current session
- **Best for:** Breakout momentum, trend continuation
- **Bias:** Long

### 4. VWAP Fade ⭐ NEW
Detects weak stocks that fade below VWAP and stay there throughout the session.
- **Signal:** 60-80%+ of bars trade below VWAP
- **Severity levels:** EMERGING (60-69%) → CONFIRMED (70-79%) → EXTREME (80%+)
- **Best for:** Risk-off environments, persistent weakness
- **Bias:** Short
- **Ideal tickers:** Crypto-adjacent stocks (ETHE, MARA, CLSK), high-beta tech
- **Documentation:** See `patterns/VWAP_FADE_PATTERN.md` for complete guide

## Configuration

Set these environment variables in `.env`:

```bash
# Required
POLYGON_API_KEY=your_key_here

# Optional
SCAN_TICKERS=AAPL,MSFT,GOOGL,AMD  # Comma-separated list
```

## Adding New Patterns

Create a new pattern file in `patterns/`:

```typescript
// patterns/bull-flag.ts
import { Pattern, TickerState, Signal } from './types';

export const BullFlag: Pattern = {
  name: 'Bull Flag',
  description: 'Strong uptrend followed by consolidation',
  minBars: 50,

  shouldScan(state: TickerState): boolean {
    // Pre-filter logic
    return state.bars.length >= 50;
  },

  scan(state: TickerState): Signal | null {
    // Pattern detection logic
    const bars = state.bars;
    const current = bars[bars.length - 1];

    // ... your pattern logic ...

    if (patternFound) {
      return {
        ticker: state.ticker,
        pattern: this.name,
        timestamp: current.timestamp,
        time: current.time,
        entry: entryPrice,
        stop: stopPrice,
        target: targetPrice,
        confidence: 85,
        metadata: { /* pattern-specific data */ }
      };
    }

    return null;
  }
};
```

Then register it in `index.ts`:

```typescript
import { BullFlag } from './patterns/bull-flag';

// In registerPatterns()
registry.register(BullFlag);
```

## Pattern Interface

Every pattern must implement:

```typescript
interface Pattern {
  name: string;              // Display name
  description: string;       // What it looks for
  minBars?: number;          // Minimum bars needed
  shouldScan?(state): boolean;  // Pre-filter (optional)
  scan(state): Signal | null;   // Main logic (required)
}
```

## Available Indicators

The `TickerState` includes pre-calculated indicators:

```typescript
state.indicators = {
  vwap: number;       // Volume-weighted average price (session)
  sma20: number;      // 20-period simple moving average
  sma50: number;      // 50-period SMA
  rsi: number;        // 14-period RSI
  avgVolume: number;  // 20-bar average volume
};

state.metadata = {
  prevDayClose: number;   // Previous trading day close
  todayOpen: number;      // Today's opening price
  todayHigh: number;      // Today's high
  todayLow: number;       // Today's low
};
```

## Alert Channels

### Console (Default)

Logs signals to console with formatted output.

### Discord (Coming Soon)

```typescript
import { DiscordAlert } from './alerts/discord';

alertManager.registerChannel(new DiscordAlert(webhookUrl));
```

### Telegram (Coming Soon)

```typescript
import { TelegramAlert } from './alerts/telegram';

alertManager.registerChannel(new TelegramAlert(botToken, chatId));
```

## Signal Filtering

Configure which signals trigger alerts:

```typescript
alertManager.setConfig({
  minConfidence: 70,              // Only alert if confidence >= 70
  patterns: ['Gap and Hold'],     // Only these patterns (empty = all)
  tickers: ['AAPL', 'MSFT']       // Only these tickers (empty = all)
});
```

## Performance

- **Scans:** 500 tickers in <5 seconds
- **Memory:** ~50 bars per ticker × 500 tickers = ~25K bars in RAM
- **Latency:** Alerts within 1 second of pattern detection

## Monitoring

The scanner logs:
- Connection status
- Scan results (signals found, duration)
- Memory usage
- Active patterns/tickers

## Graceful Shutdown

Press `Ctrl+C` to stop. The scanner will:
- Disconnect from websocket
- Print final statistics
- Exit cleanly

## Testing Patterns

Test a pattern with historical data before going live:

```typescript
// In backtest/test-pattern.ts
import { marketState } from '../realtime/data/market-state';
import { GapAndHold } from '../realtime/patterns/gap-and-hold';

// Load historical bars into market state
for (const bar of historicalBars) {
  marketState.updateBar('AAPL', bar);
}

// Test the pattern
const state = marketState.getState('AAPL');
const signal = GapAndHold.scan(state!);

console.log(signal);
```

## Troubleshooting

**No signals found:**
- Check that tickers have enough bars (min 20-50 depending on pattern)
- Verify pattern filters aren't too strict
- Confirm market conditions match pattern criteria

**High CPU usage:**
- Reduce number of tickers
- Add more aggressive `shouldScan` pre-filters
- Increase scan interval

**WebSocket disconnects:**
- Check Polygon API key is valid
- Verify stable internet connection
- Check API rate limits

## Roadmap

- [ ] Web UI for viewing active signals
- [ ] Historical signal replay
- [ ] Pattern backtest integration
- [ ] Discord/Telegram alerts
- [ ] SMS alerts
- [ ] Email alerts
- [ ] Pattern optimization tools
- [ ] Machine learning pattern scoring
