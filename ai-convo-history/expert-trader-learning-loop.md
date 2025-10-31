AI Trading Laboratory - Expert Trader Learning Loop

 Architecture Overview

 Core Principle: Claude acts as an expert trader who:
 1. Generates pattern-specific strategies using trading knowledge
 2. Analyzes backtest results with trader intuition
 3. Suggests refinements based on what worked/failed
 4. Learns over time by accumulating pattern knowledge

 Data Flow

 User: "Find VWAP crossover to downside"
     ↓
 [1. GENERATE] Claude Expert Trader generates:
     - Scan script (find the pattern)
     - Execution strategy (how to trade it)
     - Context: "For bearish VWAP crosses, I place stops just above VWAP
                with targets at LOD and prior day low"
     ↓
 [2. EXECUTE] Run scan + backtest
     - 25 bearish VWAP crosses found
     - Strategy tested: 60% win, 1.2 Sharpe
     ↓
 [3. ANALYZE] Claude analyzes as expert:
     - Reviews winning vs losing trades
     - Checks market context (S/R levels, news, volume patterns)
     - Identifies what separated winners from losers
     ↓
 [4. SUGGEST] Claude proposes refinements:
     - Scan improvements: "Add volume >= 2.5x filter"
     - Parameter tuning: "Tighten stop to 0.15% vs 0.2%"
     - Missing data: "Check if price near support level"
     ↓
 [5. ITERATE] User approves → test refined version
     ↓
 [6. LEARN] Store knowledge:
     - "VWAP bearish crosses work best with 0.15% stops"
     - "Volume confirmation critical for this pattern"

 Implementation Components

 1. Claude Expert Trader Service

 File: backend/src/services/claude-expert-trader.service.ts

 Core Method:
 async generateStrategyFromScan(
   naturalLanguage: string,
   context?: MarketContext
 ): Promise<{
   scanScript: string,
   executionScript: string,
   tradingRationale: string,
   tunableParameters: Parameter[]
 }>

 Expert Trader System Prompt:
 You are an expert day trader with 20 years of experience trading technical patterns.

 Your trading philosophy:
 - Every pattern has key levels where stops should be placed
 - Support/resistance levels are critical for targets and stops
 - Volume confirms price action - require volume confirmation
 - Time of day matters - avoid first 5 minutes, last 10 minutes
 - News/catalysts can invalidate technical patterns
 - Risk management is paramount - always define stop loss first

 When generating execution strategies:
 1. Identify the pattern's key reference points (VWAP, prior bar, LOD, HOD, etc.)
 2. Place stops at logical invalidation points, not arbitrary percentages
 3. Use multi-target approach: First target at obvious level, second at next key level
 4. Consider partial exits - lock in profits while letting runners work
 5. Account for spread and slippage - especially important for small edges

 Common patterns you know well:
 - VWAP crosses: Stop at VWAP ± small buffer, target at LOD/HOD or prior day levels
 - ORB: Stop at opposite side of range, target at 1-2x range size
 - Failed breakouts: Stop beyond recent high/low, quick profit target
 - Capitulation: Wide stop (below panic low), target at VWAP or prior support
 - Gap fills: Stop beyond gap level, target at gap close

 Current market knowledge you've accumulated:
 {PATTERN_KNOWLEDGE_FROM_DB}

 Available market data for context:
 - Support/resistance levels
 - Recent news/catalysts
 - Market regime (VIX, SPY trend)
 - Volume patterns
 - Earnings dates

 Key Methods:

 class ClaudeExpertTraderService {
   // Generate initial strategy
   async generateStrategyFromScan(query: string): Promise<StrategyGeneration>

   // Analyze backtest results
   async analyzeResults(
     backtest: BacktestResult,
     scanMatches: ScanMatch[],
     marketContext: MarketContext[]
   ): Promise<ExpertAnalysis>

   // Suggest refinements
   async suggestRefinements(
     analysis: ExpertAnalysis,
     currentScan: string,
     currentStrategy: string
   ): Promise<Refinements>

   // Identify tunable parameters
   async identifyTunableParams(
     scanScript: string,
     strategyScript: string
   ): Promise<Parameter[]>

   // Generate refined scripts with new parameter values
   async generateRefinedScripts(
     originalScripts: Scripts,
     parameterChanges: ParameterChange[]
   ): Promise<Scripts>
 }

 2. Market Context Service

 File: backend/src/services/market-context.service.ts

 Fetches contextual data to inform Claude's analysis:

 interface MarketContext {
   ticker: string;
   date: string;

   // Support/Resistance
   nearestSupport: { price: number; strength: number; distance: number };
   nearestResistance: { price: number; strength: number; distance: number };
   pivotPoints: { daily: number; weekly: number; r1: number; s1: number };

   // News/Catalysts
   recentNews: Array<{
     headline: string;
     timestamp: string;
     sentiment: 'positive' | 'negative' | 'neutral';
     impact: number;
   }>;

   hasEarnings: boolean;
   earningsDetails?: { expectedEPS: number; actualEPS: number; surprise: number };

   // Market Regime
   marketRegime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
   vix: number;
   spyTrend: 'bullish' | 'bearish' | 'neutral';

   // Volume/Price Context
   volumeRatio: number;  // vs 20-day avg
   pricePosition: 'near_high' | 'near_low' | 'middle';
   dayRange: number;  // high-low %
 }

 class MarketContextService {
   async getContextForTrade(
     ticker: string,
     date: string,
     time?: string
   ): Promise<MarketContext>

   async enrichScanResults(
     matches: ScanMatch[]
   ): Promise<Array<ScanMatch & MarketContext>>
 }

 3. Support/Resistance Service (NEW)

 File: backend/src/services/support-resistance.service.ts

 class SupportResistanceService {
   // Calculate pivot points (standard, Fibonacci, Camarilla)
   async calculatePivots(
     ticker: string,
     date: string
   ): Promise<PivotLevels>

   // Detect horizontal S/R levels from price action
   async detectLevels(
     ticker: string,
     lookbackDays: number = 30
   ): Promise<SupportResistanceLevel[]>

   // Find nearest levels to current price
   async findNearestLevels(
     ticker: string,
     currentPrice: number
   ): Promise<{ support: Level; resistance: Level }>
 }

 // Algorithm for horizontal level detection:
 // 1. Find swing highs/lows in last N bars
 // 2. Cluster nearby levels (within 0.5%)
 // 3. Calculate strength: # of touches × volume at level
 // 4. Return top 5 support and top 5 resistance levels

 Database:
 CREATE TABLE support_resistance_levels (
   ticker TEXT NOT NULL,
   level_type TEXT NOT NULL,  -- 'SUPPORT', 'RESISTANCE'
   price REAL NOT NULL,
   strength INTEGER,  -- 0-100
   first_touch_date TEXT,
   last_touch_date TEXT,
   touch_count INTEGER,
   calculation_method TEXT,  -- 'PIVOT', 'SWING', 'FIBONACCI'
   PRIMARY KEY (ticker, level_type, price)
 );

 CREATE TABLE pivot_points_cache (
   ticker TEXT NOT NULL,
   date TEXT NOT NULL,
   timeframe TEXT,  -- 'daily', 'weekly', 'monthly'
   pivot REAL,
   r1 REAL, r2 REAL, r3 REAL,
   s1 REAL, s2 REAL, s3 REAL,
   PRIMARY KEY (ticker, date, timeframe)
 );

 4. News Integration Service (NEW)

 File: backend/src/services/news.service.ts

 class NewsService {
   // Fetch news from Polygon.io (already have API access)
   async fetchNews(
     ticker: string,
     startDate: string,
     endDate: string
   ): Promise<NewsEvent[]>

   // Use Claude to analyze sentiment
   async analyzeSentiment(
     headline: string,
     summary: string
   ): Promise<{ sentiment: string; impact: number; reasoning: string }>

   // Check for major catalysts
   async detectCatalysts(
     ticker: string,
     date: string
   ): Promise<Catalyst[]>
 }

 Database:
 CREATE TABLE news_events (
   id TEXT PRIMARY KEY,
   ticker TEXT NOT NULL,
   published_at TEXT NOT NULL,
   headline TEXT,
   summary TEXT,
   source TEXT,
   url TEXT,
   sentiment TEXT,  -- Analyzed by Claude
   impact_score INTEGER,  -- 0-100
   created_at TEXT
 );

 CREATE INDEX idx_news_ticker_date ON news_events(ticker, published_at);

 5. Pattern Knowledge Database (NEW)

 File: backend/src/services/pattern-knowledge.service.ts

 Stores what Claude learns over time:

 class PatternKnowledgeService {
   // Record insights from analysis
   async recordInsight(
     patternType: string,
     insight: string,
     supportingData: any
   ): Promise<void>

   // Retrieve accumulated knowledge for a pattern
   async getPatternKnowledge(
     patternType: string
   ): Promise<PatternKnowledge>

   // Update parameter preferences based on results
   async updateParameterPreference(
     patternType: string,
     parameter: string,
     value: number,
     performance: number
   ): Promise<void>
 }

 Database:
 CREATE TABLE pattern_knowledge (
   id TEXT PRIMARY KEY,
   pattern_type TEXT NOT NULL,  -- 'vwap_bearish_cross', 'orb_breakout', etc.
   insight_type TEXT,  -- 'PARAMETER_PREFERENCE', 'FILTER_SUGGESTION', 'CONTEXT_RULE'
   insight TEXT,  -- Human-readable insight
   supporting_data JSON,  -- Stats, examples
   confidence_score REAL,  -- 0-1 based on sample size
   created_at TEXT,
   updated_at TEXT
 );

 CREATE TABLE parameter_performance (
   pattern_type TEXT NOT NULL,
   parameter_name TEXT NOT NULL,
   parameter_value REAL NOT NULL,
   tests_count INTEGER DEFAULT 0,
   avg_win_rate REAL,
   avg_sharpe REAL,
   last_tested TEXT,
   PRIMARY KEY (pattern_type, parameter_name, parameter_value)
 );

 6. Learning Loop Service (Orchestrator)

 File: backend/src/services/learning-loop.service.ts

 class LearningLoopService {
   // Execute complete learning iteration
   async runIteration(
     scanId: string,
     strategyId: string,
     version: number
   ): Promise<IterationResult>

   // The full cycle
   async executeLearningCycle(
     naturalLanguageQuery: string
   ): Promise<{
     iteration: number;
     scanResults: ScanMatch[];
     backtestResults: BacktestResult;
     expertAnalysis: ExpertAnalysis;
     refinements: Refinements;
     status: 'needs_approval' | 'threshold_met' | 'max_iterations';
   }>
 }

 Flow:
 async executeLearningCycle(query: string) {
   // 1. Generate initial strategy
   const { scanScript, executionScript, tunableParameters } =
     await expertTrader.generateStrategyFromScan(query);

   // 2. Run scan
   const scanResults = await scanner.executeScan(scanScript);

   // 3. Enrich with market context
   const enrichedResults = await marketContext.enrichScanResults(scanResults);

   // 4. Run backtest
   const backtestResults = await backtest.testStrategy(
     executionScript,
     enrichedResults
   );

   // 5. Claude analyzes results as expert
   const analysis = await expertTrader.analyzeResults(
     backtestResults,
     enrichedResults,
     marketContextData
   );

   // 6. Claude suggests refinements
   const refinements = await expertTrader.suggestRefinements(
     analysis,
     scanScript,
     executionScript
   );

   // 7. Store insights
   await patternKnowledge.recordInsights(analysis.insights);

   return {
     scanResults: enrichedResults,
     backtestResults,
     expertAnalysis: analysis,
     refinements,
     status: 'needs_approval'
   };
 }

 7. Parameter Tuning System

 How Claude identifies tunable parameters:

 interface TunableParameter {
   name: string;
   description: string;
   currentValue: number;
   suggestedValue: number;
   reasoning: string;
   location: {
     script: 'scan' | 'execution';
     lineNumber: number;
     variableName: string;
   };
 }

 // Example from Claude's analysis:
 {
   name: "stop_distance_from_vwap",
   description: "Stop loss distance above VWAP",
   currentValue: 0.002,  // 0.2%
   suggestedValue: 0.0015,  // 0.15%
   reasoning: "8 losing trades were stopped out when VWAP recrossed within 0.2%. Tightening to 0.15% would have saved 5 of those trades.",
   location: {
     script: 'execution',
     lineNumber: 45,
     variableName: 'stopDistance'
   }
 }

 Script modification approach:
 - Claude identifies numeric constants in generated scripts
 - Adds comments marking tunable parameters
 - Generates new script version with modified values
 - Tracks parameter history for each pattern type

 8. API Endpoints

 File: backend/src/api/routes/laboratory.ts

 POST /api/laboratory/generate-strategy
   Body: { query: string }
   Returns: { scanScript, executionScript, rationale, tunableParams }

 POST /api/laboratory/run-learning-cycle
   Body: { query: string }
   Returns: { scanResults, backtestResults, analysis, refinements }

 POST /api/laboratory/apply-refinements
   Body: { originalScripts, parameterChanges }
   Returns: { refinedScanScript, refinedExecutionScript }

 POST /api/laboratory/test-refined-version
   Body: { refinedScripts }
   Returns: { backtestResults, comparison }

 GET /api/laboratory/pattern-knowledge/:patternType
   Returns: { insights, parameterPreferences, historicalPerformance }

 9. Laboratory UI

 File: frontend/src/components/Laboratory.tsx

 // Step 1: Generate
 ┌─────────────────────────────────────────────┐
 │ Enter Pattern: "Find VWAP crossover down"   │
 │ [Generate Strategy]                         │
 └─────────────────────────────────────────────┘

 // Step 2: Review Strategy
 ┌─────────────────────────────────────────────┐
 │ 🤖 Expert Trader Strategy                   │
 │                                             │
 │ "For bearish VWAP crosses, I recommend:    │
 │  • Entry: Next bar after VWAP cross down   │
 │  • Stop: 0.2% above VWAP (invalidation)    │
 │  • Target 1: Low of day (50% position)     │
 │  • Target 2: Prior day low (50% position)  │
 │  • Time filter: Avoid first 15 minutes     │
 │                                             │
 │  This pattern works best with volume       │
 │  confirmation (>2x average) and when       │
 │  market isn't oversold (RSI > 25)."        │
 │                                             │
 │ [Test This Strategy]  [Modify]              │
 └─────────────────────────────────────────────┘

 // Step 3: Results & Analysis
 ┌─────────────────────────────────────────────┐
 │ 📊 BACKTEST RESULTS                         │
 │ 25 signals found • Win Rate: 60% • 1.2 Sharpe│
 │                                             │
 │ 🔍 EXPERT ANALYSIS                          │
 │                                             │
 │ What Worked:                                │
 │ ✓ Avg winner had 3.2x volume (vs 1.8x loser)│
 │ ✓ All trades near support level succeeded  │
 │ ✓ Prior day low target hit 85% of the time │
 │                                             │
 │ What Failed:                                │
 │ ✗ 8 losses recrossed VWAP within 2 bars    │
 │ ✗ 3 losses had news catalyst (gap reversal)│
 │ ✗ Stops too wide - avg loss -1.2% vs +2.1% win│
 │                                             │
 │ 💡 SUGGESTED REFINEMENTS                     │
 │                                             │
 │ 1. Scan Filter: Add "volume_ratio >= 2.5"  │
 │    → Would eliminate 7 losing trades        │
 │                                             │
 │ 2. Stop Tightening: 0.2% → 0.15% above VWAP│
 │    → Would save 5 trades from early stop    │
 │                                             │
 │ 3. Catalyst Filter: Skip if news in last 2hr│
 │    → Would avoid 3 news-driven reversals    │
 │                                             │
 │ 4. Missing Data: Check S/R levels           │
 │    → Winners were 0.8% from support avg     │
 │                                             │
 │ Projected Improvement: 60% → 76% win rate   │
 │                                             │
 │ [Test Refined Version] [Manual Tweaks]      │
 └─────────────────────────────────────────────┘

 // Step 4: Refinement Results
 ┌─────────────────────────────────────────────┐
 │ 📊 REFINED VERSION RESULTS                  │
 │                                             │
 │ Version 1: 60% win, 1.2 Sharpe              │
 │ Version 2: 76% win, 1.9 Sharpe ⭐           │
 │                                             │
 │ Changes Applied:                            │
 │ • Volume filter: >= 2.5x                    │
 │ • Stop: 0.15% (was 0.2%)                    │
 │ • News filter: Skip if catalyst in 2hr     │
 │                                             │
 │ Signals: 25 → 18 (more selective)           │
 │ Total Return: +12.8% → +16.4%               │
 │                                             │
 │ 💾 This pattern-strategy combo has been     │
 │    saved to your library as:                │
 │    "VWAP Bearish Cross v2.0"                │
 │                                             │
 │ [Deploy to Live Agent] [Iterate Again]      │
 └─────────────────────────────────────────────┘

 10. Example Expert Analysis Output

 {
   expertAnalysis: {
     summary: "This VWAP bearish cross pattern shows promise but needs refinement...",

     workingElements: [
       {
         element: "Volume confirmation",
         evidence: "Winners avg 3.2x volume vs losers 1.8x",
         confidence: 0.85
       },
       {
         element: "Prior day low target",
         evidence: "Target hit in 85% of trades, avg profit +2.1%",
         confidence: 0.90
       }
     ],

     failurePoints: [
       {
         issue: "Stop loss too wide",
         evidence: "8 trades recrossed VWAP and stopped out at -1.2% avg",
         impact: "Cost 5.6% in avoidable losses",
         suggestedFix: "Tighten stop from 0.2% to 0.15%"
       },
       {
         issue: "News interference",
         evidence: "3 losses occurred within 2hr of breaking news",
         impact: "3/10 losses = 30% of failures",
         suggestedFix: "Add news filter via Polygon.io API"
       }
     ],

     missingContext: [
       {
         dataType: "Support/Resistance levels",
         reasoning: "Winners avg 0.8% from nearest support. May be key factor.",
         recommendation: "Implement S/R service, add to scan criteria"
       }
     ],

     parameterRecommendations: [
       {
         parameter: "stop_distance",
         currentValue: 0.002,
         recommendedValue: 0.0015,
         expectedImprovement: "Save 5 trades = +6% win rate"
       },
       {
         parameter: "min_volume_ratio",
         currentValue: null,
         recommendedValue: 2.5,
         expectedImprovement: "Eliminate 7 low-quality signals"
       }
     ],

     projectedPerformance: {
       current: { winRate: 0.60, sharpe: 1.2 },
       withRefinements: { winRate: 0.76, sharpe: 1.9 },
       confidence: 0.75
     }
   }
 }

 Implementation Priority

 Phase 1: Core Learning Loop (Week 1)

 1. Enhanced Claude Expert Trader Service
   - System prompt with trading knowledge
   - Generate scan + execution together
   - Analyze results with expert perspective
   - Suggest refinements
 2. Parameter identification system
   - Parse scripts for tunable values
   - Track parameter performance
 3. Basic Laboratory UI
   - Generate → Test → Analyze → Refine workflow

 Phase 2: Market Context (Week 2)

 4. Support/Resistance Service
   - Pivot point calculation
   - Horizontal level detection
   - Database + caching
 5. News Integration
   - Polygon.io news API
   - Sentiment analysis via Claude
   - Catalyst detection
 6. Market Context Service
   - VIX/SPY/QQQ tracking
   - Market regime detection
   - Enrich scan results with context

 Phase 3: Knowledge Accumulation (Week 3)

 7. Pattern Knowledge Database
   - Store insights from analyses
   - Track parameter preferences
   - Build pattern library over time
 8. Advanced refinement
   - Multi-parameter optimization
   - Pattern health monitoring
   - Auto-suggest based on accumulated knowledge

 Expected User Experience

 Day 1:
 User: "Find VWAP downside crosses"
 Claude: Generates strategy with 60% win rate
 Learning: Initial baseline

 Day 2:
 Claude suggests refinements based on Day 1 results
 Refined version: 76% win rate
 Learning: "This pattern needs tight stops + volume filter"

 Day 7:
 User scans for VWAP crosses again
 Claude: "Based on 6 previous tests, I recommend 0.15% stops and 2.5x volume"
 New scan automatically uses proven parameters
 Win rate: 78% (knowledge accumulated)

 Day 30:
 Pattern library has 25 proven setups
 Each with optimal parameters learned from backtesting
 Agent can trade any pattern with confidence

 Files to Create

 Backend (10 new, 2 modified):
 - services/claude-expert-trader.service.ts ⭐ Core
 - services/market-context.service.ts
 - services/support-resistance.service.ts
 - services/news.service.ts
 - services/pattern-knowledge.service.ts
 - services/learning-loop.service.ts
 - api/routes/laboratory.ts
 - types/laboratory.types.ts
 - database/migrations/007_market_context.sql
 - database/migrations/008_pattern_knowledge.sql
 - services/claude.service.ts (MODIFY)
 - api/index.ts (MODIFY)

 Frontend (3 new, 1 modified):
 - components/Laboratory.tsx ⭐ Main UI
 - components/ExpertAnalysis.tsx
 - services/laboratoryApi.ts
 - App.tsx (MODIFY)

 Success Metrics

 - Generate scan + strategy in one step: ✓
 - Backtest results include expert analysis: ✓
 - Refinement suggestions with projected improvement: ✓
 - Parameter tuning based on results: ✓
 - Knowledge accumulation over time: ✓
 - Win rate improvement iteration-to-iteration: Target +10-20%
