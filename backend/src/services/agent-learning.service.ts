/**
 * Agent Learning Service
 * Orchestrates the learning loop: scan generation → execution → analysis → refinement
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../database/db';
import {
  TradingAgent,
  AgentIteration,
  AgentStrategy,
  ExpertAnalysis,
  Refinement,
  IterationResult,
  ApplyRefinementsRequest,
  ApplyRefinementsResponse,
  AgentBacktestConfig,
} from '../types/agent.types';
import { AgentManagementService } from './agent-management.service';
import { ClaudeService } from './claude.service';
import { ScannerService } from './scanner.service';
import { BacktestService } from './backtest.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { RefinementApprovalService } from './refinement-approval.service';
import { ScriptExecutionService } from './script-execution.service';
import { AgentKnowledgeExtractionService } from './agent-knowledge-extraction.service';
import { TemplateRendererService } from './template-renderer.service';
import { executionTemplates, DEFAULT_TEMPLATES } from '../templates/execution';
import { createIterationLogger } from '../utils/logger';

// Default backtest configuration
const DEFAULT_BACKTEST_CONFIG: AgentBacktestConfig = {
  max_signals_per_iteration: 10,      // Cap at 10 signals (10 signals × 5 templates = 50 scripts)
  max_signals_per_ticker_date: 2,     // Max 2 signals per ticker per day
  max_signals_per_date: 10,            // Max 10 signals per unique date
  min_pattern_strength: 0,             // Minimum quality score (0 = accept all)
  backtest_timeout_ms: 120000,         // 2 minute timeout per backtest
};

export class AgentLearningService {
  private agentMgmt: AgentManagementService;
  private claude: ClaudeService;
  private knowledgeExtraction: AgentKnowledgeExtractionService;
  private scanner: ScannerService;
  private backtest: BacktestService;
  private performanceMonitor: PerformanceMonitorService;
  private refinementApproval: RefinementApprovalService;
  private scriptExecution: ScriptExecutionService;
  private templateRenderer: TemplateRendererService;

  constructor() {
    this.agentMgmt = new AgentManagementService();
    this.claude = new ClaudeService();
    this.scanner = new ScannerService();
    this.backtest = new BacktestService();
    this.performanceMonitor = new PerformanceMonitorService();
    this.refinementApproval = new RefinementApprovalService();
    this.scriptExecution = new ScriptExecutionService();
    this.knowledgeExtraction = new AgentKnowledgeExtractionService();
    this.templateRenderer = new TemplateRendererService();
  }

  /**
   * Run a complete learning iteration for an agent
   */
  async runIteration(agentId: string): Promise<IterationResult> {
    const agent = await this.agentMgmt.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get current iteration number
    const iterationNumber = await this.getNextIterationNumber(agentId);

    // Create iteration-specific logger
    const logger = createIterationLogger(agentId, iterationNumber);
    logger.info('Starting learning iteration', { agentName: agent.name });

    try {
      // Step 1: Generate strategy (scan + execution)
      logger.info('Step 1: Generating strategy');
      const strategy = await this.generateStrategy(agent, iterationNumber);
      logger.info('Strategy generated', {
        scannerTokens: strategy.scannerTokenUsage?.total_tokens,
        executionTokens: strategy.executionTokenUsage?.total_tokens
      });

      // Step 2: Execute scan
      logger.info('Step 2: Running scan');
      const scanResults = await this.executeScan(strategy.scanScript, strategy.scannerTokenUsage);
      logger.info('Scan complete', {
        signalsFound: scanResults.length,
        tickers: [...new Set(scanResults.map((s: any) => s.ticker))]
      });

      if (scanResults.length === 0) {
        logger.warn('No signals found - iteration will continue with empty results');
      }

      // Step 3: Run backtests on scan results
      logger.info('Step 3: Running backtests with template library');
      const backtestResults = await this.runBacktests(strategy.executionScript, scanResults, strategy.executionTokenUsage);
      logger.info('Backtests complete', {
        totalTrades: backtestResults.totalTrades,
        winningTemplate: backtestResults.winningTemplate,
        profitFactor: backtestResults.profitFactor,
        templatesResults: backtestResults.templateResults?.length || 0
      });

      // Step 4: Agent analyzes results (skip if no successful backtests)
      logger.info('Step 4: Analyzing results');
      let analysis: ExpertAnalysis;

      if (backtestResults.totalTrades === 0) {
        logger.warn('No trades generated - skipping detailed analysis');
        // Generate minimal analysis for failed execution
        analysis = {
          summary: 'No trades were generated. All backtest scripts either failed to compile or failed to execute. Check generated scripts for TypeScript errors.',
          parameter_recommendations: [],
          strategic_insights: [],
          trade_quality_assessment: 'No trades to assess',
          risk_assessment: 'Unable to assess - no execution data',
          market_condition_notes: 'Scripts did not execute successfully'
        };
      } else {
        analysis = await this.analyzeResults(agent, backtestResults, scanResults);
        logger.info('Analysis complete', {
          winRate: backtestResults.winRate,
          sharpeRatio: backtestResults.sharpeRatio
        });
      }

      // Step 4.5: Extract and store knowledge from analysis
      logger.info('Step 4.5: Extracting knowledge');
      const knowledge = await this.knowledgeExtraction.extractKnowledge(agentId, analysis, iterationNumber);
      await this.knowledgeExtraction.storeKnowledge(agentId, knowledge);

      // Step 5: Agent proposes refinements
      logger.info('Step 5: Proposing refinements');
      const refinements = await this.proposeRefinements(agent, analysis);
      logger.info('Refinements proposed', { count: refinements.length });

      // Step 6: Save iteration to database
      const iteration = await this.saveIteration({
        agentId,
        iterationNumber,
        strategy,
        scanResults,
        backtestResults,
        analysis,
        refinements,
      });

      logger.info('Iteration complete', {
        iterationId: iteration.id,
        status: iteration.iteration_status
      });

      // Phase 2 Autonomy Features: Post-iteration hooks
      try {
        // 1. Analyze performance and generate alerts
        logger.info('Post-iteration: Analyzing performance');
        await this.performanceMonitor.analyzeIteration(agentId, iteration.id);

        // 2. Auto-approve refinements if enabled
        logger.info('Post-iteration: Checking auto-approval');
        await this.refinementApproval.evaluateAndApply(agentId, iteration.id);
      } catch (error: any) {
        logger.warn('Post-iteration autonomy hooks failed', { error: error.message });
        // Don't fail the iteration if autonomy features fail
      }

      return {
        iteration,
        strategy,
        scanResults,
        backtestResults,
        analysis,
        refinements,
      };
    } catch (error: any) {
      logger.error('Iteration failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Build backtest configuration based on agent personality
   */
  private buildBacktestConfig(agent: TradingAgent): any {
    const maxTrades = agent.risk_tolerance === 'aggressive' ? 3 :
                      agent.risk_tolerance === 'moderate' ? 2 : 1;

    return {
      allowLong: true,
      allowShort: agent.risk_tolerance !== 'conservative',
      exitTime: '15:55', // Exit before market close
      maxTradesPerDay: maxTrades,
      stopLossPct: agent.risk_tolerance === 'aggressive' ? 2 :
                   agent.risk_tolerance === 'moderate' ? 1.5 : 1,
      takeProfitPct: agent.risk_tolerance === 'aggressive' ? 3 :
                     agent.risk_tolerance === 'moderate' ? 2 : 1.5,
    };
  }

  /**
   * Generate strategy scripts for this agent using Claude
   */
  private async generateStrategy(
    agent: TradingAgent,
    iterationNumber: number
  ): Promise<{
    scanScript: string;
    executionScript: string;
    rationale: string;
    scannerTokenUsage?: any;
    executionTokenUsage?: any;
  }> {
    // Get agent's accumulated knowledge
    const knowledge = await this.getAgentKnowledge(agent.id);
    const knowledgeSummary = this.formatKnowledgeSummary(knowledge, agent);

    console.log(`   Agent personality: ${agent.trading_style}, ${agent.risk_tolerance}`);
    console.log(`   Pattern focus: ${agent.pattern_focus.join(', ')}`);

    // Step 1: Generate scanner script
    // ALWAYS prioritize custom instructions if they exist (for specialized strategies)
    // Otherwise use generic pattern focus (with learnings on iteration 2+)
    let scannerQuery: string;

    if (agent.instructions && agent.instructions.trim() !== '') {
      // Specialized strategy with custom instructions - always use them
      scannerQuery = agent.instructions;

      // On iteration 2+, append learnings to refine the custom strategy
      if (iterationNumber > 1 && knowledgeSummary && knowledgeSummary.trim() !== '') {
        scannerQuery += `\n\nINCORPORATE THESE LEARNINGS: ${knowledgeSummary}`;
      }
    } else {
      // Generic agent - use pattern focus
      if (iterationNumber === 1) {
        scannerQuery = `Find ${agent.pattern_focus.join(' or ')} patterns in ${agent.market_conditions.join(' or ')} market conditions. Trading style: ${agent.trading_style}, risk tolerance: ${agent.risk_tolerance}.`;
      } else {
        scannerQuery = `Find ${agent.pattern_focus.join(' or ')} patterns incorporating these learnings: ${knowledgeSummary}`;
      }
    }

    console.log(`   Generating scanner with Claude...`);
    console.log(`   Scanner query: ${scannerQuery.substring(0, 100)}...`);
    const scannerResult = await this.claude.generateScannerScript({
      query: scannerQuery,
      universe: agent.universe || 'Tech Sector', // Use agent's universe or default to Tech Sector
      dateRange: {
        start: this.getDateDaysAgo(20),
        end: this.getDateDaysAgo(1)
      }
    });

    // Step 2: Execution templates (no longer generated via Claude)
    // We now use the execution template library which tests all 5 templates
    // This saves ~4000 tokens per iteration and ensures consistent backtesting
    console.log(`   Skipping execution script generation - using template library`);

    const rationale = iterationNumber === 1
      ? `Initial strategy: ${scannerResult.explanation}. Using execution template library for backtesting.`
      : `Iteration ${iterationNumber}: Applied learnings to refine scanner. Using execution template library for backtesting.`;

    return {
      scanScript: scannerResult.script,
      executionScript: '',  // No longer needed - using template library
      rationale,
      scannerTokenUsage: scannerResult.tokenUsage,
      executionTokenUsage: undefined  // No tokens used for execution
    };
  }

  /**
   * Execute scan script and return matches
   */
  private async executeScan(scanScript: string, tokenUsage?: any): Promise<any[]> {
    const scriptId = uuidv4();
    const scriptPath = path.join(__dirname, '../../', `agent-scan-${scriptId}.ts`);

    try {
      // Save script to temp file
      fs.writeFileSync(scriptPath, scanScript);
      console.log(`   Saved scan script to ${scriptPath}`);

      // Execute script with 60 second timeout
      console.log(`   Executing scan script...`);
      const result = await this.scriptExecution.executeScript(scriptPath, 60000, tokenUsage);

      if (!result.success) {
        console.error(`   Scan script execution failed: ${result.error}`);
        return [];
      }

      // Parse results (scan scripts can return array directly, {matches: []}, or {trades: []})
      let scanResults: any[] = [];
      if (Array.isArray(result.data)) {
        scanResults = result.data;
      } else {
        scanResults = (result.data as any)?.matches || (result.data as any)?.trades || [];
      }
      console.log(`   Scan found ${scanResults.length} matches`);

      return scanResults;
    } catch (error: any) {
      console.error(`   Error executing scan: ${error.message}`);
      return [];
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
          console.log(`   Cleaned up temp file: ${scriptPath}`);
        }
      } catch (cleanupError: any) {
        console.warn(`   Failed to clean up temp file: ${cleanupError.message}`);
      }
    }
  }

  /**
   * Run backtests using multiple execution templates
   * Tests all 5 templates and returns the best performing one
   */
  private async runBacktests(executionScript: string, scanResults: any[], tokenUsage?: any): Promise<any> {
    if (scanResults.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        trades: [],
        templateResults: []
      };
    }

    console.log(`   Raw scan results: ${scanResults.length}`);

    // Apply signal filtering to reduce to manageable set
    const filteredResults = this.applySignalFiltering(scanResults, DEFAULT_BACKTEST_CONFIG);

    console.log(`   Testing ${DEFAULT_TEMPLATES.length} execution templates on ${filteredResults.length} filtered signals...`);

    // Group signals by ticker
    const signalsByTicker: { [ticker: string]: any[] } = {};
    for (const signal of filteredResults) {
      if (!signalsByTicker[signal.ticker]) {
        signalsByTicker[signal.ticker] = [];
      }
      signalsByTicker[signal.ticker].push(signal);
    }

    console.log(`   Grouped into ${Object.keys(signalsByTicker).length} ticker(s)`);

    // Test each template
    const templateResults: any[] = [];

    for (const templateName of DEFAULT_TEMPLATES) {
      const template = executionTemplates[templateName];
      console.log(`   \n   📊 Testing template: ${template.name}`);

      const allTrades: any[] = [];
      let successfulBacktests = 0;

      // Execute backtests for all tickers with this template
      const backtestPromises = Object.entries(signalsByTicker).map(async ([ticker, signals]) => {
        const scriptId = uuidv4();
        const scriptPath = path.join(__dirname, '../../generated-scripts/success', new Date().toISOString().split('T')[0], `${scriptId}-${templateName}-${ticker}.ts`);

        // Ensure directory exists
        const dir = path.dirname(scriptPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        try {
          // Render script using template
          const script = this.templateRenderer.renderScript(template, signals, ticker);

          // Save to file
          fs.writeFileSync(scriptPath, script);

          // Execute with 120 second timeout
          const result = await this.scriptExecution.executeScript(scriptPath, 120000, tokenUsage);

          // Note: Keep generated scripts for debugging

          if (result.success && result.data) {
            // Parse results - handle both array and object formats
            let trades: any[] = [];
            if (Array.isArray(result.data)) {
              trades = result.data;
            } else if (result.data.trades) {
              trades = result.data.trades;
            }

            return { ticker, trades, success: true };
          } else {
            console.log(`      ⚠️  Backtest failed for ${ticker}: ${result.error || 'Unknown error'}`);
            return { ticker, trades: [], success: false, error: result.error };
          }
        } catch (error: any) {
          console.error(`      Error backtesting ${ticker}: ${error.message}`);
          return { ticker, trades: [], success: false, error: error.message };
        }
      });

      // Wait for all backtests to complete for this template
      const results = await Promise.all(backtestPromises);

      // Aggregate successful results
      for (const result of results) {
        if (result.success && result.trades.length > 0) {
          allTrades.push(...result.trades);
          successfulBacktests++;
        }
      }

      console.log(`      Completed ${successfulBacktests}/${Object.keys(signalsByTicker).length} backtests`);
      console.log(`      Total trades: ${allTrades.length}`);

      // Calculate performance metrics
      const aggregated = this.aggregateBacktestResults(allTrades);
      const profitFactor = this.calculateProfitFactor(allTrades);

      templateResults.push({
        template: templateName,
        templateDisplayName: template.name,
        trades: allTrades,
        totalTrades: allTrades.length,
        winRate: aggregated.winRate,
        sharpeRatio: aggregated.sharpeRatio,
        totalReturn: aggregated.totalReturn,
        profitFactor: profitFactor,
        avgWin: this.calculateAvgWin(allTrades),
        avgLoss: this.calculateAvgLoss(allTrades)
      });
    }

    // Sort by profit factor (best first)
    templateResults.sort((a, b) => b.profitFactor - a.profitFactor);

    console.log(`\n   📈 Template Performance Summary:`);
    templateResults.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.templateDisplayName}: ` +
        `PF ${r.profitFactor.toFixed(2)}, ` +
        `WR ${(r.winRate * 100).toFixed(1)}%, ` +
        `Trades ${r.totalTrades}, ` +
        `Avg Win ${r.avgWin.toFixed(2)}%, ` +
        `Avg Loss ${r.avgLoss.toFixed(2)}%`);
    });

    // Winner is the first (best profit factor)
    const winner = templateResults[0];
    console.log(`\n   🏆 Winner: ${winner.templateDisplayName}`);

    // Return winner's results as primary, with all template results included
    return {
      totalTrades: winner.totalTrades,
      winRate: winner.winRate,
      sharpeRatio: winner.sharpeRatio,
      totalReturn: winner.totalReturn,
      trades: winner.trades,
      profitFactor: winner.profitFactor,
      templateResults: templateResults,  // All template results for analysis
      winningTemplate: winner.template,
      recommendation: `${winner.templateDisplayName} template performed best with profit factor ${winner.profitFactor.toFixed(2)}`
    };
  }

  /**
   * Aggregate backtest results from multiple trades
   */
  private aggregateBacktestResults(trades: any[]): {
    winRate: number;
    sharpeRatio: number;
    totalReturn: number;
  } {
    if (trades.length === 0) {
      return { winRate: 0, sharpeRatio: 0, totalReturn: 0 };
    }

    // Calculate win rate (handle both 'pnl' and 'profit' field names)
    const wins = trades.filter(t => (t.pnl || t.profit || 0) > 0).length;
    const winRate = wins / trades.length;

    // Calculate total return (handle both 'pnl' and 'profit' field names)
    const totalReturn = trades.reduce((sum, t) => sum + (t.pnl || t.profit || 0), 0);

    // Calculate Sharpe ratio (simplified) - handle both field names
    const returns = trades.map(t => t.pnl || t.profit || 0);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return { winRate, sharpeRatio, totalReturn };
  }

  /**
   * Calculate profit factor (gross profit / gross loss)
   */
  private calculateProfitFactor(trades: any[]): number {
    if (trades.length === 0) return 0;

    const winners = trades.filter(t => (t.pnl || t.profit || 0) > 0);
    const losers = trades.filter(t => (t.pnl || t.profit || 0) < 0);

    const grossProfit = winners.reduce((sum, t) => sum + Math.abs(t.pnl || t.profit || 0), 0);
    const grossLoss = losers.reduce((sum, t) => sum + Math.abs(t.pnl || t.profit || 0), 0);

    if (grossLoss === 0) return grossProfit > 0 ? 999 : 0;
    return grossProfit / grossLoss;
  }

  /**
   * Calculate average win percentage
   */
  private calculateAvgWin(trades: any[]): number {
    const winners = trades.filter(t => (t.pnlPercent || t.profitPercent || 0) > 0);
    if (winners.length === 0) return 0;

    const totalWinPct = winners.reduce((sum, t) => sum + Math.abs(t.pnlPercent || t.profitPercent || 0), 0);
    return totalWinPct / winners.length;
  }

  /**
   * Calculate average loss percentage
   */
  private calculateAvgLoss(trades: any[]): number {
    const losers = trades.filter(t => (t.pnlPercent || t.profitPercent || 0) < 0);
    if (losers.length === 0) return 0;

    const totalLossPct = losers.reduce((sum, t) => sum + Math.abs(t.pnlPercent || t.profitPercent || 0), 0);
    return totalLossPct / losers.length;
  }

  /**
   * Agent analyzes backtest results as expert trader
   */
  private async analyzeResults(
    agent: TradingAgent,
    backtestResults: any,
    scanResults: any[]
  ): Promise<ExpertAnalysis> {
    const agentPersonality = `${agent.trading_style} ${agent.risk_tolerance} risk trader focusing on ${agent.pattern_focus.join(', ')} patterns in ${agent.market_conditions.join(', ')} conditions. ${agent.system_prompt || ''}`;

    console.log(`   Analyzing results with agent personality...`);

    const analysis = await this.claude.analyzeBacktestResults({
      agentPersonality,
      backtestResults,
      scanResultsCount: scanResults.length
    });

    console.log(`   Analysis complete: ${analysis.summary}`);

    return analysis;
  }

  /**
   * Agent proposes refinements based on analysis
   */
  private async proposeRefinements(
    agent: TradingAgent,
    analysis: ExpertAnalysis
  ): Promise<Refinement[]> {
    const refinements: Refinement[] = [];

    console.log(`   Converting analysis into ${(analysis.parameter_recommendations || []).length} refinements...`);

    // Convert parameter recommendations into refinements (only if values are defined)
    for (const param of analysis.parameter_recommendations || []) {
      // Skip if parameter values are undefined or missing
      if (!param.parameter || param.currentValue === undefined || param.recommendedValue === undefined) {
        console.log(`   Skipping refinement with undefined values: ${JSON.stringify(param)}`);
        continue;
      }

      refinements.push({
        type: 'parameter_adjustment',
        description: `Adjust ${param.parameter} from ${param.currentValue} to ${param.recommendedValue}`,
        reasoning: param.expectedImprovement || 'Expected improvement based on analysis',
        projected_improvement: param.expectedImprovement || 'Expected improvement based on analysis',
        specific_changes: {
          parameter: param.parameter,
          old_value: param.currentValue,
          new_value: param.recommendedValue
        }
      });
    }

    // Convert missing context into data collection refinements
    for (const missing of analysis.missing_context || []) {
      refinements.push({
        type: 'missing_data',
        description: `Add data: ${missing}`,
        reasoning: 'Required for better strategy decisions',
        specific_changes: {
          data_needed: missing
        }
      });
    }

    // Add refinements based on failure points
    for (const failure of analysis.failure_points || []) {
      refinements.push({
        type: 'exit_rule',
        description: `Address failure: ${failure}`,
        reasoning: 'Identified during backtest analysis',
        specific_changes: {
          issue: failure
        }
      });
    }

    console.log(`   Proposed ${refinements.length} refinements`);

    return refinements;
  }

  /**
   * Apply approved refinements and create new strategy version
   */
  async applyRefinements(request: ApplyRefinementsRequest): Promise<ApplyRefinementsResponse> {
    if (!request.approved) {
      // Mark iteration as rejected
      const db = getDatabase();
      db.prepare(`UPDATE agent_iterations SET iteration_status = 'rejected' WHERE id = ?`)
        .run(request.iteration_id);

      return {
        success: false,
        new_version: {} as AgentStrategy,
        message: 'Refinements rejected by user',
      };
    }

    // Get iteration
    const db = getDatabase();
    const iteration = db.prepare('SELECT * FROM agent_iterations WHERE id = ?')
      .get(request.iteration_id) as any;

    if (!iteration) {
      throw new Error(`Iteration not found: ${request.iteration_id}`);
    }

    // Parse refinements and generate new strategy version
    const refinements = JSON.parse(iteration.refinements_suggested);
    const newVersion = await this.generateRefinedStrategy(
      request.agent_id,
      iteration,
      refinements
    );

    // Save new strategy version
    await this.saveStrategyVersion(newVersion);

    // Mark iteration as approved
    db.prepare(`UPDATE agent_iterations SET iteration_status = 'approved' WHERE id = ?`)
      .run(request.iteration_id);

    return {
      success: true,
      new_version: newVersion,
      message: `Created strategy version ${newVersion.version}`,
    };
  }

  // ========================================
  // Helper Methods
  // ========================================

  private async getNextIterationNumber(agentId: string): Promise<number> {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT MAX(iteration_number) as max_iteration
      FROM agent_iterations
      WHERE agent_id = ?
    `).get(agentId) as { max_iteration: number | null };

    return (result.max_iteration || 0) + 1;
  }

  private async getAgentKnowledge(agentId: string): Promise<any[]> {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM agent_knowledge
      WHERE agent_id = ?
      ORDER BY confidence DESC, created_at DESC
    `).all(agentId);
  }

  private formatKnowledgeSummary(knowledge: any[], agent: TradingAgent): string {
    return this.knowledgeExtraction.formatKnowledgeForStrategyGeneration(
      knowledge,
      agent.pattern_focus
    );
  }

  private async saveIteration(data: any): Promise<AgentIteration> {
    const db = getDatabase();
    const id = uuidv4();

    const iteration: AgentIteration = {
      id,
      agent_id: data.agentId,
      iteration_number: data.iterationNumber,
      scan_script: data.strategy.scanScript,
      execution_script: data.strategy.executionScript,
      version_notes: `Iteration ${data.iterationNumber}`,
      signals_found: data.scanResults.length,
      backtest_results: data.backtestResults,
      win_rate: data.backtestResults.winRate || 0,
      sharpe_ratio: data.backtestResults.sharpeRatio || 0,
      total_return: data.backtestResults.totalReturn || 0,
      expert_analysis: JSON.stringify(data.analysis),
      refinements_suggested: data.refinements,
      iteration_status: 'completed',
      created_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO agent_iterations (
        id, agent_id, iteration_number, scan_script, execution_script,
        version_notes, signals_found, backtest_results, win_rate, sharpe_ratio,
        total_return, expert_analysis, refinements_suggested, iteration_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      iteration.id,
      iteration.agent_id,
      iteration.iteration_number,
      iteration.scan_script,
      iteration.execution_script,
      iteration.version_notes,
      iteration.signals_found,
      JSON.stringify(iteration.backtest_results),
      iteration.win_rate,
      iteration.sharpe_ratio,
      iteration.total_return,
      iteration.expert_analysis,
      JSON.stringify(iteration.refinements_suggested),
      iteration.iteration_status,
      iteration.created_at
    );

    return iteration;
  }

  private async generateRefinedStrategy(
    agentId: string,
    iteration: any,
    refinements: Refinement[]
  ): Promise<AgentStrategy> {
    // Get current version
    const db = getDatabase();
    const currentVersion = db.prepare(`
      SELECT version FROM agent_strategies
      WHERE agent_id = ? AND is_current_version = 1
    `).get(agentId) as { version: string } | undefined;

    const newVersion = this.incrementVersion(currentVersion?.version || 'v0.0');

    return {
      id: uuidv4(),
      agent_id: agentId,
      version: newVersion,
      scan_script: iteration.scan_script,
      execution_script: iteration.execution_script,
      backtest_sharpe: iteration.sharpe_ratio,
      backtest_win_rate: iteration.win_rate,
      backtest_total_return: iteration.total_return,
      is_current_version: true,
      parent_version: currentVersion?.version,
      changes_from_parent: refinements.map(r => r.description).join('; '),
      created_at: new Date().toISOString(),
    };
  }

  private async saveStrategyVersion(strategy: AgentStrategy): Promise<void> {
    const db = getDatabase();

    // Unset current version flag on old versions
    db.prepare(`
      UPDATE agent_strategies
      SET is_current_version = 0
      WHERE agent_id = ? AND is_current_version = 1
    `).run(strategy.agent_id);

    // Insert new version
    db.prepare(`
      INSERT INTO agent_strategies (
        id, agent_id, version, scan_script, execution_script,
        backtest_sharpe, backtest_win_rate, backtest_total_return,
        is_current_version, parent_version, changes_from_parent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      strategy.id,
      strategy.agent_id,
      strategy.version,
      strategy.scan_script,
      strategy.execution_script,
      strategy.backtest_sharpe,
      strategy.backtest_win_rate,
      strategy.backtest_total_return,
      strategy.is_current_version ? 1 : 0,
      strategy.parent_version,
      strategy.changes_from_parent,
      strategy.created_at
    );
  }

  private incrementVersion(version: string): string {
    const match = version.match(/v(\d+)\.(\d+)/);
    if (!match) return 'v1.0';

    const major = parseInt(match[1]);
    const minor = parseInt(match[2]);

    return `v${major}.${minor + 1}`;
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
  }

  /**
   * Apply signal filtering to reduce scan results to manageable set
   */
  private applySignalFiltering(signals: any[], config: AgentBacktestConfig): any[] {
    console.log(`\n📊 Signal Filtering:`);
    console.log(`   Raw scan results: ${signals.length}`);

    // Step 1: Filter by minimum quality
    const qualityFiltered = signals.filter(signal =>
      (signal.pattern_strength || 0) >= config.min_pattern_strength
    );
    console.log(`   After quality filter (>=${config.min_pattern_strength}): ${qualityFiltered.length}`);

    // Step 2: Apply diversification (limit per ticker/date, limit per date)
    const diversified = this.applyDiversification(
      qualityFiltered,
      config.max_signals_per_ticker_date,
      config.max_signals_per_date
    );
    console.log(`   After diversification: ${diversified.length}`);

    // Step 3: Sort by quality and take top N
    const final = diversified
      .sort((a, b) => (b.pattern_strength || 0) - (a.pattern_strength || 0))
      .slice(0, config.max_signals_per_iteration);

    console.log(`   Final set to backtest: ${final.length}`);

    const estimatedMinutes = (final.length * config.backtest_timeout_ms / 1000 / 60).toFixed(1);
    console.log(`   Estimated time: ~${estimatedMinutes} minutes\n`);

    return final;
  }

  /**
   * Apply diversification limits to prevent ticker/date concentration
   */
  private applyDiversification(
    signals: any[],
    maxPerTickerDate: number,
    maxPerDate: number
  ): any[] {
    // Group by ticker+date combination
    const byTickerDate = new Map<string, any[]>();

    for (const signal of signals) {
      const key = `${signal.ticker}:${signal.date}`;
      if (!byTickerDate.has(key)) {
        byTickerDate.set(key, []);
      }
      byTickerDate.get(key)!.push(signal);
    }

    // Take top N per ticker+date, respecting per-date limits
    const diversified: any[] = [];
    const dateCount = new Map<string, number>();

    for (const [key, groupSignals] of byTickerDate) {
      const date = key.split(':')[1];
      const currentDateCount = dateCount.get(date) || 0;

      // Skip if we've hit the per-date limit
      if (currentDateCount >= maxPerDate) continue;

      // Sort by pattern_strength and take top N for this ticker+date
      const topSignals = groupSignals
        .sort((a, b) => (b.pattern_strength || 0) - (a.pattern_strength || 0))
        .slice(0, maxPerTickerDate);

      // Add signals while respecting per-date limit
      for (const signal of topSignals) {
        if ((dateCount.get(date) || 0) < maxPerDate) {
          diversified.push(signal);
          dateCount.set(date, (dateCount.get(date) || 0) + 1);
        }
      }
    }

    return diversified;
  }
}
