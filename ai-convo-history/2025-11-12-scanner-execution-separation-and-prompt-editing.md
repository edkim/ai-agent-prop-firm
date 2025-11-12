# Scanner/Execution Separation and Prompt Editing Feature

**Date:** 2025-11-12
**Branch:** execution-script-evolution

## Problem Analysis

### Issue: Execution Script Produced 0 Trades

**Iteration 5 Results:**
- Scanner found: 500 signals
- Execution produced: 0 trades
- Initially appeared as a "failure"

**Root Cause:**
Execution script added overly restrictive filters that rejected scanner's signals:

```typescript
// Line 97-99: 15-minute time window rejected ~98% of signals
const signalTime = signal.signal_time;
if (signalTime < '10:45' || signalTime > '11:00') return null;

// Additional stacking filters:
if (signal.metrics.price_vs_vwap_percent < 0) return null;  // VWAP position
if (!isVWAPRising(preSignalBars.slice(-3))) return null;     // VWAP trend
if (atrPercent > 15) return null;                             // ATR volatility
if (avgVolume < 50000) return null;                           // Volume
```

### Architectural Problem

**Current (Broken) Separation:**
- Scanner: Finds signals with specific criteria
- Execution: **RE-FILTERS** signals, rejecting scanner's work ❌

**Correct Separation:**
- Scanner: Find signals matching specific criteria (filtering happens here)
- Execution: Execute those signals with proper entry/exit logic (no filtering)

### Pattern: AI Learning Wrong Lessons

Small sample sizes (5-20 trades) causing overfitting:
- Iteration 3: 5 trades, 4.78 PF (lookahead bias - "cheating")
- Iteration 4: 12 trades, 0.22 PF (over-corrected with filters)
- Iteration 5: 0 trades (filters stacked too restrictively)

**Fixes Applied:**
- ✅ Increased signal cap from 20 → 200 for statistical significance
- ✅ Added lookahead bias prevention to execution prompts
- 🔄 Need to prevent execution from adding filters

## Solution: Three-Part Implementation

### Part 1: Fix Execution Filtering (5 min)

**Goal:** Prevent execution scripts from adding additional signal filters.

**Files to Modify:**
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`

**Methods to Update:**
1. `generateExecutionScriptFromStrategy()` (line 1646) - For iteration 1
2. `generateExecutionScript()` (line 1763) - For iterations 2+

**Guidance to Add:**

```typescript
**CRITICAL - DO NOT FILTER SIGNALS:**

The scanner has already found high-quality signals based on specific criteria. Your job is to EXECUTE these signals, not to add additional filtering.

❌ DO NOT reject signals based on:
- Time of day restrictions (unless part of original strategy)
- VWAP position filters
- Volume or volatility requirements
- Any other criteria not in the original signal

✅ DO focus on:
- Proper entry timing (next bar after signal, avoiding lookahead bias)
- Stop loss placement based on strategy
- Profit targets and exit logic
- Position management and trailing stops

If you believe certain filters would improve signal quality, those filters belong in the SCANNER, not the execution layer. The scanner and execution have separate responsibilities.
```

**Expected Outcome:**
- Execution scripts will stop rejecting signals
- Filters will be moved to scanner layer where they belong
- More consistent trade execution from found signals

### Part 2: Add Preview Endpoint (15 min)

**Goal:** Allow users to preview the scanner prompt before starting an iteration.

**New Backend Route:**
```typescript
// File: backend/src/routes/learning-agent.routes.ts
router.get('/:id/iterations/preview', async (req, res) => {
  const agentId = req.params.id;
  const preview = await agentLearningService.previewNextIteration(agentId);
  res.json(preview);
});
```

**New Service Method:**
```typescript
// File: backend/src/services/agent-learning.service.ts
async previewNextIteration(agentId: string) {
  // 1. Load agent configuration
  const agent = await this.getAgentById(agentId);

  // 2. Get accumulated knowledge
  const knowledge = await this.knowledgeBase.getKnowledge(agentId);

  // 3. Generate scanner prompt (same logic as iteration start)
  const scannerPrompt = await this.generateScannerPrompt(agent, knowledge);

  // 4. Return preview without executing
  return {
    scannerPrompt: string,
    learningsApplied: Array<Knowledge>,
    executionGuidance: string,
    estimatedComplexity: 'simple' | 'moderate' | 'complex'
  };
}
```

**Response Format:**
```json
{
  "success": true,
  "preview": {
    "scannerPrompt": "Find gap down patterns with volume confirmation...",
    "learningsApplied": [
      {
        "iteration": 4,
        "insight": "Tight time windows (15 min) too restrictive",
        "confidence": 0.8
      }
    ],
    "executionGuidance": "Entry on bar after signal, stop loss at gap fill...",
    "estimatedComplexity": "moderate"
  }
}
```

### Part 3: Full Edit UI (30 min)

**Goal:** Build UI for previewing and editing scanner prompts before iterations.

**New Component:**
```typescript
// File: frontend/src/components/ScannerPromptModal.tsx
interface ScannerPromptModalProps {
  agentId: string;
  onConfirm: (prompt: string | null) => void;
  onCancel: () => void;
}

export function ScannerPromptModal({ agentId, onConfirm, onCancel }: Props) {
  const [preview, setPreview] = useState<IterationPreview | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  // Load preview on mount
  useEffect(() => {
    loadPreview();
  }, [agentId]);

  return (
    <Modal>
      <h2>Preview Next Iteration</h2>

      {/* Learnings Applied Section */}
      <LearningsSection learnings={preview.learningsApplied} />

      {/* Scanner Prompt Preview/Edit */}
      <div>
        <h3>Scanner Prompt</h3>
        <button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Preview' : 'Edit'}
        </button>

        {isEditing ? (
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            rows={20}
          />
        ) : (
          <pre>{preview.scannerPrompt}</pre>
        )}
      </div>

      {/* Actions */}
      <button onClick={() => onConfirm(isEditing ? editedPrompt : null)}>
        Start Iteration
      </button>
      <button onClick={onCancel}>Cancel</button>
    </Modal>
  );
}
```

**Modify Start Iteration Flow:**
```typescript
// File: frontend/src/pages/AgentDetail.tsx
const handleStartIteration = async () => {
  // 1. Show modal with preview
  setShowPromptModal(true);
};

const handlePromptConfirm = async (overridePrompt: string | null) => {
  // 2. Call start endpoint with optional override
  const response = await fetch(`/api/learning-agents/${agentId}/iterations/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      overrideScannerPrompt: overridePrompt
    })
  });

  setShowPromptModal(false);
  // ... handle response
};
```

**Update Backend Endpoint:**
```typescript
// File: backend/src/services/agent-learning.service.ts
async startIteration(agentId: string, options?: { overrideScannerPrompt?: string }) {
  // Use override prompt if provided, otherwise generate
  const scannerPrompt = options?.overrideScannerPrompt
    ? options.overrideScannerPrompt
    : await this.generateScannerPrompt(agent, knowledge);

  // Save custom prompt to iteration record
  if (options?.overrideScannerPrompt) {
    iteration.custom_scanner_prompt = options.overrideScannerPrompt;
  }

  // Continue with iteration...
}
```

## Success Criteria

✅ **Part 1 Success:**
- Execution scripts no longer add filtering logic
- Signals from scanner are executed without rejection
- Future iterations produce trades proportional to signals found

✅ **Part 2 Success:**
- `GET /api/learning-agents/:id/iterations/preview` returns scanner prompt
- Preview includes learnings applied and execution guidance
- Preview logic matches actual iteration logic

✅ **Part 3 Success:**
- "Start Iteration" button shows preview modal first
- User can view scanner prompt before committing
- User can edit scanner prompt in textarea
- Custom prompts are saved to iteration history
- Iterations can be started with original or edited prompts

## File Locations Reference

**Backend:**
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts` (lines 1646, 1763)
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
- `/Users/edwardkim/Code/ai-backtest/backend/src/routes/learning-agent.routes.ts`

**Frontend:**
- `/Users/edwardkim/Code/ai-backtest/frontend/src/components/ScannerPromptModal.tsx` (new)
- `/Users/edwardkim/Code/ai-backtest/frontend/src/pages/AgentDetail.tsx`

**Key Configuration:**
- Signal cap: 200 (was 20) - in `agent-learning.service.ts:35-37`
- Lookahead bias prevention: Added to both execution generation methods
- Scanner/Execution separation: Being enforced in execution prompts

## Next Steps

1. ✅ Document plan in ai-convo-history
2. → Implement Part 1: Fix execution filtering
3. → Implement Part 2: Add preview endpoint
4. → Implement Part 3: Build edit UI
5. → Test with iteration 6 on ORB Morning Range agent
6. → Verify no signal rejection, proper execution
