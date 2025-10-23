/**
 * Backtest Router Service
 *
 * Simplified routing system that always uses Claude AI for intelligent script generation
 * and automatic date selection.
 */

import { ScriptGenerationParams, RoutingDecision } from '../types/script.types';
import { ScriptGeneratorService } from './script-generator.service';
import  claudeService from './claude.service';

export class BacktestRouterService {
  private scriptGenerator: ScriptGeneratorService;
  private claudeService: any; // ClaudeService

  constructor() {
    this.scriptGenerator = new ScriptGeneratorService();
    // Lazy import to avoid circular dependency
    this.claudeService = require('./claude.service').default;
  }

  /**
   * Analyze a backtest request and determine routing strategy
   *
   * Always returns Claude-generated strategy for maximum flexibility
   */
  async analyzeRequest(userPrompt: string, params?: Partial<ScriptGenerationParams>): Promise<RoutingDecision> {
    return {
      strategy: 'claude-generated',
      reason: 'Using Claude AI for intelligent script generation with automatic date selection',
      userPrompt: userPrompt,
      assumptions: [],
      confidence: 0,
    };
  }

  /**
   * Execute the routing decision and generate/run script
   */
  async executeDecision(decision: RoutingDecision, params: ScriptGenerationParams): Promise<{ script: string; filepath: string; assumptions?: string[]; confidence?: number }> {
    // Always use Claude AI to generate custom strategy script
    if (!decision.userPrompt) {
      throw new Error('User prompt is required for Claude-generated scripts');
    }

    console.log('🤖 Calling Claude API to generate custom strategy script...');

    // Claude determines dates automatically - no need to pass them
    const claudeResponse = await claudeService.generateScript(decision.userPrompt, params);

    console.log(`✅ Claude generated script with confidence: ${claudeResponse.confidence}`);
    console.log(`📋 Assumptions made: ${claudeResponse.assumptions.length}`);
    console.log(`📅 Dates selected: ${claudeResponse.dates.length} days`);
    if (claudeResponse.dateReasoning) {
      console.log(`   Reasoning: ${claudeResponse.dateReasoning}`);
    }

    // Update decision with Claude's metadata
    decision.assumptions = claudeResponse.assumptions;
    decision.confidence = claudeResponse.confidence;

    // Write the generated script to file
    const filepath = await this.scriptGenerator.writeScriptToFile(claudeResponse.script);

    // Save a permanent copy of the Claude-generated script with metadata
    await this.saveClaudeScript(claudeResponse, decision.userPrompt, params, filepath);

    return {
      script: claudeResponse.script,
      filepath,
      assumptions: claudeResponse.assumptions,
      confidence: claudeResponse.confidence,
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
        dates: claudeResponse.dates,  // Use dates from Claude response
        dateReasoning: claudeResponse.dateReasoning,
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
