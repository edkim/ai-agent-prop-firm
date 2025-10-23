# Claude API Integration - COMPLETED - 2025-10-22

## Status: ✅ COMPLETE

Claude API integration for custom strategy generation is fully implemented and ready to use.

## Goal
Implement Claude API integration for generating custom backtest scripts when user prompts don't match pre-built templates (ORB).

## Example Use Case
User prompt: "Enter after 9:30am when VWAP is crossed. If crossing below VWAP then only enter if below the 5-period SMA. Vice versa for crossing above VWAP. Set stop of 1%. Close by 4pm."

**Before:** Falls back to ORB template (incorrect)
**After:** ✅ Detects custom strategy → Calls Claude API → Generates VWAP/SMA crossover script with assumptions

## Prompt Clarification Strategy

### Recommended Approach: Smart Defaults with Transparency
- Claude generates script with reasonable assumptions
- Return both the script AND a list of assumptions made
- User can review assumptions and request regeneration if needed
- Benefits:
  - Maintains fast execution flow
  - Gives users visibility into assumptions
  - Allows iteration without blocking initial execution
  - Can upgrade to interactive mode for complex cases

### Alternative Approaches (for future)
1. **Two-pass analysis**: Claude identifies ambiguities first, asks questions, then generates
2. **Interactive generation**: Show interpretation and ask for confirmation before execution
3. **Structured prompt template**: Guide users to provide specific fields

## Implementation Steps

### 1. Install Dependencies
```bash
npm install @anthropic-ai/sdk
```

### 2. Environment Configuration
- Add `ANTHROPIC_API_KEY` to `.env`
- Configure model and parameters

### 3. Create Claude Service (`backend/src/services/claude.service.ts`)
- Initialize Anthropic SDK client
- Method: `analyzeAndGenerateScript(userPrompt, params)`
- Return: `{ script: string, assumptions: string[], confidence: number }`
- Include system prompt with:
  - Template structure and requirements
  - Available data and indicators
  - Expected output format
  - Examples of well-formed scripts

### 4. Update Router Service
- Add detection for custom strategies (non-ORB patterns)
- Add new routing strategy: 'claude-generated'
- Integrate Claude service call in `executeDecision()`

### 5. API Response Enhancement
- Include `assumptions` array in backtest response
- Frontend can display assumptions to user
- Allow user to refine and re-run if needed

### 6. Testing
- Test with VWAP/SMA crossover strategy
- Test with various ambiguous prompts
- Verify assumptions are reasonable
- Ensure generated scripts execute correctly

## Key Technical Details

### System Prompt for Claude
Should include:
- Template structure (imports, function signature, main loop)
- Available market data fields (timestamp, open, high, low, close, volume, timeOfDay)
- How to calculate indicators (VWAP, SMA, etc.)
- Position tracking pattern
- Entry/exit logic pattern
- Trade result recording

### Detection Logic for Custom Strategies
Triggers when prompt contains:
- Non-ORB indicators: VWAP, SMA, EMA, RSI, MACD, etc.
- Crossover patterns
- Complex conditional logic
- Custom timeframes or filters

### Error Handling
- Claude API failures → fallback to asking user for clarification
- Invalid script generation → return error with explanation
- Missing required parameters → add to assumptions list

---

## ✅ Implementation Completed

All steps have been successfully implemented:

### 1. Dependencies Installed
```bash
✅ @anthropic-ai/sdk installed in backend/package.json
```

### 2. Environment Configuration
```bash
✅ Updated .env and .env.example at project root with:
   - ANTHROPIC_API_KEY
   - ANTHROPIC_MODEL (default: claude-sonnet-4-5-20250929)
   - ANTHROPIC_MAX_TOKENS (default: 4000)
   - ANTHROPIC_TEMPERATURE (default: 0.0)

Note: All environment variables are in the root .env file, not backend/.env
```

### 3. Type Definitions Updated
```typescript
✅ Added to backend/src/types/script.types.ts:
   - Extended RoutingDecision with 'claude-generated' strategy
   - Added assumptions, confidence, userPrompt fields
   - Created ClaudeScriptGenerationResponse interface
```

### 4. Claude Service Created
```typescript
✅ Created backend/src/services/claude.service.ts:
   - Lazy initialization (doesn't require API key at startup)
   - Comprehensive system prompt with examples
   - Indicator calculation templates (VWAP, SMA, EMA)
   - Trade execution patterns
   - Response parsing for script + assumptions
```

### 5. Router Detection Logic
```typescript
✅ Updated backend/src/services/backtest-router.service.ts:
   - Detects custom strategies (VWAP, SMA, EMA, RSI, MACD, crossovers)
   - Prioritizes Claude detection before other routing
   - Returns routing decision with userPrompt field
```

### 6. Router Integration
```typescript
✅ Updated executeDecision() in backtest-router.service.ts:
   - Handles 'claude-generated' routing strategy
   - Calls Claude API to generate script
   - Returns assumptions and confidence alongside script
   - Logs Claude's metadata for debugging
```

### 7. Server Running
```
✅ Backend server running successfully on port 3000
✅ Lazy initialization allows server to start without API key
✅ Will only require API key when custom strategy is detected
```

---

## 🧪 How to Test

### Step 1: Add Your Anthropic API Key
The `.env` file is located at the **project root** (not in backend/):
```bash
# .env (at project root)
ANTHROPIC_API_KEY=your_anthropic_key_here

# All other vars are already configured
```

### Step 2: Test the VWAP/SMA Strategy
Use the frontend or curl to test:

**Example Prompt:**
```
"Enter after 9:30am when VWAP is crossed. If crossing below VWAP then only enter if below the 5-period SMA. Vice versa for crossing above VWAP. Set stop of 1%. Close by 4pm."
```

**Expected Behavior:**
1. Router detects custom strategy (VWAP + SMA + crossover)
2. Routing decision: `claude-generated`
3. Claude API called with comprehensive system prompt
4. Returns generated TypeScript script
5. Returns list of assumptions made
6. Returns confidence level (0-1)
7. Script is executed and results returned

### Step 3: Verify Detection
Watch the backend logs for:
```
🤖 Calling Claude API to generate custom strategy script...
✅ Claude generated script with confidence: 0.85
📋 Assumptions made: 3
```

### Step 4: Check Assumptions in Response
The API response will include:
```json
{
  "assumptions": [
    "Assumed 5-period SMA uses closing prices",
    "Assumed 1% stop loss applies to entry price",
    "Assumed VWAP calculation starts at market open"
  ],
  "confidence": 0.85,
  "script": "...",
  "filepath": "..."
}
```

---

## 📋 What Triggers Claude Generation?

The system detects custom strategies when prompts contain:

**Custom Indicators:**
- VWAP, SMA, EMA, RSI, MACD
- Bollinger Bands, Stochastic, ATR, ADX
- Moving averages

**Custom Patterns:**
- Crossover, crosses above, crosses below
- When the [indicator], if the [indicator]
- Above the, below the

**Exclusions:**
- ORB or "opening range" strategies use templates
- Date range queries use multi-day template
- Earnings queries use earnings + template

---

## 🎯 Benefits

1. **Smart Defaults** - Claude makes reasonable assumptions, returns them transparently
2. **Fast Execution** - Single API call, no back-and-forth
3. **Confidence Scoring** - User knows how confident Claude is in the generated script
4. **Full Transparency** - All assumptions listed for user review
5. **Iterative Refinement** - User can provide clarifications and regenerate

---

---

## ✅ 2025-10-23 Update - Fixed Template Variable Issue

**Issue**: Claude was using `TEMPLATE_TRADING_DAYS` literally instead of substituting actual dates
**Fix**: Updated system prompt guideline #1:
- Before: "Always use template placeholders: TEMPLATE_TICKER, TEMPLATE_TIMEFRAME, TEMPLATE_TRADING_DAYS"
- After: "Use TEMPLATE_TICKER and TEMPLATE_TIMEFRAME as placeholders, but use the ACTUAL dates provided in the user message for tradingDays array"

**Files modified**:
- `backend/src/services/claude.service.ts:330` - Updated guideline to instruct Claude to use actual dates
- `backend/src/services/claude.service.ts:131` - Updated code template comment to clarify

Servers restarted successfully - ready for testing!

---

## 📝 Next Steps (Optional Enhancements)

1. **Frontend Display** - Show assumptions in UI for user review
2. **Regeneration** - Allow user to refine prompt and regenerate
3. **Script Validation** - TypeScript compilation check before execution
4. **Caching** - Cache generated scripts by prompt hash
5. **Analytics** - Track which strategies are generated most often
