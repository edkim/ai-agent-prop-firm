# Multi-Agent Trading Laboratory - Implementation Plan
**Date:** 2025-10-30

## Overview

Build autonomous trading agents that learn and evolve, split into:
- **Phase 1:** Core learning loop with existing data
- **Phase 2:** Autonomy features (MCP, data requests, self-modification)

---

## Phase 1: Core Agent Learning Loop (Week 1-2)

### Goal
Agents can learn from backtests using existing cached data. User creates agents with natural language instructions, agents iterate on strategies, accumulate knowledge.

### Components

#### 1. Database Schema
```sql
CREATE TABLE trading_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  instructions TEXT NOT NULL,
  system_prompt TEXT,
  risk_tolerance TEXT,
  trading_style TEXT,
  pattern_focus TEXT,
  market_conditions TEXT,
  risk_config TEXT,
  status TEXT DEFAULT 'learning',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE agent_knowledge (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES trading_agents(id),
  knowledge_type TEXT,
  pattern_type TEXT,
  insight TEXT,
  supporting_data TEXT,
  confidence REAL,
  learned_from_iteration INTEGER,
  created_at TEXT
);

CREATE TABLE agent_iterations (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES trading_agents(id),
  iteration_number INTEGER,
  scan_script TEXT,
  execution_script TEXT,
  version_notes TEXT,
  signals_found INTEGER,
  backtest_results TEXT,
  win_rate REAL,
  sharpe_ratio REAL,
  expert_analysis TEXT,
  refinements_suggested TEXT,
  iteration_status TEXT,
  created_at TEXT
);

CREATE TABLE agent_strategies (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES trading_agents(id),
  version TEXT,
  scan_script TEXT,
  execution_script TEXT,
  backtest_sharpe REAL,
  backtest_win_rate REAL,
  is_current_version BOOLEAN,
  parent_version TEXT,
  changes_from_parent TEXT,
  created_at TEXT
);
```

#### 2. Agent Management Service
**File:** `backend/src/services/agent-management.service.ts`

```typescript
class AgentManagementService {
  // Create agent from natural language
  async createAgent(instructions: string, name?: string): Promise<TradingAgent>

  // Parse instructions → extract personality traits
  async extractPersonality(instructions: string): Promise<Personality>

  // Generate Claude system prompt for this agent
  async generateSystemPrompt(agent: TradingAgent): Promise<string>

  // CRUD operations
  async getAgent(id: string): Promise<TradingAgent>
  async listAgents(): Promise<TradingAgent[]>
  async updateAgent(id: string, updates: Partial<TradingAgent>)
  async deleteAgent(id: string)
}
```

#### 3. Agent Learning Service
**File:** `backend/src/services/agent-learning.service.ts`

```typescript
class AgentLearningService {
  // Run complete learning iteration
  async runIteration(agentId: string): Promise<IterationResult> {
    // 1. Generate strategy (scan + execution) using agent's prompt
    const strategy = await this.generateStrategy(agentId);

    // 2. Run scan on existing cached data
    const scanResults = await this.executeScan(strategy.scanScript);

    // 3. Enrich with market context
    const enriched = await marketContext.enrichResults(scanResults);

    // 4. Run backtest
    const backtest = await this.runBacktest(strategy.executionScript, enriched);

    // 5. Agent analyzes results as expert trader
    const analysis = await this.analyzeResults(agentId, backtest, enriched);

    // 6. Agent proposes refinements
    const refinements = await this.proposeRefinements(agentId, analysis);

    // 7. Store iteration + knowledge
    await this.saveIteration(agentId, { strategy, backtest, analysis, refinements });

    return { strategy, backtest, analysis, refinements };
  }

  // Agent generates its own strategy
  async generateStrategy(agentId: string): Promise<{
    scanScript: string;
    executionScript: string;
    rationale: string;
  }>

  // Agent analyzes results with its personality
  async analyzeResults(
    agentId: string,
    backtest: BacktestResult,
    context: MarketContext[]
  ): Promise<ExpertAnalysis>

  // Apply refinements → create new version
  async applyRefinements(
    agentId: string,
    iterationId: string,
    approved: boolean
  ): Promise<StrategyVersion>
}
```

#### 4. Market Context Service (Enhanced)
**File:** `backend/src/services/market-context.service.ts`

```typescript
class MarketContextService {
  // Add support/resistance calculation
  async calculatePivots(ticker: string, date: string): Promise<PivotLevels>

  // Detect horizontal S/R levels from price action
  async detectSupportResistance(
    ticker: string,
    lookback: number
  ): Promise<Level[]>

  // Get market regime (VIX, SPY trend)
  async getMarketRegime(date: string): Promise<MarketRegime>

  // Fetch news from Polygon.io
  async getNews(ticker: string, date: string): Promise<NewsEvent[]>

  // Enrich scan results with context
  async enrichScanResults(
    matches: ScanMatch[]
  ): Promise<Array<ScanMatch & MarketContext>>
}
```

#### 5. API Endpoints
**File:** `backend/src/api/routes/agents.ts`

```typescript
// Agent CRUD
POST   /api/agents/create
GET    /api/agents
GET    /api/agents/:id
PUT    /api/agents/:id
DELETE /api/agents/:id

// Learning iterations
POST   /api/agents/:id/iterations/start
GET    /api/agents/:id/iterations
GET    /api/agents/:id/iterations/:iteration_id
POST   /api/agents/:id/iterations/:iteration_id/apply-refinements

// Strategy versions
GET    /api/agents/:id/strategies
GET    /api/agents/:id/strategies/:version

// Knowledge base
GET    /api/agents/:id/knowledge
```

#### 6. Frontend Components

**AgentDashboard.tsx** - Main overview
```tsx
┌──────────────────────────────────────────────┐
│ TRADING AGENTS                               │
├──────────────────────────────────────────────┤
│ [+ Create New Agent]                         │
│                                              │
│ 📊 VWAP Guardian                             │
│    Status: Learning • 3 iterations           │
│    Performance: 82% WR, 2.1 Sharpe           │
│    Focus: VWAP bounces • Conservative        │
│    [Start Iteration] [Details]               │
│                                              │
│ 🎯 Gap Hunter                                │
│    Status: Learning • 5 iterations           │
│    Performance: 68% WR, 1.8 Sharpe           │
│    Focus: Gap & Go • Aggressive              │
│    [Start Iteration] [Details]               │
└──────────────────────────────────────────────┘
```

**AgentCreation.tsx** - Natural language agent creation
```tsx
┌──────────────────────────────────────────────┐
│ CREATE TRADING AGENT                         │
├──────────────────────────────────────────────┤
│ Agent Name: [________________________]       │
│                                              │
│ Instructions (describe the agent):           │
│ ┌──────────────────────────────────────────┐ │
│ │ Create a conservative VWAP scalper that  │ │
│ │ trades tech stocks during market hours.  │ │
│ │ Use tight stops and quick profit targets│ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [Create Agent]                               │
└──────────────────────────────────────────────┘

// After creation
┌──────────────────────────────────────────────┐
│ ✓ Agent Created                              │
├──────────────────────────────────────────────┤
│ Detected Personality:                        │
│ • Risk: Conservative                         │
│ • Style: Scalper                             │
│ • Focus: VWAP patterns                       │
│ • Markets: Trending, Ranging                 │
│                                              │
│ [Start First Learning Cycle]                 │
└──────────────────────────────────────────────┘
```

**AgentIterationView.tsx** - Learning iteration results
```tsx
┌──────────────────────────────────────────────┐
│ VWAP Guardian - Iteration 3                  │
├──────────────────────────────────────────────┤
│ 📊 RESULTS                                   │
│ • Signals: 18 VWAP bounces                   │
│ • Win Rate: 77.8% (+12% from v1.0)           │
│ • Sharpe: 2.0                                │
│ • Total Return: +17.2%                       │
│                                              │
│ 🧠 AGENT'S ANALYSIS                          │
│                                              │
│ "The refinements worked well. I've learned:  │
│  • 3x volume filter crucial (no false sigs)  │
│  • Morning setups (10-11 AM): 87.5% WR       │
│  • Resistance check saved 3 failing trades   │
│                                              │
│  Remaining issues:                           │
│  • 4 losses occurred on bearish SPY days     │
│                                              │
│  💡 Suggested refinement:                     │
│  Add market regime filter - only trade when  │
│  SPY is flat or up. Projected: 78% → 85% WR" │
│                                              │
│ [Apply Refinements] [Edit] [Discard]         │
└──────────────────────────────────────────────┘
```

### Phase 1 Deliverables

**Backend:**
- Agent management service
- Agent learning service
- Market context service (S/R, news, regime)
- Database schema (4 tables)
- API endpoints (15 routes)

**Frontend:**
- Agent dashboard
- Agent creation modal
- Iteration results view
- Basic agent detail page

**Database Additions:**
- Support/resistance levels table
- News events table (Polygon.io integration)
- Market regime tracking (VIX, SPY)

### Phase 1 Success Criteria
- ✅ Create agent from natural language
- ✅ Agent runs learning iterations autonomously
- ✅ Agent analyzes results and suggests refinements
- ✅ Agent accumulates knowledge over iterations
- ✅ User can approve/reject refinements
- ✅ Win rate improvement iteration-over-iteration

---

## Phase 2: Agent Autonomy & Tools (Week 3-4)

### Goal
Agents gain autonomy to request data, create universes, introspect codebase, and propose personality changes. Cost-optimized MCP integration.

### Components

#### 1. MCP Integration with Caching
**File:** `backend/src/services/mcp-polygon.service.ts`

**Strategy:** Cache-first to minimize token costs. MCP for metadata queries and new data.

#### 2. Agent Data Request Service
- Budget tracking per agent
- Auto-approve small requests
- Queue large requests for user approval

#### 3. Dynamic Universe Service
- Agents create custom universes (earnings, high IV, etc.)
- User approval required
- Daily refresh for dynamic criteria

#### 4. Personality Evolution Service
- Agents propose personality changes
- Show before/after performance projection
- User approval required

#### 5. Codebase Introspection
- Read indicator library
- Read database schema
- Learn from other agents' strategies
- Search for functionality

### Phase 2 Deliverables

**Backend:**
- MCP Polygon integration with caching
- Agent data request service + budget tracking
- Dynamic universe service
- Personality evolution service
- Codebase introspection service

**Frontend:**
- Data request approval UI
- Personality evolution approval UI
- Agent resource usage dashboard
- Custom universe management

### Cost Optimization
- Cache-first strategy (check DB before MCP)
- Smart summarization for large datasets
- Lazy loading (fetch only when needed)
- Budget limits per agent per day
- Expected cost: $0.10-$0.50 per iteration

---

## Implementation Steps - Phase 1

### Backend (Week 1)

1. **Database Migration**
   - Create 4 new tables for agents
   - Add support/resistance tables
   - Add news events table

2. **Agent Management Service**
   - Natural language → personality extraction
   - System prompt generation
   - CRUD operations

3. **Agent Learning Service**
   - Strategy generation (scan + execution)
   - Backtest execution
   - Result analysis
   - Refinement suggestions

4. **Market Context Service**
   - Pivot point calculation
   - S/R level detection
   - Market regime detection (VIX, SPY)
   - News integration (Polygon.io)

5. **API Routes**
   - Agent CRUD endpoints
   - Learning iteration endpoints
   - Knowledge base endpoints

### Frontend (Week 2)

6. **Agent Dashboard**
   - List all agents
   - Status and performance summary
   - Quick actions

7. **Agent Creation Modal**
   - Natural language input
   - Show detected personality
   - Edit before creation

8. **Agent Iteration View**
   - Results display
   - Expert analysis
   - Refinement suggestions
   - Approve/reject flow

9. **Integration**
   - Connect to backend APIs
   - Add to main navigation
   - Replace old Scanner/Backtest tabs

---

## Timeline

**Week 1:** Phase 1 Backend (database, services)
**Week 2:** Phase 1 Frontend (dashboard, iteration UI)
**Week 3:** Phase 2 Autonomy (MCP, data requests)
**Week 4:** Phase 2 Polish (evolution, introspection)

**Total:** 4 weeks to full autonomous agents

---

## Example Agent Workflows

### Workflow 1: Create and Train Agent

```
Day 1:
User: "Create a conservative VWAP scalper for tech stocks"
→ Agent created with personality traits extracted
→ System prompt generated

Day 2:
User: "Start learning cycle"
→ Agent generates scan + execution strategy
→ Finds 25 VWAP bounces
→ Backtests: 66% win rate, 1.4 Sharpe
→ Agent analyzes: "Volume confirmation crucial"
→ Suggests: Add 3x volume filter

Day 3:
User: "Approve refinements"
→ Agent generates v1.1 with volume filter
→ Tests: 78% win rate, 2.0 Sharpe ✨
→ Agent learns: "3x volume filter works"

Day 7:
Agent after 5 iterations:
→ 85% win rate, 2.4 Sharpe
→ Knowledge base: 12 insights accumulated
→ Ready for paper trading
```

### Workflow 2: Agent Evolution

```
Week 2:
Agent discovers: "I'm too aggressive, getting stopped out"
→ Proposes: risk_tolerance → moderate
→ Shows: Would improve Sharpe 1.6 → 2.1
→ User approves evolution
→ Agent personality updated

Week 3:
Agent expands focus: "VWAP bounces work best at support levels"
→ Learns about support/resistance
→ Refines strategy to require near support
→ Win rate: 85% → 92%
```

### Workflow 3: Multi-Agent Portfolio

```
Month 1:
User manages 3 agents:
• VWAP Guardian: 82% WR, $4,200 PnL
• Gap Hunter: 68% WR, $6,800 PnL
• Reversal Artist: 74% WR, $3,100 PnL

Total: $14,100 profit
Each agent specialized in its niche
User oversees like hedge fund manager
```

---

## Key Design Decisions

### 1. Agent Personality
- **Extracted from natural language** using Claude
- Defines: risk tolerance, trading style, pattern focus, market conditions
- **Can evolve** based on performance (Phase 2)

### 2. Independent Knowledge
- Each agent has **private knowledge base**
- No sharing between agents (maintains specialization)
- Knowledge accumulates over iterations

### 3. User as Portfolio Manager
- User creates and oversees multiple specialist agents
- Approves refinements and evolutions
- Monitors performance dashboard
- Controls budget and autonomy settings (Phase 2)

### 4. Learning Loop
- User-triggered iterations (not automatic)
- Agent proposes, user approves
- Clear feedback at each step
- Measurable improvement tracking

### 5. Cost Optimization (Phase 2)
- Cache-first for all data access
- MCP for metadata and exploration only
- Budget limits prevent runaway costs
- Target: <$1 per agent per day

---

## Success Metrics

### Phase 1
- Create agent from natural language ✅
- Run learning iterations ✅
- Agent analyzes and suggests refinements ✅
- Knowledge accumulates ✅
- Win rate improves iteration-over-iteration ✅

### Phase 2
- Agents request data autonomously ✅
- MCP integration with low token cost ✅
- Agents create custom universes ✅
- Agents propose personality changes ✅
- Cost stays <$1/agent/day ✅

### Long-term
- 5+ specialized agents running
- Portfolio-level profitability
- Agents evolve and adapt to markets
- User as "hedge fund manager"
