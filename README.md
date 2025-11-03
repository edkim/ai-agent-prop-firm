# 🧠 AI Learning Laboratory - Autonomous Trading Strategy Evolution

**An AI-powered platform where trading agents autonomously learn, evolve, and optimize strategies through continuous backtesting iterations.**

```
Natural Language Instructions → Learning Agent Created → Autonomous Learning Loop

"Find parabolic exhaustion patterns after 100%+ moves in 3 days"
         ↓
Agent runs iteration 1:  60 signals found, 45% win rate
         ↓
Agent analyzes results and self-improves
         ↓
Agent runs iteration 2:  28 signals found, 67% win rate  ← Quality over quantity
         ↓
Agent continues learning... iteration 22 with manual guidance
```

---

## 🎯 What Makes This Different

### Traditional Backtesting
❌ Write strategy → Test once → Manually tweak → Test again → Repeat forever
❌ Human bottleneck in the optimization loop
❌ No memory of what was tried before
❌ Strategies don't adapt to changing conditions

### Learning Laboratory
✅ **Autonomous Learning Loop**: Agents generate strategies, backtest them, analyze results, and self-improve
✅ **Knowledge Accumulation**: Each iteration builds on previous learnings
✅ **Manual Guidance**: Steer the learning process with specific instructions
✅ **Version Control**: Full history of strategy evolution with performance metrics
✅ **Multi-Agent System**: Run multiple agents learning different patterns simultaneously

---

## ✨ Latest Feature: Manual Guidance (2025-11-03)

**Take control of the learning process while maintaining automation**

Users can now provide specific guidance to steer iteration outcomes:

```
Manual Guidance Input:
"Scan the last 2 YEARS of data, not just 60 days.
Include stocks with 100%+ gain in 5 OR FEWER days (not just 3).
Relax RSI filters - make them optional.
Minimum price $1.00 to capture penny stock moves like BYND."

Result: Iteration 22 found 15 signals including BYND's 454% move
- 60% win rate
- 2.74 Sharpe ratio
- Successfully detected patterns that previous automated iterations missed
```

**How It Works:**
1. Open Learning Laboratory → Select Agent → View Iterations
2. Click "+ Add Manual Guidance"
3. Describe what you want the next iteration to focus on
4. Agent incorporates your guidance with **priority** over automated learnings
5. Manual guidance stored in database for full transparency

**Use Cases:**
- Relax filters when too few signals found
- Extend lookback period for rare patterns
- Focus on specific price ranges or market conditions
- Test hypotheses while maintaining the learning loop

---

## 🧪 The Learning Laboratory

### Core Concept: Autonomous Strategy Evolution

The Learning Laboratory is a **multi-agent system** where each agent:

1. **Generates Trading Strategies** (via Claude AI)
   - Creates TypeScript scanners from natural language instructions
   - Designs execution logic with entry/exit rules
   - Documents assumptions and rationale

2. **Runs Backtests** (automated)
   - Executes scanner over historical data
   - Tests signals with multiple execution templates
   - Calculates win rate, Sharpe ratio, total return

3. **Analyzes Performance** (AI-powered)
   - Expert analysis of what worked and what didn't
   - Identifies patterns in winning vs losing trades
   - Suggests specific refinements for next iteration

4. **Self-Improves** (autonomous)
   - Applies learnings to generate improved strategy
   - Adjusts filters, timing, risk parameters
   - Builds on accumulated knowledge base

5. **Repeats** (continuous learning)
   - Each iteration is smarter than the last
   - Knowledge compounds over time
   - Strategies adapt to changing market conditions

---

## 🚀 Quick Start: Create Your First Learning Agent

### 1. Install & Setup

```bash
# Clone and install
git clone https://github.com/edkim/ai-backtest.git
cd ai-backtest

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# Configure (backend/.env)
ANTHROPIC_API_KEY=your_anthropic_key
POLYGON_API_KEY=your_polygon_key
DATABASE_PATH=./backtesting.db
```

### 2. Start the Platform

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev

# Access: http://localhost:5173
```

### 3. Create a Learning Agent

**Via UI:**
1. Open http://localhost:5173
2. Click "Learning Laboratory"
3. Click "+ Create New Agent"
4. Describe strategy in natural language:

```
Find parabolic exhaustion patterns: stocks that rise 100%+ in 3 days,
then close below VWAP with volume confirmation. Short when exhaustion
is detected. Target 10-20% profit, stop at previous day high.
```

**Via API:**
```bash
curl -X POST http://localhost:3000/api/learning-agents/create \
  -H "Content-Type: application/json" \
  -d '{
    "instructions": "Find parabolic exhaustion patterns: stocks that rise 100%+ in 3 days, then close below VWAP with volume confirmation. Short when exhaustion is detected."
  }'
```

The AI automatically detects:
- **Risk Tolerance:** Moderate (from "10-20% profit")
- **Trading Style:** Day Trader (from "VWAP" and short-term signals)
- **Pattern Focus:** Mean Reversion, Momentum (from "parabolic exhaustion")

### 4. Start Learning

Click **"Start New Iteration"** and watch the magic:

```
🔄 Iteration 1 Running...
   ├─ Generating scanner strategy...
   ├─ Scanning historical data (60 days)...
   ├─ Found 45 parabolic patterns
   ├─ Running backtests (5 templates)...
   ├─ Analyzing results with AI...
   └─ ✅ Complete! Win rate: 58%, Sharpe: 1.8

📊 Agent Analysis:
   "Strategy shows promise but generates too many low-quality signals.
    Refinement needed: Tighten volume filter from 1.5x to 2.0x average,
    require RSI > 70 for better exhaustion confirmation."

🔄 Iteration 2 Running...
   └─ Applying refinements from iteration 1...
```

### 5. Provide Manual Guidance (Optional)

After a few iterations, guide the learning process:

```
Click "+ Add Manual Guidance"

Input: "The signals are too conservative. Scan the last 6 months
instead of 60 days to find more rare parabolic moves. Lower the
minimum price to $5 to capture small-cap explosions."

Result: Next iteration finds 18 signals with 72% win rate
```

---

## 🏗️ Architecture: The Learning Loop

### Single Iteration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Learning Iteration N                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────┐
        │   1. GENERATE STRATEGY              │
        │   - Read previous iteration results │
        │   - Apply manual guidance if given  │
        │   - Generate improved scanner       │
        │   - Create execution logic          │
        └─────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────┐
        │   2. EXECUTE SCANNER                │
        │   - Run TypeScript against SQLite   │
        │   - Filter by quality (score > 50)  │
        │   - Diversify (max 2 per ticker)    │
        │   - Select top 10 for backtesting   │
        └─────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────┐
        │   3. BACKTEST SIGNALS               │
        │   - 5 execution templates:          │
        │     • Conservative (2% stop, 3% target)│
        │     • Aggressive (3% stop, 6% target) │
        │     • Time-based (max 2-day hold)   │
        │     • ATR Adaptive (dynamic stops)  │
        │     • Price Action (trailing stop)  │
        └─────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────┐
        │   4. ANALYZE RESULTS                │
        │   - AI expert analysis via Claude   │
        │   - Identify winning patterns       │
        │   - Suggest 3-5 specific refinements│
        │   - Update knowledge base           │
        └─────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────┐
        │   5. STORE & LEARN                  │
        │   - Save iteration to database      │
        │   - Record all scripts and results  │
        │   - Update agent's knowledge base   │
        │   - Prepare context for iteration N+1│
        └─────────────────────────────────────┘
                              ↓
                    Repeat automatically or
                    wait for manual guidance
```

### Multi-Agent System

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Agent 1        │  │   Agent 2        │  │   Agent 3        │
│   Parabolic      │  │   VWAP Bounces   │  │   Opening Range  │
│   Exhaustion     │  │   Intraday       │  │   Breakouts      │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Shared Knowledge   │
                    │  - Market insights  │
                    │  - Parameter prefs  │
                    │  - Pattern rules    │
                    └─────────────────────┘
```

**Each agent learns independently but shares knowledge:**
- Cross-pollination of successful techniques
- Avoid repeating failed experiments
- Build collective intelligence

---

## 📊 Real Learning Results

### Case Study: Parabolic Exhaustion Agent

**Starting Point (Iteration 1):**
- Instructions: "Find parabolic moves 100%+ in 3 days, short exhaustion"
- Signals Found: 60
- Win Rate: 45%
- Sharpe Ratio: 0.8
- Issue: Too many false signals

**AI Analysis:**
```
"High signal count suggests loose filters. Many signals occur during
strong uptrends where momentum continues. Tighten entry requirements:
1. Require RSI > 70 (overbought)
2. Volume must be 2x average (not 1.5x)
3. Must close below prior day close (weakness)
4. Avoid first 30 min (fake-outs)"
```

**After Refinements (Iteration 7):**
- Signals Found: 18
- Win Rate: 67%
- Sharpe Ratio: 2.4
- Improvement: Quality over quantity

**With Manual Guidance (Iteration 22):**

User input:
```
"Scan 2 years of data. Include 100%+ moves in 5 OR FEWER days.
Relax RSI requirement. Minimum price $1.00 to catch BYND."
```

Result:
- Signals Found: 15 (including BYND's 454% move!)
- Win Rate: 60%
- Sharpe Ratio: 2.74
- Key: Manual guidance found rare patterns automated process missed

**Learning Journey:**
```
Iteration  Signals  Win%  Sharpe   Key Learning
─────────────────────────────────────────────────────────────
    1        60     45%    0.8    Too many signals
    3        35     52%    1.3    Tighter volume filter
    7        18     67%    2.4    Quality > quantity
   15        24     61%    2.1    Extended lookback
   22        15     60%    2.74   Manual guidance: 2-year scan + BYND
```

---

## 💡 Key Features

### 1. Natural Language Agent Creation

**No coding required.** Describe your strategy in plain English:

```
"I want an agent that finds stocks breaking out of consolidation patterns
with volume confirmation. Buy breakouts, hold for 2-3 days, target 5-8%
gains. Use tight stops at 2% to minimize risk."
```

**AI automatically:**
- Detects trading style (swing trader from "2-3 days")
- Determines risk tolerance (moderate from "tight 2% stops")
- Identifies patterns (momentum, breakout)
- Generates first strategy iteration

### 2. Intelligent Signal Filtering

**From 338,688 signals → 10 high-quality backtests in <1 second**

3-Stage Filter:
1. **Quality**: Pattern strength score > 50
2. **Diversification**: Max 2 signals per ticker, max 10 per date
3. **Top-N Selection**: Best 10 signals by score

Result: 99.997% reduction, 3,387x faster execution

### 3. Knowledge Base Accumulation

**Agents remember what works:**

```sql
-- Example knowledge entries
{
  type: "PARAMETER_PREF",
  insight: "Volume ratio > 2.0x more predictive than 1.5x",
  confidence: 0.85,
  learned_from_iteration: 3,
  times_validated: 5
}

{
  type: "PATTERN_RULE",
  insight: "Avoid first 30 minutes - high false signal rate",
  confidence: 0.92,
  learned_from_iteration: 5,
  times_validated: 8
}
```

**Knowledge compounds:**
- Iteration 1: 0 insights
- Iteration 5: 12 insights
- Iteration 20: 47 insights
- Each new iteration is informed by all previous learnings

### 4. Strategy Version Control

**Full audit trail:**
- Every scanner script saved
- Every backtest result recorded
- Every refinement documented
- Complete genealogy of strategy evolution

**Compare versions:**
```
Version 1.0  → Version 1.3  → Version 2.1
45% WR         67% WR         72% WR
+1.2 Sharpe   +2.4 Sharpe    +3.1 Sharpe

View diff: What changed between versions?
- Volume filter: 1.5x → 2.0x
- Added RSI > 70 requirement
- Changed timing: All day → 10 AM - 3 PM
```

### 5. Multiple Execution Templates

**Each signal tested 5 ways:**

1. **Conservative**: 2% stop, 3% target, quick exit
2. **Aggressive**: 3% stop, 6% target, swing for fences
3. **Time-Based**: Max 2-day hold, force exit
4. **ATR Adaptive**: Dynamic stops based on volatility
5. **Price Action**: Trailing stop, let winners run

**Why?** Find optimal execution for each pattern type.

### 6. Manual Guidance System

**Steer without breaking automation:**

When to use:
- ❌ Too few signals: "Relax filters"
- ❌ Too many signals: "Tighten requirements"
- 🎯 Test hypothesis: "Focus on small-caps under $10"
- 📅 Extend timeframe: "Scan last 2 years for rare events"
- 🔍 Find specific stock: "Include BYND at $1.47"

**Priority system:**
- Manual guidance takes precedence
- Automated learnings still applied
- Best of both worlds: Human intuition + AI optimization

---

## 🎨 User Interface

### Learning Laboratory Dashboard

**Main View:**
```
┌───────────────────────────────────────────────────────────────┐
│  🧠 Multi-Agent Learning Laboratory                           │
│                                            [+ Create New Agent]│
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  📊 Parabolic Exhaustion Hunter                    [View]     │
│     Status: Learning  |  Iterations: 22  |  Win Rate: 60%    │
│     Last run: 2 hours ago  |  Sharpe: 2.74                    │
│                                                                │
│  🎯 VWAP Bounce Trader                             [View]     │
│     Status: Learning  |  Iterations: 15  |  Win Rate: 58%    │
│     Last run: 1 day ago  |  Sharpe: 1.9                       │
│                                                                │
│  🚀 Opening Range Breakout                         [View]     │
│     Status: Learning  |  Iterations: 8   |  Win Rate: 52%    │
│     Last run: 3 days ago  |  Sharpe: 1.2                      │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Agent Detail View - 3 Tabs:**

**Tab 1: Iterations**
```
┌─ Manual Guidance ──────────────────────────────────────────┐
│  [+ Add] Manual Guidance                                    │
│  ┌────────────────────────────────────────────────────────┐│
│  │ Scan last 2 years. Include 100%+ moves in ≤5 days.    ││
│  │ Relax RSI filters. Min price $1.00 for penny stocks.  ││
│  └────────────────────────────────────────────────────────┘│
│                                 [Start New Iteration]       │
└─────────────────────────────────────────────────────────────┘

┌─ Learning History (22 iterations) ─────────────────────────┐
│  [📋 Iteration #22]  Win Rate: 60%  |  Sharpe: 2.74        │
│  [📋 Iteration #21]  Win Rate: 58%  |  Sharpe: 2.1         │
│  [📋 Iteration #20]  Win Rate: 67%  |  Sharpe: 2.4         │
└─────────────────────────────────────────────────────────────┘

┌─ Iteration #22 Details ────────────────────────────────────┐
│  Summary  |  Analysis  |  Trades (10)                       │
│                                                              │
│  🎯 Manual Guidance                                         │
│  "Scan last 2 years. Include 100%+ moves in ≤5 days..."    │
│                                                              │
│  📊 Performance Metrics                                     │
│  Signals: 15  |  Win Rate: 60%  |  Sharpe: 2.74           │
│                                                              │
│  🧠 AI Analysis                                             │
│  "Manual guidance successfully extended scan period and     │
│   captured rare parabolic patterns like BYND's 454% move..." │
│                                                              │
│  💡 Suggested Refinements                                   │
│  1. Volume confirmation at 150%+ working well               │
│  2. Consider tightening entry timing to first hour          │
│  3. 5-day window optimal for this pattern                   │
└─────────────────────────────────────────────────────────────┘
```

**Tab 2: Knowledge Base**
- Accumulated insights from all iterations
- Filter by type (insights, parameters, pattern rules)
- Confidence scores and validation counts

**Tab 3: Strategy Versions**
- Full version history with diffs
- Compare any two versions side-by-side
- Promote best version to production

---

## 🛠️ Technical Stack

### Backend
- **Node.js 18+** with TypeScript
- **SQLite** for data persistence (43MB database)
- **Anthropic Claude 3.7 Sonnet** for AI generation
- **Script Execution** - Sandboxed TypeScript runner
- **18 Microservices** - Modular architecture

### Frontend
- **React 18** with TypeScript
- **Vite** for lightning-fast dev server
- **TailwindCSS v4** for styling
- **Real-time Updates** via polling (5-second intervals)

### Data
- **Polygon.io** - Market data (5-min & daily bars)
- **163,871** intraday bars (30 days, 62 tickers)
- **15,931** daily bars (1 year, 64 tickers)
- **Tech Sector Universe** - 65 S&P Technology stocks

---

## 📖 Advanced Usage

### Scheduled Learning

**Run iterations on a schedule:**

```typescript
// Enable scheduled learning for an agent
POST /api/learning-agents/:id
{
  scheduled_learning: {
    enabled: true,
    frequency: "daily",      // daily, weekly
    time: "02:00",          // 2 AM
    max_iterations: 50      // Stop after 50 iterations
  }
}
```

**Use case:** Let agent learn overnight, review results in morning.

### Multi-Agent Collaboration

**Share knowledge between agents:**

```typescript
// Create agent family
POST /api/learning-agents/create-family
{
  base_strategy: "momentum",
  variations: [
    "Find breakouts on 5-min charts",
    "Find breakouts on 15-min charts",
    "Find breakouts on daily charts"
  ],
  shared_knowledge: true
}
```

All agents learn from each other's iterations.

### Export Strategies

**Deploy learned strategy to production:**

```bash
# Export iteration 22 as standalone script
GET /api/learning-agents/:id/iterations/22/export

# Returns:
# - scanner-production.ts (standalone)
# - execution-production.ts (standalone)
# - config.json (all parameters)
# - README.md (usage instructions)
```

---

## 🗺️ Roadmap

### ✅ Current (v1.0)
- Multi-agent learning laboratory
- Autonomous iteration loop
- Manual guidance system
- Knowledge base accumulation
- Strategy version control

### 🚧 In Progress (v1.1)
- [ ] Monte Carlo simulation for risk assessment
- [ ] Walk-forward analysis (out-of-sample testing)
- [ ] Parameter optimization (grid search)
- [ ] Paper trading validation

### 🔮 Future (v2.0)
- [ ] Live trading execution
- [ ] Real-time adaptation (market regime detection)
- [ ] Multi-timeframe agents (daily + intraday)
- [ ] Portfolio-level optimization
- [ ] Ensemble strategies (combine multiple agents)

---

## 📚 Documentation

**Main Docs:**
- [README.md](README.md) - This file
- [docs/DATABASE.md](docs/DATABASE.md) - Backup & restore procedures
- [ORIGINAL_REQUIREMENTS.md](ORIGINAL_REQUIREMENTS.md) - Initial vision

**Learning Guides:**
- [Creating Your First Agent](docs/guides/first-agent.md)
- [Understanding the Learning Loop](docs/guides/learning-loop.md)
- [Manual Guidance Best Practices](docs/guides/manual-guidance.md)
- [Knowledge Base Deep Dive](docs/guides/knowledge-base.md)

**API Reference:**
- Swagger UI: http://localhost:3000/api-docs
- Full REST API documentation

---

## 🙏 Acknowledgments

- **Anthropic Claude** - AI-powered learning and analysis
- **Polygon.io** - Comprehensive market data
- **TradeStation** - Paper trading integration
- **React + Vite** - Modern frontend framework
- **TailwindCSS v4** - Beautiful, responsive UI

---

## 📄 License

MIT

---

**Built with Claude Code** 🤖

*Where AI agents autonomously learn to trade, iterate by iterate, guided by human intuition when needed.*

*Last updated: 2025-11-03*
