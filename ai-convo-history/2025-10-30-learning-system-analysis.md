# Learning System Implementation Analysis

## Executive Summary

The current learning system has a well-structured foundation for agent knowledge management, including:
- **agent_knowledge table**: Stores learned insights, parameter preferences, and pattern rules
- **agent_iterations table**: Tracks backtest experiments with results and Claude's expert analysis
- **agent_strategies table**: Maintains version history of agent strategies with performance metrics
- **refinement-approval.service.ts**: Automatically evaluates and applies refinements based on thresholds
- **performance-monitor.service.ts**: Tracks performance trends and generates alerts
- **agent-learning.service.ts**: Orchestrates the complete learning loop

## 1. Database Schema: agent_knowledge Table

**Location**: `/Users/edwardkim/Code/ai-backtest/backend/src/database/schema.sql` (lines 757-774)

### Column Structure
```sql
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  knowledge_type TEXT NOT NULL, -- 'INSIGHT', 'PARAMETER_PREF', 'PATTERN_RULE'
  pattern_type TEXT, -- e.g., 'vwap_bounce', 'gap_and_go'
  insight TEXT NOT NULL, -- Human-readable insight
  supporting_data TEXT, -- JSON: stats, examples, evidence
  confidence REAL, -- 0-1 confidence score
  learned_from_iteration INTEGER, -- Which iteration produced this
  times_validated INTEGER DEFAULT 0, -- How many times confirmed
  last_validated TEXT, -- Last validation date
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
);
```

### Key Points
- **knowledge_type**: Three categories - INSIGHT (general learnings), PARAMETER_PREF (preferred parameter values), PATTERN_RULE (specific trading rules)
- **supporting_data**: JSON field for statistical evidence, examples, or supporting metrics
- **confidence**: 0-1 scale indicating confidence in the knowledge
- **times_validated**: Tracks how many times this knowledge has been validated across iterations
- **learned_from_iteration**: Maintains lineage to the source iteration

## 2. Refinement Approval Service

**Location**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/refinement-approval.service.ts`

### Key Methods

#### evaluateAndApply(agentId, iterationId)
**Purpose**: Automatically evaluates iteration results against configured thresholds and applies refinements if approved

**What it does**:
1. Checks if auto-approval is enabled for the agent
2. Parses approval thresholds (or uses defaults)
3. Evaluates iteration against thresholds:
   - **Threshold checks**:
     - `min_win_rate` (default: 55%)
     - `min_sharpe_ratio` (default: 1.5)
     - `min_total_return` (default: 2%)
     - `min_signals` (default: 10)
   - **Improvement requirement**: If enabled, must show improvement in ≥2 out of 3 metrics vs. current version
4. If approved, calls `AgentLearningService.applyRefinements()` to create new strategy version
5. Logs to activity log with detailed context

**Returns**: `ApprovalResult`
```typescript
{
  approved: boolean;
  reason: string;
  meetsThresholds: boolean;
  improvements: {
    win_rate: number | null;
    sharpe_ratio: number | null;
    total_return: number | null;
  };
}
```

#### Does it populate agent_knowledge?
**NO** - The current implementation of `evaluateAndApply()` does NOT directly populate the `agent_knowledge` table. This is a gap in the system where learned insights from approved refinements are not being captured for future iterations.

## 3. Performance Monitor Service

**Location**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/performance-monitor.service.ts`

### Key Method: analyzeIteration(agentId, iterationId)

**Purpose**: Analyzes performance after each iteration and generates alerts for significant events

**What it does**:
1. Retrieves current and recent (last 5) iterations
2. Runs four analysis checks:
   - **Performance Degradation Check**: Detects if current iteration is significantly worse (>15% drop in win rate OR >20% drop in Sharpe)
   - **Convergence Check**: Identifies when performance has plateaued (coefficient of variation <5%)
   - **Milestone Check**: Detects achievement milestones:
     - 10, 50, 100 iterations completed
     - Exceptional performance (70%+ win rate + 2.0+ Sharpe)
     - 100+ signals in single iteration
   - **Graduation Readiness Check**: Evaluates if agent is ready for paper trading (strict criteria):
     - ≥20 total iterations
     - ≥60% average win rate
     - ≥2.0 average Sharpe ratio
     - ≥5% average return
     - ≥50 total signals
     - Consistent performance (last 5 iterations all >55% win rate)

3. Creates alerts in the database for each detected condition
4. Logs to activity log

**Returns**: Array of `Alert` objects

**Does it extract insights?** NO - `analyzeIteration()` generates alerts about performance trends but does NOT extract or store learnable insights in the `agent_knowledge` table.

## 4. Agent Learning Service - Refinement Structure

**Location**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`

### Refinement Type Definition
```typescript
export interface Refinement {
  type: 'scan_filter' | 'parameter_adjustment' | 'exit_rule' | 'missing_data';
  description: string;
  reasoning: string;
  projected_improvement?: string;
  specific_changes?: any; // Structured changes to apply
}
```

### Refinement Fields
- **type**: Categorizes the refinement (4 types)
- **description**: Human-readable summary (e.g., "Adjust RSI threshold from 70 to 65")
- **reasoning**: Explanation of why this refinement is needed
- **projected_improvement**: Expected outcome (e.g., "Expected improvement based on analysis")
- **specific_changes**: Object with detailed parameters:
  - For parameter_adjustment: `{ parameter, old_value, new_value }`
  - For missing_data: `{ data_needed }`
  - For exit_rule: `{ issue }`

### How Refinements are Generated
In `proposeRefinements()` method (lines 349-401):
1. Converts `analysis.parameter_recommendations` into `parameter_adjustment` refinements
2. Converts `analysis.missing_context` into `missing_data` refinements
3. Converts `analysis.failure_points` into `exit_rule` refinements

## 5. Expert Analysis Structure

**Location**: Claude analysis in `agent-learning.service.ts` (lines 329-346) and `claude.service.ts` (lines 1292-1375)

### ExpertAnalysis Type
```typescript
export interface ExpertAnalysis {
  summary: string;
  working_elements: AnalysisElement[];
  failure_points: FailurePoint[];
  missing_context: MissingContext[];
  parameter_recommendations: ParameterRecommendation[];
  projected_performance: {
    current: { winRate: number; sharpe: number };
    withRefinements: { winRate: number; sharpe: number };
    confidence: number;
  };
}

interface AnalysisElement {
  element: string;
  evidence: string;
  confidence: number;
}

interface FailurePoint {
  issue: string;
  evidence: string;
  impact: string;
  suggestedFix: string;
}

interface MissingContext {
  dataType: string;
  reasoning: string;
  recommendation: string;
}

interface ParameterRecommendation {
  parameter: string;
  currentValue: any;
  recommendedValue: any;
  expectedImprovement: string;
}
```

### How Analysis is Generated
The `analyzeBacktestResults()` method in Claude service:
1. Takes backtest results and agent personality as input
2. Sends to Claude with specific JSON response format
3. Claude returns structured analysis covering:
   - Summary of performance
   - Elements that worked well
   - Failure points and their impacts
   - Missing context/data needed
   - Parameter recommendations with rationale
   - Projected performance improvements

**Key Claude System Prompt Section** (lines 1299-1301):
```
You are an expert trader analyzing backtest results. ${params.agentPersonality}

Analyze the provided backtest results and provide structured feedback in JSON format.
```

## Gap Analysis: Knowledge Extraction Opportunity

### Current Flow
```
Iteration → Analysis → Refinements → Approval → Strategy Version
                ↓
            Stored in
        agent_iterations
```

### Missing: Knowledge Extraction
```
Analysis Results
     ↓
  [NO MECHANISM] ← OPPORTUNITY HERE
     ↓
agent_knowledge table (currently unused)
```

### What's NOT Being Captured
1. **Insights from approved refinements**: When a refinement is auto-approved and applied, there's no capture of the learning
2. **Performance patterns**: Convergence alerts indicate learning limits, but these aren't stored as knowledge
3. **Parameter effectiveness**: Parameter recommendations are applied but effectiveness isn't tracked
4. **Pattern-specific learnings**: VWAP bounce patterns might have specific parameter preferences, but these aren't extracted
5. **Validation history**: Times a knowledge item proved correct isn't being updated

## Recommendations for Knowledge Extraction Implementation

### 1. Post-Approval Knowledge Extraction
After refinements are approved, extract:
- Parameter adjustments as `PARAMETER_PREF` knowledge
- Successful patterns as `PATTERN_RULE` knowledge
- General insights as `INSIGHT` knowledge

### 2. Performance Monitor Integration
Convert performance alerts into knowledge:
- Degradation alerts → negative learnings about parameter ranges
- Convergence alerts → marker for knowledge compilation
- Milestones → celebration of validated knowledge

### 3. Analysis-Driven Knowledge
From expert analysis:
- Working elements → validated patterns
- Failure points → learned constraints
- Parameter recommendations → preferences with rationale

### 4. Validation Tracking
When knowledge is used in subsequent iterations:
- Increment `times_validated` counter
- Update `last_validated` timestamp
- Track success rate of knowledge application

## Key Tables Involved

| Table | Purpose | Status |
|-------|---------|--------|
| agent_knowledge | Store learned insights | Created but not populated |
| agent_iterations | Track experiments | Active, stores analysis results |
| agent_strategies | Version control | Active, tracks performance |
| agent_alerts | Performance monitoring | Active, used for alerts |
| agent_activity_log | Audit trail | Active, logs all events |

## Implementation Prerequisites

1. **ExpertAnalysis is available**: Claude returns structured analysis after each iteration
2. **Refinement approval process exists**: RefinementApprovalService evaluates and applies refinements
3. **Performance monitoring is active**: PerformanceMonitorService generates alerts
4. **Activity logging is comprehensive**: All events are logged with context

All prerequisites are in place for implementing knowledge extraction!
