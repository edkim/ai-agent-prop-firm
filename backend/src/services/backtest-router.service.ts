/**
 * Backtest Router Service
 *
 * Intelligent routing system that decides how to execute backtest requests:
 * - Tier 1: Template API for common patterns (date ranges, exit times)
 * - Tier 2: Custom script generation with date injection (earnings, specific dates)
 * - Tier 3: Fully custom scripts (edge cases)
 */

import { ScriptGenerationParams, RoutingDecision, DateQueryFilter } from '../types/script.types';
import { DateQueryService } from './date-query.service';
import { ScriptGeneratorService } from './script-generator.service';

export class BacktestRouterService {
  private dateQueryService: DateQueryService;
  private scriptGenerator: ScriptGeneratorService;

  constructor() {
    this.dateQueryService = new DateQueryService();
    this.scriptGenerator = new ScriptGeneratorService();
  }

  /**
   * Analyze a backtest request and determine routing strategy
   */
  async analyzeRequest(userPrompt: string, params?: Partial<ScriptGenerationParams>): Promise<RoutingDecision> {
    const lowercasePrompt = userPrompt.toLowerCase();

    // Check for earnings-based queries
    if (this.isEarningsQuery(lowercasePrompt)) {
      return await this.handleEarningsQuery(userPrompt, params);
    }

    // Check for date range queries
    if (this.isDateRangeQuery(lowercasePrompt)) {
      return this.handleDateRangeQuery(userPrompt, params);
    }

    // Check for specific dates
    if (this.isSpecificDatesQuery(lowercasePrompt)) {
      return this.handleSpecificDatesQuery(userPrompt, params);
    }

    // Check for custom exit time
    if (this.isCustomExitTime(lowercasePrompt)) {
      return this.handleCustomExitTime(userPrompt, params);
    }

    // Check for single-day backtest (simple case)
    if (this.isSingleDayQuery(lowercasePrompt)) {
      return this.handleSingleDayQuery(userPrompt, params);
    }

    // Default: assume template API can handle it
    return {
      strategy: 'template-api',
      reason: 'Standard backtest request - using template API',
      useTemplate: params?.strategyType || 'orb'
    };
  }

  /**
   * Execute the routing decision and generate/run script
   */
  async executeDecision(decision: RoutingDecision, params: ScriptGenerationParams): Promise<{ script: string; filepath: string }> {
    if (decision.strategy === 'template-api' || decision.strategy === 'custom-dates') {
      // Use script generator with provided dates
      const finalParams: ScriptGenerationParams = { ...params };

      if (decision.dates) {
        finalParams.specificDates = decision.dates;
      }

      const script = await this.scriptGenerator.generateScript(finalParams);
      const filepath = await this.scriptGenerator.writeScriptToFile(script);

      return { script, filepath };
    }

    // Tier 3: Fully custom - would require more complex logic
    throw new Error('Fully custom scripts not yet implemented');
  }

  // ============================================================
  // QUERY DETECTION METHODS
  // ============================================================

  private isEarningsQuery(prompt: string): boolean {
    const earningsKeywords = [
      'earnings',
      'earnings day',
      'earnings days',
      'earnings report',
      'earnings announcement',
      'last 3 earnings',
      'past 5 earnings',
      'next earnings'
    ];

    return earningsKeywords.some(keyword => prompt.includes(keyword));
  }

  private isDateRangeQuery(prompt: string): boolean {
    const rangeKeywords = [
      'past',
      'last',
      'previous',
      'over the',
      'between',
      'from',
      'to',
      'days',
      'weeks',
      'months'
    ];

    // Check for patterns like "past 10 days", "last 2 weeks", "from X to Y"
    return rangeKeywords.some(keyword => prompt.includes(keyword));
  }

  private isSpecificDatesQuery(prompt: string): boolean {
    // Check if prompt contains specific date formats or lists
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const hasDateFormat = datePattern.test(prompt);

    // Check for phrases like "on Oct 8, Oct 10, Oct 15"
    const hasDateList = /,\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(prompt);

    return hasDateFormat || hasDateList;
  }

  private isCustomExitTime(prompt: string): boolean {
    const exitKeywords = [
      'exit at',
      'exits at',
      'close at',
      'closes at',
      'noon',
      '12:00',
      '11:00',
      '13:00',
      '14:00',
      '15:00',
      'exit time'
    ];

    return exitKeywords.some(keyword => prompt.includes(keyword));
  }

  private isSingleDayQuery(prompt: string): boolean {
    // Check for patterns like "on 2025-10-15" or "for Oct 15"
    const singleDayPatterns = [
      /on \d{4}-\d{2}-\d{2}/,
      /for (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec) \d{1,2}/i,
      /test (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec) \d{1,2}/i
    ];

    return singleDayPatterns.some(pattern => pattern.test(prompt));
  }

  // ============================================================
  // QUERY HANDLER METHODS
  // ============================================================

  private async handleEarningsQuery(prompt: string, params?: Partial<ScriptGenerationParams>): Promise<RoutingDecision> {
    if (!params?.ticker) {
      return {
        strategy: 'template-api',
        reason: 'Earnings query requires ticker - cannot determine dates',
      };
    }

    // Extract number of earnings days (e.g., "last 3 earnings days")
    const match = prompt.match(/(?:last|past|previous)\s+(\d+)\s+earnings/i);
    const limit = match ? parseInt(match[1]) : 5;

    // Query earnings dates
    const filter: DateQueryFilter = {
      type: 'earnings',
      ticker: params.ticker,
      limit,
      order: 'desc'
    };

    const dates = await this.dateQueryService.queryDates(filter);

    if (dates.length === 0) {
      return {
        strategy: 'template-api',
        reason: `No earnings data found for ${params.ticker}`,
      };
    }

    return {
      strategy: 'custom-dates',
      reason: `Found ${dates.length} earnings dates for ${params.ticker} - using custom date injection`,
      dates,
      useTemplate: 'orb-multiday'
    };
  }

  private handleDateRangeQuery(prompt: string, params?: Partial<ScriptGenerationParams>): RoutingDecision {
    // Extract number of days (e.g., "past 10 days", "last 2 weeks")
    let days = 10; // default

    const daysMatch = prompt.match(/(?:past|last|previous)\s+(\d+)\s+(?:trading\s+)?days?/i);
    if (daysMatch) {
      days = parseInt(daysMatch[1]);
    }

    const weeksMatch = prompt.match(/(?:past|last|previous)\s+(\d+)\s+weeks?/i);
    if (weeksMatch) {
      days = parseInt(weeksMatch[1]) * 5; // 5 trading days per week
    }

    const monthsMatch = prompt.match(/(?:past|last|previous)\s+(\d+)\s+months?/i);
    if (monthsMatch) {
      days = parseInt(monthsMatch[1]) * 21; // ~21 trading days per month
    }

    // Generate date range from today backwards
    const dates = this.generatePastTradingDays(days);

    return {
      strategy: 'custom-dates',
      reason: `Date range query detected: ${days} trading days - using multi-day template`,
      dates,
      useTemplate: 'orb-multiday'
    };
  }

  /**
   * Generate list of past N trading days from today
   */
  private generatePastTradingDays(days: number): string[] {
    const dates: string[] = [];

    // Use UTC to avoid timezone issues
    // Get current UTC date at midnight
    const now = new Date();
    const current = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));

    // Start from today - with real-time data subscription, we can backtest
    // trades that have already completed today (e.g., morning trades that exited)
    // The backtest will use whatever data is available up to the current time

    while (dates.length < days) {
      const dayOfWeek = current.getUTCDay();
      // Exclude weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(current.toISOString().split('T')[0]);
      }
      // Go back one day in UTC
      current.setUTCDate(current.getUTCDate() - 1);
    }

    // Reverse to get chronological order
    return dates.reverse();
  }

  private handleSpecificDatesQuery(prompt: string, params?: Partial<ScriptGenerationParams>): RoutingDecision {
    // Extract dates from prompt (simplified - would need more robust parsing)
    const datePattern = /\d{4}-\d{2}-\d{2}/g;
    const dates = prompt.match(datePattern) || [];

    if (dates.length > 0) {
      return {
        strategy: 'custom-dates',
        reason: `Specific dates provided: ${dates.join(', ')} - using multi-day template`,
        dates,
        useTemplate: 'orb-multiday'
      };
    }

    return {
      strategy: 'template-api',
      reason: 'Could not parse specific dates - falling back to template API',
      useTemplate: params?.strategyType || 'orb'
    };
  }

  private handleCustomExitTime(prompt: string, params?: Partial<ScriptGenerationParams>): RoutingDecision {
    // Extract exit time from prompt
    let exitTime = '16:00'; // default market close

    // Check for "noon" or "12:00"
    if (prompt.includes('noon') || prompt.includes('12:00')) {
      exitTime = '12:00';
    }

    // Check for other times
    const timeMatch = prompt.match(/(?:exit|close)(?:\s+at)?\s+(\d{1,2}):?(\d{2})/i);
    if (timeMatch) {
      const hours = timeMatch[1].padStart(2, '0');
      const minutes = timeMatch[2] || '00';
      exitTime = `${hours}:${minutes}`;
    }

    // Check if this is also a multi-day query
    if (this.isDateRangeQuery(prompt) || this.isSpecificDatesQuery(prompt)) {
      return {
        strategy: 'custom-dates',
        reason: `Multi-day backtest with custom exit time (${exitTime}) - using multi-day template`,
        useTemplate: 'orb-multiday'
      };
    }

    return {
      strategy: 'template-api',
      reason: `Single-day backtest with custom exit time (${exitTime}) - template API can handle`,
      useTemplate: params?.strategyType || 'orb'
    };
  }

  private handleSingleDayQuery(prompt: string, params?: Partial<ScriptGenerationParams>): RoutingDecision {
    return {
      strategy: 'template-api',
      reason: 'Single-day backtest - using standard template API',
      useTemplate: params?.strategyType || 'orb'
    };
  }
}

// Export singleton instance
export default new BacktestRouterService();
