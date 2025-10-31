/**
 * Claude AI Service for Custom Strategy Script Generation
 *
 * Uses Anthropic's Claude API to generate custom backtest scripts based on
 * natural language strategy descriptions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeScriptGenerationResponse, ScriptGenerationParams } from '../types/script.types';

export class ClaudeService {
  private client: Anthropic | null = null;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
    this.maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '16000'); // Increased to match scanner scripts
    this.temperature = parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.0');
  }

  /**
   * Initialize Anthropic client (lazy initialization)
   */
  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required for Claude-generated scripts. Please set it in your .env file.');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  /**
   * Generate a custom backtest script from a natural language prompt
   */
  async generateScript(
    userPrompt: string,
    params: ScriptGenerationParams
  ): Promise<ClaudeScriptGenerationResponse> {
    console.log('📝 Claude receiving params:', JSON.stringify(params, null, 2));

    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(userPrompt, params);
    console.log('📤 Sending to Claude:', userMessage);

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse the response
      return this.parseClaudeResponse(textContent.text);
    } catch (error: any) {
      console.error('Error calling Claude API:', error);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Extract dates from a natural language prompt using Claude
   * Returns suggested dates based on explicit mentions or strategy complexity
   */
  async extractDatesFromPrompt(userPrompt: string, ticker: string): Promise<{
    dates: string[];
    reasoning: string;
    complexity: 'simple' | 'medium' | 'complex';
  }> {
    console.log('📅 Claude analyzing prompt for date extraction...');

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are a trading strategy analyst. Your task is to determine the appropriate testing dates for a backtest based on the user's strategy description.

Guidelines:
1. If the prompt explicitly mentions dates (e.g., "last 10 days", "past 20 trading days", "from Oct 1 to Oct 22"), extract them
2. If no dates specified, consider strategy complexity:
   - Simple strategies (basic ORB, single indicator): 10 trading days
   - Medium complexity (multiple conditions, VWAP + SMA, conditional logic): 15 trading days
   - Complex strategies (multi-timeframe, advanced logic, many conditions): 20 trading days
3. Return dates in YYYY-MM-DD format
4. Only return trading days (Mon-Fri, excluding major US holidays)
5. Return dates in descending order (most recent first)
6. Today's date is ${today}

Respond with ONLY a JSON object in this format:
{
  "dates": ["2025-10-22", "2025-10-21", ...],
  "reasoning": "Brief explanation of why these dates were chosen",
  "complexity": "simple|medium|complex"
}`;

    const userMessage = `Analyze this backtest prompt and determine appropriate testing dates:

Prompt: "${userPrompt}"
Ticker: ${ticker}

Based on the strategy complexity and any explicit date mentions, what dates should be tested?`;

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 1000, // Smaller than script generation
        temperature: 0.0, // Deterministic for date extraction
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse JSON response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ Claude response not in expected JSON format:', textContent.text);
        throw new Error('Invalid response format from Claude');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✅ Claude date extraction:', {
        dates: parsed.dates?.length || 0,
        reasoning: parsed.reasoning,
        complexity: parsed.complexity,
      });

      return {
        dates: parsed.dates || [],
        reasoning: parsed.reasoning || 'No reasoning provided',
        complexity: parsed.complexity || 'medium',
      };
    } catch (error: any) {
      console.error('❌ Error in Claude date extraction:', error.message);
      throw error;
    }
  }

  /**
   * Generate a scanner script from a natural language query
   */
  async generateScannerScript(params: {
    query: string;
    universe: string;
    dateRange?: { start: string; end: string };
  }): Promise<{ script: string; explanation: string }> {
    console.log('🔍 Claude generating scanner script for query:', params.query);

    const systemPrompt = this.buildScannerSystemPrompt();
    const userMessage = this.buildScannerUserMessage(params);

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 16000, // Increased for long scanner scripts
        temperature: 0.0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse the response
      return this.parseScannerResponse(textContent.text);
    } catch (error: any) {
      console.error('Error calling Claude API for scanner:', error);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Build comprehensive system prompt with examples and structure
   */
  private buildSystemPrompt(): string {
    return `You are an expert TypeScript developer specializing in algorithmic trading backtesting systems.

Your task is to generate complete, runnable backtest scripts based on user strategy descriptions.

## Script Structure

Every script must follow this exact structure:

import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay: string;
}

// CRITICAL: This is the EXACT interface for trade results
// Follow these rules when populating this interface:
// 1. All fields marked with ? are OPTIONAL
// 2. Use exact property names: highestPrice (NOT 'highest'), lowestPrice (NOT 'lowest')
// 3. For no-trade results, set noTrade=true and provide noTradeReason
// 4. For executed trades, provide all trade fields (side, entry/exit prices, pnl, etc.)
interface TradeResult {
  date: string;              // Required: Trading date (YYYY-MM-DD)
  ticker: string;            // Required: Stock ticker
  side?: 'LONG' | 'SHORT';   // Optional: Trade direction
  entryTime?: string;        // Optional: Entry time (HH:MM:SS)
  entryPrice?: number;       // Optional: Entry price
  exitTime?: string;         // Optional: Exit time (HH:MM:SS)
  exitPrice?: number;        // Optional: Exit price
  pnl?: number;              // Optional: Profit/loss in dollars
  pnlPercent?: number;       // Optional: Profit/loss as percentage
  exitReason?: string;       // Optional: Why trade exited (e.g., 'Stop loss', 'Take profit')
  highestPrice?: number;     // Optional: Highest price reached (use 'highestPrice', NOT 'highest')
  lowestPrice?: number;      // Optional: Lowest price reached (use 'lowestPrice', NOT 'lowest')
  noTrade?: boolean;         // Optional: Set to true if no trade executed
  noTradeReason?: string;    // Optional: Why no trade (e.g., 'No data', 'Signal too late')
}

async function runBacktest() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  // Configuration
  // IMPORTANT: Use the actual values provided in the user message
  const ticker = 'TEMPLATE_TICKER';
  const timeframe = 'TEMPLATE_TIMEFRAME';
  const tradingDays: string[] = []; // Replace with actual dates from user message

  // Strategy-specific configuration
  // ... your custom parameters here

  const results: TradeResult[] = [];

  for (const date of tradingDays) {
    // Fetch bars for this day
    const dateStart = new Date(\`\${date}T00:00:00Z\`).getTime();
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateEnd = nextDate.getTime();

    const query = \`
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp ASC
    \`;

    const bars = db.prepare(query).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

    if (bars.length === 0) {
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: 'No data available'
      });
      continue;
    }

    // ===== YOUR STRATEGY LOGIC HERE =====
    // Calculate indicators, detect signals, execute trades

  }

  // Output results as JSON
  console.log(JSON.stringify(results, null, 2));
}

runBacktest().catch(console.error);

## Available Data

Each bar has:
- timestamp: Unix timestamp in milliseconds
- open, high, low, close: Price data
- volume: Trading volume
- timeOfDay: String in HH:MM:SS format (e.g., "09:30:00", "14:15:30")

## Time Comparisons

IMPORTANT: Use \`.startsWith()\` for time comparisons since times are in HH:MM:SS format:

// ✅ Correct
if (bar.timeOfDay.startsWith('09:30')) { ... }
if (bar.timeOfDay >= '09:30:00' && bar.timeOfDay < '16:00:00') { ... }

// ❌ Wrong
if (bar.timeOfDay === '09:30') { ... }

## Common Indicators

### VWAP (Volume-Weighted Average Price)
function calculateVWAP(bars: Bar[]): number {
  let totalPV = 0;
  let totalVolume = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    totalPV += typicalPrice * bar.volume;
    totalVolume += bar.volume;
  }
  return totalVolume > 0 ? totalPV / totalVolume : 0;
}

### SMA (Simple Moving Average)
function calculateSMA(bars: Bar[], period: number, field: 'close' | 'open' | 'high' | 'low' = 'close'): number {
  if (bars.length < period) return 0;
  const sum = bars.slice(-period).reduce((acc, bar) => acc + bar[field], 0);
  return sum / period;
}

### EMA (Exponential Moving Average)
function calculateEMA(bars: Bar[], period: number, field: 'close' | 'open' | 'high' | 'low' = 'close'): number {
  if (bars.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = bars[0][field];
  for (let i = 1; i < bars.length; i++) {
    ema = (bars[i][field] - ema) * multiplier + ema;
  }
  return ema;
}

## Trade Execution Pattern

Use signal tracking for realistic next-bar execution:

let longSignalDetected = false;
let longPosition: { entry: number; entryTime: string; highestPrice: number } | null = null;

for (let i = 0; i < bars.length; i++) {
  const bar = bars[i];

  // Skip pre-market hours
  if (bar.timeOfDay < '09:30:00') continue;

  // Execute pending long entry
  if (longSignalDetected && !longPosition) {
    longPosition = {
      entry: bar.open,
      entryTime: bar.timeOfDay,
      highestPrice: bar.high
    };
    longSignalDetected = false;
  }

  // Detect long signal
  if (!longPosition && !longSignalDetected) {
    // Check your entry conditions
    if (/* entry condition */) {
      longSignalDetected = true;
    }
  }

  // Exit logic
  if (longPosition) {
    longPosition.highestPrice = Math.max(longPosition.highestPrice, bar.high);

    // Check exit conditions
    if (/* exit condition */ || bar.timeOfDay.startsWith('16:00')) {
      results.push({
        date,
        ticker,
        side: 'LONG',
        entryTime: longPosition.entryTime,
        entryPrice: longPosition.entry,
        exitTime: bar.timeOfDay,
        exitPrice: bar.close,
        pnl: bar.close - longPosition.entry,
        pnlPercent: ((bar.close - longPosition.entry) / longPosition.entry) * 100,
        exitReason: '...',
        highestPrice: longPosition.highestPrice
      });
      longPosition = null;
    }
  }
}

// Force exit if still in position
if (longPosition) {
  results.push({ /* ... */ });
}

// No trade if no entry
if (results.filter(r => r.date === date).length === 0) {
  results.push({
    date,
    ticker,
    noTrade: true,
    noTradeReason: 'No entry signal'
  });
}

## Trade Limiting (Max Trades Per Day)

If the user specifies trade limits like "take at most 1 trade per day" or "max 2 trades per day", you MUST implement a trade counter:

// Add this at the top of the daily loop (inside for (const date of tradingDays))
let tradesCountToday = 0;
const maxTradesPerDay = 1; // Extract this from user's constraint

// ... fetch bars ...

let longSignalDetected = false;
let shortSignalDetected = false;
let position: { ... } | null = null;

for (let i = 0; i < bars.length; i++) {
  const bar = bars[i];

  // Execute pending long entry (ONLY if we haven't exceeded trade limit)
  if (longSignalDetected && !position && tradesCountToday < maxTradesPerDay) {
    position = {
      entry: bar.open,
      entryTime: bar.timeOfDay,
      highestPrice: bar.high
    };
    tradesCountToday++; // Increment counter AFTER entering position
    longSignalDetected = false;
  }

  // Execute pending short entry (ONLY if we haven't exceeded trade limit)
  if (shortSignalDetected && !position && tradesCountToday < maxTradesPerDay) {
    position = {
      entry: bar.open,
      entryTime: bar.timeOfDay,
      lowestPrice: bar.low
    };
    tradesCountToday++; // Increment counter AFTER entering position
    shortSignalDetected = false;
  }

  // Detect signals (ONLY if we haven't exceeded trade limit)
  if (!position && !longSignalDetected && !shortSignalDetected && tradesCountToday < maxTradesPerDay) {
    if (/* long condition */) {
      longSignalDetected = true;
    } else if (/* short condition */) {
      shortSignalDetected = true;
    }
  }

  // Exit logic (same as before)
  if (position) {
    // ... exit conditions ...
    if (/* exit triggered */) {
      results.push({ ... });
      position = null; // tradesCountToday is NOT reset here!
    }
  }
}

// At the end of the day, tradesCountToday is reset by the next iteration of the date loop

**Key points for trade limiting:**
1. Add \`tradesCountToday\` counter at the TOP of each daily loop (after fetching bars)
2. Extract \`maxTradesPerDay\` from user's constraint (e.g., "at most 1 trade" → maxTradesPerDay = 1)
3. Check \`tradesCountToday < maxTradesPerDay\` in THREE places:
   - Before entering long position
   - Before entering short position
   - Before detecting new signals
4. Increment \`tradesCountToday++\` AFTER entering a position (not after detecting signal)
5. Do NOT reset \`tradesCountToday\` when exiting a position (it resets naturally at the start of next day's loop)
6. If user says "max 1 trade", this means TOTAL trades per day (long + short combined)
7. If user says "max 1 long and 1 short", you need separate counters: \`longTradesCountToday\` and \`shortTradesCountToday\`

## Signal-Based Execution (CRITICAL FOR AGENT LEARNING)

**IMPORTANT:** When generating execution scripts for learning agents, the script will receive pre-detected signals from a scanner.

**YOU MUST use this EXACT interface definition - DO NOT create your own:**

// CRITICAL: This is the EXACT interface for scanner signals
// DO NOT define your own ScannerSignal interface with different field names!
interface ScannerSignal {
  ticker: string;
  signal_date: string;     // NOT 'date' - use signal_date!
  signal_time: string;     // NOT 'time' - use signal_time!
  pattern_strength: number;
  metrics: {
    [key: string]: any;    // Scanner-specific metrics (varies by pattern)
  };
}
// DO NOT expect a 'pattern_type' field - it doesn't exist!

The \`SCANNER_SIGNALS\` constant will be injected into your script with this structure:

// This constant is injected by the learning system
const SCANNER_SIGNALS: ScannerSignal[] = [
  {
    ticker: 'AAPL',
    signal_date: '2025-10-13',  // Trading date (YYYY-MM-DD)
    signal_time: '10:30',       // Signal time (HH:MM)
    pattern_strength: 75,
    metrics: {
      // Scanner-specific metrics (varies by pattern)
      vwap: 180.50,
      price: 180.75,
      volume_ratio: 2.3,
      // ... other pattern-specific metrics
    }
  },
  // ... more signals
];

**When SCANNER_SIGNALS is present, you MUST use signal-based execution:**

// Check if scanner signals are available
const useSignalBasedExecution = typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS.length > 0;

if (useSignalBasedExecution) {
  console.log(\`Using signal-based execution with \${SCANNER_SIGNALS.length} signals\`);

  // Process each signal
  for (const signal of SCANNER_SIGNALS) {
    const { ticker, signal_date, signal_time } = signal;

    // Fetch bars for this signal's date
    const dateStart = new Date(\`\${signal_date}T00:00:00Z\`).getTime();
    const nextDate = new Date(signal_date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateEnd = nextDate.getTime();

    const bars = db.prepare(\`
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
        AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp ASC
    \`).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

    if (bars.length === 0) {
      results.push({ date, ticker, noTrade: true, noTradeReason: 'No data' });
      continue;
    }

    // Find the bar at or after signal time
    const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signalTime);
    if (signalBarIndex === -1 || signalBarIndex === bars.length - 1) {
      results.push({ date, ticker, noTrade: true, noTradeReason: 'Signal too late in day' });
      continue;
    }

    // Enter on NEXT bar after signal (realistic execution)
    const entryBar = bars[signalBarIndex + 1];

    // Determine trade direction based on your strategy logic
    // Example: For momentum exhaustion/fade strategies, enter SHORT
    // For bounce/reversal strategies, enter LONG
    const side = 'SHORT'; // or 'LONG' based on your strategy

    let position = {
      side,
      entry: entryBar.open,
      entryTime: entryBar.timeOfDay,
      highestPrice: entryBar.high,
      lowestPrice: entryBar.low
    };

    // Monitor position until exit
    for (let i = signalBarIndex + 2; i < bars.length; i++) {
      const bar = bars[i];
      position.highestPrice = Math.max(position.highestPrice, bar.high);
      position.lowestPrice = Math.min(position.lowestPrice, bar.low);

      // Apply your exit logic here (stop loss, take profit, time-based, etc.)
      let exitTriggered = false;
      let exitPrice = bar.close;
      let exitReason = '';

      if (side === 'LONG') {
        const stopLoss = position.entry * (1 - stopLossPct / 100);
        const takeProfit = position.entry * (1 + takeProfitPct / 100);

        if (bar.low <= stopLoss) {
          exitTriggered = true;
          exitPrice = stopLoss;
          exitReason = 'Stop loss';
        } else if (bar.high >= takeProfit) {
          exitTriggered = true;
          exitPrice = takeProfit;
          exitReason = 'Take profit';
        } else if (bar.timeOfDay >= '15:55:00') {
          exitTriggered = true;
          exitPrice = bar.close;
          exitReason = 'Market close';
        }
      } else { // SHORT
        const stopLoss = position.entry * (1 + stopLossPct / 100);
        const takeProfit = position.entry * (1 - takeProfitPct / 100);

        if (bar.high >= stopLoss) {
          exitTriggered = true;
          exitPrice = stopLoss;
          exitReason = 'Stop loss';
        } else if (bar.low <= takeProfit) {
          exitTriggered = true;
          exitPrice = takeProfit;
          exitReason = 'Take profit';
        } else if (bar.timeOfDay >= '15:55:00') {
          exitTriggered = true;
          exitPrice = bar.close;
          exitReason = 'Market close';
        }
      }

      if (exitTriggered) {
        const pnl = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
        const pnlPercent = (pnl / position.entry) * 100;

        results.push({
          date,
          ticker,
          side,
          entryTime: position.entryTime,
          entryPrice: position.entry,
          exitTime: bar.timeOfDay,
          exitPrice,
          pnl,
          pnlPercent,
          exitReason,
          highestPrice: position.highestPrice,
          lowestPrice: position.lowestPrice
        });
        break;
      }
    }
  }
} else {
  // Fall back to autonomous pattern detection if no signals provided
  // (Use the standard pattern detection logic here)
}

**Helper Functions (Copy if needed):**

If your strategy requires technical indicators, use these pre-built functions:

// Calculate VWAP (Volume-Weighted Average Price) for intraday bars
function calculateVWAP(bars: IntradayBar[]): number {
  let totalPriceVolume = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    totalPriceVolume += typicalPrice * bar.volume;
    totalVolume += bar.volume;
  }

  return totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // Default neutral RSI

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate momentum (rate of change)
function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period + 1) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - period];
  return past !== 0 ? ((current - past) / past) * 100 : 0;
}

// Calculate simple moving average
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const relevantPrices = prices.slice(-period);
  return relevantPrices.reduce((sum, p) => sum + p, 0) / period;
}

// Calculate Average True Range (volatility)
function calculateATR(bars: IntradayBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

**TypeScript Strict Mode Requirements:**

Your generated code MUST compile with TypeScript strict mode. Follow these requirements carefully:

1. **Explicit Type Annotations for ALL Callback Parameters:**
   
   // ❌ WRONG - Implicit 'any' type error
   bars.reduce((acc, bar) => acc + bar.volume, 0);

   // ✅ CORRECT - Explicit type annotation
   bars.reduce((acc: number, bar: Bar) => acc + bar.volume, 0);

   // ❌ WRONG - Missing type in forEach
   signals.forEach(signal => {
     // ...
   });

   // ✅ CORRECT - Explicit type
   signals.forEach((signal: ScannerSignal) => {
     // ...
   });


2. **Null Handling - Use Optional Fields or Union Types:**
   
   // ❌ WRONG - Cannot assign null to string
   let exitReason: string = null;

   // ✅ CORRECT - Use union type
   let exitReason: string | null = null;

   // ✅ ALSO CORRECT - Use empty string
   let exitReason: string = '';


3. **Object Shorthand - Use Existing Variables Only:**
   
   // ❌ WRONG - 'highest' variable doesn't exist
   results.push({
     highest,  // Error: Cannot find name 'highest'
     lowest
   });

   // ✅ CORRECT - Use actual property names
   results.push({
     highestPrice: position.highestPrice,
     lowestPrice: position.lowestPrice
   });

   // ✅ ALSO CORRECT - If variable matches property name
   const highestPrice = position.highestPrice;
   results.push({
     highestPrice,  // OK because variable exists
     lowestPrice: position.lowestPrice
   });


4. **Interface Field Names - Use EXACT Field Names from ScannerSignal:**
   
   // ❌ WRONG - ScannerSignal doesn't have 'date' or 'time'
   const date = signal.date;
   const time = signal.time;

   // ✅ CORRECT - Use signal_date and signal_time
   const date = signal.signal_date;
   const time = signal.signal_time;

   // ❌ WRONG - No pattern_type field exists
   const pattern = signal.pattern_type;

   // ✅ CORRECT - Access metrics instead
   const vwap = signal.metrics.vwap;


5. **Type Conversions - Ensure Type Compatibility:**
   
   // ❌ WRONG - Type mismatch between interfaces
   const customSignal: MyCustomSignal = SCANNER_SIGNALS[0];

   // ✅ CORRECT - Use the ScannerSignal interface directly
   const signal: ScannerSignal = SCANNER_SIGNALS[0];


6. **Date-Keyed Dictionaries - MUST Use Record<string, T> or Map<string, T>:**
   
   // ❌ WRONG - Missing type annotation causes "Property '2025-10-13' does not exist" errors
   const barsByDate = bars.reduce((acc, bar) => {
     acc[bar.signal_date] = bar;  // TypeScript error: Property doesn't exist on type '{}'
     return acc;
   }, {});

   // ✅ CORRECT - Use Record<string, T> type
   const barsByDate = bars.reduce((acc: Record<string, Bar>, bar: Bar) => {
     acc[bar.signal_date] = bar;
     return acc;
   }, {} as Record<string, Bar>);

   // ✅ ALSO CORRECT - Use Map for better type safety
   const barsByDate = new Map<string, Bar>();
   bars.forEach((bar: Bar) => {
     barsByDate.set(bar.signal_date, bar);
   });

   // Access with type safety
   const todayBar = barsByDate.get('2025-10-13');  // Returns Bar | undefined


7. **Array Initialization - NEVER Use null in Typed Arrays:**

   // ❌ WRONG - Cannot assign null to string[]
   const tradingDays: string[] = [null];

   // ✅ CORRECT - Use empty array or proper values
   const tradingDays: string[] = [];
   const tradingDays: string[] = ["2025-10-30", "2025-10-29"];

   // ✅ IF YOU NEED NULLABLE VALUES - Use union type
   const tradingDays: (string | null)[] = [null];


8. **Scanner Metrics - NEVER Assume Property Names:**

   // ❌ WRONG - Accessing properties that may not exist in metrics
   const volumeSpike = metrics.volume_spike || false;
   const bearishRejection = metrics.bearish_rejection || false;

   // ✅ CORRECT - Only access properties that the scanner actually outputs
   // Look at the scanner's output metrics to see what properties are available
   // For VWAP scanner, available metrics are:
   //   - vwap, price, distance_from_vwap_percent
   //   - volume_spike_multiplier (NOT volume_spike)
   //   - rejection_confirmation_bars
   //   - session_trend
   //   - mean_reversion_quality

   // Derive pattern type from actual metrics:
   const hasVolumeSpike = metrics.volume_spike_multiplier >= 1.5;
   const distanceFromVWAP = metrics.distance_from_vwap_percent;
   const isBearishSetup = distanceFromVWAP > 0; // Price above VWAP
   const isBullishSetup = distanceFromVWAP < 0; // Price below VWAP


9. **TradeResult Objects - ALWAYS Include Required Fields:**

   // ❌ WRONG - Missing required 'ticker' field
   results.push({
     date: signal_date,
     side: 'LONG',
     entryPrice: entry
   });

   // ✅ CORRECT - Include all required fields (date AND ticker)
   results.push({
     date: signal_date,
     ticker: ticker,  // REQUIRED!
     side: 'LONG',
     entryPrice: entry,
     entryTime: entryTime,
     exitPrice: exit,
     exitTime: exitTime,
     pnl: pnl,
     pnlPercent: pnlPercent,
     exitReason: 'Stop loss'
   });

   // ✅ For no-trade results
   results.push({
     date: signal_date,
     ticker: ticker,  // REQUIRED!
     noTrade: true,
     noTradeReason: 'No favorable setup'
   });


10. **Complete Code Generation - NEVER Truncate:**

    CRITICAL: Your response MUST be complete. If you start generating code:
    - You MUST finish all open code blocks
    - You MUST close all open braces, brackets, and parentheses
    - You MUST complete the runBacktest() function
    - You MUST include the final .catch(console.error) line

    If your response is getting long, SIMPLIFY your logic instead of truncating:
    - Use fewer helper functions
    - Inline simple calculations
    - Remove verbose comments
    - But NEVER leave incomplete code!


**Critical Rules for Signal-Based Execution:**
1. ALWAYS check if \`SCANNER_SIGNALS\` exists before using it
2. Use \`signal_date\` and \`signal_time\` fields to identify when the pattern occurred
3. Enter trades at the bar AFTER the signal time (next-bar execution)
4. Process each signal independently
5. Do NOT re-detect patterns - trust the scanner's signals
6. Apply your exit rules (stop loss, take profit, time exit) after entry
7. Trade direction should be based on the strategy logic (e.g., momentum exhaustion = SHORT, bounce = LONG)

## Date Selection

You must determine appropriate testing dates based on the user's strategy description.

**Guidelines:**
1. If the prompt explicitly mentions dates (e.g., "last 10 days", "past 20 trading days", "from Oct 1 to Oct 22"), extract them
2. If no dates specified, consider strategy complexity:
   - Simple strategies (basic ORB, single indicator): 10 trading days
   - Medium complexity (multiple conditions, VWAP + SMA, conditional logic): 15 trading days
   - Complex strategies (multi-timeframe, advanced logic, many conditions): 20 trading days
3. Return dates in YYYY-MM-DD format
4. Only return trading days (Mon-Fri, excluding major US holidays)
5. Return dates in descending order (most recent first)
6. Today's date is ${new Date().toISOString().split('T')[0]}

## Response Format

Return your response in this exact format:

DATES: ["2025-10-22", "2025-10-21", ...]

DATE_REASONING: Brief explanation of why these dates were chosen

SCRIPT:
[your complete script here]

ASSUMPTIONS:
- List each assumption you made (one per line)
- Example: "Assumed 5-period SMA uses closing prices"
- Example: "Assumed 1% stop loss applies to entry price"

CONFIDENCE: [0.0-1.0]

INDICATORS: VWAP, SMA(5), etc.

EXPLANATION: [Brief description of the strategy logic]

## Guidelines

1. Use TEMPLATE_TICKER and TEMPLATE_TIMEFRAME as placeholders, and use the dates you determined in the DATES section for the tradingDays array (e.g., const tradingDays = ['2024-01-02', '2024-01-03'])
2. Include ALL necessary imports and type definitions
3. Use realistic next-bar execution (signal detection → next bar entry)
4. Always handle the "no trade" case
5. Force exit positions at market close (16:00)
6. Make reasonable assumptions when details are unclear
7. List ALL assumptions in the ASSUMPTIONS section
8. Be precise with time comparisons (use HH:MM:SS format)
9. Calculate proper PnL and PnL percentage
10. Include helpful comments in complex logic`;
  }

  /**
   * Build user message with strategy description and parameters
   */
  private buildUserMessage(userPrompt: string, params: ScriptGenerationParams): string {
    return `Generate a backtest script for the following strategy:

USER STRATEGY: ${userPrompt}

PARAMETERS:
- Ticker: ${params.ticker}
- Timeframe: ${params.timeframe}
- Strategy Type: ${params.strategyType}

Please generate a complete, runnable TypeScript backtest script following the structure and guidelines provided.`;
  }

  /**
   * Parse Claude's response to extract script and metadata
   */
  private parseClaudeResponse(responseText: string): ClaudeScriptGenerationResponse {
    const assumptions: string[] = [];
    let script = '';
    let confidence = 0.8; // default
    let indicators: string[] = [];
    let explanation = '';
    let dates: string[] = [];
    let dateReasoning = '';

    // Extract dates (JSON array format)
    const datesMatch = responseText.match(/DATES:\s*(\[[\s\S]*?\])/);
    if (datesMatch) {
      try {
        dates = JSON.parse(datesMatch[1]);
      } catch (error) {
        console.error('Failed to parse dates from Claude response:', error);
        dates = [];
      }
    }

    // Extract date reasoning
    const dateReasoningMatch = responseText.match(/DATE_REASONING:\s*(.+)/);
    if (dateReasoningMatch) {
      dateReasoning = dateReasoningMatch[1].trim();
    }

    // Extract script using robust extraction
    const extractedScript = this.extractTypeScriptCode(responseText);
    if (extractedScript) {
      script = extractedScript;
    } else {
      console.error('Could not extract script. Response:', responseText.substring(0, 500));
      throw new Error('Could not extract script from Claude response');
    }

    // Extract assumptions (lines starting with - after ASSUMPTIONS:)
    const assumptionsMatch = responseText.match(/ASSUMPTIONS:\n([\s\S]*?)(?=\n\n|CONFIDENCE:|INDICATORS:|EXPLANATION:|$)/);
    if (assumptionsMatch) {
      const lines = assumptionsMatch[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-')) {
          assumptions.push(trimmed.substring(1).trim());
        }
      }
    }

    // Extract confidence
    const confidenceMatch = responseText.match(/CONFIDENCE:\s*([\d.]+)/);
    if (confidenceMatch) {
      confidence = parseFloat(confidenceMatch[1]);
    }

    // Extract indicators
    const indicatorsMatch = responseText.match(/INDICATORS:\s*(.+)/);
    if (indicatorsMatch) {
      indicators = indicatorsMatch[1].split(',').map(i => i.trim());
    }

    // Extract explanation
    const explanationMatch = responseText.match(/EXPLANATION:\s*(.+)/);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    return {
      script,
      assumptions,
      confidence,
      indicators,
      explanation,
      dates,
      dateReasoning,
    };
  }

  /**
   * Build scanner-specific system prompt
   */
  private buildScannerSystemPrompt(): string {
    return `You are generating a stock scanner script based on user's natural language criteria.

Your task is to generate a complete, runnable TypeScript scanner that queries the appropriate database table(s) to find matching stock patterns.

## ⚠️ CRITICAL: Data Table Selection Rules

**YOU MUST follow these rules when deciding which table to query:**

1. **If user mentions ANY of these keywords, YOU MUST use ohlcv_data table with 5-minute bars:**
   - "VWAP", "vwap", "volume-weighted average price"
   - "5-minute", "5min", "1-minute", "intraday bars"
   - "time of day", "morning", "afternoon", "opening range"
   - "intraday", "within the day", "during the day"
   - Any mention of sub-daily timeframes

2. **VWAP CANNOT be calculated from daily data!**
   - VWAP is cumulative throughout the trading day using intraday bars
   - SMA_20 is NOT a substitute for VWAP
   - Daily approximations of VWAP patterns are NOT acceptable
   - If user wants VWAP, you MUST query ohlcv_data with timeframe='5min'

3. **Use daily_metrics ONLY when:**
   - User explicitly asks for daily/multi-day patterns
   - Pattern spans multiple days (High-Tight Flag, Cup and Handle, etc.)
   - No mention of intraday timeframes or VWAP
   - Keywords: "days", "weeks", "daily", "swing trade"

## Available Data Tables

### Table 1: ohlcv_data (INTRADAY - Use for VWAP and intraday patterns)

**Schema:**
- ticker: Stock symbol (TEXT)
- timestamp: Unix timestamp in milliseconds (INTEGER)
- timeframe: '5min', '1min', '15min', '1h', '1d' (TEXT)
- open, high, low, close: Price values (REAL)
- volume: Share volume (REAL)
- time_of_day: Time in 'HH:MM' format, e.g., '09:30', '14:15' (TEXT)

**Query Example:**
\`\`\`sql
-- Get 5-minute bars for a specific date
SELECT timestamp, open, high, low, close, volume, time_of_day
FROM ohlcv_data
WHERE ticker = 'AAPL'
  AND timeframe = '5min'
  AND date(timestamp/1000, 'unixepoch') = '2025-10-29'
ORDER BY timestamp ASC

**Important:**
- Market hours: 09:30 - 16:00 ET
- Intraday data available for ~60+ tech sector stocks
- Always filter by timeframe = '5min' for intraday analysis

### Table 2: daily_metrics (DAILY - Use for multi-day patterns only)

**Schema:**
- ticker, date, open, high, low, close, volume
- change_percent (daily % change)
- change_5d_percent, change_10d_percent
- volume_ratio (volume / 30-day average)
- consecutive_up_days, consecutive_down_days
- rsi_14 (14-day RSI)
- sma_20, sma_50 (20-day and 50-day SMAs)
- price_to_sma20_percent, price_to_sma50_percent
- high_low_range_percent

### VWAP Calculation (For Intraday Patterns)

When user mentions "VWAP", "VWAP bounce", "VWAP support", or similar:

**Formula:**
Typical Price = (high + low + close) / 3
VWAP = Σ(Typical Price × Volume) / Σ(Volume)

**Implementation Pattern:**
// Calculate VWAP for each trading day
function calculateVWAP(bars: any[]): number {
  let cumVolume = 0;
  let cumVolumePrice = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumVolumePrice += typicalPrice * bar.volume;
    cumVolume += bar.volume;
  }

  return cumVolume === 0 ? 0 : cumVolumePrice / cumVolume;
}

// Query 5-minute bars for a specific day
const bars = db.prepare(\`
  SELECT timestamp, open, high, low, close, volume, time_of_day
  FROM ohlcv_data
  WHERE ticker = ?
    AND timeframe = '5min'
    AND date(timestamp/1000, 'unixepoch') = ?
  ORDER BY timestamp ASC
\`).all(ticker, dateStr);

// Calculate running VWAP for each bar
const barsWithVWAP = [];
let cumVol = 0, cumVolPrice = 0;
for (const bar of bars) {
  const typical = (bar.high + bar.low + bar.close) / 3;
  cumVolPrice += typical * bar.volume;
  cumVol += bar.volume;
  barsWithVWAP.push({
    ...bar,
    vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
  });
}

**VWAP Bounce Detection Pattern:**
// Detect VWAP bounce: price touches VWAP then bounces up
for (let i = 10; i < barsWithVWAP.length; i++) {
  const current = barsWithVWAP[i];
  const previous = barsWithVWAP.slice(i - 10, i);

  // Check if price recently touched VWAP (within 0.3%)
  const touchedVWAP = previous.some(bar => {
    const distance = Math.abs(bar.low - bar.vwap) / bar.vwap;
    return distance < 0.003; // Within 0.3%
  });

  // Check if now bouncing above VWAP
  const bouncing = current.close > current.vwap && current.close > current.open;

  // Volume confirmation
  const recentVol = previous.slice(-5).reduce((sum, b) => sum + b.volume, 0) / 5;
  const volumeExpansion = current.volume > recentVol * 1.2;

  if (touchedVWAP && bouncing && volumeExpansion) {
    // Pattern detected!
  }
}

## Scanner Script Structure Examples

### Example 1: INTRADAY Scanner (for VWAP, intraday patterns)

import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;  // Trading date (YYYY-MM-DD)
  signal_time: string;  // Time of detection (HH:MM)
  pattern_strength: number; // 0-100
  metrics: any;
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  // Get list of tickers with intraday data
  const tickersStmt = db.prepare(\`
    SELECT DISTINCT ticker FROM ohlcv_data
    WHERE timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
  \`);
  const tickers = tickersStmt.all('2025-10-28', '2025-10-29') as any[];

  console.log(\`Scanning \${tickers.length} tickers with intraday data...\`);

  // Scan each ticker
  for (const { ticker } of tickers) {
    // Get 5-minute bars for the date range
    const barsStmt = db.prepare(\`
      SELECT timestamp, open, high, low, close, volume, time_of_day,
             date(timestamp/1000, 'unixepoch') as date
      FROM ohlcv_data
      WHERE ticker = ?
        AND timeframe = '5min'
        AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      ORDER BY timestamp ASC
    \`);
    const allBars = barsStmt.all(ticker, '2025-10-28', '2025-10-29') as any[];

    if (allBars.length < 20) continue;

    // Group bars by day
    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    // Scan each day
    for (const [date, dayBars] of Object.entries(barsByDay)) {
      // Calculate VWAP for each bar
      const barsWithVWAP = [];
      let cumVol = 0, cumVolPrice = 0;

      for (const bar of dayBars) {
        const typical = (bar.high + bar.low + bar.close) / 3;
        cumVolPrice += typical * bar.volume;
        cumVol += bar.volume;
        barsWithVWAP.push({
          ...bar,
          vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
        });
      }

      // Detect VWAP bounces
      for (let i = 10; i < barsWithVWAP.length; i++) {
        const current = barsWithVWAP[i];
        const previous = barsWithVWAP.slice(i - 10, i);

        // Check if touched VWAP recently
        const touchedVWAP = previous.some(b =>
          Math.abs(b.low - b.vwap) / b.vwap < 0.003
        );

        // Check if bouncing
        const bouncing = current.close > current.vwap &&
                        current.close > current.open;

        // Volume confirmation
        const avgVol = previous.slice(-5).reduce((s, b) => s + b.volume, 0) / 5;
        const volumeExpansion = current.volume > avgVol * 1.2;

        if (touchedVWAP && bouncing && volumeExpansion) {
          results.push({
            ticker,
            signal_date: date,
            signal_time: current.time_of_day,
            pattern_strength: 75, // Calculate based on criteria
            metrics: {
              vwap: current.vwap,
              price: current.close,
              volumeRatio: current.volume / avgVol
            }
          });
        }
      }
    }
  }

  return results;
}

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  // IMPORTANT: Output ONLY the JSON to stdout (no other messages)
  // Progress messages can go to stderr: console.error()
  console.error(\`✅ Scan complete! Found \${results.length} pattern matches\`);
  console.error(\`📊 Outputting top \${topResults.length} patterns\`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(console.error);

### Example 2: DAILY Scanner (for multi-day patterns)

import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  start_date: string;
  end_date: string;
  pattern_strength: number;
  metrics: any;
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  // Query daily metrics
  const metricsStmt = db.prepare(\`
    SELECT ticker, date, open, high, low, close, volume,
           change_percent, volume_ratio, rsi_14, sma_20, sma_50
    FROM daily_metrics
    WHERE date BETWEEN ? AND ?
    ORDER BY ticker, date ASC
  \`);

  const allRows = metricsStmt.all('2025-10-01', '2025-10-29') as any[];

  // Group by ticker and detect patterns
  const byTicker: { [key: string]: any[] } = {};
  for (const row of allRows) {
    if (!byTicker[row.ticker]) byTicker[row.ticker] = [];
    byTicker[row.ticker].push(row);
  }

  for (const [ticker, rows] of Object.entries(byTicker)) {
    // Pattern detection logic for daily patterns
    // (High-Tight Flag, Cup and Handle, etc.)
  }

  return results;
}

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  // IMPORTANT: Output ONLY the JSON to stdout (no other messages)
  // Progress messages can go to stderr: console.error()
  console.error(\`✅ Scan complete! Found \${results.length} pattern matches\`);
  console.error(\`📊 Outputting top \${topResults.length} patterns\`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(console.error);

## VALIDATION CHECKLIST - Read this BEFORE writing your script!

Before generating the scanner script, answer these questions:

1. **Does the user query mention "VWAP" or "5-minute" or "intraday"?**
   - YES → You MUST use ohlcv_data table with timeframe='5min'
   - NO → You may use daily_metrics table

2. **Can this pattern be detected with daily data alone?**
   - If pattern requires intraday precision (VWAP, time of day, intraday bounces) → Use ohlcv_data
   - If pattern spans multiple days (consolidation, multi-day rally) → Use daily_metrics

3. **Is SMA_20 an acceptable substitute for VWAP?**
   - NO! Never use SMA as a VWAP proxy. VWAP is intraday-specific and cumulative from market open.

4. **Final check:** If your script queries daily_metrics but user asked for VWAP, you made an ERROR. Go back and rewrite using ohlcv_data.

## Response Format

Return your response in this exact format:

SCRIPT:
[your complete scanner script here]

EXPLANATION: [Brief description of the pattern matching logic AND which table you used (ohlcv_data or daily_metrics) and WHY]

## ⚠️ CRITICAL: Output Size Limits and JSON Format

**YOU MUST limit your scanner output to prevent buffer overflow errors!**

Your scanner may find thousands or even hundreds of thousands of pattern matches. **Outputting all of them will crash the system.**

**REQUIRED OUTPUT LIMITING:**

1. **Sort patterns by strength** (highest quality first)
2. **Take only the TOP 500-1000 patterns**
3. **Output ONLY JSON to stdout** - No other console.log messages
4. **Progress messages go to stderr** - Use console.error() for debug/progress output

**Example (REQUIRED pattern for all scanners):**

runScan().then(results => {
  // Sort by pattern strength (best signals first)
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);

  // CRITICAL: Limit to top 500 patterns to prevent buffer overflow
  const topResults = sortedResults.slice(0, 500);

  // IMPORTANT: Output ONLY the JSON to stdout (no other messages)
  // Progress messages can go to stderr: console.error()
  console.error(\`✅ Scan complete! Found \${results.length} pattern matches\`);
  console.error(\`📊 Outputting top \${topResults.length} patterns\`);

  // Output ONLY JSON to stdout for parsing
  console.log(JSON.stringify(topResults, null, 2));
}).catch(console.error);

**Why this is critical:**
- Scanner may find 100,000+ matches
- Outputting all matches exceeds stdout buffer (100MB limit)
- System will fail with "maxBuffer length exceeded" error
- Learning iteration will fail completely

**DO NOT output unlimited patterns. Always use .slice(0, 500) or similar limiting.**

## Guidelines

1. **FIRST**: Determine if this is an intraday pattern (VWAP, 5-min, time of day) or daily pattern
2. **THEN**: Choose the correct table (ohlcv_data for intraday, daily_metrics for multi-day)
3. Use the example scripts above as templates
4. Replace START_DATE and END_DATE with actual date range
5. Calculate pattern_strength score (0-100) based on criteria match quality
6. Output results as JSON array via console.log(JSON.stringify(...))
7. Handle edge cases (no data, invalid tickers, etc.)`;
  }

  /**
   * Build user message for scanner generation
   */
  private buildScannerUserMessage(params: {
    query: string;
    universe: string;
    dateRange?: { start: string; end: string };
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const startDate = params.dateRange?.start || defaultStart;
    const endDate = params.dateRange?.end || today;

    // Check if query contains intraday keywords
    const queryLower = params.query.toLowerCase();
    const isIntradayQuery = queryLower.includes('vwap') ||
                            queryLower.includes('5-minute') ||
                            queryLower.includes('5min') ||
                            queryLower.includes('intraday') ||
                            queryLower.includes('time of day');

    const tableInstruction = isIntradayQuery
      ? '\n⚠️ IMPORTANT: This query mentions intraday keywords (VWAP/5-minute/intraday). You MUST use the ohlcv_data table with timeframe=\'5min\'.\n'
      : '';

    return `Generate a scanner script for the following query:

USER QUERY: ${params.query}
${tableInstruction}
PARAMETERS:
- Universe: ${params.universe}
- Date Range: ${startDate} to ${endDate}

Please generate a complete, runnable TypeScript scanner script that finds stocks matching the user's criteria.`;
  }

  /**
   * Extract TypeScript code from Claude response with flexible matching
   */
  private extractTypeScriptCode(responseText: string): string | null {
    console.log('🔍 Attempting to extract TypeScript code...');
    console.log('Response length:', responseText.length);
    console.log('Response preview (first 800 chars):\n', responseText.substring(0, 800));

    // First, look for the SCRIPT: marker if present and extract everything after it
    let searchText = responseText;
    const scriptMarker = /(?:SCRIPT|CODE|TYPESCRIPT):\s*\n/i;
    const scriptMatch = responseText.match(scriptMarker);
    if (scriptMatch) {
      console.log(`  Found script marker at position ${scriptMatch.index}`);
      searchText = responseText.substring(scriptMatch.index! + scriptMatch[0].length);
    }

    // Try multiple patterns in order of specificity
    // First try with closing backticks (complete response)
    const patternsWithClose = [
      { regex: /```typescript\s*([\s\S]*?)```/, name: 'typescript with closing' },
      { regex: /```ts\s*([\s\S]*?)```/, name: 'ts with closing' },
      { regex: /```\s*([\s\S]*?)```/, name: 'generic with closing' },
    ];

    for (const { regex, name } of patternsWithClose) {
      console.log(`  Trying pattern: ${name}`);
      const match = searchText.match(regex);
      if (match && match[1]) {
        const code = match[1].trim();
        console.log(`  ✓ Pattern matched! Code length: ${code.length}`);
        console.log(`  Code preview (first 200 chars): ${code.substring(0, 200)}`);

        // Verify it looks like TypeScript (has import/const/function/etc)
        const tsKeywordMatch = code.match(/\b(import|const|let|var|function|class|interface|type|export)\b/);
        if (tsKeywordMatch) {
          console.log(`  ✓ TypeScript validation passed (found keyword: ${tsKeywordMatch[0]})`);
          return code;
        }
      }
    }

    // If no closing backticks found, try patterns without closing (truncated response)
    console.log('  No closing backticks found, trying truncated patterns...');
    const patternsWithoutClose = [
      { regex: /```typescript\s*([\s\S]+)$/, name: 'typescript without closing' },
      { regex: /```ts\s*([\s\S]+)$/, name: 'ts without closing' },
      { regex: /```\s*([\s\S]+)$/, name: 'generic without closing' },
    ];

    for (const { regex, name } of patternsWithoutClose) {
      console.log(`  Trying pattern: ${name}`);
      const match = searchText.match(regex);
      if (match && match[1]) {
        const code = match[1].trim();
        console.log(`  ✓ Pattern matched (truncated)! Code length: ${code.length}`);
        console.log(`  Code preview (first 200 chars): ${code.substring(0, 200)}`);

        // Verify it looks like TypeScript
        const tsKeywordMatch = code.match(/\b(import|const|let|var|function|class|interface|type|export)\b/);
        if (tsKeywordMatch) {
          console.log(`  ✓ TypeScript validation passed (found keyword: ${tsKeywordMatch[0]})`);
          console.log(`  ⚠️  WARNING: Response appears truncated (no closing backticks)`);
          return code;
        }
      }
    }

    console.log('❌ All patterns failed to extract valid TypeScript code');

    // Save full response to file for debugging
    const fs = require('fs');
    const debugPath = '/tmp/claude-response-debug.txt';
    fs.writeFileSync(debugPath, responseText);
    console.log(`Full response saved to: ${debugPath}`);
    console.log('First 1000 chars of response:\n', responseText.substring(0, 1000));
    console.log('\nSearchText first 1000 chars:\n', searchText.substring(0, 1000));

    return null;
  }

  /**
   * Parse Claude's scanner response
   */
  private parseScannerResponse(responseText: string): { script: string; explanation: string } {
    let script = '';
    let explanation = '';

    // Extract script using robust extraction
    const extractedScript = this.extractTypeScriptCode(responseText);
    if (extractedScript) {
      script = extractedScript;
    } else {
      console.error('Could not extract script. Response:', responseText.substring(0, 500));
      throw new Error('Could not extract script from Claude response');
    }

    // Extract explanation
    const explanationMatch = responseText.match(/EXPLANATION:\s*(.+)/);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    return {
      script,
      explanation,
    };
  }

  /**
   * Generate a daily backtest script that works with daily_metrics table
   * Used by portfolio backtest to test strategies across multiple stocks
   */
  async generateDailyBacktestScript(
    ticker: string,
    signalDate: string,
    strategyPrompt: string
  ): Promise<{ script: string; explanation: string }> {
    console.log(`📝 Generating daily backtest script for ${ticker} on ${signalDate}`);

    const systemPrompt = `You are an expert TypeScript developer specializing in algorithmic trading backtesting.

Generate a backtest script that works with DAILY price data from the daily_metrics table in a SQLite database.

## Database Setup
Use better-sqlite3 for database access:
import Database from 'better-sqlite3';
const db = new Database('./backtesting.db', { readonly: true });

## Database Schema
The daily_metrics table has these columns:
- ticker (TEXT), date (TEXT in YYYY-MM-DD format)
- open, high, low, close (REAL), volume (INTEGER)
- change_percent, volume_ratio, high_low_range_percent (REAL)
- sma_20, sma_50, sma_200, rsi_14 (REAL)
- consecutive_up_days, consecutive_down_days (INTEGER)
- change_5d_percent, change_10d_percent, change_20d_percent (REAL)

## Script Requirements
1. Use better-sqlite3 to query daily_metrics for the ticker starting from signal date
2. Implement the strategy logic using daily close-to-close prices
3. Output JSON array of TradeResult objects with: ticker, date, side, entry_price, exit_price, pnl, pnl_percent
4. If no trades taken, output empty array []
5. Output ONLY the script - no markdown, no explanations

## Example Template Structure
import Database from 'better-sqlite3';

interface DailyMetric {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_percent: number | null;
  volume_ratio: number | null;
  sma_20: number | null;
  sma_50: number | null;
  rsi_14: number | null;
}

const db = new Database('./backtesting.db', { readonly: true });

// Query daily metrics with proper typing
const rows = db.prepare(\`
  SELECT * FROM daily_metrics
  WHERE ticker = ? AND date >= ?
  ORDER BY date ASC
\`).all(ticker, startDate) as DailyMetric[];

// Strategy logic here...
const results: any[] = [];

// Output results as JSON
console.log(JSON.stringify(results));

IMPORTANT: Always cast database query results with 'as DailyMetric[]' to avoid TypeScript type errors.
Output ONLY executable TypeScript code, no markdown formatting.`;

    const userMessage = `Generate a daily backtest script for:

Ticker: ${ticker}
Signal Date: ${signalDate}
Strategy: ${strategyPrompt}

The script should:
1. Fetch daily metrics from the database starting near the signal date
2. Implement the strategy logic based on daily prices
3. Track positions across multiple days if needed
4. Return results as JSON array

Output ONLY the TypeScript code, no markdown formatting.`;

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 3000,
        temperature: 0.0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Extract script from response
      let script = textContent.text;

      // Remove markdown code blocks if present
      script = script.replace(/```typescript\n?/g, '').replace(/```\n?/g, '');
      script = script.trim();

      return {
        script,
        explanation: 'Daily backtest script for portfolio testing'
      };
    } catch (error: any) {
      console.error('Error generating daily backtest script:', error);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Analyze backtest results as an expert trader
   */
  async analyzeBacktestResults(params: {
    agentPersonality: string;
    backtestResults: any;
    scanResultsCount: number;
  }): Promise<any> {
    console.log('📊 Analyzing backtest results with Claude...');

    const systemPrompt = `You are an expert trader analyzing backtest results. ${params.agentPersonality}

Analyze the provided backtest results and provide structured feedback in JSON format.`;

    const userPrompt = `Analyze these backtest results:

**Backtest Summary:**
${JSON.stringify(params.backtestResults, null, 2)}

**Scan Results Count:** ${params.scanResultsCount}

Provide expert analysis in this exact JSON structure:
{
  "summary": "Brief overview of performance",
  "working_elements": ["List of things that worked well"],
  "failure_points": ["List of things that failed and why"],
  "missing_context": ["List of additional data or context needed"],
  "parameter_recommendations": [
    {
      "parameter": "name of parameter to adjust",
      "current_value": "current value",
      "suggested_value": "suggested new value",
      "rationale": "why this change would help"
    }
  ],
  "projected_performance": {
    "current": { "winRate": ${params.backtestResults.winRate || 0}, "sharpe": ${params.backtestResults.sharpeRatio || 0} },
    "withRefinements": { "winRate": 0.XX, "sharpe": X.XX },
    "confidence": 0.XX
  }
}

Return ONLY the JSON object, no additional text.`;

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // Extract JSON from response
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No JSON found in Claude response');
      }

      throw new Error('Unexpected response format from Claude');
    } catch (error: any) {
      console.error('Error analyzing backtest results:', error);
      // Return default analysis on error
      return {
        summary: 'Analysis unavailable due to error',
        working_elements: [],
        failure_points: ['Unable to complete analysis'],
        missing_context: [],
        parameter_recommendations: [],
        projected_performance: {
          current: { winRate: params.backtestResults.winRate || 0, sharpe: params.backtestResults.sharpeRatio || 0 },
          withRefinements: { winRate: 0, sharpe: 0 },
          confidence: 0
        }
      };
    }
  }
}

// Export singleton instance
export default new ClaudeService();
