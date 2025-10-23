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
import  claudeService from './claude.service';

export class BacktestRouterService {
  private dateQueryService: DateQueryService;
  private scriptGenerator: ScriptGeneratorService;

  constructor() {
    this.dateQueryService = new DateQueryService();
    this.scriptGenerator = new ScriptGeneratorService();
  }

  /**
   * Analyze a backtest request and determine routing strategy
   *
   * Strategy: Default to Claude unless it's a simple template case
   */
  async analyzeRequest(userPrompt: string, params?: Partial<ScriptGenerationParams>): Promise<RoutingDecision> {
    const lowercasePrompt = userPrompt.toLowerCase();

    // Priority 1: Earnings queries (special date handling + template)
    if (this.isEarningsQuery(lowercasePrompt)) {
      return await this.handleEarningsQuery(userPrompt, params);
    }

    // Priority 2: Simple ORB queries (use fast template)
    if (this.isSimpleORB(lowercasePrompt)) {
      return this.handleSimpleORB(userPrompt, params);
    }

    // Default: Everything else goes to Claude for intelligent generation
    return await this.handleCustomStrategyQuery(userPrompt, params);
  }

  /**
   * Execute the routing decision and generate/run script
   */
  async executeDecision(decision: RoutingDecision, params: ScriptGenerationParams): Promise<{ script: string; filepath: string; assumptions?: string[]; confidence?: number }> {
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

    if (decision.strategy === 'claude-generated') {
      // Use Claude AI to generate custom strategy script
      if (!decision.userPrompt) {
        throw new Error('User prompt is required for Claude-generated scripts');
      }

      console.log('🤖 Calling Claude API to generate custom strategy script...');

      // If the routing decision has dates, add them to params
      const finalParams: ScriptGenerationParams = { ...params };
      if (decision.dates) {
        finalParams.specificDates = decision.dates;
      }

      const claudeResponse = await claudeService.generateScript(decision.userPrompt, finalParams);

      console.log(`✅ Claude generated script with confidence: ${claudeResponse.confidence}`);
      console.log(`📋 Assumptions made: ${claudeResponse.assumptions.length}`);

      // Update decision with Claude's metadata
      decision.assumptions = claudeResponse.assumptions;
      decision.confidence = claudeResponse.confidence;

      // Write the generated script to file
      const filepath = await this.scriptGenerator.writeScriptToFile(claudeResponse.script);

      // Save a permanent copy of the Claude-generated script with metadata
      await this.saveClaudeScript(claudeResponse, decision.userPrompt, finalParams, filepath);

      return {
        script: claudeResponse.script,
        filepath,
        assumptions: claudeResponse.assumptions,
        confidence: claudeResponse.confidence,
      };
    }

    // Tier 3: Fully custom - would require more complex logic
    throw new Error('Fully custom scripts not yet implemented');
  }

  // ============================================================
  // QUERY DETECTION METHODS
  // ============================================================

  /**
   * Detect simple ORB queries that can use the fast template
   * Returns true ONLY for basic ORB without custom logic
   */
  private isSimpleORB(prompt: string): boolean {
    // Must mention ORB or opening range
    const hasORBKeyword = prompt.includes('orb') ||
                          prompt.includes('opening range') ||
                          prompt.includes('breakout');

    if (!hasORBKeyword) {
      return false;
    }

    // Indicators that require Claude
    const customIndicators = [
      'vwap', 'sma', 'ema', 'rsi', 'macd', 'bollinger',
      'stochastic', 'atr', 'adx', 'moving average'
    ];

    // Advanced patterns that require Claude
    const advancedPatterns = [
      'retest', 'low of day', 'high of day', 'previous high', 'previous low',
      'new high', 'new low', 'failed', 'successful', 'multiple', 'consecutive',
      'crossover', 'crosses above', 'crosses below'
    ];

    // Short position keywords (requires Claude for proper implementation)
    const shortKeywords = ['short', 'short at', 'short if', 'go short'];

    // Complex conditional patterns
    const complexPatterns = [
      'if the', 'when the', 'only if', 'only when',
      'above the', 'below the'
    ];

    // If it has any of these, it's NOT a simple ORB
    const hasCustomIndicator = customIndicators.some(indicator => prompt.includes(indicator));
    const hasAdvancedPattern = advancedPatterns.some(pattern => prompt.includes(pattern));
    const hasShortKeyword = shortKeywords.some(keyword => prompt.includes(keyword));
    const hasComplexPattern = complexPatterns.some(pattern => prompt.includes(pattern));

    // Simple ORB = has ORB keyword but no custom/advanced logic
    return hasORBKeyword && !hasCustomIndicator && !hasAdvancedPattern &&
           !hasShortKeyword && !hasComplexPattern;
  }

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

  /**
   * Handle simple ORB queries using the fast template
   */
  private handleSimpleORB(prompt: string, params?: Partial<ScriptGenerationParams>): RoutingDecision {
    return {
      strategy: 'template-api',
      reason: 'Simple ORB query detected - using fast template',
      useTemplate: params?.strategyType || 'orb'
    };
  }

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

  private async handleCustomStrategyQuery(prompt: string, params?: Partial<ScriptGenerationParams>): Promise<RoutingDecision> {
    const lowercasePrompt = prompt.toLowerCase();

    console.log('📋 Analyzing custom strategy query for dates...');

    // Check if the prompt already contains date information
    const hasDateRange = this.isDateRangeQuery(lowercasePrompt);
    const hasSpecificDates = this.isSpecificDatesQuery(lowercasePrompt);
    const hasSingleDay = this.isSingleDayQuery(lowercasePrompt);
    const hasDateInfo = hasDateRange || hasSpecificDates || hasSingleDay;

    console.log(`   - Date range detected: ${hasDateRange}`);
    console.log(`   - Specific dates detected: ${hasSpecificDates}`);
    console.log(`   - Single day detected: ${hasSingleDay}`);
    console.log(`   - Has any date info: ${hasDateInfo}`);

    let dates: string[] | undefined;

    // If no date info, default to last 10 trading days
    if (!hasDateInfo) {
      console.log('📅 No dates specified in custom strategy - defaulting to last 10 trading days');
      try {
        const filter: DateQueryFilter = {
          type: 'trading',
          limit: 10,
          order: 'desc'
        };
        dates = await this.dateQueryService.queryDates(filter);
        console.log(`✅ Retrieved ${dates.length} default dates: ${dates.join(', ')}`);

        if (dates.length === 0) {
          console.warn('⚠️  DateQueryService returned empty array for default dates!');
        }
      } catch (error: any) {
        console.error('❌ Error getting default dates from DateQueryService:', error.message);
        dates = [];
      }
    } else if (hasDateRange) {
      // Extract date range
      console.log('📅 Extracting date range from prompt...');
      const match = lowercasePrompt.match(/(?:last|past|previous)\s+(\d+)\s+(?:trading\s+)?days?/i);
      const days = match ? parseInt(match[1]) : 10;
      console.log(`   - Detected ${days} days`);

      try {
        const filter: DateQueryFilter = {
          type: 'trading',
          limit: days,
          order: 'desc'
        };
        dates = await this.dateQueryService.queryDates(filter);
        console.log(`✅ Retrieved ${dates.length} dates from range: ${dates.join(', ')}`);
      } catch (error: any) {
        console.error('❌ Error getting dates from DateQueryService:', error.message);
        dates = [];
      }
    }

    const reason = `Custom strategy detected (VWAP, SMA, crossovers, etc.) - using Claude AI for script generation${!hasDateInfo ? ' (defaulting to last 10 trading days)' : ''}`;

    console.log(`📊 Routing decision: claude-generated with ${dates?.length || 0} dates`);

    return {
      strategy: 'claude-generated',
      reason,
      userPrompt: prompt,
      dates: dates,
      assumptions: [], // Will be populated by Claude service
      confidence: 0, // Will be populated by Claude service
    };
  }

  /**
   * Save Claude-generated script permanently with metadata
   */
  private async saveClaudeScript(
    claudeResponse: any,
    userPrompt: string,
    params: ScriptGenerationParams,
    tempFilepath: string
  ): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const ticker = params.ticker || 'UNKNOWN';
      const filename = `claude-${timestamp}-${ticker}.ts`;
      const metadataFilename = `claude-${timestamp}-${ticker}.json`;

      const scriptsDir = path.join(__dirname, '../../claude-generated-scripts');
      const scriptPath = path.join(scriptsDir, filename);
      const metadataPath = path.join(scriptsDir, metadataFilename);

      // Save the script
      await fs.copyFile(tempFilepath, scriptPath);

      // Save metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        userPrompt,
        ticker: params.ticker,
        timeframe: params.timeframe,
        strategyType: params.strategyType,
        dates: params.specificDates || params.dateRange,
        confidence: claudeResponse.confidence,
        assumptions: claudeResponse.assumptions,
        indicators: claudeResponse.indicators,
        explanation: claudeResponse.explanation,
        scriptFilename: filename
      };

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

      console.log(`💾 Saved Claude-generated script: ${filename}`);
      console.log(`📄 Saved metadata: ${metadataFilename}`);
    } catch (error: any) {
      console.error('Error saving Claude script:', error);
      // Don't throw - this is a nice-to-have feature
    }
  }
}

// Export singleton instance
export default new BacktestRouterService();
