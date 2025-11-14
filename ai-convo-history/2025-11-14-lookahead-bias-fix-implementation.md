# Lookahead Bias Fix - Implementation Summary

**Date:** 2025-11-14
**Branch:** `fix-lookahead-bias`
**Status:** Phase 2 Complete, Phase 3 Planned

---

## Overview

Implemented comprehensive fixes to prevent lookahead bias in scanner generation, following the crisis discovered on 2025-11-13. The fix is structured in phases to balance immediate impact with long-term robustness.

---

## What We Did Today

### ✅ Phase 2: Fix Scanner Generation (COMPLETED)

#### 1. Updated Scanner Generation Prompt
**File:** `backend/src/services/claude.service.ts`
**Location:** `buildScannerSystemPrompt()` method (line ~704)

**Changes:**
- Added critical "PREVENT LOOKAHEAD BIAS" section with:
  - ❌ Forbidden patterns (finding peak first, processing all bars at once)
  - ✅ Correct pattern (sequential bar-by-bar processing)
  - Mental model: "What do I know RIGHT NOW?"
  - Code examples showing wrong vs. right approaches

**Impact:** Claude will now generate scanners that process bars sequentially instead of finding peaks/troughs first.

#### 2. Created Lookahead Bias Validator
**File:** `backend/src/utils/validate-scanner.ts` (NEW)

**Capabilities:**
- Detects 8 common lookahead bias patterns:
  1. Peak/trough finding before processing
  2. Math.max/min on entire arrays
  3. Slicing entire day (0 to length)
  4. Processing post-event bars
  5. Time window filtering all at once
  6. Two-pass algorithms
  7. Missing sequential processing
  8. Missing lookback windows
- Returns detailed violation reports with line numbers
- Severity levels (error vs warning)

**Functions:**
```typescript
detectLookAheadBias(code: string): ValidationResult
formatValidationReport(result: ValidationResult): string
validateScanner(code: string): boolean
```

#### 3. Integrated Validator into Pipeline
**File:** `backend/src/services/learning-iteration.service.ts`
**Location:** `generateStrategy()` method (after scanner generation)

**Changes:**
- Imports validator utilities
- Runs validation after Claude generates scanner
- Logs detailed validation report
- Stores validation result in strategy metadata
- Warns if lookahead bias detected

**Impact:** Every scanner generated will be automatically validated, giving us visibility into bias issues.

---

## Phase 3: Real-Time Simulation Mode (PLANNED)

### 📋 Comprehensive Plan Created
**File:** `ai-convo-history/2025-11-14-phase3-realtime-simulation-plan.md`

**Key Concepts:**
1. **Current Problem:** Scanners receive entire day's bars at once, can peek ahead
2. **Solution:** Feed bars sequentially, simulating real-time arrival
3. **Architecture Change:**
   - Before: `runScanner(ticker, date) → Signal[]`
   - After: `runScannerAtBar(ticker, date, availableBars, currentIndex) → Signal | null`

**Implementation Steps:**
1. Create real-time backtest engine
2. Update scanner generation to produce pure functions
3. Create scanner function executor
4. Integrate with learning iteration pipeline
5. Performance optimization (parallel processing, caching)

**Timeline:** 12 days (3 phases: POC, Rollout, Migration)

**Trade-offs:**
- **Pro:** Eliminates lookahead bias by construction
- **Pro:** Results will be realistic (honest win rates)
- **Pro:** Easier transition to live trading
- **Con:** 4-40x slower (mitigated with optimizations)

**Recommendation:**
- Short term: Ship Phase 2, test with new iterations
- Medium term: Build Phase 3 POC, evaluate performance
- Long term: Migrate all agents once proven

---

## Files Changed

### Modified Files
1. `backend/src/services/claude.service.ts`
   - Added anti-lookahead bias instructions to scanner prompt

2. `backend/src/services/learning-iteration.service.ts`
   - Imported validator utilities
   - Integrated validation after scanner generation

### New Files
1. `backend/src/utils/validate-scanner.ts`
   - Static analysis tool for detecting lookahead bias

2. `ai-convo-history/2025-11-14-phase3-realtime-simulation-plan.md`
   - Comprehensive implementation plan for real-time simulation

3. `ai-convo-history/2025-11-14-lookahead-bias-fix-implementation.md`
   - This summary document

---

## Testing Plan

### Immediate Testing (Phase 2)
1. **Run a test iteration** with an existing agent:
   ```bash
   curl -X POST http://localhost:3000/api/learning-agents/{agentId}/iterate
   ```

2. **Verify validator runs:**
   - Check logs for validation report
   - Confirm "✅ Scanner validation passed" or warnings

3. **Check generated scanner:**
   - Look for sequential processing: `for (let i = 30; i < bars.length; i++)`
   - Look for lookback windows: `bars.slice(i - 20, i)`
   - Verify NO peak-finding: No `peakBar =` or `Math.max(...allBars.map(...))`

### Phase 3 Testing (Future)
1. Build POC with one agent
2. Compare results: old approach vs real-time simulation
3. Measure performance: execution time, memory usage
4. Validate: win rates should be lower (more realistic)

---

## Expected Impact

### Short-Term (This Week - Phase 2)
- **New iterations** will generate bias-free scanners
- **Validator** will catch issues in generated code
- **Visibility** into any remaining bias patterns

### Medium-Term (Next 2 Weeks - Phase 3 POC)
- **Proof of concept** for real-time simulation
- **Performance data** to inform rollout decision
- **Confidence** in backtest accuracy

### Long-Term (Month 2 - Phase 3 Full)
- **All agents** use real-time simulation
- **Realistic performance** expectations
- **Safe transition** to paper/live trading

---

## Risks and Mitigations

### Risk: Validator Has False Positives
**Mitigation:** Current approach logs warnings but doesn't fail iterations. Monitor for patterns.

### Risk: Claude Still Finds Ways to Cheat
**Mitigation:** Iterate on validator patterns as we discover new bias techniques.

### Risk: Phase 3 Too Slow for Production
**Mitigation:** POC first, then decide. Can use hybrid approach (real-time for signals, templates for execution).

### Risk: Win Rates Drop to Unprofitable
**Response:** This is good news - we found the truth! Focus on genuinely profitable strategies.

---

## Next Steps

### Immediate (Today)
- [x] Fix scanner generation prompt
- [x] Create validator
- [x] Integrate into pipeline
- [x] Plan Phase 3
- [ ] **Commit and push changes**
- [ ] **Test with one agent iteration**

### This Week
- [ ] Monitor validator reports from new iterations
- [ ] Identify any remaining bias patterns
- [ ] Refine validator rules based on findings
- [ ] Update documentation

### Next 2 Weeks (Phase 3 POC)
- [ ] Implement real-time backtest engine
- [ ] Update scanner generation for pure functions
- [ ] Test with 1-2 agents
- [ ] Evaluate performance vs. accuracy trade-off
- [ ] Decision: proceed with full Phase 3 or stick with Phase 2

---

## Success Criteria

### Phase 2 (Immediate)
- [x] Scanner prompt includes anti-bias instructions
- [x] Validator catches common bias patterns
- [x] Validation runs automatically in pipeline
- [ ] New iterations generate bias-free scanners
- [ ] No critical bias violations in next 5 iterations

### Phase 3 (Future)
- [ ] Real-time simulation works without errors
- [ ] Performance acceptable (<5 min for typical scan)
- [ ] Results are realistic (30-50% win rate)
- [ ] Strategies transition smoothly to paper trading

---

## Lessons Learned

1. **Catch problems early:** Finding this in backtest vs. live trading saved us from losses
2. **Defense in depth:** Multiple layers (prompts + validation + architecture)
3. **Trust but verify:** Can't rely on Claude alone, need automated checks
4. **Realistic is better than optimistic:** Honest results build confidence

---

## References

- Crisis document: `ai-convo-history/2025-11-13-look-ahead-bias-crisis.md`
- Phase 3 plan: `ai-convo-history/2025-11-14-phase3-realtime-simulation-plan.md`
- Scanner prompt: `backend/src/services/claude.service.ts:buildScannerSystemPrompt()`
- Validator: `backend/src/utils/validate-scanner.ts`

---

**Status:** Phase 2 complete and ready for testing
**Next Milestone:** Test with live iteration, then decide on Phase 3 timeline
**Overall Goal:** Seamless transition from backtesting to paper trading with realistic expectations
