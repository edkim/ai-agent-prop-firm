# Performance Tracking Additions for LearningIterationService

## Key Changes Needed:

### 1. After Step 2.5 (execution regeneration) - around line 141-152:
- Track execution_generation_time_ms if execution is regenerated
- Add tokens from regeneration to execution_generation_tokens

### 2. After Step 3 (backtests) - around line 160-168:
```typescript
// Step 3: Run backtests on scan results
logger.info('Step 3: Running backtests with template library');
this.performanceTracker.updatePhase(iterationId, 'backtest_execution');

const backtestStartTime = Date.now();
const backtestResults = await this.runBacktests(...);
const backtestEndTime = Date.now();

this.performanceTracker.updateMetrics(iterationId, {
  backtest_execution_time_ms: backtestEndTime - backtestStartTime,
});
```

### 3. After Step 4 (analysis) - around line 228-239:
```typescript
// Step 4: Analyze results + Step 5: Extract knowledge + refinements
logger.info('Step 4: Analyzing results');
this.performanceTracker.updatePhase(iterationId, 'analysis');

const analysisStartTime = Date.now();
// ... all analysis, knowledge extraction, and refinement logic
const analysisEndTime = Date.now();

this.performanceTracker.updateMetrics(iterationId, {
  analysis_time_ms: analysisEndTime - analysisStartTime,
  analysis_tokens: analysisTokensUsed,
});
```

### 4. Update saveIteration call - around line 247:
```typescript
// Step 6: Save iteration to database
const iteration = await this.saveIteration({
  id: iterationId,  // ADD THIS LINE
  agentId,
  iterationNumber,
  strategy,
  scanResults,
  backtestResults,
  analysis,
  refinements,
  manualGuidance,
});
```

### 5. Update saveIteration method signature - around line 1019:
```typescript
private async saveIteration(data: any): Promise<AgentIteration> {
  const db = getDatabase();
  const id = data.id || uuidv4();  // Use provided ID or generate new one
```

### 6. Mark iteration as completed - after saveIteration around line 258:
```typescript
// Mark performance tracking as completed
this.performanceTracker.updatePhase(iterationId, 'completed');

logger.info('Iteration complete', {
  iterationId: iteration.id,
  status: iteration.iteration_status
});
```

### 7. Error handling - in catch block around line 285:
```typescript
} catch (error: any) {
  // Mark iteration as failed in performance tracking
  this.performanceTracker.updatePhase(iterationId, 'failed', error.message);

  logger.error('Iteration failed', {
    error: error.message,
    stack: error.stack
  });
  throw error;
}
```

## Token Tracking Notes:

For analysis tokens, we need to track tokens from:
- analyzeResults()
- proposeRefinements()

These methods use ClaudeService which returns token usage. We need to collect and sum these.
