# Learning Laboratory UI Issues Investigation - 2025-11-03

## High-Level Plan

### Phase 1: Locate Components and Files
1. Find Learning Laboratory frontend components
2. Locate backend services for agent learning
3. Identify type definitions for data structures

### Phase 2: Investigate Each Issue
1. **Total Return Display Issue**
   - Locate Iteration Summary component
   - Check backend API response format
   - Identify formatting logic
   - Determine root cause

2. **Backtest Trades Table - Quantity Issue**
   - Find trades table component
   - Check backend quantity calculations
   - Verify if display vs calculation issue

3. **Knowledge Base Invalid Recommendations**
   - Find Knowledge Base component
   - Check expected vs actual data structure
   - Identify validation logic

4. **Understand Knowledge Base Feature**
   - Document purpose and usage
   - Trace data flow
   - Determine if active or legacy

### Phase 3: Document Findings
1. Create detailed report with:
   - Absolute file paths
   - Line numbers
   - Code snippets
   - Root causes
   - Recommended fixes

---

## INVESTIGATION FINDINGS

---

## Issue 1: Total Return Display Issue

### Problem
Total Return is displayed as a percent (%) in the Iteration Summary, but should be displayed as dollars ($).

### Root Cause
**DISPLAY BUG** - The backend is correctly storing `total_return` as a dollar amount, but the frontend is incorrectly multiplying by 100 and displaying it as a percentage.

### Evidence

#### Backend (CORRECT)
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`

**Lines 492-516:** The `aggregateBacktestResults` method calculates `totalReturn` as dollar PnL:
```typescript
private aggregateBacktestResults(trades: any[]): {
  winRate: number;
  sharpeRatio: number;
  totalReturn: number;
} {
  // ...
  // Calculate total return (handle both 'pnl' and 'profit' field names)
  const totalReturn = trades.reduce((sum, t) => sum + (t.pnl || t.profit || 0), 0);
  // ...
  return { winRate, sharpeRatio, totalReturn };
}
```

**Line 736:** This is stored in the database as dollars:
```typescript
total_return: data.backtestResults.totalReturn || 0,
```

#### Frontend (INCORRECT)
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`

**Lines 256-264:** The display incorrectly multiplies by 100 and adds `%`:
```typescript
<div>
  <div className="text-xs text-gray-600">Total Return</div>
  <div className={`text-2xl font-bold ${
    selectedIteration.total_return >= 0 ? 'text-green-600' : 'text-red-600'
  }`}>
    {selectedIteration.total_return >= 0 ? '+' : ''}
    {(selectedIteration.total_return * 100).toFixed(2)}%  {/* <-- BUG HERE */}
  </div>
</div>
```

### Fix Required
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`
**Lines:** 256-264

**Change from:**
```typescript
{selectedIteration.total_return >= 0 ? '+' : ''}
{(selectedIteration.total_return * 100).toFixed(2)}%
```

**Change to:**
```typescript
{selectedIteration.total_return >= 0 ? '+' : ''}
${selectedIteration.total_return.toFixed(2)}
```

---

## Issue 2: Backtest Trades Table - Quantity Issue

### Problem
Trades table shows quantity of 1 share per ticker instead of proper position sizing.

### Root Cause
**TEMPLATE BUG** - The execution templates ARE calculating proper position sizing (using $10,000 trade size), but there's a fallback in the frontend that defaults to quantity=1 when the field is missing.

### Evidence

#### Backend Execution Template (CORRECT)
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/templates/execution/conservative.ts`

**Lines 149-154:** Templates calculate quantity based on $10,000 position size:
```typescript
// Position sizing: $10,000 trade size
const TRADE_SIZE = 10000;
const quantity = Math.floor(TRADE_SIZE / position.entry);
const pnlPerShare = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
const pnl = pnlPerShare * quantity;
const pnlPercent = (pnlPerShare / position.entry) * 100;
```

**Lines 156-170:** Results include the calculated quantity:
```typescript
results.push({
  date: signal_date,
  ticker: sigTicker,
  side,
  entryTime: position.entryTime,
  entryPrice: position.entry,
  exitTime: bar.timeOfDay,
  exitPrice,
  quantity,  // <-- Proper quantity here
  pnl,
  pnlPercent,
  exitReason,
  highestPrice: position.highestPrice,
  lowestPrice: position.lowestPrice
});
```

#### Frontend Display (POTENTIAL ISSUE)
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`

**Lines 367-420:** The trade display has a fallback that defaults to 1:
```typescript
{selectedIteration.backtest_results.trades.map((trade: any, idx: number) => {
  // Handle both camelCase and snake_case field names
  const entryPrice = trade.entryPrice || trade.entry_price;
  const exitPrice = trade.exitPrice || trade.exit_price;
  const pnl = trade.pnl;
  const pnlPercent = trade.pnlPercent !== undefined ? trade.pnlPercent : trade.pnl_percent;
  const exitReason = trade.exitReason || trade.exit_reason;
  const quantity = trade.quantity || 1;  // <-- FALLBACK TO 1 HERE
```

### Investigation Required
This needs testing to determine if:
1. The templates are correctly saving `quantity` in the backtest results
2. The API is correctly returning `quantity` in the trades array
3. The frontend is receiving the data but falling back to 1 anyway

### Debugging Steps
1. Check a recent backtest result in the database - does it include `quantity` in the trades array?
2. Check the API response - is `quantity` being returned in the JSON?
3. If yes to both, the frontend fallback should work correctly
4. If no, we need to ensure the templates are properly populating the quantity field

**Database Query to Check:**
```sql
SELECT backtest_results FROM agent_iterations ORDER BY created_at DESC LIMIT 1;
```

Then inspect the `trades` array within `backtest_results` to see if `quantity` is present.

---

## Issue 3: Knowledge Base Invalid Recommendations

### Problem
Knowledge Base section shows "invalid recommendations" instead of displaying accumulated knowledge.

### Root Cause
**UNCLEAR - NEEDS MORE INVESTIGATION**

The Knowledge Base component looks correct and should work properly. The issue is likely:
1. No knowledge has been extracted/stored yet, OR
2. There's an error in the knowledge extraction process

### Evidence

#### Frontend Component (APPEARS CORRECT)
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/KnowledgeBaseView.tsx`

**Lines 76-134:** The component handles empty knowledge correctly:
```typescript
{knowledge.length === 0 ? (
  <div className="text-center py-12">
    <div className="text-4xl mb-3">🧠</div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">No Knowledge Yet</h3>
    <p className="text-gray-600">
      The agent will accumulate insights as it learns through iterations
    </p>
  </div>
) : (
  <div className="space-y-3">
    {knowledge.map(item => (
      <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
        {/* Display knowledge items */}
      </div>
    ))}
  </div>
)}
```

#### Backend Knowledge Extraction (CHECKING IF ACTIVE)
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`

**Lines 136-138:** Knowledge extraction IS being called during iterations:
```typescript
// Step 4.5: Extract and store knowledge from analysis
logger.info('Step 4.5: Extracting knowledge');
const knowledge = await this.knowledgeExtraction.extractKnowledge(agentId, analysis, iterationNumber);
await this.knowledgeExtraction.storeKnowledge(agentId, knowledge);
```

### Investigation Required
1. **Check if knowledge extraction is working:** Look at the `AgentKnowledgeExtractionService` to see if it's properly extracting knowledge from analysis
2. **Check database:** Query `agent_knowledge` table to see if any records exist
3. **Check for errors:** Look for errors in the knowledge extraction service

**Database Query:**
```sql
SELECT * FROM agent_knowledge LIMIT 10;
```

### Most Likely Cause
The user is seeing "invalid recommendations" which suggests:
1. The component may be receiving malformed data, OR
2. There's a different component/section showing recommendations that we haven't identified yet

**Need clarification from user:** Where exactly are they seeing "invalid recommendations"? Is it:
- In the Knowledge Base tab?
- In the Analysis tab under "Suggested Refinements"?
- Somewhere else?

---

## Issue 4: Understanding the Knowledge Base Feature

### What is it?
The Knowledge Base is a **learning system** that accumulates insights across iterations to improve future strategy generation.

### Purpose
As the agent completes iterations and analyzes backtest results, it:
1. Extracts key insights from the analysis
2. Stores them with confidence scores
3. Uses them to inform future iterations

### Data Structure
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/types/agent.types.ts`

**Lines 92-106:**
```typescript
export interface AgentKnowledge {
  id: string;
  agent_id: string;
  knowledge_type: KnowledgeType;  // 'INSIGHT' | 'PARAMETER_PREF' | 'PATTERN_RULE'
  pattern_type?: string;           // e.g., 'vwap_bounce'
  insight: string;                 // Human-readable insight
  supporting_data?: any;           // Stats, examples, evidence
  confidence: number;              // 0-1
  learned_from_iteration: number;
  times_validated: number;
  last_validated?: string;
  created_at: string;
}
```

### How It's Used

#### 1. Extraction (After Each Iteration)
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`

**Lines 136-138:**
```typescript
const knowledge = await this.knowledgeExtraction.extractKnowledge(agentId, analysis, iterationNumber);
await this.knowledgeExtraction.storeKnowledge(agentId, knowledge);
```

#### 2. Retrieval (Before Generating New Strategy)
**Lines 227-228:**
```typescript
const knowledge = await this.getAgentKnowledge(agent.id);
const knowledgeSummary = this.formatKnowledgeSummary(knowledge, agent);
```

#### 3. Application (In Strategy Generation)
**Lines 239-256:**
```typescript
let scannerQuery: string;

if (agent.instructions && agent.instructions.trim() !== '') {
  // Specialized strategy with custom instructions - always use them
  scannerQuery = agent.instructions;

  // On iteration 2+, append learnings to refine the custom strategy
  if (iterationNumber > 1 && knowledgeSummary && knowledgeSummary.trim() !== '') {
    scannerQuery += `\n\nINCORPORATE THESE LEARNINGS: ${knowledgeSummary}`;
  }
} else {
  // Generic agent - use pattern focus
  if (iterationNumber === 1) {
    scannerQuery = `Find ${agent.pattern_focus.join(' or ')} patterns...`;
  } else {
    scannerQuery = `Find ${agent.pattern_focus.join(' or ')} patterns incorporating these learnings: ${knowledgeSummary}`;
  }
}
```

### Is It Active?
**YES** - The feature is actively used:
1. Knowledge is extracted after each iteration (Step 4.5)
2. Knowledge is retrieved before generating strategies (iteration 2+)
3. Knowledge is incorporated into scanner query generation

### Frontend Display
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/KnowledgeBaseView.tsx`

Displays knowledge items with:
- Type badges (INSIGHT, PARAMETER_PREF, PATTERN_RULE)
- Confidence score
- Times validated
- Supporting data (expandable)
- Which iteration it was learned from

---

## SUMMARY OF FIXES NEEDED

### 1. Total Return Display (CONFIRMED BUG)
**Priority:** HIGH
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`
**Line:** 262
**Fix:** Remove `* 100` and change `%` to `$`

### 2. Quantity Display (INVESTIGATION NEEDED)
**Priority:** MEDIUM
**Action:** 
1. Check database to see if `quantity` is in backtest results
2. Check API response
3. If data is correct, the frontend should display it properly
4. If data is missing, investigate template execution

### 3. Knowledge Base "Invalid Recommendations" (CLARIFICATION NEEDED)
**Priority:** MEDIUM
**Action:**
1. Ask user to clarify WHERE they're seeing "invalid recommendations"
2. Check if knowledge extraction service is working
3. Query database for knowledge records
4. Look for error logs during iteration execution

---

## FILES REFERENCED

### Frontend Components
- `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/AgentIterationView.tsx`
- `/Users/edwardkim/Code/ai-backtest/frontend/src/components/LearningLaboratory/KnowledgeBaseView.tsx`
- `/Users/edwardkim/Code/ai-backtest/frontend/src/services/learningAgentApi.ts`

### Backend Services
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
- `/Users/edwardkim/Code/ai-backtest/backend/src/api/routes/agents.ts`

### Backend Types
- `/Users/edwardkim/Code/ai-backtest/backend/src/types/agent.types.ts`

### Execution Templates
- `/Users/edwardkim/Code/ai-backtest/backend/src/templates/execution/conservative.ts`
- `/Users/edwardkim/Code/ai-backtest/backend/src/templates/execution/template.interface.ts`
