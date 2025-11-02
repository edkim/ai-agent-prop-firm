# Learning System - Quick Reference Guide

## File Locations

| Component | Path | Key Lines |
|-----------|------|-----------|
| agent_knowledge table | schema.sql | 757-774 |
| agent_iterations table | schema.sql | 777-806 |
| agent_strategies table | schema.sql | 809-835 |
| AgentLearningService | agent-learning.service.ts | 28-613 |
| RefinementApprovalService | refinement-approval.service.ts | 29-290 |
| PerformanceMonitorService | performance-monitor.service.ts | 30-438 |
| ClaudeService | claude.service.ts | 11-1379 |
| Agent Type Definitions | agent.types.ts | 1-354 |

## The Learning Loop (Current)

```
runIteration()
├─ generateStrategy() ...................... Lines 129-180
│  └─ getAgentKnowledge() .................. Line 138 (EXISTS)
│     └─ formatKnowledgeSummary() ......... Line 139 (USED)
├─ executeScan() ........................... Lines 185-222
├─ runBacktests() .......................... Lines 227-294
├─ analyzeResults() ........................ Lines 329-346
│  └─ Claude: analyzeBacktestResults() .... claude.service.ts:1292
│     Returns: ExpertAnalysis object ....... ExpertAnalysis interface:139
├─ proposeRefinements() .................... Lines 352-401
│  ├─ parameter_recommendations → refinements
│  ├─ missing_context → refinements
│  └─ failure_points → refinements
├─ saveIteration() ......................... Lines 486-533
│  └─ Stores in agent_iterations table
└─ POST-ITERATION HOOKS
   ├─ performanceMonitor.analyzeIteration()
   │  └─ Creates alerts in agent_alerts table
   └─ refinementApproval.evaluateAndApply()
      └─ If approved: createStrategyVersion()
         └─ Stores in agent_strategies table

[WHERE IS KNOWLEDGE EXTRACTION?]
↓ MISSING ↓
agent_knowledge table stays empty!
```

## The Knowledge Extraction Gap

### What's Missing
```typescript
// After analyzeResults() at line 329-346, should have:
const knowledge = await this.knowledgeExtraction.extractKnowledge(analysis, iterationNumber);
await this.knowledgeExtraction.storeKnowledge(agentId, knowledge);
// CURRENTLY: This code doesn't exist

// After refinementApproval.evaluateAndApply() at line 110, should have:
if (approvalResult.approved) {
  await this.knowledgeExtraction.validateApprovedKnowledge(agentId, iterationId);
}
// CURRENTLY: This code doesn't exist
```

### The Cost
- Claude spends tokens analyzing the same issues each iteration
- Agent re-learns same patterns in iteration N that it learned in iteration N-5
- Convergence to graduation takes longer (estimated +30-50% more iterations)
- agent_knowledge table remains empty despite good schema

## Quick Data Structure Reference

### ExpertAnalysis (What Claude returns)
```typescript
{
  summary: "Short performance overview",
  working_elements: [
    { element: "What worked", evidence: "proof", confidence: 0.92 }
  ],
  failure_points: [
    { issue: "Problem", evidence: "proof", impact: "effect", suggestedFix: "solution" }
  ],
  missing_context: [
    { dataType: "Need X", reasoning: "why", recommendation: "how" }
  ],
  parameter_recommendations: [
    { parameter: "Name", currentValue: 70, recommendedValue: 65, expectedImprovement: "10%" }
  ],
  projected_performance: {
    current: { winRate: 0.55, sharpe: 1.5 },
    withRefinements: { winRate: 0.60, sharpe: 1.8 },
    confidence: 0.85
  }
}
```

### AgentKnowledge (What should be created)
```typescript
{
  id: "uuid",
  agent_id: "agent-123",
  knowledge_type: "PARAMETER_PREF" | "PATTERN_RULE" | "INSIGHT",
  pattern_type: "vwap_bounce" | null,
  insight: "Human-readable learning",
  supporting_data: { /* structured evidence */ },
  confidence: 0.85,
  learned_from_iteration: 5,
  times_validated: 0,
  last_validated: null,
  created_at: "2025-10-30T16:37:00Z"
}
```

## The 4 Knowledge Mappings

| Analysis Component | → | Knowledge Type | Example |
|---|---|---|---|
| parameter_recommendations | → | PARAMETER_PREF | "Stop loss 2% better than 1%" |
| working_elements | → | PATTERN_RULE | "VWAP bounces work well" |
| failure_points | → | PATTERN_RULE | "Post-10AM entries fail" |
| missing_context | → | INSIGHT | "Add S/R levels for better exits" |

## Threshold & Criteria Quick Reference

### Auto-Approval Defaults
- Win rate: 55%
- Sharpe: 1.5
- Return: 2%
- Signals: 10
- Improvement: +2 of 3 metrics vs current

### Graduation Requirements
- Iterations: ≥20
- Win rate: ≥60% avg
- Sharpe: ≥2.0 avg
- Return: ≥5% avg
- Signals: ≥50 total
- Consistency: Last 5 iterations >55%

### Alert Triggers
- **DEGRADATION**: >15% win rate drop OR >20% Sharpe drop
- **CONVERGENCE**: Coefficient of variation <5%
- **MILESTONE**: 10/50/100 iterations or 70%+/2.0 Sharpe
- **GRADUATION**: All 6 criteria met

## Integration Checklist

- [ ] Create agent-knowledge-extraction.service.ts
- [ ] Add extraction after analyzeResults() in agent-learning.service.ts:346
- [ ] Add validation after refinementApproval.evaluateAndApply() in agent-learning.service.ts:110
- [ ] Add confidence updates in performance-monitor.service.ts:67, 74, 82
- [ ] Enhance formatKnowledgeSummary() in agent-learning.service.ts:476
- [ ] Add unit tests for 4 mappings
- [ ] Add integration tests for service connections
- [ ] Update type definitions if needed
- [ ] Document knowledge lifecycle in README

## Key Method Signatures

```typescript
// New service to create
class AgentKnowledgeExtractionService {
  async extractKnowledge(analysis: ExpertAnalysis, iterationNumber: number): KnowledgeItem[]
  async storeKnowledge(agentId: string, knowledge: KnowledgeItem[]): Promise<void>
  async validateApprovedKnowledge(agentId: string, iterationId: string, approvalResult): Promise<void>
  async markKnowledgeMature(agentId: string): Promise<void>
  async reduceKnowledgeConfidence(agentId: string, factor: number): Promise<void>
  formatKnowledgeForStrategyGeneration(knowledge: AgentKnowledge[], patternFocus: string[]): string
}

// Existing methods to call
AgentLearningService.analyzeResults() → returns ExpertAnalysis
RefinementApprovalService.evaluateAndApply() → returns ApprovalResult
PerformanceMonitorService.analyzeIteration() → returns Alert[]
```

## SQL Quick Queries

### View accumulated knowledge
```sql
SELECT knowledge_type, COUNT(*) as count, AVG(confidence) as avg_confidence
FROM agent_knowledge
WHERE agent_id = 'agent-123'
GROUP BY knowledge_type
ORDER BY count DESC;
```

### Find most validated knowledge
```sql
SELECT insight, times_validated, confidence, last_validated
FROM agent_knowledge
WHERE agent_id = 'agent-123'
ORDER BY times_validated DESC, confidence DESC
LIMIT 10;
```

### Check iteration analysis
```sql
SELECT iteration_number, win_rate, sharpe_ratio, total_return
FROM agent_iterations
WHERE agent_id = 'agent-123'
ORDER BY iteration_number DESC
LIMIT 5;
```

### Approval status
```sql
SELECT COUNT(*) as approved, SUM(CASE WHEN iteration_status = 'approved' THEN 1 ELSE 0 END) as approved_count
FROM agent_iterations
WHERE agent_id = 'agent-123';
```

## Dependencies

```
agent-knowledge-extraction.service.ts
├─ getDatabase() from database/db.ts
├─ AgentKnowledge, ExpertAnalysis types from types/agent.types.ts
└─ AgentActivityLogService for logging

Integration points:
├─ agent-learning.service.ts (call extractKnowledge after analysis)
├─ refinement-approval.service.ts (call validateApprovedKnowledge)
└─ performance-monitor.service.ts (call confidence updates)
```

## Testing Strategy

### Unit Tests (Knowledge Extraction Service)
```
- extractKnowledge: parameter_recommendations → PARAMETER_PREF
- extractKnowledge: working_elements → PATTERN_RULE
- extractKnowledge: failure_points → PATTERN_RULE
- extractKnowledge: missing_context → INSIGHT
- storeKnowledge: deduplication logic
- storeKnowledge: confidence updates
- formatKnowledgeForStrategyGeneration: output format
```

### Integration Tests
```
- Full iteration with knowledge extraction
- Knowledge used in next iteration
- Validation tracking on reuse
- Performance monitor confidence adjustment
```

## Success Criteria

| Metric | Target | How to Measure |
|--------|--------|---|
| Knowledge Capture Rate | 3-5 items/iteration | COUNT(*) FROM agent_knowledge |
| Knowledge Reuse | Referenced in 2+ iterations | Grep knowledge summaries |
| Validation Accumulation | 5+ validations for mature items | times_validated column |
| Convergence Speed | 30-50% fewer iterations | Compare graduation iteration number |
| Confidence Stability | Increases with validation | Track avg(confidence) over time |

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Duplicate knowledge items | No deduplication logic | Add fuzzy matching on insight text |
| Low confidence stuck | No mechanism to increase | Update on times_validated++ |
| Knowledge not reused | formatKnowledgeSummary not enhanced | Improve Claude prompt inclusion |
| Convergence no faster | Knowledge confidence too low | Lower initial thresholds, validate earlier |

---

**Remember**: The infrastructure exists. We just need to connect the pieces and populate the empty table!
