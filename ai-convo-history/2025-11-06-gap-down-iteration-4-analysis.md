# Gap Down Specialist - Iteration 4 Analysis

## Summary

**Iteration 4 Result:** 500 signals found, 0 trades executed (same as iterations 1-3)

## Two Critical Problems Identified

### Problem 1: Import Path Error (Still Not Fixed!)

**Error:**
```
error TS2307: Cannot find module '../../src/database/db' or its corresponding type declarations.
```

**Location:** Line 2 of custom execution script

**Why This Keeps Happening:**
The prompt template in `claude.service.ts:1516` provides an EXAMPLE with:
```typescript
import { getDatabase } from '../../src/database/db';
```

But the actual module location varies depending on script placement. The system places scripts in:
```
backend/generated-scripts/success/2025-11-06/[uuid]-custom-execution.ts
```

From there, the correct path should be:
```typescript
import { getDatabase } from '../../../src/database/db';  // Need 3 levels up!
```

**Status:** ⚠️ This was supposedly fixed in the prompt but Claude keeps generating `../../` instead of `../../../`

---

### Problem 2: Signal Structure Mismatch (The Real Problem!)

**Gap Down Scanner Produces:**
```typescript
interface GapDownSignal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_type: 'GAP_FILL_REVERSAL' | 'SUPPORT_BOUNCE' | 'DEAD_CAT_BOUNCE_SHORT';
  pattern_strength: number;
  metrics: {
    gap_percent: number;          // -2.46% gap
    entry_price: number;          // 5.555
    vwap: number;                 // 5.528
    support_level?: number;       // 5.60 (if SUPPORT_BOUNCE)
    rsi: number;                  // 50
    volume_ratio: number;         // 2.07x
    price_action: string;         // "Bounce at VWAP"
    time_of_signal: string;       // "10:20"
  };
}
```

**Custom Execution Script Expects (VWAP template structure):**
```typescript
interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: {
    price: number;                     // ✗ Missing
    vwap: number;                      // ✓ Present
    deviation_percent: number;         // ✗ Called gap_percent instead
    volume_ratio: number;              // ✓ Present
    wick_ratio: number;                // ✗ Missing (not relevant to gaps)
    rejection_type: 'bullish' | 'bearish';  // ✗ Missing (not relevant)
    candle_body_percent: number;       // ✗ Missing (not relevant)
  };
}
```

**TypeScript Error:**
```
Type '{ gap_percent: number; entry_price: number; vwap: number; rsi: number; volume_ratio: number;
       price_action: string; time_of_signal: string; support_level?: undefined; }'
is missing the following properties from type
'{ price: number; vwap: number; deviation_percent: number; volume_ratio: number; wick_ratio: number;
  rejection_type: "bullish" | "bearish"; candle_body_percent: number; }':
  price, deviation_percent, wick_ratio, rejection_type, candle_body_percent
```

---

## Why This Happened

### Root Cause: Generic Prompt Template

The `generateExecutionScript()` method in `claude.service.ts` uses a hardcoded example Signal interface (lines 1522-1536):

```typescript
interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics: {
    price: number;
    vwap: number;
    deviation_percent: number;
    volume_ratio: number;
    wick_ratio: number;
    rejection_type: 'bullish' | 'bearish';
    candle_body_percent: number;
  };
}
```

This example is **VWAP-specific** and doesn't match other pattern types!

### What Claude Did

1. Read the example Signal interface from the prompt
2. Generated execution logic expecting VWAP metrics
3. Tried to process Gap Down signals with that logic
4. TypeScript compiler rejected the type mismatch

---

## The Template Library Worked Fine (Sort Of)

The 5 standard templates (conservative, aggressive, time_based, etc.) also expect VWAP signals, which is why they ALL generated 0 trades.

**Templates check for:**
```typescript
if (!signal.metrics.rejection_type) return null;  // Gap signals don't have this!
```

So even though 500 gap-down signals were found, all templates rejected them due to missing fields.

---

## Solutions

### Short Term: Fix the Prompt

Update `claude.service.ts:1493-1510` to:

1. **Extract actual Signal interface from scanner script** instead of providing generic example
2. **Pass scanner's Signal interface** to Claude in the prompt
3. Claude generates execution logic matching the ACTUAL signal structure

### Medium Term: Pattern-Specific Templates

Create execution template families:
- `vwap_templates/` - For mean reversion patterns
- `gap_templates/` - For gap trading patterns
- `breakout_templates/` - For momentum patterns

### Long Term: Intelligent Signal Adapter

Add a signal normalization layer that:
1. Detects signal structure at runtime
2. Transforms signals to match template expectations
3. Or selects compatible templates for the signal type

---

## What Iteration 5 Will Do

Without fixes, iteration 5 will:
1. Generate another custom execution script with VWAP interface
2. Fail to compile (import error + type mismatch)
3. Test 5 templates that expect VWAP signals
4. Generate 0 trades again
5. Provide unhelpful "scripts failed to execute" analysis

**The agent is stuck in a loop until we fix the Signal interface mismatch!**

---

## Recommendation

**Fix the prompt to extract and use the scanner's actual Signal interface.**

This is a one-time fix that will make custom execution scripts compatible with ANY scanner pattern, not just VWAP.
