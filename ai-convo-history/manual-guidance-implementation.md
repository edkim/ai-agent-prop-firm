# Manual Guidance Feature - Implementation Summary

## Completed Changes

### 1. Database Schema ✅
- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/database/schema.sql` (line 786)
- **Change**: Added `manual_guidance TEXT` column to `agent_iterations` table
- **Note**: Column will be created automatically when server restarts

### 2. API Endpoint ✅
- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/api/routes/agents.ts` (lines 248-265)
- **Change**: Updated to extract `manualGuidance` from request body and pass to `runIteration`
```typescript
const { manualGuidance } = req.body;
const result = await agentLearning.runIteration(agentId, manualGuidance);
```

### 3. Service Method Signature ✅
- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts` (line 68)
- **Change**: Updated method signature to accept optional `manualGuidance` parameter
```typescript
async runIteration(agentId: string, manualGuidance?: string): Promise<IterationResult>
```

## Remaining Changes Needed

### 4. Update generateStrategy Method

**Location**: `src/services/agent-learning.service.ts` (around line 214)

**Current signature**:
```typescript
private async generateStrategy(agent: TradingAgent, iterationNumber: number): Promise<StrategyGeneration>
```

**New signature**:
```typescript
private async generateStrategy(agent: TradingAgent, iterationNumber: number, manualGuidance?: string): Promise<StrategyGeneration>
```

**Changes in the method**:
Find where the scanner generation prompt is built (look for `claude.generateText`) and add manual guidance to the prompt:

```typescript
const scannerPrompt = this.buildScannerPrompt(agent, iterationNumber, knowledgeContext, manualGuidance);
```

Update `buildScannerPrompt` method to include manual guidance:
```typescript
private buildScannerPrompt(
  agent: TradingAgent,
  iterationNumber: number,
  knowledgeContext: string,
  manualGuidance?: string
): string {
  // ... existing code ...

  let prompt = `${basePrompt}...`;

  // Add manual guidance if provided
  if (manualGuidance) {
    prompt += `\n\n## MANUAL GUIDANCE FROM USER\n\nThe user has provided the following specific guidance for this iteration:\n\n${manualGuidance}\n\nIMPORTANT: Incorporate this guidance into your strategy generation. This takes priority over automated refinements.\n`;
  }

  return prompt;
}
```

### 5. Update saveIteration Method

**Location**: `src/services/agent-learning.service.ts` (around line 700-800)

**Find**:
```typescript
private async saveIteration(params: {
  agentId: string;
  iterationNumber: number;
  strategy: StrategyGeneration;
  scanResults: any[];
  backtestResults: BacktestResults;
  analysis: ExpertAnalysis;
  refinements: any[];
}): Promise<any>
```

**Update to**:
```typescript
private async saveIteration(params: {
  agentId: string;
  iterationNumber: number;
  strategy: StrategyGeneration;
  scanResults: any[];
  backtestResults: BacktestResults;
  analysis: ExpertAnalysis;
  refinements: any[];
  manualGuidance?: string;
}): Promise<any>
```

**In the database INSERT statement**, add `manual_guidance`:
```typescript
db.prepare(`
  INSERT INTO agent_iterations (
    id, agent_id, iteration_number,
    scan_script, execution_script, version_notes, manual_guidance,
    signals_found, backtest_results,
    win_rate, sharpe_ratio, total_return,
    expert_analysis, refinements_suggested,
    iteration_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  iterationId,
  params.agentId,
  params.iterationNumber,
  params.strategy.scanScript,
  params.strategy.executionScript || '',
  versionNotes,
  params.manualGuidance || null,  // ADD THIS
  params.scanResults.length,
  JSON.stringify(params.backtestResults),
  params.backtestResults.winRate || 0,
  params.backtestResults.sharpeRatio || 0,
  params.backtestResults.totalReturn || 0,
  JSON.stringify(params.analysis),
  JSON.stringify(params.refinements),
  'completed',
  new Date().toISOString()
);
```

**In runIteration**, pass manualGuidance to saveIteration:
```typescript
const iteration = await this.saveIteration({
  agentId,
  iterationNumber,
  strategy,
  scanResults,
  backtestResults,
  analysis,
  refinements,
  manualGuidance,  // ADD THIS
});
```

### 6. Frontend UI Component

**File**: `frontend/src/components/LearningLaboratory/LearningLaboratory.tsx`

Add a state variable and UI input for manual guidance:

```typescript
const [manualGuidance, setManualGuidance] = useState('');
const [showGuidanceInput, setShowGuidanceInput] = useState(false);

// In the UI, add before the "Start New Iteration" button:
<div className="mb-4">
  <button
    onClick={() => setShowGuidanceInput(!showGuidanceInput)}
    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2"
  >
    {showGuidanceInput ? '− Hide' : '+ Add'} Manual Guidance
  </button>

  {showGuidanceInput && (
    <div className="mt-2">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Manual Guidance for Next Iteration
      </label>
      <textarea
        value={manualGuidance}
        onChange={(e) => setManualGuidance(e.target.value)}
        placeholder="e.g., 'Relax volume filters to find more signals' or 'Focus on stocks between $5-$20'"
        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        rows={3}
      />
      <p className="mt-1 text-sm text-gray-500">
        Provide specific guidance to steer the next iteration's strategy generation
      </p>
    </div>
  )}
</div>
```

**Update the startIteration function**:
```typescript
const startIteration = async () => {
  setIsRunningIteration(true);
  setIterationError(null);

  try {
    const response = await fetch(
      `/api/learning-agents/${selectedAgent.id}/iterations/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          manualGuidance: manualGuidance.trim() || undefined
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to start iteration');
    }

    const data = await response.json();

    // Clear manual guidance after successful start
    setManualGuidance('');
    setShowGuidanceInput(false);

    // Refresh iterations list
    await fetchIterations();
  } catch (error: any) {
    setIterationError(error.message);
  } finally {
    setIsRunningIteration(false);
  }
};
```

### 7. Display Manual Guidance in Iteration View

**File**: `frontend/src/components/LearningLaboratory/AgentIterationView.tsx`

Add a section to display manual guidance if it exists:

```typescript
{selectedIteration.manual_guidance && (
  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <h3 className="text-sm font-semibold text-blue-900 mb-2">
      📝 Manual Guidance
    </h3>
    <p className="text-sm text-blue-800 whitespace-pre-wrap">
      {selectedIteration.manual_guidance}
    </p>
  </div>
)}
```

## Testing

1. **Restart backend server** to apply schema changes
2. **Test API endpoint directly**:
```bash
curl -X POST http://localhost:3000/api/learning-agents/{agent-id}/iterations/start \
  -H "Content-Type: application/json" \
  -d '{"manualGuidance": "Find more signals by relaxing volume filters to 100%"}'
```

3. **Test via UI**:
   - Open Learning Laboratory
   - Click "+ Add Manual Guidance"
   - Enter guidance like: "Relax minimum price filter to $5 to capture more signals"
   - Start iteration
   - Verify guidance appears in generated scanner prompt
   - Check iteration view shows the manual guidance

## Usage Example

When iteration 21 only found 1 signal, you could provide:

```
The previous iteration only found 1 signal. Please relax the filters to find 10-20 signals:
- Lower minimum 3-day gain to 75% (from 100%)
- Reduce volume requirement to 125% of average (from 150%)
- Consider signals any time between 9:30-15:45 (not just mid-day)
- Keep other quality filters intact
```

This will be included in the prompt and guide the next iteration's scanner generation.
