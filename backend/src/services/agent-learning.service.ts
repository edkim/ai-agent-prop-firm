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

// Default backtest configuration
const DEFAULT_BACKTEST_CONFIG: AgentBacktestConfig = {
  max_signals_per_iteration: 5,       // Cap at 5 for faster iterations
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

  constructor() {
    this.agentMgmt = new AgentManagementService();
    this.claude = new ClaudeService();
    this.scanner = new ScannerService();
    this.backtest = new BacktestService();
    this.performanceMonitor = new PerformanceMonitorService();
    this.refinementApproval = new RefinementApprovalService();
    this.scriptExecution = new ScriptExecutionService();
    this.knowledgeExtraction = new AgentKnowledgeExtractionService();
  }

  /**
   * Run a complete learning iteration for an agent
   */
  async runIteration(agentId: string): Promise<IterationResult> {
    console.log(`🧠 Starting learning iteration for agent: ${agentId}`);

    const agent = await this.agentMgmt.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get current iteration number
    const iterationNumber = await this.getNextIterationNumber(agentId);
    console.log(`📊 Iteration #${iterationNumber}`);

    // Step 1: Generate strategy (scan + execution)
    console.log('1️⃣ Generating strategy...');
    const strategy = await this.generateStrategy(agent, iterationNumber);

    // Step 2: Execute scan
    console.log('2️⃣ Running scan...');
    const scanResults = await this.executeScan(strategy.scanScript, strategy.scannerTokenUsage);
    console.log(`   Found ${scanResults.length} signals`);

    if (scanResults.length === 0) {
      console.log('⚠️  No signals found - iteration will continue with placeholder data');
      // Allow iteration to continue with empty results for now
      // TODO: Implement actual scanner execution
    }

    // Step 3: Run backtests on scan results
    console.log('3️⃣ Running backtests...');
    const backtestResults = await this.runBacktests(strategy.executionScript, scanResults, strategy.executionTokenUsage);

    // Step 4: Agent analyzes results (skip if no successful backtests)
    console.log('4️⃣ Analyzing results...');
    let analysis: ExpertAnalysis;

    if (backtestResults.totalTrades === 0) {
      console.log('   ⚠️  No trades generated - skipping detailed analysis');
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
    }

    // Step 4.5: Extract and store knowledge from analysis
    console.log('📚 Extracting knowledge...');
    const knowledge = await this.knowledgeExtraction.extractKnowledge(agentId, analysis, iterationNumber);
    await this.knowledgeExtraction.storeKnowledge(agentId, knowledge);

    // Step 5: Agent proposes refinements
    console.log('5️⃣ Proposing refinements...');
    const refinements = await this.proposeRefinements(agent, analysis);

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

    console.log(`✅ Iteration #${iterationNumber} complete`);

    // Phase 2 Autonomy Features: Post-iteration hooks
    try {
      // 1. Analyze performance and generate alerts
      console.log('📊 Analyzing performance...');
      await this.performanceMonitor.analyzeIteration(agentId, iteration.id);

      // 2. Auto-approve refinements if enabled
      console.log('🔍 Checking auto-approval...');
      await this.refinementApproval.evaluateAndApply(agentId, iteration.id);
    } catch (error: any) {
      console.error('⚠ Post-iteration autonomy hooks failed:', error.message);
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

    // Step 2: Generate execution script
    const config = this.buildBacktestConfig(agent);
    const executionPrompt = iterationNumber === 1
      ? `${agent.trading_style} trader with ${agent.risk_tolerance} risk tolerance.
Focus on ${agent.pattern_focus.join(' or ')} patterns in ${agent.market_conditions.join(' or ')} market conditions.

IMPORTANT: This script will receive SCANNER_SIGNALS from the pattern detection scanner.
Generate a SIGNAL-BASED execution script that:
- Checks if SCANNER_SIGNALS exists and uses it (required for learning)
- Enters trades at signal times (next bar after signal)
- Applies exit rules: stop loss ${config.stopLossPct}%, take profit ${config.takeProfitPct}%, market close at 15:55
- Maximum ${config.maxTradesPerDay} trade(s) per day
- Proper TypeScript type annotations for all functions
- Falls back to autonomous detection only if SCANNER_SIGNALS is undefined`
      : `${agent.trading_style} trader with accumulated knowledge: ${knowledgeSummary}.

IMPORTANT: This script will receive SCANNER_SIGNALS from the pattern detection scanner.
Improve the strategy based on previous iterations:
- MUST use signal-based execution when SCANNER_SIGNALS is provided
- Apply refined exit rules and risk management
- Maintain proper TypeScript typing with explicit type annotations`;

    console.log(`   Generating signal-based execution script with Claude...`);
    const executionResult = await this.claude.generateScript(executionPrompt, {
      strategyType: 'signal_based',
      ticker: 'TEMPLATE_TICKER',
      timeframe: agent.timeframe || '5min',
      specificDates: [this.getDateDaysAgo(5)], // Will be replaced during execution
      config: config
    });

    const rationale = iterationNumber === 1
      ? `Initial strategy: ${scannerResult.explanation}. ${executionResult.explanation || 'Basic execution rules.'}`
      : `Iteration ${iterationNumber}: Applied learnings to refine scanner and execution logic.`;

    return {
      scanScript: scannerResult.script,
      executionScript: executionResult.script,  // Fixed: script not scriptCode
      rationale,
      scannerTokenUsage: scannerResult.tokenUsage,
      executionTokenUsage: executionResult.tokenUsage
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
   * Run backtests on scan results using execution script
   */
  private async runBacktests(executionScript: string, scanResults: any[], tokenUsage?: any): Promise<any> {
    if (scanResults.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        trades: [],
      };
    }

    console.log(`   Raw scan results: ${scanResults.length}`);

    // Apply signal filtering to reduce to manageable set
    const filteredResults = this.applySignalFiltering(scanResults, DEFAULT_BACKTEST_CONFIG);

    console.log(`   Running backtests on ${filteredResults.length} filtered signals...`);
    const allTrades: any[] = [];
    let successfulBacktests = 0;

    // Group signals by ticker to batch them
    const signalsByTicker: { [ticker: string]: any[] } = {};
    for (const signal of filteredResults) {
      if (!signalsByTicker[signal.ticker]) {
        signalsByTicker[signal.ticker] = [];
      }
      signalsByTicker[signal.ticker].push(signal);
    }

    console.log(`   Grouped into ${Object.keys(signalsByTicker).length} ticker(s)`);

    // Execute backtests in parallel (up to 5 concurrent)
    const backtestPromises = Object.entries(signalsByTicker).map(async ([ticker, signals]) => {
      const scriptId = uuidv4();
      const scriptPath = path.join(__dirname, '../../', `agent-backtest-${scriptId}.ts`);

      try {
        // Inject signals into the script
        const signalsJSON = JSON.stringify(signals, null, 2);
        const signalInjection = `
// SIGNALS FROM SCANNER (injected by learning system)
const SCANNER_SIGNALS = ${signalsJSON};
`;

        // Customize execution script with ticker and signals
        const customizedScript = executionScript
          .replace(/TEMPLATE_TICKER/g, ticker)
          .replace(/const tradingDays: string\[\] = \[[^\]]*\];/s,
            `const tradingDays: string[] = ${JSON.stringify([...new Set(signals.map((s: any) => s.signal_date))])};\n${signalInjection}`);

        // Save to temp file
        fs.writeFileSync(scriptPath, customizedScript);

        // Execute with 120 second timeout
        const result = await this.scriptExecution.executeScript(scriptPath, 120000, tokenUsage);

        // Clean up
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }

        if (result.success && result.data) {
          return { ticker, trades: result.data.trades || [], success: true };
        } else {
          console.log(`   ⚠️  Backtest failed for ${ticker}: ${result.error || 'Unknown error'}`);
          return { ticker, trades: [], success: false, error: result.error };
        }
      } catch (error: any) {
        console.error(`   Error backtesting ${ticker}: ${error.message}`);
        // Clean up on error
        try {
          if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
          }
        } catch {}
        return { ticker, trades: [], success: false, error: error.message };
      }
    });

    // Wait for all backtests to complete
    const results = await Promise.all(backtestPromises);

    // Aggregate successful results
    for (const result of results) {
      if (result.success && result.trades.length > 0) {
        allTrades.push(...result.trades);
        successfulBacktests++;
      }
    }

    console.log(`   Completed ${successfulBacktests}/${Object.keys(signalsByTicker).length} backtests`);
    console.log(`   Total trades: ${allTrades.length}`);

    // Aggregate results
    const aggregated = this.aggregateBacktestResults(allTrades);

    return {
      totalTrades: allTrades.length,
      winRate: aggregated.winRate,
      sharpeRatio: aggregated.sharpeRatio,
      totalReturn: aggregated.totalReturn,
      trades: allTrades,
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

    // Calculate win rate
    const wins = trades.filter(t => t.profit > 0).length;
    const winRate = wins / trades.length;

    // Calculate total return
    const totalReturn = trades.reduce((sum, t) => sum + (t.profit || 0), 0);

    // Calculate Sharpe ratio (simplified)
    const returns = trades.map(t => t.profit || 0);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return { winRate, sharpeRatio, totalReturn };
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

    // Convert parameter recommendations into refinements
    for (const param of analysis.parameter_recommendations || []) {
      refinements.push({
        type: 'parameter_adjustment',
        description: `Adjust ${param.parameter} from ${param.currentValue} to ${param.recommendedValue}`,
        reasoning: param.expectedImprovement,
        projected_improvement: `Expected improvement based on analysis`,
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
