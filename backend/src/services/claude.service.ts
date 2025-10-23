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
    this.maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4000');
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
   * Build comprehensive system prompt with examples and structure
   */
  private buildSystemPrompt(): string {
    return `You are an expert TypeScript developer specializing in algorithmic trading backtesting systems.

Your task is to generate complete, runnable backtest scripts based on user strategy descriptions.

## Script Structure

Every script must follow this exact structure:

\`\`\`typescript
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

interface TradeResult {
  date: string;
  ticker: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
  noTrade?: boolean;
  noTradeReason?: string;
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
\`\`\`

## Available Data

Each bar has:
- timestamp: Unix timestamp in milliseconds
- open, high, low, close: Price data
- volume: Trading volume
- timeOfDay: String in HH:MM:SS format (e.g., "09:30:00", "14:15:30")

## Time Comparisons

IMPORTANT: Use \`.startsWith()\` for time comparisons since times are in HH:MM:SS format:

\`\`\`typescript
// ✅ Correct
if (bar.timeOfDay.startsWith('09:30')) { ... }
if (bar.timeOfDay >= '09:30:00' && bar.timeOfDay < '16:00:00') { ... }

// ❌ Wrong
if (bar.timeOfDay === '09:30') { ... }
\`\`\`

## Common Indicators

### VWAP (Volume-Weighted Average Price)
\`\`\`typescript
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
\`\`\`

### SMA (Simple Moving Average)
\`\`\`typescript
function calculateSMA(bars: Bar[], period: number, field: 'close' | 'open' | 'high' | 'low' = 'close'): number {
  if (bars.length < period) return 0;
  const sum = bars.slice(-period).reduce((acc, bar) => acc + bar[field], 0);
  return sum / period;
}
\`\`\`

### EMA (Exponential Moving Average)
\`\`\`typescript
function calculateEMA(bars: Bar[], period: number, field: 'close' | 'open' | 'high' | 'low' = 'close'): number {
  if (bars.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = bars[0][field];
  for (let i = 1; i < bars.length; i++) {
    ema = (bars[i][field] - ema) * multiplier + ema;
  }
  return ema;
}
\`\`\`

## Trade Execution Pattern

Use signal tracking for realistic next-bar execution:

\`\`\`typescript
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
\`\`\`

## Response Format

Return your response in this exact format:

SCRIPT:
\`\`\`typescript
[your complete script here]
\`\`\`

ASSUMPTIONS:
- List each assumption you made (one per line)
- Example: "Assumed 5-period SMA uses closing prices"
- Example: "Assumed 1% stop loss applies to entry price"

CONFIDENCE: [0.0-1.0]

INDICATORS: VWAP, SMA(5), etc.

EXPLANATION: [Brief description of the strategy logic]

## Guidelines

1. Use TEMPLATE_TICKER and TEMPLATE_TIMEFRAME as placeholders, but use the ACTUAL dates provided in the user message for tradingDays array (e.g., const tradingDays = ['2024-01-02', '2024-01-03'])
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

${params.specificDates ? `Specific Dates: ${params.specificDates.join(', ')}` : ''}
${params.date ? `Single Date: ${params.date}` : ''}

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

    // Extract script (between ```typescript and ```)
    const scriptMatch = responseText.match(/```typescript\n([\s\S]*?)\n```/);
    if (scriptMatch) {
      script = scriptMatch[1].trim();
    } else {
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
    };
  }
}

// Export singleton instance
export default new ClaudeService();
