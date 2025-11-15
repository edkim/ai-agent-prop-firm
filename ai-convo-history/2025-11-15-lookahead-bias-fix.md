# Lookahead Bias Fix - Signal Selection
**Date:** 2025-11-15
**Status:** ✅ Fixed

## Problem

We introduced lookahead bias by collecting all signals for the day, ranking them, and selecting the best one. In real trading, you **cannot wait to see all signals** before making a decision - you must act on signals as they arrive.

## The Issue

**Before (Lookahead Bias):**
```typescript
// Collect all signals for the day
for (let i = warmupBars; i < dayBars.length; i++) {
  const signal = await runScanner(...);
  if (signal) {
    daySignals.push(signal); // Collect all
  }
}

// Then rank and select best (LOOKAHEAD BIAS!)
daySignals.sort((a, b) => b.pattern_strength - a.pattern_strength);
const bestSignal = daySignals[0]; // Using future information!
```

**Why This is Lookahead Bias:**
- At bar 10, you see a signal with strength 60
- At bar 20, you see a signal with strength 80
- You wait until bar 78 to see all signals, then pick the best
- **In real trading, you can't know bar 20's signal exists when you're at bar 10!**

## The Fix

**After (Realistic):**
```typescript
// Take first signal that meets quality threshold, then stop
for (let i = warmupBars; i < dayBars.length; i++) {
  const signal = await runScanner(...);
  if (signal) {
    const patternStrength = signal.pattern_strength || 0;
    
    // Only take signal if it meets minimum quality threshold
    if (patternStrength >= MIN_PATTERN_STRENGTH) {
      signals.push(signal);
      break; // Stop - you took a trade, done for the day
    }
  }
}
```

**Why This is Realistic:**
- At bar 10, you see a signal with strength 60
- If MIN_PATTERN_STRENGTH = 0, you take it immediately
- If MIN_PATTERN_STRENGTH = 70, you skip it and continue
- At bar 20, you see a signal with strength 80
- You take it immediately (meets threshold)
- **You stop processing** - you're in a trade, done for the day

## Configuration

**MIN_PATTERN_STRENGTH** can be set to:
- `0`: Take first signal (most realistic - no quality filter)
- `50`: Take first signal with decent quality
- `70`: Take first signal with good quality
- `80+`: Take first signal with excellent quality

## Real-World Analogy

**Lookahead Bias (Wrong):**
- "I'll wait until the end of the day to see all opportunities, then pick the best one"
- ❌ You can't do this in real trading!

**Realistic (Correct):**
- "I'll take the first good opportunity I see, then stop"
- ✅ This is how real trading works!

## Verification

✅ **Lookahead Bias Prevention:** Restored
- Takes first signal that meets threshold
- Stops immediately after taking signal
- No future information used

✅ **Realistic Behavior:** Achieved
- Simulates real trading decision-making
- Can't wait for better signals
- Must act on information available now

## Trade-off

**Before (Lookahead Bias):**
- Better backtest results (picking best signals)
- Unrealistic (can't do this in real trading)
- ❌ Lookahead bias

**After (Realistic):**
- Realistic trading behavior
- No lookahead bias
- Might miss better signals later (but that's realistic!)
- ✅ Honest backtesting

## Conclusion

We've fixed the lookahead bias by reverting to realistic signal selection:
- Take first signal that meets quality threshold
- Stop immediately (you're in a trade)
- No waiting to see all signals

This ensures our backtests are **honest** and **realistic**, even if the results aren't as good as the biased version.

