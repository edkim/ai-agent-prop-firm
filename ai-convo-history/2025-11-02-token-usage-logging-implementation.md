# Token Usage Logging Implementation

**Date**: 2025-11-02
**Status**: ✅ Completed

## Summary

Successfully implemented comprehensive token usage logging and metadata tracking for Claude API calls. This provides immediate visibility into token consumption and enables data-driven decisions about prompt optimization.

## Problem Statement

Scripts were truncating at ~316-335 lines due to hitting token limits, but we had NO visibility into:
- Actual token usage (input/output)
- How close we were to the 20,000 max_tokens limit
- Whether truncation was due to token limits or other issues

## Solution Implemented

### 1. Console Logging (Primary Goal ✅)

Added detailed token usage logging after every Claude API call:

```typescript
📊 Token Usage: {
  "input_tokens": 5234,
  "output_tokens": 18456,
  "total_tokens": 23690,
  "max_tokens": 20000,
  "utilization_percent": "92.3",
  "stop_reason": "max_tokens"
}
```

**Features**:
- Logs input_tokens (prompt size)
- Logs output_tokens (generated script size)
- Calculates utilization percentage
- Shows stop_reason (confirms if truncated)
- Warns when > 90% utilization

**Locations**:
- `backend/src/services/claude.service.ts:76` - Execution script generation
- `backend/src/services/claude.service.ts:227` - Scanner script generation

### 2. Metadata Persistence (Bonus ✅)

Token usage is now saved in script metadata JSON files for historical analysis:

```json
{
  "scriptId": "6942b4e2-2b57-40df-b16e-cb31b0f4f33b",
  "scriptType": "execution",
  "status": "failed",
  "tokenUsage": {
    "input_tokens": 5234,
    "output_tokens": 18456,
    "total_tokens": 23690,
    "max_tokens": 20000,
    "utilization_percent": "92.3",
    "stop_reason": "max_tokens",
    "truncated": true
  }
}
```

## Files Modified

### 1. Type Definitions
- `backend/src/types/script.types.ts`
  - Added `TokenUsage` interface (lines 165-172)
  - Updated `ClaudeScriptGenerationResponse` to include `tokenUsage` (line 185)

### 2. Claude Service (Core Implementation)
- `backend/src/services/claude.service.ts`
  - Added token logging after `generateScript` API call (lines 67-76)
  - Added token logging after `generateScannerScript` API call (lines 218-227)
  - Return tokenUsage in both methods (lines 93-97, 244-248)
  - Handle null `stop_reason` with fallback to 'end_turn' (lines 74, 225)

### 3. Script Execution Service
- `backend/src/services/script-execution.service.ts`
  - Added `TokenUsageMetadata` interface (lines 19-27)
  - Updated `ScriptMetadata` interface to include `tokenUsage` field (line 43)
  - Updated `saveScriptWithMetadata` signature to accept `tokenUsage` parameter (line 60)
  - Include tokenUsage in metadata object with truncated flag (lines 103-106)
  - Updated `executeScript` signature to accept `tokenUsage` (line 215)
  - Pass tokenUsage to `saveScriptWithMetadata` in both success and failure cases (lines 275, 301)
  - Fixed TypeScript errors for undefined values (lines 74, 98)

### 4. Agent Learning Service
- `backend/src/services/agent-learning.service.ts`
  - Updated `generateStrategy` return type to include token usage (lines 188-189)
  - Return tokenUsage from `generateStrategy` (lines 268-269)
  - Updated `executeScan` to accept and pass `tokenUsage` (lines 276, 287)
  - Updated `runBacktests` to accept and pass `tokenUsage` (lines 323, 377)
  - Pass tokenUsage when calling both methods (lines 81, 92)

## Technical Implementation Details

### Data Flow

1. **Generation** → Claude API returns response with `usage` object
2. **Logging** → Token usage logged to console immediately
3. **Return** → TokenUsage included in method return value
4. **Execution** → TokenUsage passed through execution chain
5. **Persistence** → TokenUsage saved in metadata JSON

### Type Safety

All changes are fully type-safe with proper TypeScript interfaces:
- `TokenUsage` for Claude API response data
- `TokenUsageMetadata` for saved metadata (includes `truncated` boolean)
- Optional parameters throughout to maintain backward compatibility

### Error Handling

- Handles null `stop_reason` gracefully (defaults to 'end_turn')
- Handles undefined `stderr` and `executionTime` in metadata saving
- All changes are backward compatible (optional parameters)

## Testing

### Compilation
✅ TypeScript compiles without errors (all token-usage related issues resolved)

### Unit Tests
✅ All 48 existing tests pass (no regressions)

### Manual Testing Required

**Next Step**: Run one learning agent iteration to verify:
1. Console logs show token usage
2. Metadata files include tokenUsage field
3. Truncation warnings appear when > 90% utilization
4. Token data helps identify if we're hitting limits

## Expected Benefits

### Immediate
1. **Visibility**: See exact token usage for every generation
2. **Confirmation**: Know if scripts are truncating due to token limits
3. **Monitoring**: Track utilization % to prevent hitting limits

### Future
1. **Historical Analysis**: Analyze token usage trends over time
2. **Optimization Guidance**: Know which prompts need reduction
3. **Cost Tracking**: Monitor API usage and costs
4. **Performance Tuning**: Optimize max_tokens setting based on data

## Example Output (Expected)

```
📤 Sending to Claude: Generate execution script for VWAP bounce strategy...
📊 Token Usage: {
  "input_tokens": 3687,
  "output_tokens": 18234,
  "total_tokens": 21921,
  "max_tokens": 20000,
  "utilization_percent": "91.2",
  "stop_reason": "max_tokens"
}
⚠️  Script generation truncated due to token limit!
   Consider simplifying the prompt or increasing max_tokens further.
```

## Next Steps

1. **Run Test Iteration** - Execute one agent learning iteration
2. **Analyze Output** - Review console logs and metadata files
3. **Decision Point**:
   - If at/near limit (>90%): Reduce prompts OR increase max_tokens
   - If plenty of headroom (<80%): Focus on fixing TypeScript errors in prompts
4. **Document Findings** - Create analysis document with recommendations

## Metrics to Watch

When running test iteration, observe:
- Input token count (system prompt size)
- Output token count (generated script size)
- Utilization percentage
- Stop reason (max_tokens = truncated, end_turn = complete)
- Script line count vs token usage correlation

## Related Issues

This implementation addresses:
- ❌ Script truncation at 316-335 lines
- ❌ Type errors: `Type 'null' is not assignable to type 'string'`
- ❌ Unexpected end of input (incomplete scripts)

The logging will help determine if these are due to token limits (likely) or other issues.

---

## Conclusion

✅ **Token usage logging is fully implemented and ready for testing**

The system now provides complete visibility into Claude API token consumption through both console logs and persistent metadata. This will enable data-driven optimization decisions and help resolve the script truncation issues.

**Ready for Test Run**: Execute `npm run agent:iterate <agent-id>` to generate scripts and verify token logging.
