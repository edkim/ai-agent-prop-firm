# Scan Prompt Differences: Iteration 5 vs 6

## TL;DR

**Yes, the prompts were significantly different!**

Iteration 5 received guidance to TIGHTEN filters (which made it worse).
Iteration 6 received NO guidance (which paradoxically helped).

---

## Agent Base Instructions (Same for Both)

```
I want to trade VWAP mean reversion patterns on liquid tech stocks.
Look for stocks that deviate 1.5-4% from intraday VWAP with volume
confirmation (1.3x+ average), showing rejection candles (wicks/reversals).
Trade during mid-day session (10:00-14:00 ET) when mean reversion is strongest.
```

---

## Iteration 5 Prompt (Found 0 Signals) ❌

### Base Instructions
- VWAP deviation: **1.5-4%**
- Volume: 1.3x+ average
- Time: 10:00-14:00 ET

### PLUS Learnings from Iteration 4

**Parameter Recommendation:**
```json
{
  "parameter": "vwap_deviation_range",
  "current_value": "1.5-4%",
  "suggested_value": "2.0-3.5% with rejection candle required",
  "rationale": "Tighter range focuses on sweet spot. Below 2% insufficient
                profit potential. Above 3.5% risks fundamental catalyst."
}
```

**Other Recommendations:**
- Time window: 10:00-14:00 → **10:30-13:30** (tighter!)
- Entry volume: 1.3x → **1.5x** (tighter!)

### Knowledge Summary (70 items about exits)
- Stop loss strategies
- Take profit strategies
- Exit timing patterns
- Template performance comparisons

### What Claude Generated
✅ Attempted to implement tightened filters
❌ Introduced SQL bug: `date(o2.timestamp) = date(o.timestamp)`
❌ Bug excluded all tickers → 0 signals

**Key Issue:** The "tighten filters" guidance was well-intentioned but combined with a SQL implementation bug created a perfect storm.

---

## Iteration 6 Prompt (Found 500 Signals) ✅

### Base Instructions
- VWAP deviation: **1.5-4%**
- Volume: 1.3x+ average
- Time: 10:00-14:00 ET

### PLUS Learnings from Iteration 5

**Parameter Recommendations:** `[]` (EMPTY!)

**Analysis Summary:**
```
"No trades were generated. All backtest scripts either failed to
compile or failed to execute. Check generated scripts for TypeScript errors."
```

### Knowledge Summary
- All knowledge from iterations 1-4 (no new knowledge from iteration 5)
- Still had the exit strategy learnings
- But NO scanner filter adjustments

### What Claude Generated
✅ Used `daily_metrics` table instead of `ohlcv_data`
✅ Fixed SQL: `d.date BETWEEN '2025-10-17' AND '2025-11-05'`
✅ Added pattern strength function
✅ Better code structure
✅ Found 500 signals!

**Key Difference:** Without bad "tighten filters" guidance, Claude took a different approach and happened to write better SQL.

---

## Why Did Iteration 6 Succeed?

### 1. **No Bad Guidance**
- Iteration 5's empty analysis meant NO recommendations to tighten filters
- Claude wasn't pushed to implement stricter criteria
- Fresh start allowed better SQL generation

### 2. **Claude's Variability**
- Different prompt = different code generation path
- Used `daily_metrics` table (cleaner schema) instead of self-joining `ohlcv_data`
- Better date range handling

### 3. **Luck**
- The SQL bug in iteration 5 was subtle (date join condition)
- Iteration 6 happened to avoid that pattern
- Used a simpler, more robust approach

---

## Prompt Construction Logic

From `agent-learning.service.ts:312-313`:

```typescript
if (iterationNumber > 1 && knowledgeSummary && knowledgeSummary.trim() !== '') {
  scannerQuery += `\n\nINCORPORATE THESE LEARNINGS: ${knowledgeSummary}`;
}
```

**Iteration 5:**
```
Base instructions + "\n\nINCORPORATE THESE LEARNINGS: [70 items including
'tighten VWAP to 2.0-3.5%', 'tighten time to 10:30-13:30', etc.]"
```

**Iteration 6:**
```
Base instructions + "\n\nINCORPORATE THESE LEARNINGS: [same 70 items, but
NO new scanner recommendations because iteration 5 had empty analysis]"
```

---

## Knowledge Accumulation

| Iteration | Knowledge Items Added | Scanner Guidance |
|-----------|----------------------|------------------|
| 1 | 8 | None (first iteration) |
| 2 | 15 | From iteration 1 |
| 3 | 19 | From iteration 2 |
| 4 | 20 | From iteration 3 |
| **5** | **0** | **From iteration 4 (TIGHTEN filters)** ← Problem |
| 6 | 18 | From iteration 5 (NO new guidance) ← Helped! |

---

## The Irony

**Iteration 4's "helpful" guidance made iteration 5 worse:**
- Recommended tightening filters based on good performance
- Claude tried to implement tighter filters
- Combined with SQL bug → catastrophic failure

**Iteration 5's "useless" empty analysis made iteration 6 better:**
- No bad recommendations to overconstrain
- Claude generated cleaner code
- Fixed the SQL approach entirely

---

## What Your New Feature Would Have Done

If the zero-signal analysis feature had been active for iteration 5:

```json
{
  "summary": "Scanner found 0 signals due to SQL query bug in ticker selection",
  "restrictive_filters_identified": [
    "EXISTS clause uses date(o2.timestamp) = date(o.timestamp) requiring exact
     date match per 5-minute bar - this is impossible and excludes all tickers",
    "Should use ticker-level date range check instead"
  ],
  "parameter_recommendations": [
    {
      "parameter": "ticker_selection_query",
      "current_value": "date(o2.timestamp) = date(o.timestamp)",
      "suggested_value": "d.date BETWEEN '2025-10-17' AND '2025-11-05'",
      "rationale": "Use date range on daily_metrics table to check ticker-level
                    price availability, not per-bar exact match"
    }
  ]
}
```

This would have given iteration 6 ACTIONABLE SQL fixes instead of empty guidance!
