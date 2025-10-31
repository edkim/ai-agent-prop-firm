# Key Code Snippets for Knowledge Extraction Design

## File References

### Database Schema
- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/database/schema.sql`
- **Lines 757-774**: agent_knowledge table definition
- **Lines 777-806**: agent_iterations table definition  
- **Lines 809-835**: agent_strategies table definition

### Services
- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/refinement-approval.service.ts`
  - Line 52: `evaluateAndApply()` method
  - Line 240: `getDefaultThresholds()` method

- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/performance-monitor.service.ts`
  - Line 40: `analyzeIteration()` method
  - Line 95: `checkPerformanceDegradation()` method
  - Line 147: `checkConvergence()` method
  - Line 194: `checkMilestones()` method
  - Line 248: `checkGraduationReadiness()` method

- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
  - Line 50: `runIteration()` main learning loop
  - Line 329: `analyzeResults()` method
  - Line 352: `proposeRefinements()` method - converts analysis to refinements
  - Line 407: `applyRefinements()` method

- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`
  - Line 1292: `analyzeBacktestResults()` method

### Type Definitions
- **File**: `/Users/edwardkim/Code/ai-backtest/backend/src/types/agent.types.ts`
  - Line 82: `KnowledgeType` type definition
  - Line 84: `AgentKnowledge` interface
  - Line 104: `AgentIteration` interface
  - Line 131: `Refinement` interface
  - Line 139: `ExpertAnalysis` interface
  - Line 152: `AnalysisElement` interface
  - Line 158: `FailurePoint` interface
  - Line 165: `MissingContext` interface
  - Line 171: `ParameterRecommendation` interface

## Analysis Flow Diagram

```
Agent.runIteration()
├─ generateStrategy()
│  └─ Claude: Generate scanner + execution scripts
├─ executeScan()
│  └─ Get scan matches from strategy
├─ runBacktests()
│  └─ Execute trades and aggregate results
├─ analyzeResults()
│  └─ Claude: analyzeBacktestResults() → ExpertAnalysis JSON
│     {
│       summary: string
│       working_elements: AnalysisElement[]
│       failure_points: FailurePoint[]
│       missing_context: MissingContext[]
│       parameter_recommendations: ParameterRecommendation[]
│       projected_performance: { current, withRefinements, confidence }
│     }
├─ proposeRefinements()
│  ├─ Convert parameter_recommendations → parameter_adjustment refinements
│  ├─ Convert missing_context → missing_data refinements
│  └─ Convert failure_points → exit_rule refinements
├─ saveIteration()
│  └─ Store iteration with analysis + refinements in DB
└─ POST-ITERATION AUTONOMY HOOKS
   ├─ performanceMonitor.analyzeIteration()
   │  └─ Generate alerts (degradation, convergence, milestone, graduation)
   │     → agent_alerts table
   └─ refinementApproval.evaluateAndApply()
      └─ If approved:
         ├─ Generate new strategy version
         ├─ Store in agent_strategies
         └─ [MISSING: Extract and store learnings to agent_knowledge]
```

## Data Flow: From Analysis to Knowledge

### Current State (Analysis)
```typescript
interface ExpertAnalysis {
  summary: string;
  working_elements: AnalysisElement[];
  failure_points: FailurePoint[];
  missing_context: MissingContext[];
  parameter_recommendations: ParameterRecommendation[];
  projected_performance: {...};
}
```

### Target State (Knowledge)
```typescript
interface AgentKnowledge {
  id: string;
  agent_id: string;
  knowledge_type: 'INSIGHT' | 'PARAMETER_PREF' | 'PATTERN_RULE';
  pattern_type?: string;
  insight: string;
  supporting_data?: any; // JSON
  confidence: number; // 0-1
  learned_from_iteration: number;
  times_validated: number;
  last_validated?: string;
  created_at: string;
}
```

## Mapping: Analysis → Knowledge

### 1. Parameter Recommendations → PARAMETER_PREF
```
ParameterRecommendation {
  parameter: "RSI threshold",
  currentValue: 70,
  recommendedValue: 65,
  expectedImprovement: "10% increase in win rate"
}

↓ converts to ↓

AgentKnowledge {
  knowledge_type: 'PARAMETER_PREF',
  pattern_type: 'rsi_bounces', // extracted from context
  insight: "RSI threshold of 65 works better than 70",
  supporting_data: {
    parameter: "RSI threshold",
    old_value: 70,
    new_value: 65,
    expected_improvement: "10% increase in win rate"
  },
  confidence: 0.85 // from projected_performance.confidence
}
```

### 2. Working Elements → PATTERN_RULE
```
AnalysisElement {
  element: "VWAP bounce strategy working well",
  evidence: "3 of 5 recent iterations showed positive results",
  confidence: 0.92
}

↓ converts to ↓

AgentKnowledge {
  knowledge_type: 'PATTERN_RULE',
  pattern_type: 'vwap_bounce',
  insight: "VWAP bounce strategy is effective with current parameters",
  supporting_data: {
    element: "VWAP bounce strategy working well",
    evidence: "3 of 5 recent iterations showed positive results",
    validation_rate: 0.60 // 3 out of 5
  },
  confidence: 0.92
}
```

### 3. Failure Points → PATTERN_RULE (Negative)
```
FailurePoint {
  issue: "Stop loss too tight - exiting winners early",
  evidence: "Multiple trades hit stops before reversal",
  impact: "Reducing expected profit per trade by 30%",
  suggestedFix: "Increase stop loss to 2% from 1%"
}

↓ converts to ↓

AgentKnowledge {
  knowledge_type: 'PATTERN_RULE',
  pattern_type: null, // general rule
  insight: "Stop loss of 1% too tight - should be 2% or higher",
  supporting_data: {
    issue: "Stop loss too tight - exiting winners early",
    evidence: "Multiple trades hit stops before reversal",
    impact: "Reducing expected profit per trade by 30%",
    suggested_value: 0.02 // 2%
  },
  confidence: 0.80 // Based on impact evidence
}
```

### 4. Missing Context → INSIGHT
```
MissingContext {
  dataType: "Support/Resistance levels",
  reasoning: "Would help identify key reversal levels",
  recommendation: "Add support/resistance analysis to strategy"
}

↓ converts to ↓

AgentKnowledge {
  knowledge_type: 'INSIGHT',
  pattern_type: null,
  insight: "Support and resistance levels would improve signal quality",
  supporting_data: {
    data_type: "Support/Resistance levels",
    reasoning: "Would help identify key reversal levels",
    recommendation: "Add support/resistance analysis to strategy"
  },
  confidence: 0.70 // Lower confidence since not yet validated
}
```

## Knowledge Lifecycle

### 1. Creation (Post-Analysis)
- Extracted from ExpertAnalysis after each iteration
- Initial confidence: from analysis confidence scores
- times_validated: 0
- learned_from_iteration: current iteration number

### 2. Usage (Next Iteration)
- Retrieved in `generateStrategy()` as `formatKnowledgeSummary()`
- Included in Claude prompts for strategy refinement
- Helps guide scanner and execution script generation

### 3. Validation (Post-Approval)
- If approved refinement contains knowledge: increment times_validated
- If degradation alert: may reduce confidence
- If convergence alert: mark as mature knowledge
- Update last_validated timestamp

## Default Approval Thresholds
```typescript
{
  min_win_rate: 0.55,         // 55%
  min_sharpe_ratio: 1.5,
  min_signals: 10,
  min_total_return: 0.02,     // 2%
  require_improvement: true    // Must beat current version
}
```

## Graduation Criteria (Hard Requirements)
```
- Iterations: >= 20
- Win rate: >= 60% average
- Sharpe ratio: >= 2.0 average
- Total return: >= 5% average
- Total signals: >= 50
- Consistency: Last 5 iterations all > 55% win rate
```

## Alert Types Generated
1. **PERFORMANCE_DEGRADATION**: >15% win rate drop OR >20% Sharpe drop
2. **CONVERGENCE**: CV < 5% on metrics (improvement stalled)
3. **MILESTONE**: 10/50/100 iterations, exceptional performance
4. **GRADUATION_READY**: All strict criteria met
5. **ERROR**: System-level failures
