# Legacy Code Deletion Plan - Phase 3 Cleanup

**Created:** 2025-11-14
**Target Deletion Date:** 2025-11-24 (after Phase 3 validation)
**Reason:** These components contain lookahead bias and will be replaced by real-time simulation

---

## 🗑️ Code Marked for Deletion

### 1. LearningIterationService.executeScanLegacy()

**File:** `backend/src/services/learning-iteration.service.ts`
**Lines:** ~613-655
**Reason:** Batch processing with lookahead bias vulnerability
**Replacement:** `executeScanRealtime()` (Phase 3)

**Warning Signs:**
```typescript
// Receives ALL bars for a day at once
const scriptPath = path.join(__dirname, '../../', `agent-scan-legacy-${scriptId}.ts`);
```

**Deletion Criteria:**
- ✅ Phase 3 real-time mode validated
- ✅ Side-by-side comparison complete
- ✅ Performance acceptable
- ✅ All agents migrated to real-time mode

**How to Delete:**
1. Remove `executeScanLegacy()` method entirely
2. Update `executeScan()` to always use `executeScanRealtime()`
3. Remove feature flag check (always real-time)
4. Update tests

---

### 2. PaperTradingOrchestrator.runScanScript() (Current Implementation)

**File:** `backend/src/services/paper-trading-orchestrator.service.ts`
**Lines:** ~354-393
**Reason:** Passes all 100 recent bars to scanner (same bias as backtest)
**Replacement:** Use same real-time engine as backtest

**Warning Signs:**
```typescript
const bars = this.recentBars.get(bar.ticker) || []; // ALL bars!
const signals = await this.runScanScript(agent, bars); // Batch mode
```

**Deletion Criteria:**
- ✅ Phase 3C complete (unified scanner execution)
- ✅ Paper trading uses real-time backtest engine
- ✅ Side-by-side validation with live data

**How to Delete:**
1. Replace `runScanScript()` with call to real-time engine
2. Pass only sequential bar context
3. Update tests for paper trading

---

### 3. Original Scanner Generation (Pre-Phase 2)

**Status:** ⚠️ Already replaced by Phase 2, but need to ensure no rollback

**File:** `backend/src/services/claude.service.ts`
**Method:** `buildScannerSystemPrompt()`
**Lines:** Anti-bias instructions at ~704-798

**Keep:** The Phase 2 anti-bias instructions
**Delete:** Any old scanner generation logic that predates Phase 2

**Verification:**
```bash
# Ensure anti-bias section exists
grep -A 5 "PREVENT LOOKAHEAD BIAS" backend/src/services/claude.service.ts
```

---

## ⚠️ Components to Keep (DO NOT DELETE)

### Paper Trading Infrastructure (80% Perfect!)

**Keep These:**
- ✅ `processBar()` - Bar-by-bar event processing framework
- ✅ `recentBars` buffer - Sliding window management
- ✅ `checkExitConditions()` - Template-based exits (works perfectly!)
- ✅ `VirtualExecutor` - Order simulation
- ✅ `PaperAccountService` - Position tracking
- ✅ `ExecutionTemplateExitsService` - Exit strategies

**Why Keep:** These components are architecturally sound and work in real-time!

---

## 📋 Deletion Checklist

Use this before deleting any code:

### Pre-Deletion Validation

- [ ] Phase 3 real-time mode passes all tests
- [ ] Side-by-side comparison shows expected differences:
  - [ ] Fewer signals (can't perfectly time peaks)
  - [ ] Lower but realistic win rates
  - [ ] Similar/worse returns (honest results)
- [ ] Performance acceptable (<5 min for typical scan)
- [ ] All agents migrated to real-time mode
- [ ] Paper trading validated with real-time engine

### Deletion Steps

1. **Create backup branch:**
   ```bash
   git checkout -b backup-legacy-code
   git push origin backup-legacy-code
   ```

2. **Delete legacy methods:**
   ```bash
   # Remove executeScanLegacy
   # Remove old runScanScript in paper trading
   # Remove any batch processing utilities
   ```

3. **Update feature flags:**
   ```bash
   # Remove USE_REALTIME_SIMULATION flag
   # Always use real-time mode
   ```

4. **Update documentation:**
   ```bash
   # Mark as "Phase 3 complete"
   # Update README
   # Archive this document
   ```

5. **Run full test suite:**
   ```bash
   npm test
   ```

6. **Commit:**
   ```bash
   git commit -m "Phase 3 complete: Delete legacy batch processing code

   Removed:
   - executeScanLegacy() - lookahead bias vulnerability
   - Old paper trading scanner execution
   - Feature flag (always use real-time)

   All scanners now use sequential bar-by-bar processing.
   Lookahead bias eliminated by construction."
   ```

---

## 🎯 Validation Metrics

Before deleting legacy code, ensure these metrics are met:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Phase 3 POC Complete | ✅ | ⬜ | Pending |
| Performance <5min | ✅ | ⬜ | Pending |
| Side-by-side comparison done | ✅ | ⬜ | Pending |
| Paper trading fixed | ✅ | ⬜ | Pending |
| All tests passing | ✅ | ⬜ | Pending |

---

## 📊 Expected Changes After Deletion

### Code Size Reduction
- **Lines removed:** ~200-300 lines
- **Files deleted:** 0 (methods only)
- **Complexity reduced:** Simpler codebase, single execution path

### Maintenance Benefits
- ✅ No code drift between backtest and paper trading
- ✅ Single source of truth for scanner execution
- ✅ Easier to reason about and test
- ✅ Impossible to accidentally use legacy mode

### Performance
- ⚠️ Slightly slower than legacy (expected)
- ✅ But results are honest and trustworthy
- ✅ Optimizations make it acceptable

---

## 🚨 Rollback Plan

If Phase 3 validation fails:

1. **Keep legacy code** (don't delete)
2. **Set feature flag:** `USE_REALTIME_SIMULATION=false`
3. **Investigate issues:**
   - Performance unacceptable?
   - Results unexpected?
   - Implementation bugs?
4. **Fix or pivot:**
   - Option A: Fix Phase 3 issues
   - Option B: Improve Phase 2 validation
   - Option C: Hybrid approach (real-time for signals, templates for exits)

---

**Document Status:** Active
**Next Review:** 2025-11-24 (after Phase 3 validation)
**Owner:** TBD
