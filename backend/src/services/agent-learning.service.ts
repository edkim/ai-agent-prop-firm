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
} from '../types/agent.types';
import { AgentManagementService } from './agent-management.service';
import { ClaudeService } from './claude.service';
import { ScannerService } from './scanner.service';
import { BacktestService } from './backtest.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { RefinementApprovalService } from './refinement-approval.service';
import { ScriptExecutionService } from './script-execution.service';

export class AgentLearningService {
  private agentMgmt: AgentManagementService;
  private claude: ClaudeService;
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
    const scanResults = await this.executeScan(strategy.scanScript);
    console.log(`   Found ${scanResults.length} signals`);

    if (scanResults.length === 0) {
      console.log('⚠️  No signals found - iteration will continue with placeholder data');
      // Allow iteration to continue with empty results for now
      // TODO: Implement actual scanner execution
    }

    // Step 3: Run backtests on scan results
    console.log('3️⃣ Running backtests...');
    const backtestResults = await this.runBacktests(strategy.executionScript, scanResults);

    // Step 4: Agent analyzes results
    console.log('4️⃣ Analyzing results...');
    const analysis = await this.analyzeResults(agent, backtestResults, scanResults);

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
   * Generate strategy scripts for this agent using Claude
   */
  private async generateStrategy(
    agent: TradingAgent,
    iterationNumber: number
  ): Promise<{
    scanScript: string;
    executionScript: string;
    rationale: string;
  }> {
    // Get agent's accumulated knowledge
    const knowledge = await this.getAgentKnowledge(agent.id);
    const knowledgeSummary = this.formatKnowledgeSummary(knowledge);

    console.log(`   Agent personality: ${agent.trading_style}, ${agent.risk_tolerance}`);
    console.log(`   Pattern focus: ${agent.pattern_focus.join(', ')}`);

    // Step 1: Generate scanner script
    const scannerQuery = iterationNumber === 1
      ? `Find ${agent.pattern_focus.join(' or ')} patterns in ${agent.market_conditions.join(' or ')} market conditions. Trading style: ${agent.trading_style}, risk tolerance: ${agent.risk_tolerance}.`
      : `Find ${agent.pattern_focus.join(' or ')} patterns incorporating these learnings: ${knowledgeSummary}`;

    console.log(`   Generating scanner with Claude...`);
    const scannerResult = await this.claude.generateScannerScript({
      query: scannerQuery,
      universe: 'technology', // Default to tech sector
      dateRange: {
        start: this.getDateDaysAgo(20),
        end: this.getDateDaysAgo(1)
      }
    });

    // Step 2: Generate execution script
    const executionPrompt = iterationNumber === 1
      ? `${agent.trading_style} ${agent.risk_tolerance} risk trader looking for ${agent.pattern_focus.join(' or ')} patterns. Generate entry and exit rules matching this personality in ${agent.market_conditions.join(' or ')} conditions.`
      : `${agent.trading_style} trader with these learnings: ${knowledgeSummary}. Improve the strategy based on previous iterations.`;

    console.log(`   Generating execution script with Claude...`);
    const executionResult = await this.claude.generateScript(executionPrompt, {
      ticker: 'TEMPLATE_TICKER',
      timeframe: '5min',
      dates: [this.getDateDaysAgo(5)] // Will be replaced during execution
    });

    const rationale = iterationNumber === 1
      ? `Initial strategy: ${scannerResult.explanation}. ${executionResult.explanation || 'Basic execution rules.'}`
      : `Iteration ${iterationNumber}: Applied learnings to refine scanner and execution logic.`;

    return {
      scanScript: scannerResult.script,
      executionScript: executionResult.scriptCode,
      rationale
    };
  }

  /**
   * Execute scan script and return matches
   */
  private async executeScan(scanScript: string): Promise<any[]> {
    const scriptId = uuidv4();
    const scriptPath = path.join('/tmp', `agent-scan-${scriptId}.ts`);

    try {
      // Save script to temp file
      fs.writeFileSync(scriptPath, scanScript);
      console.log(`   Saved scan script to ${scriptPath}`);

      // Execute script with 60 second timeout
      console.log(`   Executing scan script...`);
      const result = await this.scriptExecution.executeScript(scriptPath, 60000);

      if (!result.success) {
        console.error(`   Scan script execution failed: ${result.error}`);
        return [];
      }

      // Parse results
      const scanResults = result.data?.matches || [];
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
  private async runBacktests(executionScript: string, scanResults: any[]): Promise<any> {
    if (scanResults.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        trades: [],
      };
    }

    console.log(`   Running backtests on ${scanResults.length} scan results...`);
    const allTrades: any[] = [];
    let successfulBacktests = 0;

    // Execute backtest for each scan result
    for (const scanResult of scanResults) {
      const { ticker, date } = scanResult;
      const scriptId = uuidv4();
      const scriptPath = path.join('/tmp', `agent-backtest-${scriptId}.ts`);

      try {
        // Customize execution script with ticker and date
        const customizedScript = executionScript
          .replace(/TEMPLATE_TICKER/g, ticker)
          .replace(/\[.*?\]/g, `['${date}']`); // Replace date array

        // Save to temp file
        fs.writeFileSync(scriptPath, customizedScript);

        // Execute with 120 second timeout
        const result = await this.scriptExecution.executeScript(scriptPath, 120000);

        if (result.success && result.data) {
          const trades = result.data.trades || [];
          allTrades.push(...trades);
          successfulBacktests++;
        }

        // Clean up
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }
      } catch (error: any) {
        console.error(`   Error backtesting ${ticker} on ${date}: ${error.message}`);
        // Clean up on error
        try {
          if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
          }
        } catch {}
      }
    }

    console.log(`   Completed ${successfulBacktests}/${scanResults.length} backtests`);
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

    console.log(`   Converting analysis into ${analysis.parameter_recommendations.length} refinements...`);

    // Convert parameter recommendations into refinements
    for (const param of analysis.parameter_recommendations) {
      refinements.push({
        type: 'parameter_adjustment',
        description: `Adjust ${param.parameter} from ${param.current_value} to ${param.suggested_value}`,
        reasoning: param.rationale,
        projected_improvement: `Expected improvement based on analysis`,
        specific_changes: {
          parameter: param.parameter,
          old_value: param.current_value,
          new_value: param.suggested_value
        }
      });
    }

    // Convert missing context into data collection refinements
    for (const missing of analysis.missing_context) {
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
    for (const failure of analysis.failure_points) {
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

  private formatKnowledgeSummary(knowledge: any[]): string {
    if (knowledge.length === 0) {
      return 'No accumulated knowledge yet. This is your first iteration.';
    }

    return knowledge
      .map(k => `- ${k.insight} (confidence: ${Math.round(k.confidence * 100)}%)`)
      .join('\n');
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
}
