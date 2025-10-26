# Broader Custom Strategy Detection - 2025-10-23

## Goal
Implement broader custom strategy detection to default most queries to Claude API instead of trying to match specific patterns.

## Problem
The previous routing logic had too many specific pattern checks that made it brittle. When users entered prompts like "Short at successful retest of low of day", the system would fail with "Single day backtest requires a date parameter" instead of routing to Claude for intelligent generation.

## Solution - Option A: Simplified Routing
Simplify the routing logic to have only 3 checks:
1. **Earnings queries** - Use special date handling + template
2. **Simple ORB queries** - Use fast template (ONLY if it's basic ORB without custom logic)
3. **Everything else** - Default to Claude for intelligent generation

## Implementation Steps

### 1. Simplified `analyzeRequest()` Method
**File**: `backend/src/services/backtest-router.service.ts:24-44`

Changed from 7+ checks to just 3:
```typescript
async analyzeRequest(userPrompt: string, params?: Partial<ScriptGenerationParams>): Promise<RoutingDecision> {
  const lowercasePrompt = userPrompt.toLowerCase();

  // Priority 1: Earnings queries (special date handling + template)
  if (this.isEarningsQuery(lowercasePrompt)) {
    return await this.handleEarningsQuery(userPrompt, params);
  }

  // Priority 2: Simple ORB queries (use fast template)
  if (this.isSimpleORB(lowercasePrompt)) {
    return this.handleSimpleORB(userPrompt, params);
  }

  // Default: Everything else goes to Claude for intelligent generation
  return await this.handleCustomStrategyQuery(userPrompt, params);
}
```

### 2. New `isSimpleORB()` Detection Method
**File**: `backend/src/services/backtest-router.service.ts:109-154`

Returns `true` ONLY if:
- Mentions 'orb' OR 'opening range' OR 'breakout'
- AND does NOT have:
  - Custom indicators (VWAP, SMA, EMA, RSI, MACD, etc.)
  - Advanced patterns (retest, low of day, high of day, crossovers, etc.)
  - Short position keywords
  - Complex conditional logic (if the, when the, only if, etc.)

This ensures only truly simple ORB queries use the template. Everything else goes to Claude.

### 3. New `handleSimpleORB()` Handler Method
**File**: `backend/src/services/backtest-router.service.ts:233-242`

Simple handler that routes to template-api:
```typescript
private handleSimpleORB(prompt: string, params?: Partial<ScriptGenerationParams>): RoutingDecision {
  return {
    strategy: 'template-api',
    reason: 'Simple ORB query detected - using fast template',
    useTemplate: params?.strategyType || 'orb'
  };
}
```

### 4. Removed Unused Methods
Cleaned up the codebase by removing methods that are no longer called:

**Detection methods removed**:
- `isCustomExitTime()` - No longer needed

**Handler methods removed**:
- `handleDateRangeQuery()` - No longer called
- `handleSpecificDatesQuery()` - No longer called
- `handleCustomExitTime()` - No longer called
- `handleSingleDayQuery()` - No longer called
- `generatePastTradingDays()` - Only used by removed handlers

**Detection methods kept** (still used in `handleCustomStrategyQuery()`):
- `isDateRangeQuery()` - Used to check if prompt has date info
- `isSpecificDatesQuery()` - Used to check if prompt has date info
- `isSingleDayQuery()` - Used to check if prompt has date info

## Benefits

1. **Much Broader Coverage** - Almost everything now routes to Claude
2. **Smarter Routing** - Claude handles complex strategies that templates can't
3. **Cleaner Code** - Removed ~150 lines of unused routing logic
4. **Better UX** - No more "requires a date parameter" errors for custom strategies
5. **Faster Development** - Don't need to add pattern matching for every new strategy type

## Example Routing Decisions

### Routes to Template (Simple ORB)
- "Test 5 minute ORB"
- "Run opening range breakout"
- "Opening range breakout for past 10 days"

### Routes to Claude (Custom/Complex)
- "Short at successful retest of low of day" ✅
- "Enter when VWAP is crossed" ✅
- "5 minute ORB with 1% stop loss and trailing stop" ✅
- "ORB only if volume > 1M" ✅
- "Go long if price crosses above SMA" ✅
- "Test momentum strategy" ✅

### Routes to Earnings + Template
- "Last 3 earnings days" ✅

## Testing

The system should now handle the problematic prompt from earlier:
```
Ticker: OKLO
Prompt: "Test for Oct 22. Short at successful retest of low of day.
         By successful I mean a new low of day was made. Exit at end of day."
```

**Expected behavior**:
- ✅ Routes to Claude (custom strategy detected)
- ✅ Extracts date: Oct 22
- ✅ Claude generates short position script with retest logic
- ✅ Returns assumptions about what "successful retest" means

## Next Steps (Deferred)

The user mentioned parameter optimization (x, y variables for auto-tuning) but explicitly said:
> "For now let's only implement the broader detection with your recommended option A. Don't worry about the auto-tuning feature."

This can be implemented later if needed.

## Files Modified

1. `backend/src/services/backtest-router.service.ts`
   - Modified `analyzeRequest()` (lines 24-44)
   - Added `isSimpleORB()` (lines 109-154)
   - Added `handleSimpleORB()` (lines 233-242)
   - Removed unused methods (~150 lines)

## Status
✅ **COMPLETE** - Broader detection implemented and ready for testing
