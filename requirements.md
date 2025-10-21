# Polygon Backtesting App - Requirements Document

## Executive Summary

Build a web-based backtesting platform for algorithmic trading strategies using Polygon.io market data. The key differentiator is an **AI-powered conversational interface** where users design strategies by chatting with Claude/ChatGPT, which then generates executable strategy configurations.

**Core Value Proposition:** Make sophisticated backtesting accessible through natural language conversations instead of requiring users to understand complex technical indicators and conditions.

---

## Quick Start for Claude Code

### Recommended Implementation Order

**Phase 1: Core Backend (Days 1-3)**
1. Project setup with TypeScript, Express, SQLite
2. Polygon API integration and data fetching
3. Basic indicator calculations (SMA, EMA, RSI, ATR)
4. Expression evaluation engine
5. Simple backtesting engine (bar-by-bar simulation)

**Phase 2: AI Integration (Days 4-5)**
6. Anthropic Claude API integration
7. System prompts and conversation management
8. Strategy JSON generation from conversations
9. **Dynamic script generation for complex backtests** (see DYNAMIC_SCRIPT_GENERATION.md)

**Phase 3: Frontend (Days 6-8)**
10. React app with Tailwind + shadcn/ui
11. Chat interface for strategy building
12. Strategy visualization and backtest results display

**Phase 4: Advanced Features (Days 9-10)**
13. Custom indicators (time-aligned ATR)
14. Advanced risk management
15. Performance optimization

### File Structure Recommendation

```
project-root/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── data.ts          # Polygon data endpoints
│   │   │   │   ├── strategies.ts    # Strategy CRUD
│   │   │   │   ├── backtests.ts     # Backtest execution
│   │   │   │   └── conversations.ts # AI chat endpoints
│   │   │   └── server.ts
│   │   ├── services/
│   │   │   ├── polygon.service.ts   # Polygon API client
│   │   │   ├── ai.service.ts        # Claude/ChatGPT integration
│   │   │   ├── backtest.service.ts  # Backtesting engine
│   │   │   └── expression.service.ts # Expression parser
│   │   ├── indicators/
│   │   │   ├── base.ts              # Base indicator class
│   │   │   ├── sma.ts
│   │   │   ├── ema.ts
│   │   │   ├── rsi.ts
│   │   │   ├── atr.ts
│   │   │   └── custom.ts            # Time-aligned indicators
│   │   ├── models/
│   │   │   ├── strategy.model.ts
│   │   │   ├── backtest.model.ts
│   │   │   ├── conversation.model.ts
│   │   │   └── ohlcv.model.ts
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   └── db.ts
│   │   └── types/
│   │       ├── strategy.types.ts
│   │       └── backtest.types.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatInterface.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   └── MessageInput.tsx
│   │   │   ├── strategy/
│   │   │   │   ├── StrategyPreview.tsx
│   │   │   │   └── StrategyEditor.tsx
│   │   │   ├── backtest/
│   │   │   │   ├── ResultsView.tsx
│   │   │   │   ├── EquityCurve.tsx
│   │   │   │   └── TradeLog.tsx
│   │   │   └── ui/              # shadcn components
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── StrategyBuilder.tsx
│   │   │   └── BacktestResults.tsx
│   │   ├── hooks/
│   │   │   ├── useConversation.ts
│   │   │   └── useBacktest.ts
│   │   └── lib/
│   │       └── api.ts
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

---

## Technical Stack

### Backend
- **Language**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite (development) → PostgreSQL (production ready)
- **API Integrations**: 
  - Polygon.io for market data
  - Anthropic Claude API (primary) or OpenAI (alternative)
- **Expression Parser**: `expr-eval` or `mathjs`

### Frontend
- **Framework**: React 18+ with TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Charts**: Recharts or Plotly
- **State**: React Context or Zustand

### Environment Variables
```bash
# Required
POLYGON_API_KEY=your_polygon_key
ANTHROPIC_API_KEY=your_anthropic_key  # or OPENAI_API_KEY

# Optional
AI_PROVIDER=anthropic  # or 'openai'
AI_MODEL=claude-sonnet-4-5-20250929
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

DATABASE_URL=./backtesting.db
PORT=3000
NODE_ENV=development
```

---

# Polygon Backtesting App - Requirements Document

## Overview
A comprehensive web-based backtesting platform that allows users to test trading strategies using historical market data from Polygon.io.

## Technical Stack

### Backend
- **Language**: Node.js with TypeScript
- **Framework**: Express.js
- **API Client**: Polygon.io SDK or REST API
- **AI Integration**: Anthropic Claude API (primary) or OpenAI API (alternative)
- **Database**: SQLite for development (easily upgradeable to PostgreSQL)
- **Data Processing**: Support for calculating indicators and executing strategy logic

### Frontend
- **Framework**: React with TypeScript
- **UI Library**: Tailwind CSS + shadcn/ui components
- **Charts**: Recharts or Plotly for visualization
- **State Management**: React Context or Zustand

## Core Features

### 1. Data Management

#### 1.1 Polygon API Integration
- Connect to Polygon.io using API key (stored in environment variables)
- Fetch historical aggregate/bar data for stocks
- Support multiple timeframes:
  - 1 minute, 5 minutes, 15 minutes, 30 minutes, 1 hour
  - Daily, weekly, monthly
- Fetch data for date ranges
- Handle API rate limits gracefully
- Cache fetched data locally to minimize API calls

#### 1.2 Data Storage
- Store fetched historical data in SQLite database
- Schema should include:
  - Ticker symbol
  - Timestamp (with timezone support for intraday data)
  - Open, High, Low, Close prices
  - Volume
  - Timeframe/resolution
  - Time of day (extracted from timestamp for quick filtering)
  - Day of week
- Ability to refresh/update data
- Data validation and cleaning
- **Support for multi-timeframe storage:**
  - Store both 5min and daily data for same ticker
  - Enable time-aligned calculations across days
  - Index on (ticker, timestamp, time_of_day) for efficient queries

### 2. Strategy Definition

#### 2.1 AI-Assisted Strategy Builder
**Conversational Strategy Design** - Primary interface for creating strategies
- Integrate Claude API (Anthropic) or OpenAI ChatGPT API
- Chat-based interface where users describe their strategy ideas in natural language
- AI assistant helps refine and formalize strategy logic through conversation
- AI suggests improvements, asks clarifying questions, and validates logic

**Conversation Flow Examples:**
- User: "I want to buy when the price crosses above the 50-day moving average"
- AI: "Great! Let's build that out. What should trigger a sell signal? And would you like any additional confirmation indicators?"
- User: "Sell when it crosses below, and only enter if RSI is below 70"
- AI: "Perfect! I'll set up entry when price > SMA(50) AND RSI < 70, and exit when price < SMA(50). Should we add stop loss protection?"

**AI Capabilities:**
- Parse natural language strategy descriptions
- Generate structured strategy configuration from conversation
- Suggest appropriate indicators based on strategy type
- Recommend risk management parameters
- Explain strategy logic back to user for confirmation
- Warn about potential issues (e.g., overfitting, unrealistic assumptions)
- Provide education about trading concepts and indicators

**Output Generation:**
- AI translates conversational strategy into structured JSON configuration
- User can review and manually adjust generated strategy
- Save conversation history with each strategy for future reference

#### 2.2 Manual Strategy Builder (Alternative)
- Traditional form-based interface for users who prefer direct control
- Dropdown menus and input fields for precise configuration
- Can switch between conversational and manual modes
- Manual adjustments to AI-generated strategies

#### 2.3 Built-in Indicators
Implement common technical indicators:
- Simple Moving Average (SMA)
- Exponential Moving Average (EMA)
- Relative Strength Index (RSI)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Average True Range (ATR)
- Stochastic Oscillator
- Average Directional Index (ADX)
- On-Balance Volume (OBV)
- Volume-based indicators

#### 2.3.1 Custom Indicator Definitions

Support for user-defined custom indicators with advanced calculation logic:

**Time-Aligned Indicators:**
Calculate indicators using specific time-of-day alignment across multiple days. Example: ATR using the same 5-minute period from the past 14 days.

**Custom Indicator Schema:**

```json
{
  "type": "CUSTOM",
  "id": "atr_time_aligned",
  "calculation": {
    "method": "time_aligned_atr",
    "params": {
      "periods": 14,
      "timeframe": "5min",
      "alignment": "same_time_of_day"
    }
  },
  "description": "14-period ATR using same 5-min time from past 14 days"
}
```

**Alternative: Expression-Based Custom Indicators**

For maximum flexibility, allow indicators defined via expressions that access multi-timeframe data:

```json
{
  "type": "CUSTOM",
  "id": "my_custom_atr",
  "formula": "avg(true_range_at_time(current_time, lookback_days=14), 14)",
  "description": "Time-aligned ATR calculation"
}
```

**Built-in Time-Aware Functions:**

```
time_aligned_bars(time, days_back) - Get bars at same time from past N days
same_time_yesterday() - Get bar from exactly 24 hours ago
day_bars(offset_days) - Get all bars from a specific day
time_of_day() - Current time (e.g., "10:30")
is_market_open() - Boolean check
bars_since_market_open() - Number of bars since open
```

**Example: Time-Aligned ATR Implementation**

```typescript
// Custom indicator calculation
function calculateTimeAlignedATR(
  data: OHLCVBar[],
  currentIndex: number,
  periods: number = 14
): number {
  const currentBar = data[currentIndex];
  const currentTime = getTimeOfDay(currentBar.timestamp);
  
  // Find bars at same time from past N days
  const alignedBars: OHLCVBar[] = [];
  let daysFound = 0;
  let lookbackIndex = currentIndex - 1;
  
  while (daysFound < periods && lookbackIndex >= 0) {
    const bar = data[lookbackIndex];
    const barTime = getTimeOfDay(bar.timestamp);
    
    // Check if same time of day (e.g., both 10:30)
    if (barTime === currentTime) {
      alignedBars.push(bar);
      daysFound++;
    }
    
    lookbackIndex--;
  }
  
  // Calculate ATR using aligned bars
  const trueRanges = alignedBars.map((bar, i) => {
    if (i === alignedBars.length - 1) {
      return bar.high - bar.low;
    }
    const prevClose = alignedBars[i + 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    );
  });
  
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}
```

**Usage in Strategy:**

```json
{
  "name": "Time-Aligned ATR Breakout",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "CUSTOM",
      "id": "atr_aligned",
      "calculation": {
        "method": "time_aligned_atr",
        "params": {
          "periods": 14,
          "alignment": "same_time_of_day"
        }
      }
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_aligned",
        "description": "Candle body exceeds 2x time-aligned ATR"
      }
    ],
    "logic": "AND"
  }
}
```

**Alternative: Inline Custom Calculation**

For one-off calculations without defining a separate indicator:

```json
{
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) > 2 * time_aligned_atr(14)",
        "description": "Using inline time-aligned ATR function"
      }
    ]
  }
}
```

#### 2.4 Strategy Parameters
Allow users to configure:
- Entry conditions (when to buy)
- Exit conditions (when to sell)
- Position sizing rules
- Stop loss levels (percentage or fixed amount)
- Take profit levels
- Maximum number of concurrent positions
- Allow both long and short positions (configurable)

### 3. Backtesting Engine

#### 3.1 Core Backtesting Logic
- Simulate trades based on historical data
- Execute strategy logic for each time period (bar-by-bar simulation)
- **Expression Evaluation Engine:**
  - Parse expression strings into executable code
  - Provide evaluation context with OHLCV data, indicators, and position info
  - Support array indexing for historical data (close[1], high[5], etc.)
  - Implement built-in functions: cross_above(), cross_below(), highest(), lowest(), avg(), etc.
  - Validate expressions for safety (no arbitrary code execution)
  - Use library like `expr-eval`, `mathjs`, or custom parser
- Track:
  - Open positions
  - Closed positions
  - Cash balance
  - Portfolio value over time
  - Trade history
  - Bar-by-bar indicator values

#### 3.2 Order Execution Simulation
- Support different order types:
  - Market orders (execute at next available price)
  - Limit orders (execute at specified price or better)
- Account for slippage (configurable percentage)
- Commission/fee modeling (configurable per trade or percentage)

#### 3.3 Portfolio Management
- Starting capital (user-defined)
- Position sizing methods:
  - Fixed dollar amount
  - Percentage of portfolio
  - Risk-based sizing
- Track portfolio value throughout backtest period

### 4. Performance Analytics

#### 4.1 Key Metrics
Calculate and display:
- **Returns**:
  - Total return (percentage and dollar amount)
  - Annualized return
  - Compound Annual Growth Rate (CAGR)
- **Risk Metrics**:
  - Maximum drawdown
  - Sharpe ratio
  - Sortino ratio
  - Standard deviation of returns
  - Win rate (percentage of profitable trades)
- **Trade Statistics**:
  - Total number of trades
  - Average profit per trade
  - Average loss per trade
  - Profit factor (gross profit / gross loss)
  - Largest winning trade
  - Largest losing trade
  - Average trade duration

#### 4.2 Benchmark Comparison
- Compare strategy performance against buy-and-hold benchmark
- Show relative outperformance/underperformance

### 5. Visualization

#### 5.1 Equity Curve
- Line chart showing portfolio value over time
- Compare against benchmark
- Mark significant drawdown periods

#### 5.2 Trade Visualization
- Display trades on price chart
- Show entry points (buy signals)
- Show exit points (sell signals)
- Color-code profitable vs losing trades

#### 5.3 Performance Charts
- Monthly/yearly return heatmap
- Drawdown chart over time
- Distribution of returns histogram
- Rolling Sharpe ratio

#### 5.4 Trade Log Table
- Searchable and sortable table of all trades
- Columns: Entry date, exit date, ticker, entry price, exit price, quantity, profit/loss, return %

### 6. User Interface

#### 6.1 Dashboard
- Overview of saved strategies
- Quick access to create new strategy
- Recent backtest results summary

#### 6.2 Conversational Strategy Builder
- **Chat Interface**:
  - Clean, messaging-app style interface
  - Real-time streaming of AI responses
  - Message history for each strategy creation session
  - Ability to edit previous messages and regenerate
  - Code blocks for showing generated strategy configuration
  
- **Strategy Preview Panel**:
  - Live preview of strategy being built
  - Visual representation of indicators and rules
  - Editable JSON/form view of strategy parameters
  - "Apply Strategy" button to finalize
  
- **Conversation Management**:
  - Save conversation threads with strategies
  - Resume previous conversations
  - Start new strategy conversation
  - Export conversation history
  
- **Quick Actions**:
  - Example prompts: "Create a momentum strategy", "Build a mean reversion strategy"
  - "Explain this indicator" buttons
  - "Test strategy" shortcut from chat
  - Switch to manual editing mode

#### 6.3 Manual Strategy Configuration Page (Alternative Mode)
- Form to define strategy parameters
- Indicator selection and configuration
- Entry/exit rule builder
- Risk management settings
- Date range selector for backtest

#### 6.4 Results Page
- Performance metrics summary cards
- Interactive charts and visualizations
- Detailed trade log
- Export functionality (CSV/JSON)

#### 6.5 Data Management Page
- View available tickers and date ranges
- Fetch new data from Polygon
- Clear cached data
- API usage statistics

## Data Flow

### Strategy Creation Flow (Conversational)
1. User starts new strategy conversation
2. User describes strategy idea in natural language
3. Frontend sends message to backend AI endpoint
4. Backend calls Claude/ChatGPT API with:
   - System prompt (strategy advisor role)
   - Conversation history
   - User message
   - Available indicators/capabilities context
5. AI responds with clarifying questions or strategy suggestions
6. Conversation continues until strategy is well-defined
7. AI generates structured strategy JSON
8. User reviews and approves strategy
9. Strategy is saved to database with conversation reference

### Backtesting Flow
1. User selects strategy (created conversationally or manually)
2. User selects ticker(s) and date range
3. System checks if data exists locally, fetches from Polygon if needed
4. Backtesting engine processes historical data bar by bar
5. Strategy logic evaluates entry/exit conditions at each bar
6. Trades are simulated and recorded
7. Performance metrics are calculated
8. Results are displayed with visualizations

## API Requirements

### Polygon.io Endpoints Used
- `/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}` - Historical aggregates
- `/v3/reference/tickers` - Ticker information (optional, for validation)
- `/v2/snapshot/locale/us/markets/stocks/tickers` - Current snapshot (optional, for context)

### AI Provider Integration

**Option 1: Anthropic Claude (Recommended)**
- **API**: Anthropic Messages API
- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Features**: 
  - Excellent at structured reasoning and strategy formulation
  - Strong at explaining complex trading concepts
  - Can be prompted to output valid JSON
  - Supports streaming for real-time responses

**Option 2: OpenAI ChatGPT**
- **API**: OpenAI Chat Completions API
- **Model**: GPT-4 or GPT-4 Turbo
- **Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Features**:
  - Function calling for structured outputs
  - Good at conversational strategy building

**AI Implementation Requirements:**
- System prompt that defines AI's role as a trading strategy advisor
- Context about available indicators, rules, and platform capabilities
- Structured output schema for strategy generation
- Conversation memory/context management
- Error handling for API failures
- Token usage tracking and limits

---

## Prompt Engineering Guide

### System Prompt Architecture

The system prompt should be structured in sections to provide clear context and instructions to the AI.

**Complete System Prompt Template:**

```
You are an expert trading strategy advisor helping users design and backtest algorithmic trading strategies. Your role is to guide users through creating strategies in a conversational, educational, and supportive manner.

# PLATFORM CAPABILITIES

## Available Technical Indicators
- Simple Moving Average (SMA): Periods 5-200
- Exponential Moving Average (EMA): Periods 5-200
- Relative Strength Index (RSI): Periods 5-50, standard is 14
- MACD: Fast(12), Slow(26), Signal(9) - configurable
- Bollinger Bands: Period 20, Standard Deviations 2 - configurable
- Volume indicators: On-Balance Volume, Volume SMA
- Average True Range (ATR): Standard and time-aligned variants
- Stochastic, ADX (configurable)

## Custom Indicators
You can define custom indicators for advanced calculations:

**Time-Aligned Indicators:** Calculate using same time-of-day from past N days
- Example: ATR using 10:30 AM bar from past 14 days (not just last 14 bars)
- Useful for intraday strategies sensitive to time-of-day patterns

**Custom Calculation Methods:**
- time_aligned_atr(periods, timeframe) - ATR at same time across days
- time_aligned_sma(periods) - SMA at same time across days
- Custom formulas using expression language

**Example Custom Indicator:**
```json
{
  "type": "CUSTOM",
  "id": "atr_10am",
  "calculation": {
    "method": "time_aligned_atr",
    "params": {"periods": 14, "alignment": "same_time_of_day"}
  }
}
```

## Entry/Exit Conditions
You can create conditions using expressions with this syntax:

**Expression Language:**
- Variables: open, high, low, close, volume (current and historical with [n] notation)
- Indicator values: Use indicator IDs like sma_50, rsi_14, atr_14
- Historical data: close[1] = close from 1 bar ago, high[5] = high from 5 bars ago
- Operators: +, -, *, /, >, <, >=, <=, ==, !=, and, or, not
- Functions: cross_above(), cross_below(), highest(), lowest(), avg(), abs(), max(), min()
- Position data: entry_price, entry_time (available in exit rules)

**Example Expressions:**
- "abs(close - open) > 2 * atr_14" (candle body exceeds 2x ATR)
- "close > high[1]" (breaking previous high)
- "cross_above(sma_20, sma_50)" (golden cross)
- "volume > avg(volume, 20) * 1.5" (volume 1.5x the 20-bar average)
- "low < low[1] and close > open" (higher low with bullish close)
- "close > highest(high, 20)" (new 20-bar high)
- "(high - low) / close > 0.05" (large candle range, 5%+ of price)

**Condition Types:**
1. "expression" type: Boolean expression evaluated on each bar
2. "crossover" type: Convenience shorthand for cross_above/cross_below
3. Combine multiple conditions with AND/OR logic

## Risk Management Options
- Stop Loss: Fixed percentage, fixed dollar amount, or ATR-based
- Take Profit: Fixed percentage, fixed dollar amount, or risk/reward ratio
- Position Sizing: Fixed shares, fixed dollar amount, percentage of portfolio, risk-based (% of capital at risk)
- Max concurrent positions: 1-10

## Order Types
- Market orders (execute at next available price)
- Limit orders (execute at specified price or better)

## Backtesting Parameters
- Date ranges from 2020-01-01 to present
- Timeframes: 1min, 5min, 15min, 30min, 1hour, 1day, 1week
- Commission: $0-10 per trade or 0-0.5% per trade
- Slippage: 0-1% simulated slippage

# YOUR CONVERSATIONAL APPROACH

## Initial Strategy Discussion
When a user first describes a strategy idea:
1. Acknowledge their idea positively
2. Ask 2-3 clarifying questions to understand their goals:
   - What timeframe are they trading? (day trading, swing, long-term)
   - What's their risk tolerance?
   - What market conditions do they expect? (trending, ranging, volatile)
3. Suggest appropriate indicators based on their goals
4. Discuss entry and exit logic

## Building the Strategy
As you refine the strategy:
1. Explain WHY certain combinations work well together
2. Warn about common pitfalls (e.g., overfitting, look-ahead bias, unrealistic assumptions)
3. Suggest risk management parameters appropriate to their strategy
4. Ask if they want to add confirmation indicators or filters

## Educational Moments
When users ask about indicators or concepts:
1. Provide clear, concise explanations
2. Give real-world examples of when/how it's used
3. Mention strengths and weaknesses
4. Suggest how it might fit into a strategy

## Generating Strategy Configuration
When the strategy is well-defined, generate a JSON configuration. Say something like:
"Great! I have all the details I need. Here's your strategy configuration:"

Then output ONLY valid JSON in this exact format:
```json
{
  "name": "Strategy Name",
  "description": "Brief description of the strategy logic",
  "timeframe": "1day",
  "indicators": [
    {
      "type": "SMA",
      "params": {"period": 50},
      "id": "sma_50"
    },
    {
      "type": "RSI",
      "params": {"period": 14},
      "id": "rsi_14"
    }
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "price",
        "indicator2": "sma_50",
        "direction": "above"
      },
      {
        "type": "expression",
        "expression": "rsi_14 < 70",
        "description": "RSI not overbought"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "price",
        "indicator2": "sma_50",
        "direction": "below"
      }
    ],
    "logic": "AND"
  },
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "percentage",
      "value": 5
    },
    "takeProfit": {
      "enabled": true,
      "type": "percentage",
      "value": 10
    },
    "positionSizing": {
      "type": "percentage_of_portfolio",
      "value": 20
    },
    "maxConcurrentPositions": 3
  },
  "commission": {
    "type": "per_trade",
    "value": 1
  },
  "slippage": 0.1
}
```

**For complex expression-based strategies:**
Use the "expression" condition type when the logic requires:
- Mathematical operations: `(close - open) > 2 * atr_14`
- Historical references: `close > high[1]` or `low[5]`
- Custom calculations: `abs(close - open) / close > 0.03`
- Built-in functions: `cross_above(close, sma_50)`, `highest(high, 20)`, `avg(volume, 20)`

**When using expressions, always:**
1. Include a "description" field explaining what the expression does in plain English
2. Use clear variable names matching the expression language spec
3. Reference indicators by their ID (e.g., "atr_14" not "atr")
4. Use proper syntax: `close[1]` for historical, `cross_above(a, b)` for functions

After generating the JSON, briefly explain the key components and ask if they'd like to adjust anything.

# IMPORTANT GUIDELINES

## What You Should Do
- Be conversational and friendly
- Ask clarifying questions before generating strategy
- Explain trading concepts in simple terms
- Warn about risks and unrealistic expectations
- Suggest sensible default parameters
- Validate strategy logic for obvious flaws
- Encourage backtesting and iteration

## What You Should NOT Do
- Never guarantee profits or returns
- Don't suggest strategies without understanding user goals
- Don't use overly complex technical jargon without explanation
- Don't generate strategies with obvious logical errors
- Don't recommend extremely risky parameters without warning
- Never imply that backtesting = future performance

## Common Pitfalls to Warn Users About
- Overfitting: Too many indicators or conditions
- Look-ahead bias: Using future information
- Survivorship bias: Only testing on successful stocks
- Unrealistic assumptions: No slippage, no commissions
- Curve fitting: Optimizing too specifically to historical data
- Ignoring market regime changes

# RESPONSE STYLE
- Use clear paragraphs, not excessive bullet points unless listing options
- Bold key terms for emphasis
- Use code blocks only for JSON output
- Keep explanations concise but thorough
- Use examples to illustrate concepts
- Maintain enthusiasm and supportiveness
```

---

### Additional Prompt Engineering Components

#### Strategy Validation Prompts

When a user proposes a strategy that might have issues, use these validation patterns:

**Detecting Overfitting:**
```
I notice your strategy has 5+ indicators and very specific conditions. This might lead to overfitting - where the strategy works great on historical data but fails in live trading. 

Would you like me to simplify it? We could focus on the 2-3 most important signals.
```

**Warning About Look-Ahead Bias:**
```
Just to clarify - this strategy will only use information available at the time of each trade, right? We want to avoid "peeking into the future" which would make backtest results unrealistic.
```

**Unrealistic Expectations:**
```
A 50% monthly return is extremely high and unlikely to be sustainable. Even professional traders target 10-20% annually. Would you like to set more conservative targets, or should we backtest this and see what realistic returns look like?
```

#### Error Handling Prompts

**When User Description is Vague:**
```
I want to help you build this strategy, but I need a bit more detail. Could you tell me:
- What signals should trigger a buy?
- What signals should trigger a sell?
- Are you thinking day trading, swing trading, or longer-term?
```

**When Combining Incompatible Indicators:**
```
I notice you want to combine indicators that might give conflicting signals. [Indicator A] works best in trending markets, while [Indicator B] works best in ranging markets. 

Would you like to:
1. Choose one approach
2. Add a filter to detect market conditions
3. Test both separately
```

**When Parameters Are Missing:**
```
Great strategy idea! To complete it, I need to know:
- What RSI period? (typically 14)
- What RSI levels for oversold/overbought? (typically 30/70)
- Position size: fixed amount or percentage of portfolio?
```

#### Educational Prompts

**When User Asks "What indicator should I use?":**
```
Great question! The best indicator depends on your trading style:

**For Trend Following:**
- Moving averages (SMA/EMA) - spot trends
- MACD - momentum and trend direction

**For Mean Reversion:**
- RSI - overbought/oversold
- Bollinger Bands - price extremes

**For Volatility:**
- Bollinger Bands width
- ATR (coming soon to platform)

What type of market behavior do you want to capitalize on?
```

**When User Asks About Risk Management:**
```
Excellent question - risk management is crucial! Here are the key components:

**Stop Loss:** Limits your loss on any single trade
- Typical: 2-5% below entry
- Tighter stops = more frequent small losses
- Wider stops = fewer but potentially larger losses

**Position Sizing:** How much to invest per trade
- Fixed $ amount: Simple but doesn't scale
- % of portfolio: Scales with account size
- Risk-based: Size position so you only risk X% of capital

**Take Profit:** Lock in gains
- Fixed %: Simple and consistent
- Risk/reward ratio: e.g., 2:1 (make $2 for every $1 risked)

What's your risk tolerance?
```

#### Multi-Turn Conversation Management

**Track Conversation State:**
```typescript
interface ConversationState {
  stage: 'initial' | 'clarifying' | 'building' | 'refining' | 'generating';
  strategyDraft: Partial<StrategyConfig>;
  clarificationQuestions: string[];
  userPreferences: {
    timeframe?: string;
    riskTolerance?: 'low' | 'medium' | 'high';
    tradingStyle?: 'scalping' | 'day' | 'swing' | 'position';
  };
}
```

**Stage-Specific Prompting:**

**Initial Stage:**
```
User just described basic strategy idea. Extract:
- Core concept (trend following, mean reversion, momentum, etc.)
- Any mentioned indicators
- Timeframe hints
- Risk tolerance hints

Ask 2-3 clarifying questions about missing critical information.
```

**Clarifying Stage:**
```
User has answered some questions. Current understanding:
- Strategy type: [extracted]
- Indicators mentioned: [list]
- Entry logic: [extracted or "unclear"]
- Exit logic: [extracted or "unclear"]

If entry/exit logic is clear, move to building stage.
If not, ask specific questions about missing pieces.
```

**Building Stage:**
```
All core components identified. Now suggest:
- Appropriate indicator parameters
- Risk management options
- Potential improvements or filters

Summarize strategy and ask for confirmation before generating.
```

**Refining Stage:**
```
Strategy generated but user wants changes.
Current strategy: [show JSON or summary]
User request: [latest message]

Identify what to modify and explain the change.
```

#### Complete Conversation Flow Example

```
USER: "I want to trade the golden cross"

A: "The golden cross is a classic bullish signal! This happens when a shorter moving average crosses above a longer one, typically the 50-day crossing above the 200-day.

A few questions to help me build this properly:

1. **Timeframe:** Are you thinking daily charts (position trading), hourly (swing trading), or shorter?
2. **Exit strategy:** Should we exit on the death cross (50 crosses below 200), or would you prefer a trailing stop or profit target?
3. **Position sizing:** How much of your portfolio per trade? 

Also, golden cross signals are infrequent but often reliable. Would you like to add a faster confirmation indicator like RSI to catch more opportunities?"

USER: "Daily charts, and yes exit on death cross. 25% of portfolio. No extra indicators"

A: "Perfect! Here's what I'm setting up:

**Entry Signal:** 
- SMA(50) crosses above SMA(200)
- This is the 'golden cross' - typically indicates strong bullish trend

**Exit Signal:**
- SMA(50) crosses below SMA(200)  
- This is the 'death cross' - trend reversal signal

**Position Size:** 25% of portfolio per trade
**Max Positions:** 1 (since we're using all crossovers)

For risk management, I recommend adding:
- **Stop loss:** 8% below entry (protects if trend fails quickly)
- **Max holding time:** None (let the death cross dictate exit)

The golden cross is a long-term strategy - you might only get 1-3 signals per year, but they tend to catch major trends.

Should I generate this, or would you like to adjust anything?"

USER: "Looks good, generate it"

A: "Excellent! Here's your Golden Cross Strategy:

```json
{
  "name": "Golden Cross Strategy",
  "description": "Buy when 50-day SMA crosses above 200-day SMA, sell on death cross",
  "timeframe": "1day",
  "indicators": [
    {
      "type": "SMA",
      "params": {"period": 50},
      "id": "sma_50"
    },
    {
      "type": "SMA",
      "params": {"period": 200},
      "id": "sma_200"
    }
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "sma_50",
        "indicator2": "sma_200",
        "direction": "above"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "sma_50",
        "indicator2": "sma_200",
        "direction": "below"
      }
    ],
    "logic": "AND"
  },
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "percentage",
      "value": 8
    },
    "takeProfit": {
      "enabled": false
    },
    "positionSizing": {
      "type": "percentage_of_portfolio",
      "value": 25
    },
    "maxConcurrentPositions": 1
  },
  "commission": {
    "type": "per_trade",
    "value": 1
  },
  "slippage": 0.1
}
```

**Strategy Summary:**
This is a trend-following strategy that enters on the bullish golden cross signal and exits on the bearish death cross. With 25% position sizing, you'll make substantial moves when trends develop. The 8% stop loss protects against false signals.

**What to expect:**
- Low frequency: 1-4 trades per year typically
- Long holding periods: Often 6-12 months
- Works best in trending markets
- May underperform in choppy/ranging markets

Ready to backtest this? Pick a ticker and date range!"

USER: "Can we add RSI confirmation now?"

A: "Absolutely! Adding RSI confirmation can help filter out weaker signals. There are a few ways to do this:

**Option 1 - Strength Confirmation (Recommended)**
Only enter golden cross if RSI > 50 (shows momentum is actually positive)

**Option 2 - Oversold Bounce**  
Only enter golden cross if RSI < 70 (avoid overbought entries)

**Option 3 - Trend Strength**
Only enter if RSI > 60 (very strong momentum required)

Which approach sounds better to you? Option 1 is most popular for golden cross strategies."

USER: "Option 1"

A: "Perfect choice! I'll update the strategy to require RSI > 50 at the time of the golden cross. This ensures we're only entering when price momentum confirms the bullish signal.

Here's the updated entry condition:
- SMA(50) crosses above SMA(200) **AND**
- RSI(14) > 50

This should reduce false signals while keeping the core golden cross logic intact. Let me regenerate the full JSON..."

[Regenerates strategy with additional RSI indicator and updated entry rules]
```

**Example 4: Complex ATR-Based Strategy**

```
USER: "I want to enter when a 5 minute candle moves 2x the 14-period ATR and exit when the price crosses the previous candle's low for long positions"

AI: "That's a volatility breakout strategy - excellent for catching momentum moves! Let me break down what you're describing:

**Entry Signal:**
You want to capture explosive moves where a single 5-minute candle's body (close - open) exceeds twice the Average True Range. This indicates unusual volatility and potential momentum.

**Exit Signal:**  
You'll exit when price breaks below the previous candle's low, which serves as a quick stop if momentum fails.

A few questions to refine this:

1. **Direction:** Should we only take long positions (bullish candles), or also short positions (bearish candles)?

2. **Candle type:** Do you mean the absolute body size `abs(close - open)`, or specifically bullish candles where `close > open`?

3. **ATR multiplier:** You said 2x ATR - would you also like a stop loss further back, say at 1.5x ATR below entry, in case price gaps against you?

4. **Volume filter:** These breakout strategies often work better with volume confirmation. Should we require volume above average?"

USER: "Only long positions with bullish candles. Yes to the 1.5 ATR stop loss. No volume filter for now."

AI: "Perfect! Here's your ATR Breakout Strategy:

**Strategy Logic:**
- **Entry:** When a bullish 5-min candle (close > open) has a body exceeding 2x the 14-period ATR
- **Exit:** When price breaks below the previous candle's low  
- **Stop Loss:** 1.5x ATR below entry price (automatic protection)

This captures volatile breakout moves while using the previous low as a quick exit if momentum stalls. The ATR-based stop provides additional protection.

**Risk Considerations:**
- This will generate infrequent but high-conviction trades
- 5-minute timeframe means you'll need to monitor actively or use automated execution
- Slippage can be significant on volatile breakouts - I'll set 0.2% slippage

Should I generate the complete strategy configuration?"

USER: "Yes"

AI: "Here's your ATR Breakout Strategy:

```json
{
  "name": "ATR Volatility Breakout",
  "description": "Enter on explosive 5-min candles exceeding 2x ATR, exit on previous low break",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "ATR",
      "params": {"period": 14},
      "id": "atr_14"
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle"
      },
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_14",
        "description": "Candle body exceeds 2x ATR"
      }
    ],
    "logic": "AND"
  },
  
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < low[1]",
        "description": "Price breaks below previous candle's low"
      }
    ],
    "logic": "OR"
  },
  
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price - 1.5 * atr_14",
      "description": "Stop loss at 1.5 ATR below entry"
    },
    "takeProfit": {
      "enabled": false
    },
    "positionSizing": {
      "type": "risk_based",
      "riskPerTrade": 1,
      "description": "Risk 1% of portfolio per trade"
    },
    "maxConcurrentPositions": 2
  },
  
  "commission": {
    "type": "per_trade",
    "value": 1
  },
  "slippage": 0.2
}
```

**Key Features:**
- **Expression-based conditions:** Uses `(close - open) > 2 * atr_14` to calculate candle body vs ATR
- **Historical reference:** Uses `low[1]` to reference previous candle's low
- **Dynamic stop loss:** Stop is calculated as `entry_price - 1.5 * atr_14` for each trade
- **Risk-based sizing:** Automatically calculates position size to risk 1% per trade

**What to Expect:**
- Low frequency: Maybe 1-5 trades per day depending on ticker volatility
- Fast exits: Most trades will exit within a few candles
- Works best with: Volatile stocks, momentum stocks, during high-volume periods
- Avoid: Very choppy or low-liquidity stocks

Ready to backtest this on your chosen ticker?"
```

**Example 5: Time-Aligned ATR Strategy**

```
USER: "Is it possible to calculate ATR using the same 5-minute time period from the past 14 days instead of just the last 14 bars?"

AI: "Absolutely! That's a time-aligned ATR calculation, and it's actually a sophisticated approach that can be very useful for intraday strategies.

**What you're describing:**
Instead of standard ATR that uses the last 14 consecutive bars (which could be 14 different times of day), you want ATR calculated from:
- Today's 10:30 AM bar
- Yesterday's 10:30 AM bar  
- Day before's 10:30 AM bar
- ... back 14 days

**Why this is powerful:**
- Captures time-of-day volatility patterns
- More relevant for strategies sensitive to market hours
- Accounts for consistent opening volatility, lunchtime lull, closing surge, etc.

**How we'll implement it:**
```json
{
  "indicators": [
    {
      "type": "CUSTOM",
      "id": "atr_time_aligned", 
      "calculation": {
        "method": "time_aligned_atr",
        "params": {
          "periods": 14,
          "alignment": "same_time_of_day"
        }
      },
      "description": "14-period ATR using same 5-min time from past 14 days"
    }
  ]
}
```

Now, what's your entry condition? Are you still looking at candle body > 2x this time-aligned ATR?"

USER: "Yes, exactly that"

AI: "Perfect! Here's your time-aligned ATR breakout strategy:

```json
{
  "name": "Time-Aligned ATR Breakout",
  "description": "Volatility breakout using time-of-day aligned ATR calculation",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "CUSTOM",
      "id": "atr_aligned",
      "calculation": {
        "method": "time_aligned_atr",
        "params": {
          "periods": 14,
          "alignment": "same_time_of_day"
        }
      },
      "description": "ATR calculated from same 5-min time over past 14 days"
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle"
      },
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_aligned",
        "description": "Candle body exceeds 2x time-aligned ATR"
      }
    ],
    "logic": "AND"
  },
  
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < low[1]",
        "description": "Price breaks below previous candle's low"
      }
    ],
    "logic": "OR"
  },
  
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price - 1.5 * atr_aligned",
      "description": "Stop loss at 1.5x time-aligned ATR below entry"
    },
    "takeProfit": {
      "enabled": false
    },
    "positionSizing": {
      "type": "risk_based",
      "riskPerTrade": 1
    },
    "maxConcurrentPositions": 2
  },
  
  "commission": {"type": "per_trade", "value": 1},
  "slippage": 0.2
}
```

**Key Advantages of This Approach:**
- ATR at 10:00 AM reflects typical 10:00 AM volatility (not mixed with afternoon or morning open)
- More accurate threshold for what constitutes an "unusual" move at that specific time
- Adapts to intraday volatility patterns

**Data Requirements:**
- You'll need at least 14 days of 5-minute historical data
- The system will automatically find bars at the same time across days
- If a day is missing (holiday, etc.), it uses the next available prior day

**Testing Recommendation:**
Compare this against standard 14-bar ATR to see if the time alignment improves performance for your strategy.

Ready to backtest?"
```
```

### Context Injection Patterns

**Before each API call, inject current conversation context:**

```typescript
// Example context injection for Claude API
const messages = [
  {
    role: 'user',
    content: conversationHistory.map(msg => 
      `${msg.role}: ${msg.content}`
    ).join('\n\n')
  },
  {
    role: 'user', 
    content: currentUserMessage
  }
];
```

**For strategy refinement, include current draft:**

```
<current_strategy>
User is refining this strategy:
Name: RSI Mean Reversion
Current indicators: RSI(14)
Entry: RSI < 30
Exit: RSI > 70
</current_strategy>

User wants to add: "I want to add a moving average filter"
```

**Injecting Available Tickers/Data Context:**

```
<available_data>
User has data for these tickers: AAPL, MSFT, GOOGL, TSLA
Date range available: 2020-01-01 to 2025-10-15
Timeframes available: 1day, 1hour
</available_data>
```

### Structured Output Prompts

**When ready to generate strategy JSON:**

```
Based on our conversation, please generate the complete strategy configuration.

Output ONLY valid JSON matching this schema, with no additional text before or after:

{
  "name": string,
  "description": string,
  "timeframe": "1min" | "5min" | "15min" | "30min" | "1hour" | "1day" | "1week",
  "indicators": Array<{
    "type": "SMA" | "EMA" | "RSI" | "MACD" | "BBANDS",
    "params": object,
    "id": string
  }>,
  "entryRules": {
    "conditions": Array<Condition>,
    "logic": "AND" | "OR"
  },
  "exitRules": {
    "conditions": Array<Condition>,
    "logic": "AND" | "OR"
  },
  "riskManagement": {
    "stopLoss": { "enabled": boolean, "type": string, "value": number },
    "takeProfit": { "enabled": boolean, "type": string, "value": number },
    "positionSizing": { "type": string, "value": number },
    "maxConcurrentPositions": number
  },
  "commission": { "type": string, "value": number },
  "slippage": number
}

After the JSON, on a new line, explain the strategy briefly.
```

---

### Flexible Expression-Based Schema

The schema needs to support complex conditions like:
- Candle movements relative to indicators (e.g., "5min candle moves 2x ATR")
- References to previous bars (e.g., "price crosses previous candle's low")
- Mathematical operations
- Custom calculations

**Updated JSON Schema Design:**

```json
{
  "name": "ATR Breakout Strategy",
  "description": "Enter when 5min candle moves 2x ATR, exit on previous low cross",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "ATR",
      "params": {"period": 14},
      "id": "atr_14"
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_14",
        "description": "Candle body exceeds 2x ATR"
      }
    ],
    "logic": "AND"
  },
  
  "exitRules": {
    "conditions": [
      {
        "type": "expression", 
        "expression": "close < low[1]",
        "description": "Price crosses below previous candle's low"
      }
    ],
    "logic": "OR"
  },
  
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price - 1.5 * atr_14",
      "description": "Stop 1.5 ATR below entry"
    },
    "takeProfit": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price + 3 * atr_14",
      "description": "Target 3 ATR above entry"
    },
    "positionSizing": {
      "type": "risk_based",
      "riskPerTrade": 1,
      "description": "Risk 1% of portfolio per trade"
    },
    "maxConcurrentPositions": 3
  },
  
  "commission": {"type": "per_trade", "value": 1},
  "slippage": 0.1
}
```

**Expression Language Specification:**

```
Available Variables:
- open, high, low, close, volume (current bar)
- open[n], high[n], low[n], close[n], volume[n] (n bars ago)
- entry_price, entry_time (when position opened)
- position_size, unrealized_pnl
- {indicator_id} (e.g., sma_50, rsi_14, atr_14)
- {indicator_id}[n] (indicator value n bars ago)

Available Operators:
- Arithmetic: +, -, *, /, %
- Comparison: >, <, >=, <=, ==, !=
- Logical: and, or, not
- Functions: abs(), max(), min(), avg()

Special Functions:
- cross_above(series1, series2) - series1 crosses above series2
- cross_below(series1, series2) - series1 crosses below series2
- highest(series, period) - highest value in period
- lowest(series, period) - lowest value in period
- change(series, periods) - change over n periods
- percent_change(series, periods) - percentage change

Examples:
- "close > sma_50 and rsi_14 < 70"
- "(close - open) / open > 0.02"
- "cross_above(close, high[1])"
- "volume > avg(volume, 20) * 1.5"
- "abs(close - open) > 2 * atr_14"
```

**Complete Schema Template:**

```typescript
interface StrategyConfig {
  name: string;
  description: string;
  timeframe: string;
  
  // Indicators to calculate
  indicators: Array<{
    type: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BBANDS' | 'ATR' | 'STOCH' | 'ADX' | 'OBV';
    params: Record<string, any>;
    id: string;  // Unique identifier for use in expressions
  }>;
  
  // Entry conditions
  entryRules: {
    conditions: Array<
      | {
          type: 'expression';
          expression: string;  // Boolean expression
          description?: string;
        }
      | {
          type: 'crossover';  // Convenience shorthand
          indicator1: string;
          indicator2: string;
          direction: 'above' | 'below';
          description?: string;
        }
    >;
    logic: 'AND' | 'OR';
  };
  
  // Exit conditions
  exitRules: {
    conditions: Array<
      | {
          type: 'expression';
          expression: string;
          description?: string;
        }
      | {
          type: 'crossover';
          indicator1: string;
          indicator2: string;
          direction: 'above' | 'below';
          description?: string;
        }
    >;
    logic: 'AND' | 'OR';
  };
  
  // Risk management
  riskManagement: {
    stopLoss?: {
      enabled: boolean;
      type: 'percentage' | 'fixed' | 'expression';
      value?: number;  // For percentage/fixed
      expression?: string;  // For expression type
      description?: string;
    };
    takeProfit?: {
      enabled: boolean;
      type: 'percentage' | 'fixed' | 'expression';
      value?: number;
      expression?: string;
      description?: string;
    };
    trailingStop?: {
      enabled: boolean;
      type: 'percentage' | 'atr';
      value: number;
      activation?: number;  // Activate after X% profit
    };
    positionSizing: {
      type: 'fixed_shares' | 'fixed_dollars' | 'percentage_of_portfolio' | 'risk_based';
      value?: number;
      riskPerTrade?: number;  // For risk_based (% of portfolio to risk)
    };
    maxConcurrentPositions: number;
    timeBasedExit?: {
      enabled: boolean;
      maxBarsHeld: number;  // Exit after N bars regardless
    };
  };
  
  // Filters (optional - must be true to allow entry)
  filters?: {
    timeOfDay?: {
      start: string;  // "09:30"
      end: string;    // "15:30"
    };
    daysOfWeek?: number[];  // [1,2,3,4,5] = Mon-Fri
    minimumVolume?: {
      expression: string;  // "volume > 1000000"
    };
    custom?: Array<{
      expression: string;
      description?: string;
    }>;
  };
  
  commission: {
    type: 'per_trade' | 'per_share' | 'percentage';
    value: number;
  };
  slippage: number;  // Percentage
}
```

**Example Strategies:**

**1. Your ATR Breakout Strategy:**
```json
{
  "name": "ATR Breakout",
  "timeframe": "5min",
  "indicators": [{"type": "ATR", "params": {"period": 14}, "id": "atr"}],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "abs(close - open) > 2 * atr",
        "description": "Candle body exceeds 2x ATR"
      },
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle (for long positions)"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < low[1]",
        "description": "Price breaks previous candle's low"
      }
    ],
    "logic": "OR"
  }
}
```

**2. Complex Multi-Timeframe Strategy:**
```json
{
  "name": "Multi-Timeframe Momentum",
  "timeframe": "15min",
  "indicators": [
    {"type": "SMA", "params": {"period": 50}, "id": "sma_50"},
    {"type": "RSI", "params": {"period": 14}, "id": "rsi"},
    {"type": "ATR", "params": {"period": 14}, "id": "atr"}
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > sma_50",
        "description": "Above 50 SMA (trend filter)"
      },
      {
        "type": "expression",
        "expression": "rsi > 50 and rsi < 70",
        "description": "RSI in momentum zone"
      },
      {
        "type": "expression",
        "expression": "close > high[1]",
        "description": "Breaking previous high"
      },
      {
        "type": "expression",
        "expression": "volume > avg(volume, 20) * 1.5",
        "description": "Volume surge (use built-in avg function)"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "cross_below(close, sma_50)",
        "description": "Close below 50 SMA"
      },
      {
        "type": "expression",
        "expression": "rsi > 80",
        "description": "Overbought exit"
      }
    ],
    "logic": "OR"
  },
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "min(entry_price - 2 * atr, low[1])",
      "description": "Stop at 2 ATR or previous low, whichever is closer"
    },
    "takeProfit": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price + 4 * atr"
    }
  }
}
```

**3. Mean Reversion with Bollinger Bands:**
```json
{
  "name": "Bollinger Mean Reversion",
  "timeframe": "1hour",
  "indicators": [
    {"type": "BBANDS", "params": {"period": 20, "std": 2}, "id": "bb"},
    {"type": "RSI", "params": {"period": 14}, "id": "rsi"}
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < bb.lower",
        "description": "Price touches lower band"
      },
      {
        "type": "expression",
        "expression": "rsi < 30",
        "description": "RSI oversold"
      },
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle (reversal signal)"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "high > bb.middle",
        "description": "Return to middle band"
      },
      {
        "type": "expression",
        "expression": "rsi > 70",
        "description": "RSI overbought"
      }
    ],
    "logic": "OR"
  }
}
```

**Note on Indicator Values:**

For indicators with multiple outputs (like Bollinger Bands or MACD), use dot notation:
- `bb.upper`, `bb.middle`, `bb.lower` for Bollinger Bands
- `macd.line`, `macd.signal`, `macd.histogram` for MACD
- `stoch.k`, `stoch.d` for Stochastic

**Implementation Notes:**

The backend needs to:
1. Parse expression strings into an AST (Abstract Syntax Tree)
2. Provide a safe evaluation context with available variables
3. Validate expressions before execution
4. Support array indexing for historical data: `close[1]` means close from 1 bar ago
5. Implement built-in functions like `cross_above()`, `highest()`, etc.

Use a library like `expr-eval` or `mathjs` for safe expression evaluation, with custom functions for trading-specific operations.

#### Implementation Best Practices

**1. Prompt Chaining for Complex Strategies**

Break complex strategy generation into steps:

```
Step 1: Extract user intent and strategy type
Step 2: Identify required indicators
Step 3: Formulate entry logic
Step 4: Formulate exit logic  
Step 5: Add risk management
Step 6: Generate final JSON
```

**2. Token Management**

- System prompt: ~2000-3000 tokens
- Reserve ~1000 tokens for user message + context
- Reserve ~2000 tokens for AI response
- Total: ~5000-6000 tokens per API call
- For Claude Sonnet: Well within context limits
- Store full conversation history in database, but send only recent context (last 5-10 messages) to API

**3. Streaming Implementation**

```typescript
// Enable streaming for real-time responses
const stream = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 2000,
  messages: messages,
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    // Send chunk to frontend via WebSocket
    ws.send(JSON.stringify({
      type: 'ai_response_chunk',
      content: chunk.delta.text
    }));
  }
}
```

**4. JSON Extraction**

AI might wrap JSON in markdown code blocks. Extract it:

```typescript
function extractJSON(aiResponse: string): any {
  // Look for JSON in code blocks
  const codeBlockMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1]);
  }
  
  // Look for raw JSON
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  throw new Error('No valid JSON found in response');
}
```

**5. Validation Layer**

Always validate AI-generated strategy before saving:

```typescript
function validateStrategy(strategy: any): ValidationResult {
  const errors = [];
  
  // Check required fields
  if (!strategy.name) errors.push('Strategy name is required');
  if (!strategy.indicators || strategy.indicators.length === 0) {
    errors.push('At least one indicator required');
  }
  
  // Validate indicator types
  const validIndicatorTypes = ['SMA', 'EMA', 'RSI', 'MACD', 'BBANDS'];
  strategy.indicators?.forEach((ind, i) => {
    if (!validIndicatorTypes.includes(ind.type)) {
      errors.push(`Invalid indicator type at index ${i}: ${ind.type}`);
    }
  });
  
  // Validate entry/exit rules exist
  if (!strategy.entryRules || !strategy.entryRules.conditions) {
    errors.push('Entry rules are required');
  }
  
  // Validate parameter ranges
  if (strategy.riskManagement?.stopLoss?.value) {
    const sl = strategy.riskManagement.stopLoss.value;
    if (sl < 0 || sl > 50) {
      errors.push('Stop loss should be between 0-50%');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

**6. Fallback Handling**

If AI fails to generate valid strategy:

```typescript
if (!isValidJSON(aiResponse)) {
  // Ask AI to try again with more explicit instructions
  await sendMessage({
    role: 'user',
    content: `The strategy configuration wasn't in valid JSON format. Please provide ONLY the JSON object with no additional text before or after it.`
  });
}
```

**7. Cost Management**

Track API costs:

```typescript
interface APIUsage {
  conversation_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;  // Calculate based on model pricing
  timestamp: Date;
}

// Anthropic Claude Sonnet 4.5 pricing (as of Oct 2025):
// Input: $3 per million tokens
// Output: $15 per million tokens
```

Set limits:
- Max tokens per conversation: 100,000
- Max conversations per user per day: 20
- Warning at 80% of limits

**8. Testing Prompts**

Test your prompts with diverse inputs:

```typescript
const testCases = [
  "I want a simple moving average strategy",
  "RSI below 30 means buy, above 70 means sell",
  "Trade the golden cross with momentum confirmation",
  "Bollinger band mean reversion",
  "What's the best indicator for day trading?",
  "I want to make 50% per month",  // Unrealistic expectations
  "Buy when price goes up",  // Vague
  "MACD and RSI and SMA and EMA and volume",  // Overfitting
];

// Test each and verify:
// - AI asks appropriate clarifying questions
// - AI warns about issues  
// - Generated JSON is valid
// - Strategy logic makes sense
```

---

### Backend API Endpoints for AI Conversations

Design RESTful endpoints for managing conversations:

```
POST   /api/conversations              # Create new conversation
GET    /api/conversations              # List user's conversations  
GET    /api/conversations/:id          # Get conversation with messages
DELETE /api/conversations/:id          # Delete conversation
POST   /api/conversations/:id/messages # Send message, get AI response
PUT    /api/conversations/:id/messages/:messageId # Edit message
POST   /api/conversations/:id/regenerate # Regenerate last AI response
POST   /api/conversations/:id/apply-strategy # Finalize and save strategy
```

**Example Request/Response:**

```typescript
// POST /api/conversations/:id/messages
// Request:
{
  "content": "I want a golden cross strategy",
  "stream": true  // Enable streaming
}

// Streaming Response (Server-Sent Events):
event: message_start
data: {"message_id": "msg_123"}

event: content_delta
data: {"delta": "The golden cross is a classic"}

event: content_delta  
data: {"delta": " bullish signal! This happens when"}

event: message_complete
data: {"message_id": "msg_123", "usage": {"input_tokens": 234, "output_tokens": 456}}

// OR Non-streaming Response:
{
  "message_id": "msg_123",
  "role": "assistant",
  "content": "The golden cross is a classic bullish signal! ...",
  "usage": {
    "input_tokens": 234,
    "output_tokens": 456
  },
  "generated_strategy": null  // or StrategyConfig if AI generated one
}
```

---

## Data Models

### Strategy
```typescript
{
  id: string
  name: string
  description: string
  indicators: Indicator[]
  entryRules: Rule[]
  exitRules: Rule[]
  riskManagement: RiskSettings
  conversationId?: string  // Link to conversation that created this strategy
  createdAt: Date
  updatedAt: Date
}
```

### Conversation
```typescript
{
  id: string
  strategyId?: string  // Null until strategy is finalized
  messages: Message[]
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  updatedAt: Date
}
```

### Message
```typescript
{
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    generatedStrategy?: StrategyConfig  // If AI generated a strategy in this message
    tokenCount?: number
  }
}
```

### Backtest
```typescript
{
  id: string
  strategyId: string
  ticker: string
  startDate: Date
  endDate: Date
  timeframe: string
  initialCapital: number
  results: BacktestResults
  trades: Trade[]
  executedAt: Date
}
```

### Trade
```typescript
{
  id: string
  backtestId: string
  ticker: string
  entryDate: Date
  entryPrice: number
  exitDate: Date
  exitPrice: number
  quantity: number
  side: 'long' | 'short'
  pnl: number
  pnlPercent: number
  commission: number
}
```

## Non-Functional Requirements

### Expression Evaluation Engine

**Requirements:**
- Safe evaluation of user-defined expressions
- Support for arithmetic, comparison, and logical operators
- Array indexing for historical data
- Custom function implementations (cross_above, highest, etc.)
- No arbitrary code execution (security)
- Performance optimization for bar-by-bar evaluation

**Implementation Approach:**

```typescript
// Expression evaluation context
interface EvaluationContext {
  // Current bar OHLCV
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  
  // Historical data (indexed arrays)
  open_series: number[];
  high_series: number[];
  low_series: number[];
  close_series: number[];
  volume_series: number[];
  
  // Indicator values
  indicators: Record<string, number | {[key: string]: number}>;
  
  // Position info (for exit rules)
  entry_price?: number;
  entry_time?: Date;
  position_size?: number;
  unrealized_pnl?: number;
  
  // Current bar index
  current_index: number;
}

// Custom functions
const customFunctions = {
  // Array indexing: close[1] translates to accessing close_series
  cross_above: (series1: number[], series2: number[], index: number) => {
    if (index < 1) return false;
    return series1[index] > series2[index] && 
           series1[index - 1] <= series2[index - 1];
  },
  
  cross_below: (series1: number[], series2: number[], index: number) => {
    if (index < 1) return false;
    return series1[index] < series2[index] && 
           series1[index - 1] >= series2[index - 1];
  },
  
  highest: (series: number[], period: number, index: number) => {
    const start = Math.max(0, index - period + 1);
    return Math.max(...series.slice(start, index + 1));
  },
  
  lowest: (series: number[], period: number, index: number) => {
    const start = Math.max(0, index - period + 1);
    return Math.min(...series.slice(start, index + 1));
  },
  
  avg: (series: number[], period: number, index: number) => {
    const start = Math.max(0, index - period + 1);
    const slice = series.slice(start, index + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }
};

// Expression parser needs to:
// 1. Convert "close[1]" to "close_series[current_index - 1]"
// 2. Convert "close" to "close_series[current_index]"  
// 3. Convert indicator IDs to lookups: "sma_50" to "indicators.sma_50"
// 4. Handle dot notation for multi-value indicators: "bb.upper"
```

**Recommended Libraries:**
- **expr-eval**: Lightweight expression evaluator, can extend with custom functions
- **mathjs**: More feature-rich but heavier, good for complex math
- **Custom parser**: Using PEG.js or similar for full control

**Security Considerations:**
- Whitelist allowed variables and functions only
- No eval() or Function() constructor
- Sandbox execution context
- Validate expressions before backtesting
- Set execution time limits per expression

**Time-Aligned Calculation Considerations:**

For custom indicators like time-aligned ATR:
- **Data Requirements:** Need sufficient historical depth (14+ days for 14-period time-aligned)
- **Missing Data Handling:** Handle market holidays, half-days, data gaps gracefully
- **Timezone Management:** Ensure consistent time-of-day matching across DST changes
- **Performance:** Cache time-aligned bar lookups to avoid repeated scans
- **Edge Cases:** 
  - First days of data (fewer than N periods available)
  - Different trading hours (early close days)
  - Overnight/weekend gaps

**Implementation Approach:**

```typescript
// Pre-process data to build time-of-day index
interface TimeAlignedIndex {
  [timeOfDay: string]: {  // e.g., "10:30"
    [date: string]: number;  // date -> bar index
  };
}

// Build index once when loading data
function buildTimeIndex(data: OHLCVBar[]): TimeAlignedIndex {
  const index: TimeAlignedIndex = {};
  
  data.forEach((bar, i) => {
    const time = getTimeOfDay(bar.timestamp);  // "10:30"
    const date = getDate(bar.timestamp);  // "2025-03-15"
    
    if (!index[time]) index[time] = {};
    index[time][date] = i;
  });
  
  return index;
}

// Fast lookup for time-aligned bars
function getTimeAlignedBars(
  index: TimeAlignedIndex,
  currentBar: OHLCVBar,
  periods: number
): number[] {
  const time = getTimeOfDay(currentBar.timestamp);
  const currentDate = getDate(currentBar.timestamp);
  const barIndices: number[] = [];
  
  // Walk backwards through dates
  let date = new Date(currentDate);
  let found = 0;
  
  while (found < periods && date > minDate) {
    const dateStr = formatDate(date);
    if (index[time]?.[dateStr]) {
      barIndices.push(index[time][dateStr]);
      found++;
    }
    date.setDate(date.getDate() - 1);
  }
  
  return barIndices;
}
```

### Performance
- Backtest execution should complete within reasonable time (< 30 seconds for 1 year of daily data)
- **Expression evaluation optimization:**
  - Pre-compile expressions before backtesting loop
  - Cache compiled expressions
  - Vectorize operations where possible for multiple bars
  - Consider using typed arrays for OHLCV data
- Support backtesting multiple strategies in parallel
- Efficient data caching to minimize API calls
- Database indexing on ticker and date columns

### Scalability
- Design database schema to support multiple users (future)
- Modular architecture for easy addition of new indicators
- Support for portfolio-level backtesting (multiple tickers simultaneously)

### Usability
- Intuitive UI with clear navigation
- Helpful error messages
- Loading states during data fetching and backtesting
- Form validation for all user inputs

### Security
- Secure storage of API keys
- Input validation to prevent injection attacks
- Rate limiting on API endpoints

## Future Enhancements (Optional)
- Walk-forward optimization
- Monte Carlo simulation
- Portfolio optimization
- Multi-asset strategies
- Options backtesting
- Machine learning strategy integration
- Real-time paper trading
- User authentication and multi-user support
- Strategy marketplace/sharing
- **Advanced time-aware features:**
  - Multiple timeframe analysis in single strategy
  - Session-based indicators (separate calculations for pre-market, regular hours, after-hours)
  - Day-of-week aligned indicators (e.g., every Monday's data)
  - Volume profile and time-price analysis
  - Anchored indicators (VWAP from market open, session high/low)
  - Calendar-aware calculations (month-end, quarter-end patterns)

## Getting Started Guide for Claude Code

To implement this application:

1. **Initialize Project**
   - Create a monorepo structure with `backend` and `frontend` folders
   - Set up TypeScript configuration
   - Install necessary dependencies

2. **Backend First**
   - Set up Express server with basic routing
   - Implement Polygon API client with data fetching
   - **Set up AI integration:**
     - Create service layer for Claude/ChatGPT API calls
     - Implement the complete system prompt from the Prompt Engineering Guide (include expression language documentation)
     - Design conversation management endpoints (create, list, get, continue)
     - Add streaming support for real-time AI responses using Server-Sent Events or WebSockets
     - Create prompt templates with platform capabilities context
     - Implement JSON extraction and validation for AI-generated strategies
     - Add token usage tracking
   - **Build expression evaluation engine:**
     - Implement safe expression parser (using expr-eval, mathjs, or custom)
     - Add support for array indexing: close[1], high[5], etc.
     - Implement custom functions: cross_above(), cross_below(), highest(), lowest(), avg()
     - Create evaluation context with OHLCV data and indicators
     - Add expression validation and security checks
     - Pre-compile expressions for performance
   - Create SQLite database schema and models (including conversations and messages)
   - Build backtesting engine core logic with bar-by-bar simulation
   - Implement indicator calculations (SMA, EMA, RSI, MACD, Bollinger Bands, ATR, etc.)
   - **Implement custom indicator framework:**
     - Time-aligned calculations (same time-of-day across multiple days)
     - Custom indicator registry/plugin system
     - Support for multi-timeframe data access
     - Time-of-day utility functions
   - Create REST API endpoints for frontend

3. **Frontend Second**
   - Set up React app with routing
   - Create reusable UI components
   - **Build conversational strategy builder:**
     - Chat interface with message streaming
     - Strategy preview panel (shows JSON or visual representation)
     - Markdown rendering for AI responses  
     - Edit and regenerate message functionality
     - "Apply Strategy" workflow
   - Build manual strategy configuration forms (alternative to chat)
   - Implement data visualization components
   - Connect to backend API
   - Add state management

4. **Testing**
   - Test with real Polygon data
   - **Test AI conversation flows extensively:**
     - Use the test cases from Prompt Engineering Guide
     - Verify strategy generation from various natural language descriptions
     - Test with complex strategies (ATR-based, multi-condition, expression-heavy)
     - Test with vague inputs (should ask clarifying questions)
     - Test with unrealistic expectations (should provide warnings)
     - Test with complex multi-indicator strategies
     - Validate all generated JSON outputs
     - Test conversation context retention across multiple messages
     - Test edit/regenerate functionality
   - **Test expression evaluation engine:**
     - Test all operators: arithmetic, comparison, logical
     - Test array indexing: close[1], high[10], etc.
     - Test custom functions: cross_above(), highest(), avg(), etc.
     - Test with edge cases: first bar (no history), insufficient data
     - Test security: invalid expressions, injection attempts
     - Test performance: complex expressions on large datasets
     - Validate expression results against manual calculations
   - **Test custom indicators:**
     - Test time-aligned ATR calculation accuracy
     - Verify time-of-day matching across multiple days
     - Test with missing data (holidays, gaps)
     - Test edge cases: insufficient history, DST changes
     - Compare time-aligned vs standard indicators
     - Validate performance of time-aligned lookups
   - Validate calculation accuracy for all indicators (SMA, EMA, RSI, MACD, ATR, etc.)
   - Test edge cases (no trades, all losses, consecutive stop losses, etc.)
   - Test stop loss and take profit execution with expression-based rules
   - Test position sizing calculations (fixed, percentage, risk-based)

5. **Prompt Refinement** (Ongoing)
   - Collect real user conversations
   - Identify where AI struggles or misunderstands
   - Refine system prompts based on findings
   - Add more few-shot examples for edge cases
   - Adjust temperature/parameters for better results

5. **Documentation**
   - Add README with setup instructions
   - Document API endpoints
   - Include example strategies

## Success Criteria
- Successfully fetch data from Polygon API
- **Conversational strategy builder works smoothly:**
  - AI understands diverse strategy descriptions in natural language
  - AI asks appropriate clarifying questions when needed
  - AI provides helpful warnings about pitfalls (overfitting, unrealistic expectations)
  - AI explains trading concepts clearly when asked
  - Generated strategies are valid, executable, and match user intent
  - JSON output is consistently well-formed and validated
  - Chat interface is responsive with real-time streaming
  - Users can edit and refine strategies through conversation
  - Conversation context is maintained throughout the session
- Execute backtests with accurate trade simulation
- Display performance metrics correctly with clear visualizations
- Visualize results clearly with interactive charts
- Responsive and intuitive user interface for both chat and manual modes
- Reliable error handling and data validation throughout
- System prompts effectively guide AI to be educational and helpfulUser: "I want a simple RSI strategy"User: "I want a simple RSI strategy"User: "I want a simple RSI strategy"User: "I want a simple RSI strategy"User: "I want a simple RSI strategy"#### Few-Shot Learning Examples

Add these to your system prompt to demonstrate desired conversation patterns:

```
EXAMPLE 1 - Simple RSI Strategy Building:

User: "I want a simple RSI strategy"User: "I want a simple RSI strategy"```
EXAMPLE 1 - Simple RSI Strategy Building:

User: "I want a simple RSI strategy"```
EXAMPLE 1 - Simple RSI Strategy Building:

User: "I want a simple RSI strategy"- Maintain enthusiasm and supportiveness
```

---

### Additional Prompt Engineering Components

#### Strategy Validation Prompts

When a user proposes a strategy that might have issues, use these validation patterns:

**Detecting Overfitting:**
```
I notice your strategy has 5+ indicators and very specific conditions. This might lead to overfitting - where the strategy works great on historical data but fails in live trading. 

Would you like me to simplify it? We could focus on the 2-3 most important signals.
```

**Warning About Look-Ahead Bias:**
```
Just to clarify - this strategy will only use information available at the time of each trade, right? We want to avoid "peeking into the future" which would make backtest results unrealistic.
```

**Unrealistic Expectations:**
```
A 50% monthly return is extremely high and unlikely to be sustainable. Even professional traders target 10-20% annually. Would you like to set more conservative targets, or should we backtest this and see what realistic returns look like?
```

#### Error Handling Prompts

**When User Description is Vague:**
```
I want to help you build this strategy, but I need a bit more detail. Could you tell me:
- What signals should trigger a buy?
- What signals should trigger a sell?
- Are you thinking day trading, swing trading, or longer-term?
```

**When Combining Incompatible Indicators:**
```
I notice you want to combine indicators that might give conflicting signals. [Indicator A] works best in trending markets, while [Indicator B] works best in ranging markets. 

Would you like to:
1. Choose one approach
2. Add a filter to detect market conditions
3. Test both separately
```

**When Parameters Are Missing:**
```
Great strategy idea! To complete it, I need to know:
- What RSI period? (typically 14)
- What RSI levels for oversold/overbought? (typically 30/70)
- Position size: fixed amount or percentage of portfolio?
```

#### Educational Prompts

**When User Asks "What indicator should I use?":**
```
Great question! The best indicator depends on your trading style:

**For Trend Following:**
- Moving averages (SMA/EMA) - spot trends
- MACD - momentum and trend direction

**For Mean Reversion:**
- RSI - overbought/oversold
- Bollinger Bands - price extremes

**For Volatility:**
- Bollinger Bands width
- ATR (coming soon to platform)

What type of market behavior do you want to capitalize on?
```

**When User Asks About Risk Management:**
```
Excellent question - risk management is crucial! Here are the key components:

**Stop Loss:** Limits your loss on any single trade
- Typical: 2-5% below entry
- Tighter stops = more frequent small losses
- Wider stops = fewer but potentially larger losses

**Position Sizing:** How much to invest per trade
- Fixed $ amount: Simple but doesn't scale
- % of portfolio: Scales with account size
- Risk-based: Size position so you only risk X% of capital

**Take Profit:** Lock in gains
- Fixed %: Simple and consistent
- Risk/reward ratio: e.g., 2:1 (make $2 for every $1 risked)

What's your risk tolerance?
```

#### Multi-Turn Conversation Management

**Track Conversation State:**
```typescript
interface ConversationState {
  stage: 'initial' | 'clarifying' | 'building' | 'refining' | 'generating';
  strategyDraft: Partial<StrategyConfig>;
  clarificationQuestions: string[];
  userPreferences: {
    timeframe?: string;
    riskTolerance?: 'low' | 'medium' | 'high';
    tradingStyle?: 'scalping' | 'day' | 'swing' | 'position';
  };
}
```

**Stage-Specific Prompting:**

**Initial Stage:**
```
User just described basic strategy idea. Extract:
- Core concept (trend following, mean reversion, momentum, etc.)
- Any mentioned indicators
- Timeframe hints
- Risk tolerance hints

Ask 2-3 clarifying questions about missing critical information.
```

**Clarifying Stage:**
```
User has answered some questions. Current understanding:
- Strategy type: [extracted]
- Indicators mentioned: [list]
- Entry logic: [extracted or "unclear"]
- Exit logic: [extracted or "unclear"]

If entry/exit logic is clear, move to building stage.
If not, ask specific questions about missing pieces.
```

**Building Stage:**
```
All core components identified. Now suggest:
- Appropriate indicator parameters
- Risk management options
- Potential improvements or filters

Summarize strategy and ask for confirmation before generating.
```

**Refining Stage:**
```
Strategy generated but user wants changes.
Current strategy: [show JSON or summary]
User request: [latest message]

Identify what to modify and explain the change.
```

#### Complete Conversation Flow Example

```
USER: "I want to trade the golden cross"

ASSISTANT: "The golden cross is a classic bullish signal! This happens when a shorter moving average crosses above a longer one, typically the 50-day crossing above the 200-day.

A few questions to help me build this properly:

1. **Timeframe:** Are you thinking daily charts (position trading), hourly (swing trading), or shorter?
2. **Exit strategy:** Should we exit on the death cross (50 crosses below 200), or would you prefer a trailing stop or profit target?
3. **Position sizing:** How much of your portfolio per trade? 

Also, golden cross signals are infrequent but often reliable. Would you like to add a faster confirmation indicator like RSI to catch more opportunities?"

USER: "Daily charts, and yes exit on death cross. 25% of portfolio. No extra indicators"

ASSISTANT: "Perfect! Here's what I'm setting up:

**Entry Signal:** 
- SMA(50) crosses above SMA(200)
- This is the 'golden cross' - typically indicates strong bullish trend

**Exit Signal:**
- SMA(50) crosses below SMA(200)  
- This is the 'death cross' - trend reversal signal

**Position Size:** 25% of portfolio per trade
**Max Positions:** 1 (since we're using all crossovers)

For risk management, I recommend adding:
- **Stop loss:** 8% below entry (protects if trend fails quickly)
- **Max holding time:** None (let the death cross dictate exit)

The golden cross is a long-term strategy - you might only get 1-3 signals per year, but they tend to catch major trends.

Should I generate this, or would you like to adjust anything?"

USER: "Looks good, generate it"

ASSISTANT: "Excellent! Here's your Golden Cross Strategy:

```json
{
  "name": "Golden Cross Strategy",
  "description": "Buy when 50-day SMA crosses above 200-day SMA, sell on death cross",
  "timeframe": "1day",
  "indicators": [
    {
      "type": "SMA",
      "params": {"period": 50},
      "id": "sma_50"
    },
    {
      "type": "SMA",
      "params": {"period": 200},
      "id": "sma_200"
    }
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "sma_50",
        "indicator2": "sma_200",
        "direction": "above"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "sma_50",
        "indicator2": "sma_200",
        "direction": "below"
      }
    ],
    "logic": "AND"
  },
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "percentage",
      "value": 8
    },
    "takeProfit": {
      "enabled": false
    },
    "positionSizing": {
      "type": "percentage_of_portfolio",
      "value": 25
    },
    "maxConcurrentPositions": 1
  },
  "commission": {
    "type": "per_trade",
    "value": 1
  },
  "slippage": 0.1
}
```

**Strategy Summary:**
This is a trend-following strategy that enters on the bullish golden cross signal and exits on the bearish death cross. With 25% position sizing, you'll make substantial moves when trends develop. The 8% stop loss protects against false signals.

**What to expect:**
- Low frequency: 1-4 trades per year typically
- Long holding periods: Often 6-12 months
- Works best in trending markets
- May underperform in choppy/ranging markets

Ready to backtest this? Pick a ticker and date range!"

USER: "Can we add RSI confirmation now?"

ASSISTANT: "Absolutely! Adding RSI confirmation can help filter out weaker signals. There are a few ways to do this:

**Option 1 - Strength Confirmation (Recommended)**
Only enter golden cross if RSI > 50 (shows momentum is actually positive)

**Option 2 - Oversold Bounce**  
Only enter golden cross if RSI < 70 (avoid overbought entries)

**Option 3 - Trend Strength**
Only enter if RSI > 60 (very strong momentum required)

Which approach sounds better to you? Option 1 is most popular for golden cross strategies."

USER: "Option 1"

ASSISTANT: "Perfect choice! I'll update the strategy to require RSI > 50 at the time of the golden cross. This ensures we're only entering when price momentum confirms the bullish signal.

Here's the updated entry condition:
- SMA(50) crosses above SMA(200) **AND**
- RSI(14) > 50

This should reduce false signals while keeping the core golden cross logic intact. Let me regenerate the full JSON..."

[Regenerates strategy with additional RSI indicator and updated entry rules]
```

**Example 4: Complex ATR-Based Strategy**

```
USER: "I want to enter when a 5 minute candle moves 2x the 14-period ATR and exit when the price crosses the previous candle's low for long positions"

AI: "That's a volatility breakout strategy - excellent for catching momentum moves! Let me break down what you're describing:

**Entry Signal:**
You want to capture explosive moves where a single 5-minute candle's body (close - open) exceeds twice the Average True Range. This indicates unusual volatility and potential momentum.

**Exit Signal:**  
You'll exit when price breaks below the previous candle's low, which serves as a quick stop if momentum fails.

A few questions to refine this:

1. **Direction:** Should we only take long positions (bullish candles), or also short positions (bearish candles)?

2. **Candle type:** Do you mean the absolute body size `abs(close - open)`, or specifically bullish candles where `close > open`?

3. **ATR multiplier:** You said 2x ATR - would you also like a stop loss further back, say at 1.5x ATR below entry, in case price gaps against you?

4. **Volume filter:** These breakout strategies often work better with volume confirmation. Should we require volume above average?"

USER: "Only long positions with bullish candles. Yes to the 1.5 ATR stop loss. No volume filter for now."

AI: "Perfect! Here's your ATR Breakout Strategy:

**Strategy Logic:**
- **Entry:** When a bullish 5-min candle (close > open) has a body exceeding 2x the 14-period ATR
- **Exit:** When price breaks below the previous candle's low  
- **Stop Loss:** 1.5x ATR below entry price (automatic protection)

This captures volatile breakout moves while using the previous low as a quick exit if momentum stalls. The ATR-based stop provides additional protection.

**Risk Considerations:**
- This will generate infrequent but high-conviction trades
- 5-minute timeframe means you'll need to monitor actively or use automated execution
- Slippage can be significant on volatile breakouts - I'll set 0.2% slippage

Should I generate the complete strategy configuration?"

USER: "Yes"

AI: "Here's your ATR Breakout Strategy:

```json
{
  "name": "ATR Volatility Breakout",
  "description": "Enter on explosive 5-min candles exceeding 2x ATR, exit on previous low break",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "ATR",
      "params": {"period": 14},
      "id": "atr_14"
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle"
      },
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_14",
        "description": "Candle body exceeds 2x ATR"
      }
    ],
    "logic": "AND"
  },
  
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < low[1]",
        "description": "Price breaks below previous candle's low"
      }
    ],
    "logic": "OR"
  },
  
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price - 1.5 * atr_14",
      "description": "Stop loss at 1.5 ATR below entry"
    },
    "takeProfit": {
      "enabled": false
    },
    "positionSizing": {
      "type": "risk_based",
      "riskPerTrade": 1,
      "description": "Risk 1% of portfolio per trade"
    },
    "maxConcurrentPositions": 2
  },
  
  "commission": {
    "type": "per_trade",
    "value": 1
  },
  "slippage": 0.2
}
```

**Key Features:**
- **Expression-based conditions:** Uses `(close - open) > 2 * atr_14` to calculate candle body vs ATR
- **Historical reference:** Uses `low[1]` to reference previous candle's low
- **Dynamic stop loss:** Stop is calculated as `entry_price - 1.5 * atr_14` for each trade
- **Risk-based sizing:** Automatically calculates position size to risk 1% per trade

**What to Expect:**
- Low frequency: Maybe 1-5 trades per day depending on ticker volatility
- Fast exits: Most trades will exit within a few candles
- Works best with: Volatile stocks, momentum stocks, during high-volume periods
- Avoid: Very choppy or low-liquidity stocks

Ready to backtest this on your chosen ticker?"
```
```

**Example 5: Time-Aligned ATR Strategy**

```
USER: "Is it possible to calculate ATR using the same 5-minute time period from the past 14 days instead of just the last 14 bars?"

AI: "Absolutely! That's a time-aligned ATR calculation, and it's actually a sophisticated approach that can be very useful for intraday strategies.

**What you're describing:**
Instead of standard ATR that uses the last 14 consecutive bars (which could be 14 different times of day), you want ATR calculated from:
- Today's 10:30 AM bar
- Yesterday's 10:30 AM bar  
- Day before's 10:30 AM bar
- ... back 14 days

**Why this is powerful:**
- Captures time-of-day volatility patterns
- More relevant for strategies sensitive to market hours
- Accounts for consistent opening volatility, lunchtime lull, closing surge, etc.

**How we'll implement it:**
```json
{
  "indicators": [
    {
      "type": "CUSTOM",
      "id": "atr_time_aligned", 
      "calculation": {
        "method": "time_aligned_atr",
        "params": {
          "periods": 14,
          "alignment": "same_time_of_day"
        }
      },
      "description": "14-period ATR using same 5-min time from past 14 days"
    }
  ]
}
```

Now, what's your entry condition? Are you still looking at candle body > 2x this time-aligned ATR?"

USER: "Yes, exactly that"

AI: "Perfect! Here's your time-aligned ATR breakout strategy:

```json
{
  "name": "Time-Aligned ATR Breakout",
  "description": "Volatility breakout using time-of-day aligned ATR calculation",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "CUSTOM",
      "id": "atr_aligned",
      "calculation": {
        "method": "time_aligned_atr",
        "params": {
          "periods": 14,
          "alignment": "same_time_of_day"
        }
      },
      "description": "ATR calculated from same 5-min time over past 14 days"
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle"
      },
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_aligned",
        "description": "Candle body exceeds 2x time-aligned ATR"
      }
    ],
    "logic": "AND"
  },
  
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < low[1]",
        "description": "Price breaks below previous candle's low"
      }
    ],
    "logic": "OR"
  },
  
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price - 1.5 * atr_aligned",
      "description": "Stop loss at 1.5x time-aligned ATR below entry"
    },
    "takeProfit": {
      "enabled": false
    },
    "positionSizing": {
      "type": "risk_based",
      "riskPerTrade": 1
    },
    "maxConcurrentPositions": 2
  },
  
  "commission": {"type": "per_trade", "value": 1},
  "slippage": 0.2
}
```

**Key Advantages of This Approach:**
- ATR at 10:00 AM reflects typical 10:00 AM volatility (not mixed with afternoon or morning open)
- More accurate threshold for what constitutes an "unusual" move at that specific time
- Adapts to intraday volatility patterns

**Data Requirements:**
- You'll need at least 14 days of 5-minute historical data
- The system will automatically find bars at the same time across days
- If a day is missing (holiday, etc.), it uses the next available prior day

**Testing Recommendation:**
Compare this against standard 14-bar ATR to see if the time alignment improves performance for your strategy.

Ready to backtest?"
```
```

#### Implementation Best Practices

**1. Prompt Chaining for Complex Strategies**

Break complex strategy generation into steps:

```
Step 1: Extract user intent and strategy type
Step 2: Identify required indicators
Step 3: Formulate entry logic
Step 4: Formulate exit logic  
Step 5: Add risk management
Step 6: Generate final JSON
```

**2. Token Management**

- System prompt: ~2000-3000 tokens
- Reserve ~1000 tokens for user message + context
- Reserve ~2000 tokens for AI response
- Total: ~5000-6000 tokens per API call
- For Claude Sonnet: Well within context limits
- Store full conversation history in database, but send only recent context (last 5-10 messages) to API

**3. Streaming Implementation**

```typescript
// Enable streaming for real-time responses
const stream = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 2000,
  messages: messages,
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    // Send chunk to frontend via WebSocket
    ws.send(JSON.stringify({
      type: 'ai_response_chunk',
      content: chunk.delta.text
    }));
  }
}
```

**4. JSON Extraction**

AI might wrap JSON in markdown code blocks. Extract it:

```typescript
function extractJSON(aiResponse: string): any {
  // Look for JSON in code blocks
  const codeBlockMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1]);
  }
  
  // Look for raw JSON
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  throw new Error('No valid JSON found in response');
}
```

**5. Validation Layer**

Always validate AI-generated strategy before saving:

```typescript
function validateStrategy(strategy: any): ValidationResult {
  const errors = [];
  
  // Check required fields
  if (!strategy.name) errors.push('Strategy name is required');
  if (!strategy.indicators || strategy.indicators.length === 0) {
    errors.push('At least one indicator required');
  }
  
  // Validate indicator types
  const validIndicatorTypes = ['SMA', 'EMA', 'RSI', 'MACD', 'BBANDS'];
  strategy.indicators?.forEach((ind, i) => {
    if (!validIndicatorTypes.includes(ind.type)) {
      errors.push(`Invalid indicator type at index ${i}: ${ind.type}`);
    }
  });
  
  // Validate entry/exit rules exist
  if (!strategy.entryRules || !strategy.entryRules.conditions) {
    errors.push('Entry rules are required');
  }
  
  // Validate parameter ranges
  if (strategy.riskManagement?.stopLoss?.value) {
    const sl = strategy.riskManagement.stopLoss.value;
    if (sl < 0 || sl > 50) {
      errors.push('Stop loss should be between 0-50%');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

**6. Fallback Handling**

If AI fails to generate valid strategy:

```typescript
if (!isValidJSON(aiResponse)) {
  // Ask AI to try again with more explicit instructions
  await sendMessage({
    role: 'user',
    content: `The strategy configuration wasn't in valid JSON format. Please provide ONLY the JSON object with no additional text before or after it.`
  });
}
```

**7. Cost Management**

Track API costs:

```typescript
interface APIUsage {
  conversation_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;  // Calculate based on model pricing
  timestamp: Date;
}

// Anthropic Claude Sonnet 4.5 pricing (as of Oct 2025):
// Input: $3 per million tokens
// Output: $15 per million tokens
```

Set limits:
- Max tokens per conversation: 100,000
- Max conversations per user per day: 20
- Warning at 80% of limits

**8. Testing Prompts**

Test your prompts with diverse inputs:

```typescript
const testCases = [
  "I want a simple moving average strategy",
  "RSI below 30 means buy, above 70 means sell",
  "Trade the golden cross with momentum confirmation",
  "Bollinger band mean reversion",
  "What's the best indicator for day trading?",
  "I want to make 50% per month",  // Unrealistic expectations
  "Buy when price goes up",  // Vague
  "MACD and RSI and SMA and EMA and volume",  // Overfitting
];

// Test each and verify:
// - AI asks appropriate clarifying questions
// - AI warns about issues  
// - Generated JSON is valid
// - Strategy logic makes sense
```

---

#### Few-Shot Learning Examples

Add these to your system prompt to demonstrate desired conversation patterns:

```
EXAMPLE 1 - Simple RSI Strategy Building:

User: "I want a simple RSI strategy"**Example 1: Simple RSI Strategy**
```
User: "I want a simple RSI strategy"**Example 1: Simple RSI Strategy**
```
User: "I want a simple RSI strategy"- Maintain enthusiasm and supportiveness
```

### Few-Shot Examples for System Prompt

Include these conversation examples in your system prompt to teach the AI the desired interaction pattern:

**Example 1: Simple RSI Strategy**
```
User: "I want a simple RSI strategy"- Maintain enthusiasm and supportiveness

# FEW-SHOT EXAMPLES

## Example 1: Simple Strategy
User: "I want a simple RSI strategy"# FEW-SHOT EXAMPLES

## Example 1: Simple Strategy
User: "I want a simple RSI strategy"## Example 1: Simple Strategy
User: "I want a simple RSI strategy"- Never imply that backtesting = future performance

## Common Pitfalls to Warn Users About
- Overfitting: Too many indicators or conditions
- Look-ahead bias: Using future information
- Survivorship bias: Only testing on successful stocks
- Unrealistic assumptions: No slippage, no commissions
- Curve fitting: Optimizing too specifically to historical data
- Ignoring market regime changes

# RESPONSE STYLE
- Use clear paragraphs, not excessive bullet points unless listing options
- Bold key terms for emphasis
- Use code blocks only for JSON output
- Keep explanations concise but thorough
- Use examples to illustrate concepts
- Maintain enthusiasm and supportiveness

# FEW-SHOT EXAMPLES

## Example 1: Simple Strategy
User: "I want a simple RSI strategy"```
# EXAMPLE CONVERSATION 1

User: "I want a simple RSI strategy"**Include these examples in your system prompt to guide AI responses:**

```
# EXAMPLE CONVERSATION 1

User: "I want a simple RSI strategy"### AI Provider Integration

**Option 1: Anthropic Claude (Recommended)**
- **API**: Anthropic Messages API
- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Features**: 
  - Excellent at structured reasoning and strategy formulation
  - Strong at explaining complex trading concepts
  - Can be prompted to output valid JSON
  - Supports streaming for real-time responses

**Option 2: OpenAI ChatGPT**
- **API**: OpenAI Chat Completions API
- **Model**: GPT-4 or GPT-4 Turbo
- **Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Features**:
  - Function calling for structured outputs
  - Good at conversational strategy building

**AI Implementation Requirements:**
- System prompt that defines AI's role as a trading strategy advisor
- Context about available indicators, rules, and platform capabilities
- Structured output schema for strategy generation
- Conversation memory/context management
- Error handling for API failures
- Token usage tracking and limits

---

## Prompt Engineering Guide

### System Prompt Architecture

The system prompt should be structured in sections to provide clear context and instructions to the AI.

**Complete System Prompt Template:**

```
You are an expert trading strategy advisor helping users design and backtest algorithmic trading strategies. Your role is to guide users through creating strategies in a conversational, educational, and supportive manner.

# PLATFORM CAPABILITIES

## Available Technical Indicators
- Simple Moving Average (SMA): Periods 5-200
- Exponential Moving Average (EMA): Periods 5-200
- Relative Strength Index (RSI): Periods 5-50, standard is 14
- MACD: Fast(12), Slow(26), Signal(9) - configurable
- Bollinger Bands: Period 20, Standard Deviations 2 - configurable
- Volume indicators: On-Balance Volume, Volume SMA
- Average True Range (ATR): Standard and time-aligned variants
- Stochastic, ADX (configurable)

## Custom Indicators
You can define custom indicators for advanced calculations:

**Time-Aligned Indicators:** Calculate using same time-of-day from past N days
- Example: ATR using 10:30 AM bar from past 14 days (not just last 14 bars)
- Useful for intraday strategies sensitive to time-of-day patterns

**Custom Calculation Methods:**
- time_aligned_atr(periods, timeframe) - ATR at same time across days
- time_aligned_sma(periods) - SMA at same time across days
- Custom formulas using expression language

**Example Custom Indicator:**
```json
{
  "type": "CUSTOM",
  "id": "atr_10am",
  "calculation": {
    "method": "time_aligned_atr",
    "params": {"periods": 14, "alignment": "same_time_of_day"}
  }
}
```

## Entry/Exit Conditions
You can create conditions using expressions with this syntax:

**Expression Language:**
- Variables: open, high, low, close, volume (current and historical with [n] notation)
- Indicator values: Use indicator IDs like sma_50, rsi_14, atr_14
- Historical data: close[1] = close from 1 bar ago, high[5] = high from 5 bars ago
- Operators: +, -, *, /, >, <, >=, <=, ==, !=, and, or, not
- Functions: cross_above(), cross_below(), highest(), lowest(), avg(), abs(), max(), min()
- Position data: entry_price, entry_time (available in exit rules)

**Example Expressions:**
- "abs(close - open) > 2 * atr_14" (candle body exceeds 2x ATR)
- "close > high[1]" (breaking previous high)
- "cross_above(sma_20, sma_50)" (golden cross)
- "volume > avg(volume, 20) * 1.5" (volume 1.5x the 20-bar average)
- "low < low[1] and close > open" (higher low with bullish close)
- "close > highest(high, 20)" (new 20-bar high)
- "(high - low) / close > 0.05" (large candle range, 5%+ of price)

**Condition Types:**
1. "expression" type: Boolean expression evaluated on each bar
2. "crossover" type: Convenience shorthand for cross_above/cross_below
3. Combine multiple conditions with AND/OR logic

## Risk Management Options
- Stop Loss: Fixed percentage, fixed dollar amount, or ATR-based
- Take Profit: Fixed percentage, fixed dollar amount, or risk/reward ratio
- Position Sizing: Fixed shares, fixed dollar amount, percentage of portfolio, risk-based (% of capital at risk)
- Max concurrent positions: 1-10

## Order Types
- Market orders (execute at next available price)
- Limit orders (execute at specified price or better)

## Backtesting Parameters
- Date ranges from 2020-01-01 to present
- Timeframes: 1min, 5min, 15min, 30min, 1hour, 1day, 1week
- Commission: $0-10 per trade or 0-0.5% per trade
- Slippage: 0-1% simulated slippage

# YOUR CONVERSATIONAL APPROACH

## Initial Strategy Discussion
When a user first describes a strategy idea:
1. Acknowledge their idea positively
2. Ask 2-3 clarifying questions to understand their goals:
   - What timeframe are they trading? (day trading, swing, long-term)
   - What's their risk tolerance?
   - What market conditions do they expect? (trending, ranging, volatile)
3. Suggest appropriate indicators based on their goals
4. Discuss entry and exit logic

## Building the Strategy
As you refine the strategy:
1. Explain WHY certain combinations work well together
2. Warn about common pitfalls (e.g., overfitting, look-ahead bias, unrealistic assumptions)
3. Suggest risk management parameters appropriate to their strategy
4. Ask if they want to add confirmation indicators or filters

## Educational Moments
When users ask about indicators or concepts:
1. Provide clear, concise explanations
2. Give real-world examples of when/how it's used
3. Mention strengths and weaknesses
4. Suggest how it might fit into a strategy

## Generating Strategy Configuration
When the strategy is well-defined, generate a JSON configuration. Say something like:
"Great! I have all the details I need. Here's your strategy configuration:"

Then output ONLY valid JSON in this exact format:
```json
{
  "name": "Strategy Name",
  "description": "Brief description of the strategy logic",
  "timeframe": "1day",
  "indicators": [
    {
      "type": "SMA",
      "params": {"period": 50},
      "id": "sma_50"
    },
    {
      "type": "RSI",
      "params": {"period": 14},
      "id": "rsi_14"
    }
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "price",
        "indicator2": "sma_50",
        "direction": "above"
      },
      {
        "type": "expression",
        "expression": "rsi_14 < 70",
        "description": "RSI not overbought"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "crossover",
        "indicator1": "price",
        "indicator2": "sma_50",
        "direction": "below"
      }
    ],
    "logic": "AND"
  },
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "percentage",
      "value": 5
    },
    "takeProfit": {
      "enabled": true,
      "type": "percentage",
      "value": 10
    },
    "positionSizing": {
      "type": "percentage_of_portfolio",
      "value": 20
    },
    "maxConcurrentPositions": 3
  },
  "commission": {
    "type": "per_trade",
    "value": 1
  },
  "slippage": 0.1
}
```

**For complex expression-based strategies:**
Use the "expression" condition type when the logic requires:
- Mathematical operations: `(close - open) > 2 * atr_14`
- Historical references: `close > high[1]` or `low[5]`
- Custom calculations: `abs(close - open) / close > 0.03`
- Built-in functions: `cross_above(close, sma_50)`, `highest(high, 20)`, `avg(volume, 20)`

**When using expressions, always:**
1. Include a "description" field explaining what the expression does in plain English
2. Use clear variable names matching the expression language spec
3. Reference indicators by their ID (e.g., "atr_14" not "atr")
4. Use proper syntax: `close[1]` for historical, `cross_above(a, b)` for functions

After generating the JSON, briefly explain the key components and ask if they'd like to adjust anything.

# IMPORTANT GUIDELINES

## What You Should Do
- Be conversational and friendly
- Ask clarifying questions before generating strategy
- Explain trading concepts in simple terms
- Warn about risks and unrealistic expectations
- Suggest sensible default parameters
- Validate strategy logic for obvious flaws
- Encourage backtesting and iteration

## What You Should NOT Do
- Never guarantee profits or returns
- Don't suggest strategies without understanding user goals
- Don't use overly complex technical jargon without explanation
- Don't generate strategies with obvious logical errors
- Don't recommend extremely risky parameters without warning
- Never imply that backtesting = future performance

## Common Pitfalls to Warn Users About
- Overfitting: Too many indicators or conditions
- Look-ahead bias: Using future information
- Survivorship bias: Only testing on successful stocks
- Unrealistic assumptions: No slippage, no commissions
- Curve fitting: Optimizing too specifically to historical data
- Ignoring market regime changes

# RESPONSE STYLE
- Use clear paragraphs, not excessive bullet points unless listing options
- Bold key terms for emphasis
- Use code blocks only for JSON output
- Keep explanations concise but thorough
- Use examples to illustrate concepts
- Maintain enthusiasm and supportiveness
```

### Context Injection Patterns

**Before each API call, inject current conversation context:**

```typescript
// Example context injection for Claude API
const messages = [
  {
    role: 'user',
    content: conversationHistory.map(msg => 
      `${msg.role}: ${msg.content}`
    ).join('\n\n')
  },
  {
    role: 'user', 
    content: currentUserMessage
  }
];
```

**For strategy refinement, include current draft:**

```
<current_strategy>
User is refining this strategy:
Name: RSI Mean Reversion
Current indicators: RSI(14)
Entry: RSI < 30
Exit: RSI > 70
</current_strategy>

User wants to add: "I want to add a moving average filter"
```

**Injecting Available Tickers/Data Context:**

```
<available_data>
User has data for these tickers: AAPL, MSFT, GOOGL, TSLA
Date range available: 2020-01-01 to 2025-10-15
Timeframes available: 1day, 1hour
</available_data>
```

### Structured Output Prompts

**When ready to generate strategy JSON:**

```
Based on our conversation, please generate the complete strategy configuration.

Output ONLY valid JSON matching this schema, with no additional text before or after:

{
  "name": string,
  "description": string,
  "timeframe": "1min" | "5min" | "15min" | "30min" | "1hour" | "1day" | "1week",
  "indicators": Array<{
    "type": "SMA" | "EMA" | "RSI" | "MACD" | "BBANDS",
    "params": object,
    "id": string
  }>,
  "entryRules": {
    "conditions": Array<Condition>,
    "logic": "AND" | "OR"
  },
  "exitRules": {
    "conditions": Array<Condition>,
    "logic": "AND" | "OR"
  },
  "riskManagement": {
    "stopLoss": { "enabled": boolean, "type": string, "value": number },
    "takeProfit": { "enabled": boolean, "type": string, "value": number },
    "positionSizing": { "type": string, "value": number },
    "maxConcurrentPositions": number
  },
  "commission": { "type": string, "value": number },
  "slippage": number
}

After the JSON, on a new line, explain the strategy briefly.
```

---

### Flexible Expression-Based Schema

The schema needs to support complex conditions like:
- Candle movements relative to indicators (e.g., "5min candle moves 2x ATR")
- References to previous bars (e.g., "price crosses previous candle's low")
- Mathematical operations
- Custom calculations

**Updated JSON Schema Design:**

```json
{
  "name": "ATR Breakout Strategy",
  "description": "Enter when 5min candle moves 2x ATR, exit on previous low cross",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "ATR",
      "params": {"period": 14},
      "id": "atr_14"
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_14",
        "description": "Candle body exceeds 2x ATR"
      }
    ],
    "logic": "AND"
  },
  
  "exitRules": {
    "conditions": [
      {
        "type": "expression", 
        "expression": "close < low[1]",
        "description": "Price crosses below previous candle's low"
      }
    ],
    "logic": "OR"
  },
  
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price - 1.5 * atr_14",
      "description": "Stop 1.5 ATR below entry"
    },
    "takeProfit": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price + 3 * atr_14",
      "description": "Target 3 ATR above entry"
    },
    "positionSizing": {
      "type": "risk_based",
      "riskPerTrade": 1,
      "description": "Risk 1% of portfolio per trade"
    },
    "maxConcurrentPositions": 3
  },
  
  "commission": {"type": "per_trade", "value": 1},
  "slippage": 0.1
}
```

**Expression Language Specification:**

```
Available Variables:
- open, high, low, close, volume (current bar)
- open[n], high[n], low[n], close[n], volume[n] (n bars ago)
- entry_price, entry_time (when position opened)
- position_size, unrealized_pnl
- {indicator_id} (e.g., sma_50, rsi_14, atr_14)
- {indicator_id}[n] (indicator value n bars ago)

Available Operators:
- Arithmetic: +, -, *, /, %
- Comparison: >, <, >=, <=, ==, !=
- Logical: and, or, not
- Functions: abs(), max(), min(), avg()

Special Functions:
- cross_above(series1, series2) - series1 crosses above series2
- cross_below(series1, series2) - series1 crosses below series2
- highest(series, period) - highest value in period
- lowest(series, period) - lowest value in period
- change(series, periods) - change over n periods
- percent_change(series, periods) - percentage change

Examples:
- "close > sma_50 and rsi_14 < 70"
- "(close - open) / open > 0.02"
- "cross_above(close, high[1])"
- "volume > avg(volume, 20) * 1.5"
- "abs(close - open) > 2 * atr_14"
```

**Complete Schema Template:**

```typescript
interface StrategyConfig {
  name: string;
  description: string;
  timeframe: string;
  
  // Indicators to calculate
  indicators: Array<{
    type: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BBANDS' | 'ATR' | 'STOCH' | 'ADX' | 'OBV';
    params: Record<string, any>;
    id: string;  // Unique identifier for use in expressions
  }>;
  
  // Entry conditions
  entryRules: {
    conditions: Array<
      | {
          type: 'expression';
          expression: string;  // Boolean expression
          description?: string;
        }
      | {
          type: 'crossover';  // Convenience shorthand
          indicator1: string;
          indicator2: string;
          direction: 'above' | 'below';
          description?: string;
        }
    >;
    logic: 'AND' | 'OR';
  };
  
  // Exit conditions
  exitRules: {
    conditions: Array<
      | {
          type: 'expression';
          expression: string;
          description?: string;
        }
      | {
          type: 'crossover';
          indicator1: string;
          indicator2: string;
          direction: 'above' | 'below';
          description?: string;
        }
    >;
    logic: 'AND' | 'OR';
  };
  
  // Risk management
  riskManagement: {
    stopLoss?: {
      enabled: boolean;
      type: 'percentage' | 'fixed' | 'expression';
      value?: number;  // For percentage/fixed
      expression?: string;  // For expression type
      description?: string;
    };
    takeProfit?: {
      enabled: boolean;
      type: 'percentage' | 'fixed' | 'expression';
      value?: number;
      expression?: string;
      description?: string;
    };
    trailingStop?: {
      enabled: boolean;
      type: 'percentage' | 'atr';
      value: number;
      activation?: number;  // Activate after X% profit
    };
    positionSizing: {
      type: 'fixed_shares' | 'fixed_dollars' | 'percentage_of_portfolio' | 'risk_based';
      value?: number;
      riskPerTrade?: number;  // For risk_based (% of portfolio to risk)
    };
    maxConcurrentPositions: number;
    timeBasedExit?: {
      enabled: boolean;
      maxBarsHeld: number;  // Exit after N bars regardless
    };
  };
  
  // Filters (optional - must be true to allow entry)
  filters?: {
    timeOfDay?: {
      start: string;  // "09:30"
      end: string;    // "15:30"
    };
    daysOfWeek?: number[];  // [1,2,3,4,5] = Mon-Fri
    minimumVolume?: {
      expression: string;  // "volume > 1000000"
    };
    custom?: Array<{
      expression: string;
      description?: string;
    }>;
  };
  
  commission: {
    type: 'per_trade' | 'per_share' | 'percentage';
    value: number;
  };
  slippage: number;  // Percentage
}
```

**Example Strategies:**

**1. Your ATR Breakout Strategy:**
```json
{
  "name": "ATR Breakout",
  "timeframe": "5min",
  "indicators": [{"type": "ATR", "params": {"period": 14}, "id": "atr"}],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "abs(close - open) > 2 * atr",
        "description": "Candle body exceeds 2x ATR"
      },
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle (for long positions)"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < low[1]",
        "description": "Price breaks previous candle's low"
      }
    ],
    "logic": "OR"
  }
}
```

**2. Complex Multi-Timeframe Strategy:**
```json
{
  "name": "Multi-Timeframe Momentum",
  "timeframe": "15min",
  "indicators": [
    {"type": "SMA", "params": {"period": 50}, "id": "sma_50"},
    {"type": "RSI", "params": {"period": 14}, "id": "rsi"},
    {"type": "ATR", "params": {"period": 14}, "id": "atr"}
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "close > sma_50",
        "description": "Above 50 SMA (trend filter)"
      },
      {
        "type": "expression",
        "expression": "rsi > 50 and rsi < 70",
        "description": "RSI in momentum zone"
      },
      {
        "type": "expression",
        "expression": "close > high[1]",
        "description": "Breaking previous high"
      },
      {
        "type": "expression",
        "expression": "volume > avg(volume, 20) * 1.5",
        "description": "Volume surge (use built-in avg function)"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "cross_below(close, sma_50)",
        "description": "Close below 50 SMA"
      },
      {
        "type": "expression",
        "expression": "rsi > 80",
        "description": "Overbought exit"
      }
    ],
    "logic": "OR"
  },
  "riskManagement": {
    "stopLoss": {
      "enabled": true,
      "type": "expression",
      "expression": "min(entry_price - 2 * atr, low[1])",
      "description": "Stop at 2 ATR or previous low, whichever is closer"
    },
    "takeProfit": {
      "enabled": true,
      "type": "expression",
      "expression": "entry_price + 4 * atr"
    }
  }
}
```

**3. Mean Reversion with Bollinger Bands:**
```json
{
  "name": "Bollinger Mean Reversion",
  "timeframe": "1hour",
  "indicators": [
    {"type": "BBANDS", "params": {"period": 20, "std": 2}, "id": "bb"},
    {"type": "RSI", "params": {"period": 14}, "id": "rsi"}
  ],
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "low < bb.lower",
        "description": "Price touches lower band"
      },
      {
        "type": "expression",
        "expression": "rsi < 30",
        "description": "RSI oversold"
      },
      {
        "type": "expression",
        "expression": "close > open",
        "description": "Bullish candle (reversal signal)"
      }
    ],
    "logic": "AND"
  },
  "exitRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "high > bb.middle",
        "description": "Return to middle band"
      },
      {
        "type": "expression",
        "expression": "rsi > 70",
        "description": "RSI overbought"
      }
    ],
    "logic": "OR"
  }
}
```

**Note on Indicator Values:**

For indicators with multiple outputs (like Bollinger Bands or MACD), use dot notation:
- `bb.upper`, `bb.middle`, `bb.lower` for Bollinger Bands
- `macd.line`, `macd.signal`, `macd.histogram` for MACD
- `stoch.k`, `stoch.d` for Stochastic

**Implementation Notes:**

The backend needs to:
1. Parse expression strings into an AST (Abstract Syntax Tree)
2. Provide a safe evaluation context with available variables
3. Validate expressions before execution
4. Support array indexing for historical data: `close[1]` means close from 1 bar ago
5. Implement built-in functions like `cross_above()`, `highest()`, etc.

Use a library like `expr-eval` or `mathjs` for safe expression evaluation, with custom functions for trading-specific operations.
```

### Few-Shot Examples

**Include these examples in your system prompt to guide AI responses:**

```
# EXAMPLE CONVERSATION 1

User: "I want a simple RSI strategy"# Polygon Backtesting App - Requirements Document

## Overview
A comprehensive web-based backtesting platform that allows users to test trading strategies using historical market data from Polygon.io.

## Technical Stack

### Backend
- **Language**: Node.js with TypeScript
- **Framework**: Express.js
- **API Client**: Polygon.io SDK or REST API
- **AI Integration**: Anthropic Claude API (primary) or OpenAI API (alternative)
- **Database**: SQLite for development (easily upgradeable to PostgreSQL)
- **Data Processing**: Support for calculating indicators and executing strategy logic

### Frontend
- **Framework**: React with TypeScript
- **UI Library**: Tailwind CSS + shadcn/ui components
- **Charts**: Recharts or Plotly for visualization
- **State Management**: React Context or Zustand

## Core Features

### 1. Data Management

#### 1.1 Polygon API Integration
- Connect to Polygon.io using API key (stored in environment variables)
- Fetch historical aggregate/bar data for stocks
- Support multiple timeframes:
  - 1 minute, 5 minutes, 15 minutes, 30 minutes, 1 hour
  - Daily, weekly, monthly
- Fetch data for date ranges
- Handle API rate limits gracefully
- Cache fetched data locally to minimize API calls

#### 1.2 Data Storage
- Store fetched historical data in SQLite database
- Schema should include:
  - Ticker symbol
  - Timestamp (with timezone support for intraday data)
  - Open, High, Low, Close prices
  - Volume
  - Timeframe/resolution
  - Time of day (extracted from timestamp for quick filtering)
  - Day of week
- Ability to refresh/update data
- Data validation and cleaning
- **Support for multi-timeframe storage:**
  - Store both 5min and daily data for same ticker
  - Enable time-aligned calculations across days
  - Index on (ticker, timestamp, time_of_day) for efficient queries

### 2. Strategy Definition

#### 2.1 AI-Assisted Strategy Builder
**Conversational Strategy Design** - Primary interface for creating strategies
- Integrate Claude API (Anthropic) or OpenAI ChatGPT API
- Chat-based interface where users describe their strategy ideas in natural language
- AI assistant helps refine and formalize strategy logic through conversation
- AI suggests improvements, asks clarifying questions, and validates logic

**Conversation Flow Examples:**
- User: "I want to buy when the price crosses above the 50-day moving average"
- AI: "Great! Let's build that out. What should trigger a sell signal? And would you like any additional confirmation indicators?"
- User: "Sell when it crosses below, and only enter if RSI is below 70"
- AI: "Perfect! I'll set up entry when price > SMA(50) AND RSI < 70, and exit when price < SMA(50). Should we add stop loss protection?"

**AI Capabilities:**
- Parse natural language strategy descriptions
- Generate structured strategy configuration from conversation
- Suggest appropriate indicators based on strategy type
- Recommend risk management parameters
- Explain strategy logic back to user for confirmation
- Warn about potential issues (e.g., overfitting, unrealistic assumptions)
- Provide education about trading concepts and indicators

**Output Generation:**
- AI translates conversational strategy into structured JSON configuration
- User can review and manually adjust generated strategy
- Save conversation history with each strategy for future reference

#### 2.2 Manual Strategy Builder (Alternative)
- Traditional form-based interface for users who prefer direct control
- Dropdown menus and input fields for precise configuration
- Can switch between conversational and manual modes
- Manual adjustments to AI-generated strategies

#### 2.3 Built-in Indicators
Implement common technical indicators:
- Simple Moving Average (SMA)
- Exponential Moving Average (EMA)
- Relative Strength Index (RSI)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Average True Range (ATR)
- Stochastic Oscillator
- Average Directional Index (ADX)
- On-Balance Volume (OBV)
- Volume-based indicators

#### 2.3.1 Custom Indicator Definitions

Support for user-defined custom indicators with advanced calculation logic:

**Time-Aligned Indicators:**
Calculate indicators using specific time-of-day alignment across multiple days. Example: ATR using the same 5-minute period from the past 14 days.

**Custom Indicator Schema:**

```json
{
  "type": "CUSTOM",
  "id": "atr_time_aligned",
  "calculation": {
    "method": "time_aligned_atr",
    "params": {
      "periods": 14,
      "timeframe": "5min",
      "alignment": "same_time_of_day"
    }
  },
  "description": "14-period ATR using same 5-min time from past 14 days"
}
```

**Alternative: Expression-Based Custom Indicators**

For maximum flexibility, allow indicators defined via expressions that access multi-timeframe data:

```json
{
  "type": "CUSTOM",
  "id": "my_custom_atr",
  "formula": "avg(true_range_at_time(current_time, lookback_days=14), 14)",
  "description": "Time-aligned ATR calculation"
}
```

**Built-in Time-Aware Functions:**

```
time_aligned_bars(time, days_back) - Get bars at same time from past N days
same_time_yesterday() - Get bar from exactly 24 hours ago
day_bars(offset_days) - Get all bars from a specific day
time_of_day() - Current time (e.g., "10:30")
is_market_open() - Boolean check
bars_since_market_open() - Number of bars since open
```

**Example: Time-Aligned ATR Implementation**

```typescript
// Custom indicator calculation
function calculateTimeAlignedATR(
  data: OHLCVBar[],
  currentIndex: number,
  periods: number = 14
): number {
  const currentBar = data[currentIndex];
  const currentTime = getTimeOfDay(currentBar.timestamp);
  
  // Find bars at same time from past N days
  const alignedBars: OHLCVBar[] = [];
  let daysFound = 0;
  let lookbackIndex = currentIndex - 1;
  
  while (daysFound < periods && lookbackIndex >= 0) {
    const bar = data[lookbackIndex];
    const barTime = getTimeOfDay(bar.timestamp);
    
    // Check if same time of day (e.g., both 10:30)
    if (barTime === currentTime) {
      alignedBars.push(bar);
      daysFound++;
    }
    
    lookbackIndex--;
  }
  
  // Calculate ATR using aligned bars
  const trueRanges = alignedBars.map((bar, i) => {
    if (i === alignedBars.length - 1) {
      return bar.high - bar.low;
    }
    const prevClose = alignedBars[i + 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    );
  });
  
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}
```

**Usage in Strategy:**

```json
{
  "name": "Time-Aligned ATR Breakout",
  "timeframe": "5min",
  
  "indicators": [
    {
      "type": "CUSTOM",
      "id": "atr_aligned",
      "calculation": {
        "method": "time_aligned_atr",
        "params": {
          "periods": 14,
          "alignment": "same_time_of_day"
        }
      }
    }
  ],
  
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) > 2 * atr_aligned",
        "description": "Candle body exceeds 2x time-aligned ATR"
      }
    ],
    "logic": "AND"
  }
}
```

**Alternative: Inline Custom Calculation**

For one-off calculations without defining a separate indicator:

```json
{
  "entryRules": {
    "conditions": [
      {
        "type": "expression",
        "expression": "(close - open) > 2 * time_aligned_atr(14)",
        "description": "Using inline time-aligned ATR function"
      }
    ]
  }
}
```

#### 2.4 Strategy Parameters
Allow users to configure:
- Entry conditions (when to buy)
- Exit conditions (when to sell)
- Position sizing rules
- Stop loss levels (percentage or fixed amount)
- Take profit levels
- Maximum number of concurrent positions
- Allow both long and short positions (configurable)

### 3. Backtesting Engine

#### 3.1 Core Backtesting Logic
- Simulate trades based on historical data
- Execute strategy logic for each time period (bar-by-bar simulation)
- **Expression Evaluation Engine:**
  - Parse expression strings into executable code
  - Provide evaluation context with OHLCV data, indicators, and position info
  - Support array indexing for historical data (close[1], high[5], etc.)
  - Implement built-in functions: cross_above(), cross_below(), highest(), lowest(), avg(), etc.
  - Validate expressions for safety (no arbitrary code execution)
  - Use library like `expr-eval`, `mathjs`, or custom parser
- Track:
  - Open positions
  - Closed positions
  - Cash balance
  - Portfolio value over time
  - Trade history
  - Bar-by-bar indicator values

#### 3.2 Order Execution Simulation
- Support different order types:
  - Market orders (execute at next available price)
  - Limit orders (execute at specified price or better)
- Account for slippage (configurable percentage)
- Commission/fee modeling (configurable per trade or percentage)

#### 3.3 Portfolio Management
- Starting capital (user-defined)
- Position sizing methods:
  - Fixed dollar amount
  - Percentage of portfolio
  - Risk-based sizing
- Track portfolio value throughout backtest period

### 4. Performance Analytics

#### 4.1 Key Metrics
Calculate and display:
- **Returns**:
  - Total return (percentage and dollar amount)
  - Annualized return
  - Compound Annual Growth Rate (CAGR)
- **Risk Metrics**:
  - Maximum drawdown
  - Sharpe ratio
  - Sortino ratio
  - Standard deviation of returns
  - Win rate (percentage of profitable trades)
- **Trade Statistics**:
  - Total number of trades
  - Average profit per trade
  - Average loss per trade
  - Profit factor (gross profit / gross loss)
  - Largest winning trade
  - Largest losing trade
  - Average trade duration

#### 4.2 Benchmark Comparison
- Compare strategy performance against buy-and-hold benchmark
- Show relative outperformance/underperformance

### 5. Visualization

#### 5.1 Equity Curve
- Line chart showing portfolio value over time
- Compare against benchmark
- Mark significant drawdown periods

#### 5.2 Trade Visualization
- Display trades on price chart
- Show entry points (buy signals)
- Show exit points (sell signals)
- Color-code profitable vs losing trades

#### 5.3 Performance Charts
- Monthly/yearly return heatmap
- Drawdown chart over time
- Distribution of returns histogram
- Rolling Sharpe ratio

#### 5.4 Trade Log Table
- Searchable and sortable table of all trades
- Columns: Entry date, exit date, ticker, entry price, exit price, quantity, profit/loss, return %

### 6. User Interface

#### 6.1 Dashboard
- Overview of saved strategies
- Quick access to create new strategy
- Recent backtest results summary

#### 6.2 Conversational Strategy Builder
- **Chat Interface**:
  - Clean, messaging-app style interface
  - Real-time streaming of AI responses
  - Message history for each strategy creation session
  - Ability to edit previous messages and regenerate
  - Code blocks for showing generated strategy configuration
  
- **Strategy Preview Panel**:
  - Live preview of strategy being built
  - Visual representation of indicators and rules
  - Editable JSON/form view of strategy parameters
  - "Apply Strategy" button to finalize
  
- **Conversation Management**:
  - Save conversation threads with strategies
  - Resume previous conversations
  - Start new strategy conversation
  - Export conversation history
  
- **Quick Actions**:
  - Example prompts: "Create a momentum strategy", "Build a mean reversion strategy"
  - "Explain this indicator" buttons
  - "Test strategy" shortcut from chat
  - Switch to manual editing mode

#### 6.3 Manual Strategy Configuration Page (Alternative Mode)
- Form to define strategy parameters
- Indicator selection and configuration
- Entry/exit rule builder
- Risk management settings
- Date range selector for backtest

#### 6.4 Results Page
- Performance metrics summary cards
- Interactive charts and visualizations
- Detailed trade log
- Export functionality (CSV/JSON)

#### 6.5 Data Management Page
- View available tickers and date ranges
- Fetch new data from Polygon
- Clear cached data
- API usage statistics

## Data Flow

### Strategy Creation Flow (Conversational)
1. User starts new strategy conversation
2. User describes strategy idea in natural language
3. Frontend sends message to backend AI endpoint
4. Backend calls Claude/ChatGPT API with:
   - System prompt (strategy advisor role)
   - Conversation history
   - User message
   - Available indicators/capabilities context
5. AI responds with clarifying questions or strategy suggestions
6. Conversation continues until strategy is well-defined
7. AI generates structured strategy JSON
8. User reviews and approves strategy
9. Strategy is saved to database with conversation reference

### Backtesting Flow
1. User selects strategy (created conversationally or manually)
2. User selects ticker(s) and date range
3. System checks if data exists locally, fetches from Polygon if needed
4. Backtesting engine processes historical data bar by bar
5. Strategy logic evaluates entry/exit conditions at each bar
6. Trades are simulated and recorded
7. Performance metrics are calculated
8. Results are displayed with visualizations

## API Requirements

### Polygon.io Endpoints Used
- `/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}` - Historical aggregates
- `/v3/reference/tickers` - Ticker information (optional, for validation)
- `/v2/snapshot/locale/us/markets/stocks/tickers` - Current snapshot (optional, for context)

### AI Provider Integration

**Option 1: Anthropic Claude (Recommended)**
- **API**: Anthropic Messages API
- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Features**: 
  - Excellent at structured reasoning and strategy formulation
  - Strong at explaining complex trading concepts
  - Can be prompted to output valid JSON
  - Supports streaming for real-time responses

**Option 2: OpenAI ChatGPT**
- **API**: OpenAI Chat Completions API
- **Model**: GPT-4 or GPT-4 Turbo
- **Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Features**:
  - Function calling for structured outputs
  - Good at conversational strategy building

**AI Implementation Requirements:**
- System prompt that defines AI's role as a trading strategy advisor
- Context about available indicators, rules, and platform capabilities
- Structured output schema for strategy generation
- Conversation memory/context management
- Error handling for API failures
- Token usage tracking and limits

**Example System Prompt Structure:**
```
You are an expert trading strategy advisor helping users design backtesting strategies.

Available indicators: SMA, EMA, RSI, MACD, Bollinger Bands
Available order types: Market, Limit
Risk management: Stop loss, take profit, position sizing

When the user describes a strategy:
1. Ask clarifying questions to fully understand their intent
2. Suggest appropriate indicators and parameters
3. Warn about common pitfalls
4. Generate a JSON configuration matching this schema: [schema]
5. Explain the strategy logic clearly

Be conversational, educational, and helpful.
```

**Example Conversation Patterns:**

*Pattern 1: Basic Strategy Creation*
```
User: "I want to create a simple moving average crossover strategy"

AI: "Great choice! A moving average crossover is a classic strategy. Let me help you set this up.

For this strategy, we typically use two moving averages:
- A fast (shorter period) moving average
- A slow (longer period) moving average

Common combinations are:
- 50-day and 200-day (long-term)
- 20-day and 50-day (medium-term)
- 10-day and 20-day (short-term)

Which timeframe are you thinking about? Or would you like me to suggest one based on your trading style?"

User: "Let's go with 50 and 200 day"

AI: "Perfect! Here's what I'm setting up:

**Entry Signal:** Buy when the 50-day SMA crosses above the 200-day SMA (golden cross)
**Exit Signal:** Sell when the 50-day SMA crosses below the 200-day SMA (death cross)

Now, let's add risk management. Would you like to:
1. Set a stop loss (e.g., 5% below entry)?
2. Set a take profit target?
3. Use position sizing rules?

These can help protect your capital."
```

*Pattern 2: Complex Strategy with Refinement*
```
User: "I want to use RSI and Bollinger Bands together"

AI: "Excellent! RSI and Bollinger Bands complement each other well - RSI shows momentum while Bollinger Bands show volatility. Let me help you combine them effectively.

Common approaches:
1. **Mean Reversion:** Buy when price touches lower band AND RSI < 30, sell when it touches upper band
2. **Trend Following:** Buy when price breaks above upper band AND RSI > 50
3. **Custom combination:** You tell me your idea

Which approach interests you, or would you like to design something custom?"

User: "I like the mean reversion approach"

AI: "Great! Mean reversion strategies work well in ranging markets. Here's what I'm building:

**Entry Conditions:**
- Price touches or crosses below lower Bollinger Band
- RSI is below 30 (oversold)

**Exit Conditions:**
- Price touches or crosses above upper Bollinger Band
- OR RSI exceeds 70 (overbought)

**Parameters:**
- Bollinger Bands: 20-period SMA, 2 standard deviations
- RSI: 14-period

Should we add a stop loss in case the mean reversion fails? I'd recommend 5-8% below entry."
```

*Pattern 3: Educational Exchange*
```
User: "What's MACD?"

AI: "MACD (Moving Average Convergence Divergence) is a momentum indicator that shows the relationship between two moving averages.

It consists of three components:
1. **MACD Line:** 12-day EMA minus 26-day EMA
2. **Signal Line:** 9-day EMA of the MACD line
3. **Histogram:** Difference between MACD and Signal line

**Common signals:**
- **Bullish:** MACD crosses above signal line
- **Bearish:** MACD crosses below signal line
- **Momentum:** Histogram shows strengthening/weakening trends

Would you like to build a strategy using MACD?"
```

### Environment Variables
```
POLYGON_API_KEY=your_polygon_api_key_here

# Choose ONE of these AI providers:
ANTHROPIC_API_KEY=your_anthropic_api_key_here
# OR
OPENAI_API_KEY=your_openai_api_key_here

# AI Configuration
AI_PROVIDER=anthropic  # or 'openai'
AI_MODEL=claude-sonnet-4-5-20250929  # or 'gpt-4-turbo'
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7  # 0.7 for creative/conversational, 0.3 for structured outputs

DATABASE_URL=./backtesting.db
PORT=3000
NODE_ENV=development
```

---

### Backend API Endpoints for AI Conversations

Design RESTful endpoints for managing conversations:

```
POST   /api/conversations              # Create new conversation
GET    /api/conversations              # List user's conversations  
GET    /api/conversations/:id          # Get conversation with messages
DELETE /api/conversations/:id          # Delete conversation
POST   /api/conversations/:id/messages # Send message, get AI response
PUT    /api/conversations/:id/messages/:messageId # Edit message
POST   /api/conversations/:id/regenerate # Regenerate last AI response
POST   /api/conversations/:id/apply-strategy # Finalize and save strategy
```

**Example Request/Response:**

```typescript
// POST /api/conversations/:id/messages
// Request:
{
  "content": "I want a golden cross strategy",
  "stream": true  // Enable streaming
}

// Streaming Response (Server-Sent Events):
event: message_start
data: {"message_id": "msg_123"}

event: content_delta
data: {"delta": "The golden cross is a classic"}

event: content_delta  
data: {"delta": " bullish signal! This happens when"}

event: message_complete
data: {"message_id": "msg_123", "usage": {"input_tokens": 234, "output_tokens": 456}}

// OR Non-streaming Response:
{
  "message_id": "msg_123",
  "role": "assistant",
  "content": "The golden cross is a classic bullish signal! ...",
  "usage": {
    "input_tokens": 234,
    "output_tokens": 456
  },
  "generated_strategy": null  // or StrategyConfig if AI generated one
}
```

---

## Data Models

### Strategy
```typescript
{
  id: string
  name: string
  description: string
  indicators: Indicator[]
  entryRules: Rule[]
  exitRules: Rule[]
  riskManagement: RiskSettings
  conversationId?: string  // Link to conversation that created this strategy
  createdAt: Date
  updatedAt: Date
}
```

### Conversation
```typescript
{
  id: string
  strategyId?: string  // Null until strategy is finalized
  messages: Message[]
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  updatedAt: Date
}
```

### Message
```typescript
{
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    generatedStrategy?: StrategyConfig  // If AI generated a strategy in this message
    tokenCount?: number
  }
}
```

### Backtest
```typescript
{
  id: string
  strategyId: string
  ticker: string
  startDate: Date
  endDate: Date
  timeframe: string
  initialCapital: number
  results: BacktestResults
  trades: Trade[]
  executedAt: Date
}
```

### Trade
```typescript
{
  id: string
  backtestId: string
  ticker: string
  entryDate: Date
  entryPrice: number
  exitDate: Date
  exitPrice: number
  quantity: number
  side: 'long' | 'short'
  pnl: number
  pnlPercent: number
  commission: number
}
```

## Non-Functional Requirements

### Expression Evaluation Engine

**Requirements:**
- Safe evaluation of user-defined expressions
- Support for arithmetic, comparison, and logical operators
- Array indexing for historical data
- Custom function implementations (cross_above, highest, etc.)
- No arbitrary code execution (security)
- Performance optimization for bar-by-bar evaluation

**Implementation Approach:**

```typescript
// Expression evaluation context
interface EvaluationContext {
  // Current bar OHLCV
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  
  // Historical data (indexed arrays)
  open_series: number[];
  high_series: number[];
  low_series: number[];
  close_series: number[];
  volume_series: number[];
  
  // Indicator values
  indicators: Record<string, number | {[key: string]: number}>;
  
  // Position info (for exit rules)
  entry_price?: number;
  entry_time?: Date;
  position_size?: number;
  unrealized_pnl?: number;
  
  // Current bar index
  current_index: number;
}

// Custom functions
const customFunctions = {
  // Array indexing: close[1] translates to accessing close_series
  cross_above: (series1: number[], series2: number[], index: number) => {
    if (index < 1) return false;
    return series1[index] > series2[index] && 
           series1[index - 1] <= series2[index - 1];
  },
  
  cross_below: (series1: number[], series2: number[], index: number) => {
    if (index < 1) return false;
    return series1[index] < series2[index] && 
           series1[index - 1] >= series2[index - 1];
  },
  
  highest: (series: number[], period: number, index: number) => {
    const start = Math.max(0, index - period + 1);
    return Math.max(...series.slice(start, index + 1));
  },
  
  lowest: (series: number[], period: number, index: number) => {
    const start = Math.max(0, index - period + 1);
    return Math.min(...series.slice(start, index + 1));
  },
  
  avg: (series: number[], period: number, index: number) => {
    const start = Math.max(0, index - period + 1);
    const slice = series.slice(start, index + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }
};

// Expression parser needs to:
// 1. Convert "close[1]" to "close_series[current_index - 1]"
// 2. Convert "close" to "close_series[current_index]"  
// 3. Convert indicator IDs to lookups: "sma_50" to "indicators.sma_50"
// 4. Handle dot notation for multi-value indicators: "bb.upper"
```

**Recommended Libraries:**
- **expr-eval**: Lightweight expression evaluator, can extend with custom functions
- **mathjs**: More feature-rich but heavier, good for complex math
- **Custom parser**: Using PEG.js or similar for full control

**Security Considerations:**
- Whitelist allowed variables and functions only
- No eval() or Function() constructor
- Sandbox execution context
- Validate expressions before backtesting
- Set execution time limits per expression

**Time-Aligned Calculation Considerations:**

For custom indicators like time-aligned ATR:
- **Data Requirements:** Need sufficient historical depth (14+ days for 14-period time-aligned)
- **Missing Data Handling:** Handle market holidays, half-days, data gaps gracefully
- **Timezone Management:** Ensure consistent time-of-day matching across DST changes
- **Performance:** Cache time-aligned bar lookups to avoid repeated scans
- **Edge Cases:** 
  - First days of data (fewer than N periods available)
  - Different trading hours (early close days)
  - Overnight/weekend gaps

**Implementation Approach:**

```typescript
// Pre-process data to build time-of-day index
interface TimeAlignedIndex {
  [timeOfDay: string]: {  // e.g., "10:30"
    [date: string]: number;  // date -> bar index
  };
}

// Build index once when loading data
function buildTimeIndex(data: OHLCVBar[]): TimeAlignedIndex {
  const index: TimeAlignedIndex = {};
  
  data.forEach((bar, i) => {
    const time = getTimeOfDay(bar.timestamp);  // "10:30"
    const date = getDate(bar.timestamp);  // "2025-03-15"
    
    if (!index[time]) index[time] = {};
    index[time][date] = i;
  });
  
  return index;
}

// Fast lookup for time-aligned bars
function getTimeAlignedBars(
  index: TimeAlignedIndex,
  currentBar: OHLCVBar,
  periods: number
): number[] {
  const time = getTimeOfDay(currentBar.timestamp);
  const currentDate = getDate(currentBar.timestamp);
  const barIndices: number[] = [];
  
  // Walk backwards through dates
  let date = new Date(currentDate);
  let found = 0;
  
  while (found < periods && date > minDate) {
    const dateStr = formatDate(date);
    if (index[time]?.[dateStr]) {
      barIndices.push(index[time][dateStr]);
      found++;
    }
    date.setDate(date.getDate() - 1);
  }
  
  return barIndices;
}
```

### Performance
- Backtest execution should complete within reasonable time (< 30 seconds for 1 year of daily data)
- **Expression evaluation optimization:**
  - Pre-compile expressions before backtesting loop
  - Cache compiled expressions
  - Vectorize operations where possible for multiple bars
  - Consider using typed arrays for OHLCV data
- Support backtesting multiple strategies in parallel
- Efficient data caching to minimize API calls
- Database indexing on ticker and date columns

### Scalability
- Design database schema to support multiple users (future)
- Modular architecture for easy addition of new indicators
- Support for portfolio-level backtesting (multiple tickers simultaneously)

### Usability
- Intuitive UI with clear navigation
- Helpful error messages
- Loading states during data fetching and backtesting
- Form validation for all user inputs

### Security
- Secure storage of API keys
- Input validation to prevent injection attacks
- Rate limiting on API endpoints

## Future Enhancements (Optional)
- Walk-forward optimization
- Monte Carlo simulation
- Portfolio optimization
- Multi-asset strategies
- Options backtesting
- Machine learning strategy integration
- Real-time paper trading
- User authentication and multi-user support
- Strategy marketplace/sharing
- **Advanced time-aware features:**
  - Multiple timeframe analysis in single strategy
  - Session-based indicators (separate calculations for pre-market, regular hours, after-hours)
  - Day-of-week aligned indicators (e.g., every Monday's data)
  - Volume profile and time-price analysis
  - Anchored indicators (VWAP from market open, session high/low)
  - Calendar-aware calculations (month-end, quarter-end patterns)

## Getting Started Guide for Claude Code

To implement this application:

1. **Initialize Project**
   - Create a monorepo structure with `backend` and `frontend` folders
   - Set up TypeScript configuration
   - Install necessary dependencies

2. **Backend First**
   - Set up Express server with basic routing
   - Implement Polygon API client with data fetching
   - **Set up AI integration:**
     - Create service layer for Claude/ChatGPT API calls
     - Implement the complete system prompt from the Prompt Engineering Guide (include expression language documentation)
     - Design conversation management endpoints (create, list, get, continue)
     - Add streaming support for real-time AI responses using Server-Sent Events or WebSockets
     - Create prompt templates with platform capabilities context
     - Implement JSON extraction and validation for AI-generated strategies
     - Add token usage tracking
   - **Build expression evaluation engine:**
     - Implement safe expression parser (using expr-eval, mathjs, or custom)
     - Add support for array indexing: close[1], high[5], etc.
     - Implement custom functions: cross_above(), cross_below(), highest(), lowest(), avg()
     - Create evaluation context with OHLCV data and indicators
     - Add expression validation and security checks
     - Pre-compile expressions for performance
   - Create SQLite database schema and models (including conversations and messages)
   - Build backtesting engine core logic with bar-by-bar simulation
   - Implement indicator calculations (SMA, EMA, RSI, MACD, Bollinger Bands, ATR, etc.)
   - **Implement custom indicator framework:**
     - Time-aligned calculations (same time-of-day across multiple days)
     - Custom indicator registry/plugin system
     - Support for multi-timeframe data access
     - Time-of-day utility functions
   - Create REST API endpoints for frontend

3. **Frontend Second**
   - Set up React app with routing
   - Create reusable UI components
   - **Build conversational strategy builder:**
     - Chat interface with message streaming
     - Strategy preview panel (shows JSON or visual representation)
     - Markdown rendering for AI responses  
     - Edit and regenerate message functionality
     - "Apply Strategy" workflow
   - Build manual strategy configuration forms (alternative to chat)
   - Implement data visualization components
   - Connect to backend API
   - Add state management

4. **Testing**
   - Test with real Polygon data
   - **Test AI conversation flows extensively:**
     - Use the test cases from Prompt Engineering Guide
     - Verify strategy generation from various natural language descriptions
     - Test with complex strategies (ATR-based, multi-condition, expression-heavy)
     - Test with vague inputs (should ask clarifying questions)
     - Test with unrealistic expectations (should provide warnings)
     - Test with complex multi-indicator strategies
     - Validate all generated JSON outputs
     - Test conversation context retention across multiple messages
     - Test edit/regenerate functionality
   - **Test expression evaluation engine:**
     - Test all operators: arithmetic, comparison, logical
     - Test array indexing: close[1], high[10], etc.
     - Test custom functions: cross_above(), highest(), avg(), etc.
     - Test with edge cases: first bar (no history), insufficient data
     - Test security: invalid expressions, injection attempts
     - Test performance: complex expressions on large datasets
     - Validate expression results against manual calculations
   - **Test custom indicators:**
     - Test time-aligned ATR calculation accuracy
     - Verify time-of-day matching across multiple days
     - Test with missing data (holidays, gaps)
     - Test edge cases: insufficient history, DST changes
     - Compare time-aligned vs standard indicators
     - Validate performance of time-aligned lookups
   - Validate calculation accuracy for all indicators (SMA, EMA, RSI, MACD, ATR, etc.)
   - Test edge cases (no trades, all losses, consecutive stop losses, etc.)
   - Test stop loss and take profit execution with expression-based rules
   - Test position sizing calculations (fixed, percentage, risk-based)

5. **Prompt Refinement** (Ongoing)
   - Collect real user conversations
   - Identify where AI struggles or misunderstands
   - Refine system prompts based on findings
   - Add more few-shot examples for edge cases
   - Adjust temperature/parameters for better results

5. **Documentation**
   - Add README with setup instructions
   - Document API endpoints
   - Include example strategies

## Success Criteria
- Successfully fetch data from Polygon API
- **Conversational strategy builder works smoothly:**
  - AI understands diverse strategy descriptions in natural language
  - AI asks appropriate clarifying questions when needed
  - AI provides helpful warnings about pitfalls (overfitting, unrealistic expectations)
  - AI explains trading concepts clearly when asked
  - Generated strategies are valid, executable, and match user intent
  - JSON output is consistently well-formed and validated
  - Chat interface is responsive with real-time streaming
  - Users can edit and refine strategies through conversation
  - Conversation context is maintained throughout the session
- Execute backtests with accurate trade simulation
- Display performance metrics correctly with clear visualizations
- Visualize results clearly with interactive charts
- Responsive and intuitive user interface for both chat and manual modes
- Reliable error handling and data validation throughout
- System prompts effectively guide AI to be educational and helpful
