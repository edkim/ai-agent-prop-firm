# Combine Claude API Calls & Remove Template System

**Date:** 2025-10-23

## Overview

Simplified the backtesting architecture by:
1. Combining Claude's date extraction + script generation into a single API call
2. Removing template system entirely - always using Claude for maximum flexibility

## Changes Made

### Part 1: claude.service.ts ✅

**Added date extraction to script generation system prompt:**
- New `Date Selection` section with guidelines for determining appropriate testing dates
- Updated response format to include `DATES: [...]` and `DATE_REASONING: ...`
- Modified `parseClaudeResponse()` to extract dates and dateReasoning fields
- Removed date parameters from `buildUserMessage()` (Claude determines dates itself)

**Type updates:**
- Added `dates: string[]` and `dateReasoning?: string` to `ClaudeScriptGenerationResponse`

### Part 2: backtest-router.service.ts ✅

**Completed:**
- Simplified `analyzeRequest()` to always return `'claude-generated'`
- Removed all routing helper methods (isEarningsQuery, isSimpleORB, etc.)
- Simplified `executeDecision()` to only have Claude path
- Get dates from `claudeResponse.dates` instead of `decision.dates`
- Removed DateQueryService dependency
- **Result:** Reduced from 495 lines to 130 lines (~74% reduction)

### Part 3: Clean up script-generator.service.ts ✅

**Completed:**
- Kept only `writeScriptToFile()` and `generateFilename()` methods
- Removed all template generation code
- Removed `loadTemplate()`, `generateScript()`, `validateParams()` methods
- **Result:** Reduced from 246 lines to 38 lines (~85% reduction)

### Part 4: Delete unused files ✅

**Deleted:**
- `src/templates/orb-backtest.template.ts`
- `src/templates/orb-multiday.template.ts`
- `src/templates/` directory
- `src/services/date-query.service.ts`

## Expected Benefits

- ✅ 50% fewer API calls (2 → 1)
- ✅ ~50% faster execution (40s → 20s)
- ✅ 50% cost reduction for API calls
- ✅ Simpler architecture (~400 lines of code removed)
- ✅ Single code path to maintain and improve
- ✅ All queries get full Claude intelligence (trade limits, complex logic, etc.)

### Part 5: Fix TypeScript compilation errors ✅

**Fixed:**
- Added `avg_pnl`, `avg_winner`, `avg_loser` fields to `ScriptMetrics` type
- Removed deprecated `/execute-script` endpoint from backtests.ts (lines 579-661)
- TypeScript compilation now passes with zero errors

## Summary of Changes

### Code Reduction
- **backtest-router.service.ts:** 495 → 130 lines (~74% reduction)
- **script-generator.service.ts:** 246 → 38 lines (~85% reduction)
- **backtests.ts:** Removed 83 lines (deprecated endpoint)
- **Total:** Removed ~600+ lines of code

### Files Deleted
- `src/templates/orb-backtest.template.ts`
- `src/templates/orb-multiday.template.ts`
- `src/services/date-query.service.ts`

### Architecture Benefits
- ✅ 50% fewer Claude API calls (2 → 1)
- ✅ ~50% faster execution (eliminates one API round-trip)
- ✅ 50% cost reduction for API calls
- ✅ Single unified code path (easier to maintain and improve)
- ✅ All queries get full Claude intelligence
- ✅ Automatic date selection based on strategy complexity

## Testing Plan

1. Test simple ORB backtest (previously used template)
2. Test complex strategy with trade limits
3. Test date extraction with various prompts
4. Verify all generated scripts execute correctly

## Status

✅ **All refactoring complete** - System ready for testing
