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
    this.maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '20000'); // Balanced to prevent truncation while avoiding SDK timeout limits
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
      this.client = new Anthropic({
        apiKey,
      });
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

      // Log token usage
      const tokenUsage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        max_tokens: this.maxTokens,
        utilization_percent: ((response.usage.output_tokens / this.maxTokens) * 100).toFixed(1),
        stop_reason: response.stop_reason || 'end_turn',
      };
      console.log('📊 Token Usage:', JSON.stringify(tokenUsage, null, 2));

      // Check for truncation
      if (response.stop_reason === 'max_tokens') {
        console.warn('⚠️  Script generation truncated due to token limit!');
        console.warn('   Consider simplifying the prompt or increasing max_tokens further.');
      } else if (response.usage.output_tokens > this.maxTokens * 0.9) {
        console.warn(`⚠️  WARNING: Using ${tokenUsage.utilization_percent}% of max_tokens (close to limit)`);
      }

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse the response and include token usage
      const parsed = this.parseClaudeResponse(textContent.text);
      return {
        ...parsed,
        tokenUsage,
      };
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
  }): Promise<{ script: string; explanation: string; tokenUsage?: any }> {
    console.log('🔍 Claude generating scanner script for query:', params.query);

    const systemPrompt = this.buildScannerSystemPrompt();
    const userMessage = this.buildScannerUserMessage(params);

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 20000, // Balanced to prevent truncation while avoiding SDK timeout limits
        temperature: 0.0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      // Log token usage
      const tokenUsage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        max_tokens: this.maxTokens,
        utilization_percent: ((response.usage.output_tokens / this.maxTokens) * 100).toFixed(1),
        stop_reason: response.stop_reason || 'end_turn',
      };
      console.log('📊 Scanner Token Usage:', JSON.stringify(tokenUsage, null, 2));

      // Check for truncation
      if (response.stop_reason === 'max_tokens') {
        console.warn('⚠️  Scanner script truncated due to token limit!');
        console.warn('   Consider simplifying the prompt or increasing max_tokens further.');
      } else if (response.usage.output_tokens > this.maxTokens * 0.9) {
        console.warn(`⚠️  WARNING: Using ${tokenUsage.utilization_percent}% of max_tokens (close to limit)`);
      }

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse the response and include token usage
      const parsed = this.parseScannerResponse(textContent.text);
      return {
        ...parsed,
        tokenUsage,
      };
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

Generate complete, runnable backtest scripts based on user strategy descriptions.

## Script Structure

import { initializeDatabase, getDatabase } from './src/database/db';
import * as helpers from './src/utils/backtest-helpers';
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

interface TradeResult {
  date: string;              // Required
  ticker: string;            // Required
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;     // Use 'highestPrice', NOT 'highest'
  lowestPrice?: number;      // Use 'lowestPrice', NOT 'lowest'
  noTrade?: boolean;
  noTradeReason?: string;
}

async function runBacktest() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  const ticker = 'TEMPLATE_TICKER';
  const timeframe = 'TEMPLATE_TIMEFRAME';
  const tradingDays: string[] = []; // NEVER use [null] - always empty array []

  const results: TradeResult[] = [];

  for (const date of tradingDays) {
    const dateStart = new Date(\`\${date}T00:00:00Z\`).getTime();
    const nextDate = new Date(date);
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
      results.push({ date, ticker, noTrade: true, noTradeReason: 'No data available' });
      continue;
    }

    // YOUR STRATEGY LOGIC HERE
  }

  console.log(JSON.stringify(results, null, 2));
}

runBacktest().catch(console.error);

## Data & Time

Bar fields: timestamp, open, high, low, close, volume, timeOfDay (HH:MM:SS format)

Time comparisons:
✅ bar.timeOfDay >= '09:30:00' && bar.timeOfDay < '16:00:00'
❌ bar.timeOfDay === '09:30' (wrong format)

## Indicators

Use helpers module for technical analysis:

**Basic:** helpers.calculateVWAP(bars), helpers.calculateSMA(bars, period), helpers.calculateEMA(bars, period), helpers.calculateATR(bars, period?), helpers.calculateRSI(bars, period?), helpers.calculateBollingerBands(bars, period?, stdDev?), helpers.calculateMACD(bars, fast?, slow?, signal?)

**Patterns:** helpers.isHigherHighs(bars, lookback?), helpers.isLowerLows(bars, lookback?)

**Support/Resistance:** helpers.findSupport(bars, lookback?), helpers.findResistance(bars, lookback?), helpers.distanceFromLevel(currentPrice, level)

**Volume:** helpers.calculateAverageVolume(bars, period), helpers.hasVolumeSpike(currentVol, avgVol, multiplier?)

Example:
const vwap = helpers.calculateVWAP(bars);
const rsi = helpers.calculateRSI(bars, 14);
if (bars[i].close > vwap && rsi < 30) { /* oversold bounce */ }

## Trade Execution

Next-bar entry pattern (use proper types - NEVER mix boolean and string):

let signalDetected: false | 'LONG' | 'SHORT' = false;  // Union type for signal direction
let position: { side: 'LONG' | 'SHORT'; entry: number; entryTime: string; highestPrice: number; lowestPrice: number } | null = null;

for (let i = 0; i < bars.length; i++) {
  const bar = bars[i];
  if (bar.timeOfDay < '09:30:00') continue;

  if (signalDetected && !position) {
    const side = signalDetected; // 'LONG' or 'SHORT', NOT boolean
    position = { side, entry: bar.open, entryTime: bar.timeOfDay, highestPrice: bar.high, lowestPrice: bar.low };
    signalDetected = false;
  }

  if (!position && !signalDetected) {
    // Detect LONG signals
    if (/* long entry condition */) {
      signalDetected = 'LONG';  // String, NOT true
    }
    // Detect SHORT signals
    else if (/* short entry condition */) {
      signalDetected = 'SHORT';  // String, NOT true
    }
  }

  if (position) {
    position.highestPrice = Math.max(position.highestPrice, bar.high);
    position.lowestPrice = Math.min(position.lowestPrice, bar.low);

    if (/* exit condition */ || bar.timeOfDay >= '15:55:00') {
      const pnl = position.side === 'LONG' ? bar.close - position.entry : position.entry - bar.close;
      results.push({
        date, ticker, side: position.side,
        entryTime: position.entryTime, entryPrice: position.entry,
        exitTime: bar.timeOfDay, exitPrice: bar.close,
        pnl, pnlPercent: (pnl / position.entry) * 100,
        exitReason: 'Stop/Profit/Close',
        highestPrice: position.highestPrice,
        lowestPrice: position.lowestPrice
      });
      position = null;
    }
  }
}

if (results.filter(r => r.date === date).length === 0) {
  results.push({ date, ticker, noTrade: true, noTradeReason: 'No entry signal' });
}

## Trade Limiting

For "max N trades per day":

let tradesCountToday = 0;
const maxTradesPerDay = 1;

// Check before entry:
if (signalDetected && !position && tradesCountToday < maxTradesPerDay) {
  position = { ... };
  tradesCountToday++;
}

// Check before signal detection:
if (!position && !signalDetected && tradesCountToday < maxTradesPerDay && /* condition */) {
  signalDetected = true;
}

## Signal-Based Execution

interface ScannerSignal {
  ticker: string;
  signal_date: string;     // NOT 'date'
  signal_time: string;     // NOT 'time'
  pattern_strength: number;
  metrics: { [key: string]: any };  // Flexible - scanner provides whatever metrics are relevant
}

const useSignalBasedExecution = typeof SCANNER_SIGNALS !== 'undefined' && SCANNER_SIGNALS.length > 0;

if (useSignalBasedExecution) {
  for (const signal of SCANNER_SIGNALS) {
    const { ticker, signal_date, signal_time, metrics } = signal;

    const bars = /* fetch bars for signal_date */;
    const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signal_time);

    if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
      results.push({ date: signal_date, ticker, noTrade: true, noTradeReason: 'Signal too late' });
      continue;
    }

    const entryBar = bars[signalBarIndex + 1];

    // Determine side from metrics or derive from price action
    // IMPORTANT: Don't assume specific metric names exist! Check before using.
    // Pattern-based fallback: LONG for gap-ups/breakouts/bounces, SHORT for gap-downs/breakdowns/fades
    const side = metrics.direction || (entryBar.close > (metrics.vwap || bars[signalBarIndex].close) ? 'LONG' : 'SHORT');

    let position = {
      side, entry: entryBar.open, entryTime: entryBar.timeOfDay,
      highestPrice: entryBar.high, lowestPrice: entryBar.low
    };

    for (let i = signalBarIndex + 2; i < bars.length; i++) {
      const bar = bars[i];
      position.highestPrice = Math.max(position.highestPrice, bar.high);
      position.lowestPrice = Math.min(position.lowestPrice, bar.low);

      let exitTriggered = false;
      let exitPrice = bar.close;
      let exitReason = '';

      if (side === 'LONG') {
        const stopLoss = position.entry * (1 - stopLossPct / 100);
        const takeProfit = position.entry * (1 + takeProfitPct / 100);
        if (bar.low <= stopLoss) { exitTriggered = true; exitPrice = stopLoss; exitReason = 'Stop loss'; }
        else if (bar.high >= takeProfit) { exitTriggered = true; exitPrice = takeProfit; exitReason = 'Take profit'; }
        else if (bar.timeOfDay >= '15:55:00') { exitTriggered = true; exitPrice = bar.close; exitReason = 'Market close'; }
      } else {
        const stopLoss = position.entry * (1 + stopLossPct / 100);
        const takeProfit = position.entry * (1 - takeProfitPct / 100);
        if (bar.high >= stopLoss) { exitTriggered = true; exitPrice = stopLoss; exitReason = 'Stop loss'; }
        else if (bar.low <= takeProfit) { exitTriggered = true; exitPrice = takeProfit; exitReason = 'Take profit'; }
        else if (bar.timeOfDay >= '15:55:00') { exitTriggered = true; exitPrice = bar.close; exitReason = 'Market close'; }
      }

      if (exitTriggered) {
        const pnl = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
        results.push({
          date: signal_date, ticker, side,
          entryTime: position.entryTime, entryPrice: position.entry,
          exitTime: bar.timeOfDay, exitPrice, pnl,
          pnlPercent: (pnl / position.entry) * 100,
          exitReason,
          highestPrice: position.highestPrice,
          lowestPrice: position.lowestPrice
        });
        break;
      }
    }
  }
}

## TypeScript Requirements

⚠️ **CRITICAL TYPESCRIPT RULES - FOLLOW EXACTLY:**

| Rule | ❌ Wrong | ✅ Correct |
|------|----------|------------|
| **🚫 NULL ARRAYS** | \`const days: string[] = [null];\` | \`const days: string[] = [];\` ← EMPTY ARRAY, NEVER NULL |
| **🚫 TYPE MIXING** | \`let signal = false; signal = 'LONG';\` (mixes boolean/string) | \`let signal: false \| 'LONG' \| 'SHORT' = false;\` ← UNION TYPE |
| **🚫 BOOLEAN AS STRING** | \`if (signalDetected) { side = signalDetected; }\` where signalDetected is boolean | \`let signal: false \| 'LONG' \| 'SHORT' = false;\` then \`signal = 'LONG';\` |
| **Callback types** | \`bars.reduce((acc, bar) => ...)\` | \`bars.reduce((acc: number, bar: Bar) => ...)\` |
| **Null handling** | \`let reason: string = null;\` | \`let reason: string | null = null;\` or \`let reason = '';\` |
| **Scanner fields** | \`signal.date, signal.time\` | \`signal.signal_date, signal.signal_time\` |
| **Metrics access** | \`const rsi = metrics.rsi;\` | \`const rsi = helpers.calculateRSI(bars, 14);\` - Always calculate, never assume metrics exist |
| **Side determination** | \`const side = metrics.trend === 'bullish' ? 'LONG' : 'SHORT';\` | Derive from price action: \`const side = bar.close > vwap ? 'LONG' : 'SHORT';\` |
| **TradeResult** | Missing ticker field | \`{ date, ticker, ... }\` (both required) |
| **Date dicts** | \`const d = bars.reduce((acc, b) => { acc[b.date] = b; }, {});\` | \`const d: Record<string, Bar> = {}; bars.forEach((b: Bar) => { d[b.date] = b; });\` |
| **Complete code** | Truncated scripts | Finish ALL braces, include runBacktest().catch(console.error); |

⚠️ **CRITICAL:** Never truncate code. If approaching limits:
1. Remove comments
2. Use shorter variable names
3. Inline calculations
4. Combine if-statements
5. Remove console.logs

Complete simple code > Incomplete complex code

## Date Selection

Extract from prompt or use defaults:
- Simple strategies: 10 days
- Medium complexity: 15 days
- Complex strategies: 20 days

Return YYYY-MM-DD format, descending order, trading days only.
Today: ${new Date().toISOString().split('T')[0]}

## Response Format

DATES: ["2025-10-22", "2025-10-21", ...]

DATE_REASONING: Why these dates

SCRIPT:
[complete script]

ASSUMPTIONS:
- List assumptions made

CONFIDENCE: [0.0-1.0]

INDICATORS: VWAP, SMA(5), etc.

EXPLANATION: Strategy description

## Guidelines

1. Use TEMPLATE_TICKER, TEMPLATE_TIMEFRAME placeholders
2. Include all imports and types
3. Use next-bar execution
4. Handle no-trade cases
5. Exit at market close (16:00)
6. List all assumptions
7. Use HH:MM:SS for times
8. Calculate proper PnL
`;
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

IMPORTANT: Replace TEMPLATE_TICKER with "${params.ticker}" and TEMPLATE_TIMEFRAME with EXACTLY "${params.timeframe}" (use this exact string, do not abbreviate or modify it).

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
  direction: 'LONG' | 'SHORT';  // Trade direction
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
            direction: 'LONG', // Set based on pattern: 'LONG' for breakouts/bounces/gap-ups, 'SHORT' for breakdowns/fades/gap-downs
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

${params.backtestResults.templateResults ? `
**IMPORTANT: Multiple execution templates were tested on the same signals:**
${params.backtestResults.templateResults.map((t: any) =>
  `- ${t.templateDisplayName}: ${(t.winRate * 100).toFixed(0)}% win rate, ${t.sharpeRatio.toFixed(2)} Sharpe, ${t.totalReturn.toFixed(1)}% return`
).join('\n')}

Analyze which execution approach works best for this pattern and why.` : ''}

Provide expert analysis in this exact JSON structure:
{
  "summary": "Brief overview of performance including execution strategy effectiveness",
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
  "execution_analysis": {
    "template_comparison": "Analysis of which exit templates worked best and why",
    "exit_timing_issues": ["Specific issues with exit timing observed in trades"],
    "stop_loss_effectiveness": "Assessment of stop loss placement and whether stops are too tight/wide",
    "take_profit_effectiveness": "Assessment of profit targets and whether they're achievable",
    "suggested_improvements": ["Specific actionable improvements to execution logic"]
  },
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

  /**
   * Analyze scanner script that found 0 signals and suggest filter adjustments
   */
  async analyzeZeroSignalScanner(params: {
    agentPersonality: string;
    scannerScript: string;
    agentKnowledge: string;
    previousIterationSignals?: number;
  }): Promise<any> {
    console.log('🔍 Analyzing scanner script that found 0 signals...');

    const systemPrompt = `You are an expert algorithmic trader analyzing scanner scripts. ${params.agentPersonality}

Your task is to analyze a scanner script that found ZERO signals and provide specific, actionable recommendations to loosen filters appropriately.`;

    const userPrompt = `This scanner script found 0 signals when scanning the market. This is too restrictive and prevents the agent from learning.

**Scanner Script:**
\`\`\`typescript
${params.scannerScript}
\`\`\`

**Agent's Accumulated Knowledge:**
${params.agentKnowledge || 'No prior knowledge yet'}

${params.previousIterationSignals ? `**Previous Iteration:** Found ${params.previousIterationSignals} signals` : ''}

**Your Task:**
Analyze the scanner's filter criteria and suggest specific adjustments to increase signal frequency while maintaining quality.

Common issues with restrictive scanners:
- Deviation/threshold ranges too narrow (e.g., 1.5-4% → widen to 1.2-5%)
- Volume requirements too high (e.g., 1.5x → reduce to 1.2x)
- Minimum strength scores too high (e.g., 70 → reduce to 60)
- Time windows too narrow (e.g., 10:00-12:00 → expand to 10:00-14:00)
- Price ranges too tight (e.g., $50-$100 → expand to $20-$150)
- Multiple AND conditions that are too restrictive

Provide your analysis in this exact JSON structure:
{
  "summary": "Brief explanation of why the scanner found 0 signals",
  "restrictive_filters_identified": [
    "List each filter that is too restrictive and why"
  ],
  "parameter_recommendations": [
    {
      "parameter": "exact parameter name from code (e.g., 'deviation_percent_range', 'volume_ratio_min')",
      "current_value": "current value in code (e.g., '1.5-4%', '1.3x')",
      "suggested_value": "new value that loosens filter (e.g., '1.2-5%', '1.2x')",
      "rationale": "Specific reason this will help (e.g., 'Widening from 1.5% to 1.2% captures 30% more valid signals based on market distribution')"
    }
  ],
  "expected_signal_increase": "Estimated number of signals with these changes (e.g., '15-30 signals per scan')",
  "quality_assurance": "How these changes maintain signal quality while increasing quantity"
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

      const textContent = response.content.find((block: any) => block.type === 'text');
      if (!textContent) {
        throw new Error('No text content in Claude response');
      }

      // Parse JSON response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Failed to parse JSON from Claude response:', textContent.text);
        throw new Error('Claude response was not valid JSON');
      }

      const analysis = JSON.parse(jsonMatch[0]);
      console.log('✅ Zero-signal analysis complete');
      console.log(`   Identified ${analysis.restrictive_filters_identified?.length || 0} restrictive filters`);
      console.log(`   Generated ${analysis.parameter_recommendations?.length || 0} recommendations`);

      return analysis;
    } catch (error: any) {
      console.error('❌ Failed to analyze zero-signal scanner:', error.message);
      // Return fallback analysis
      return {
        summary: 'Scanner found 0 signals - filters are too restrictive',
        restrictive_filters_identified: [
          'Unable to analyze specific filters - manual review recommended'
        ],
        parameter_recommendations: [
          {
            parameter: 'filter_thresholds',
            current_value: 'unknown',
            suggested_value: 'loosen by 20-30%',
            rationale: 'Gradually relax filters to find optimal balance between signal quantity and quality'
          }
        ],
        expected_signal_increase: '10-50 signals',
        quality_assurance: 'Incremental loosening maintains quality while increasing sample size'
      };
    }
  }

  /**
   * Infer Signal interface structure from actual scanner output
   */
  private inferSignalInterface(sampleSignal: any, scannerContext?: string): string {
    if (!sampleSignal || !sampleSignal.metrics) {
      // Fallback to flexible interface if no sample provided
      return `interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  metrics?: { [key: string]: any };  // Flexible metrics
}`;
    }

    // Analyze metrics to infer trade direction
    const metricKeys = Object.keys(sampleSignal.metrics).map(k => k.toLowerCase()).join(' ');
    const contextLower = (scannerContext || '').toLowerCase();

    let directionHint = '';
    let directionReason = '';

    // Analyze for LONG signals (bullish patterns)
    if (metricKeys.includes('breakout') || contextLower.includes('breakout')) {
      directionHint = 'LONG';
      directionReason = 'Breakout patterns are bullish momentum - price breaking above resistance';
    } else if (contextLower.includes('bullish') || contextLower.includes('long') || contextLower.includes('buy')) {
      directionHint = 'LONG';
      directionReason = 'Strategy explicitly indicates bullish/long direction';
    } else if (metricKeys.includes('breakdown') || contextLower.includes('breakdown')) {
      directionHint = 'SHORT';
      directionReason = 'Breakdown patterns are bearish - price breaking below support';
    } else if (contextLower.includes('bearish') || contextLower.includes('short') || contextLower.includes('sell')) {
      directionHint = 'SHORT';
      directionReason = 'Strategy explicitly indicates bearish/short direction';
    } else if (metricKeys.includes('rejection_type') && sampleSignal.metrics.rejection_type === 'bearish') {
      directionHint = 'SHORT';
      directionReason = 'Bearish rejection pattern';
    } else if (metricKeys.includes('rejection_type') && sampleSignal.metrics.rejection_type === 'bullish') {
      directionHint = 'LONG';
      directionReason = 'Bullish rejection pattern';
    }

    // Infer types from actual metrics
    const metricsFields = Object.keys(sampleSignal.metrics)
      .map(key => {
        const value = sampleSignal.metrics[key];
        let type: string;

        if (typeof value === 'number') {
          type = 'number';
        } else if (typeof value === 'string') {
          type = 'string';
        } else if (typeof value === 'boolean') {
          type = 'boolean';
        } else {
          type = 'any';
        }

        return `    ${key}: ${type};`;
      })
      .join('\n');

    return `interface Signal {
  ticker: string;
  signal_date: string;      // YYYY-MM-DD format
  signal_time: string;      // HH:MM format
  pattern_strength: number; // 0-100
  metrics: {
${metricsFields}
  };
}${directionHint ? `

// CRITICAL - INFERRED TRADE DIRECTION: ${directionHint}
// Reason: ${directionReason}
// You MUST use "${directionHint}" as the trade direction (side) in your execution logic.` : ''}`;
  }

  /**
   * Generate custom execution script from agent's strategy (for iteration 1)
   */
  async generateExecutionScriptFromStrategy(params: {
    agentInstructions: string;
    agentPersonality: string;
    patternFocus: string[];
    tradingStyle: string;
    riskTolerance: string;
    marketConditions: string[];
    scannerContext: string;
  }): Promise<{ script: string; rationale: string; tokenUsage: any }> {
    console.log('🎯 Generating strategy-aligned execution script with Claude...');

    const systemPrompt = `You are an expert algorithmic trader specializing in execution strategy design. ${params.agentPersonality}

Your task is to create a custom execution script that implements the agent's trading strategy as described in their instructions.`;

    const userPrompt = `Generate a custom execution script that implements this trading strategy:

**Agent Instructions:**
${params.agentInstructions}

**Pattern Focus:** ${params.patternFocus.join(', ')}
**Trading Style:** ${params.tradingStyle}
**Risk Tolerance:** ${params.riskTolerance}
**Market Conditions:** ${params.marketConditions.join(', ')}

**Scanner Context:**
${params.scannerContext}

**YOUR TASK:**
Generate TypeScript code that will be inserted into the backtest execution loop to implement the strategy.

The code will receive:
- \`SCANNER_SIGNALS\`: Array of signals with fields: ticker, signal_date, signal_time, direction, metrics
- \`results\`: Array to push TradeResult objects
- Access to database via \`helpers.getIntradayData(db, ticker, signal_date, timeframe)\`

**IMPORTANT**: Signal fields are \`signal_date\` and \`signal_time\` (NOT \`date\` and \`time\`)

Example signal destructuring:
\`\`\`typescript
for (const signal of SCANNER_SIGNALS) {
  const { ticker, signal_date, signal_time, direction, metrics } = signal;
  const bars = await helpers.getIntradayData(db, ticker, signal_date, '5min');
  // ... rest of logic
}
\`\`\`

Generate ONLY the execution loop code (no imports, no function wrapper). The code should:
1. Loop through each signal in SCANNER_SIGNALS
2. Fetch intraday bars using signal_date (not date!)
3. Find entry point based on strategy (e.g., "enter on pullback" → implement pullback logic)
4. Track position with stop loss and profit targets matching risk tolerance
5. Push TradeResult to results array

**CRITICAL REQUIREMENTS:**

1. **Align with Strategy**: The execution logic should directly implement the strategy described in the agent instructions
   - If instructions say "enter on first pullback", implement pullback detection
   - If instructions say "ride momentum continuation", use trailing stops not fixed targets
   - If instructions mention specific conditions, code them explicitly

2. **Match Risk Profile**:
   - Aggressive: Wider stops (2-4%), let winners run with trailing stops
   - Moderate: Balanced stops (1.5-2.5%), take partial profits
   - Conservative: Tight stops (0.5-1.5%), quick profit taking

3. **Match Trading Style**:
   - Day trader: Exit before market close (15:55), tighter time-based stops
   - Swing trader: Can hold overnight, wider stops for volatility
   - Scalper: Very tight stops, quick profit targets

4. **Direction Handling**: ALWAYS read direction from signal.direction field (LONG/SHORT)

5. **Output Format**: Return ONLY the execution code block that will be inserted between the loop and results output

Generate executable TypeScript code that will produce superior results by being true to the strategy's intent.`;

    try {
      const completion = await this.getClient().messages.create({
        model: this.model,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });

      const responseText = completion.content[0].type === 'text'
        ? completion.content[0].text
        : '';

      // Extract code block
      const codeBlockMatch = responseText.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
      const script = codeBlockMatch ? codeBlockMatch[1].trim() : responseText.trim();

      // Extract rationale (text before first code block)
      const rationaleMatch = responseText.match(/([\s\S]*?)```/);
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : 'Strategy-aligned custom execution script';

      const tokenUsage = {
        inputTokens: completion.usage?.input_tokens || 0,
        outputTokens: completion.usage?.output_tokens || 0
      };

      console.log(`   ✅ Generated execution script (${tokenUsage.inputTokens} in, ${tokenUsage.outputTokens} out)`);

      return { script, rationale, tokenUsage };
    } catch (error: any) {
      console.error('❌ Error generating execution script:', error.message);
      throw new Error(`Failed to generate execution script: ${error.message}`);
    }
  }

  /**
   * Generate custom execution script based on learnings from previous iterations
   */
  async generateExecutionScript(params: {
    agentPersonality: string;
    winningTemplate: string;
    templatePerformances: any[];
    executionAnalysis: any;
    agentKnowledge: string;
    scannerContext: string;
    actualScannerSignals?: any[];  // NEW: Sample signals from actual scanner output
  }): Promise<{ script: string; rationale: string }> {
    console.log('🎯 Generating custom execution script with Claude...');

    // Infer signal interface from actual scanner output
    const sampleSignal = params.actualScannerSignals?.[0];
    const signalInterface = this.inferSignalInterface(sampleSignal, params.scannerContext);

    const systemPrompt = `You are an expert algorithmic trader specializing in execution strategy optimization. ${params.agentPersonality}

Your task is to generate a custom execution script that improves upon previous template performance by incorporating learned insights.`;

    const userPrompt = `Based on previous iteration results, generate an improved custom execution script.

**Previous Winning Template:** ${params.winningTemplate}

**Template Performance Comparison:**
${params.templatePerformances.map((t: any) => `
- ${t.templateDisplayName}: ${(t.winRate * 100).toFixed(0)}% win rate, ${t.sharpeRatio.toFixed(2)} Sharpe, ${t.profitFactor?.toFixed(2)} PF
  Total Return: ${t.totalReturn.toFixed(1)}%`).join('\n')}

**Execution Analysis from Previous Iteration:**
${JSON.stringify(params.executionAnalysis, null, 2)}

**Agent's Accumulated Knowledge:**
${params.agentKnowledge}

**Scanner Context:**
${params.scannerContext}

Generate a custom TypeScript execution script that:
1. Builds upon the winning template's strengths
2. Addresses the execution issues identified in the analysis
3. Incorporates patterns learned from all template performances
4. Adapts to the specific pattern characteristics from the scanner

IMPORTANT: The script will be saved to backend/generated-scripts/success/[date]/[id]-custom-execution.ts
Use CORRECT import paths: '../../src/database/db' (not './src/database/db')

**CRITICAL - Signal Interface from YOUR Scanner:**
The ACTUAL Signal interface from the scanner output is:
\`\`\`typescript
${signalInterface}
\`\`\`

${sampleSignal ? `
**Example Signal from Scanner:**
\`\`\`json
${JSON.stringify(sampleSignal, null, 2)}
\`\`\`

IMPORTANT: Use these EXACT field names from the scanner. Do NOT assume fields like 'rejection_type' or 'wick_ratio' exist unless shown above.

**How to Determine Trade Direction:**
Analyze the signal metrics and scanner context to infer trade direction:
- For breakout patterns: Usually LONG (buying momentum)
- For rejection patterns: Check if 'rejection_type' field exists
- For mean reversion: Analyze price vs reference level (VWAP, moving average)
- Default: Use price action context (e.g., if price > recent average, consider LONG)
` : `
NOTE: No sample signals provided. Use flexible metric access:
\`const someMetric = signal.metrics?.field_name || defaultValue;\`
`}

The script should follow this structure:

\`\`\`typescript
import { Database } from 'better-sqlite3';
import { getDatabase } from '../../src/database/db';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

${signalInterface}

interface Trade {
  date: string;
  ticker: string;
  side: 'LONG' | 'SHORT';
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  pnl: number;
  pnl_percent: number;
  exit_reason: string;
  highest_price?: number;
  lowest_price?: number;
}

async function executeSignal(signal: Signal, db: Database): Promise<Trade | null> {
  // Get intraday 5-minute bars for the signal date
  const dateStart = new Date(\`\${signal.signal_date}T00:00:00Z\`).getTime();
  const nextDate = new Date(signal.signal_date);
  nextDate.setDate(nextDate.getDate() + 1);
  const dateEnd = nextDate.getTime();

  const bars = db.prepare(\`
    SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
    FROM ohlcv_data
    WHERE ticker = ? AND timeframe = '5min'
      AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  \`).all(signal.ticker, dateStart, dateEnd) as any[];

  if (bars.length === 0) return null;

  // Find the signal bar and entry bar (next bar after signal)
  const signalBarIndex = bars.findIndex((b: any) => b.timeOfDay >= signal.signal_time);
  if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) return null;

  const entryBar = bars[signalBarIndex + 1];
  const entryPrice = entryBar.open;

  // Determine trade side based on pattern type and signal metrics
  // Adapt this logic to your scanner's specific output!
  const side: 'LONG' | 'SHORT' = 'LONG';  // Customize based on signal.metrics fields

  // Implementation with improved execution logic
  // Include: entry timing, stop loss, take profit, trailing stops, time-based exits
  // ... (add your custom logic here based on learnings)

  // Example return (customize based on your exit logic):
  return {
    date: signal.signal_date,
    ticker: signal.ticker,
    side,
    entry_time: entryBar.timeOfDay,
    entry_price: entryPrice,
    exit_time: bars[bars.length - 1].timeOfDay,
    exit_price: bars[bars.length - 1].close,
    pnl: side === 'LONG' ?
      (bars[bars.length - 1].close - entryPrice) :
      (entryPrice - bars[bars.length - 1].close),
    pnl_percent: side === 'LONG' ?
      ((bars[bars.length - 1].close - entryPrice) / entryPrice) * 100 :
      ((entryPrice - bars[bars.length - 1].close) / entryPrice) * 100,
    exit_reason: 'time_exit',
    highest_price: Math.max(...bars.slice(signalBarIndex + 1).map((b: any) => b.high)),
    lowest_price: Math.min(...bars.slice(signalBarIndex + 1).map((b: any) => b.low))
  };
}

async function executeSignals(signals: Signal[]): Promise<Trade[]> {
  const db = getDatabase();
  const trades: Trade[] = [];

  for (const signal of signals) {
    const trade = await executeSignal(signal, db);
    if (trade) trades.push(trade);
  }

  return trades;
}

// Signals will be embedded here by the system (replaces stdin reading)
const signals = [];

executeSignals(signals).then(trades => {
  console.log(JSON.stringify(trades, null, 2));
  process.exit(0);
}).catch(error => {
  console.error('Execution error:', error);
  process.exit(1);
});
\`\`\`

Provide your response in this JSON format:
{
  "script": "// Full TypeScript execution script code here",
  "rationale": "Explanation of key improvements made and why they address previous issues"
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
          const result = JSON.parse(jsonMatch[0]);
          console.log('✅ Generated custom execution script');
          console.log('📝 Rationale:', result.rationale.substring(0, 200) + '...');
          return result;
        }
        throw new Error('No JSON found in Claude response');
      }

      throw new Error('Unexpected response format from Claude');
    } catch (error: any) {
      console.error('Error generating execution script:', error);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new ClaudeService();
