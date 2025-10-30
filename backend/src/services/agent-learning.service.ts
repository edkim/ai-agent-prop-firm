/**
 * Agent Learning Service
 * Orchestrates the learning loop: scan generation → execution → analysis → refinement
 */

import { v4 as uuidv4 } from 'uuid';
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

export class AgentLearningService {
  private agentMgmt: AgentManagementService;
  private claude: ClaudeService;
  private scanner: ScannerService;
  private backtest: BacktestService;
  private performanceMonitor: PerformanceMonitorService;
  private refinementApproval: RefinementApprovalService;

  constructor() {
    this.agentMgmt = new AgentManagementService();
    this.claude = new ClaudeService();
    this.scanner = new ScannerService();
    this.backtest = new BacktestService();
    this.performanceMonitor = new PerformanceMonitorService();
    this.refinementApproval = new RefinementApprovalService();
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
      throw new Error('No signals found. Try refining the scan criteria.');
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

    // Build prompt with agent's system prompt
    let systemPrompt = agent.system_prompt || '';
    systemPrompt = systemPrompt.replace('{AGENT_KNOWLEDGE}', knowledgeSummary);

    const userPrompt = iterationNumber === 1
      ? `This is your first learning iteration. Based on your instructions and personality, generate:

1. A scan script to find opportunities matching your focus (${agent.pattern_focus.join(', ')})
2. An execution strategy script with entry and exit rules matching your trading style (${agent.trading_style}, ${agent.risk_tolerance})

Consider:
- Your trading style: ${agent.trading_style}
- Your risk tolerance: ${agent.risk_tolerance}
- Pattern focus: ${agent.pattern_focus.join(', ')}
- Market conditions you trade: ${agent.market_conditions.join(', ')}

Generate both scan and execution scripts that work together.
Return your response as JSON:
{
  "scanScript": "...",
  "executionScript": "...",
  "rationale": "Brief explanation of your approach"
}`
      : `This is iteration #${iterationNumber}. Based on your previous learnings and personality, generate improved strategy scripts.

Your accumulated knowledge:
${knowledgeSummary}

Generate scan and execution scripts, incorporating your learnings.
Return JSON: { "scanScript": "...", "executionScript": "...", "rationale": "..." }`;

    // For now, return placeholder - full implementation needs scanner/backtest script generation
    // This would call Claude to generate actual TypeScript scanner and backtest scripts
    return {
      scanScript: '// Scanner script placeholder',
      executionScript: '// Execution script placeholder',
      rationale: 'Initial strategy based on agent personality',
    };
  }

  /**
   * Execute scan script and return matches
   */
  private async executeScan(scanScript: string): Promise<any[]> {
    // This would execute the generated scan script
    // For now, return placeholder
    return [];
  }

  /**
   * Run backtests on scan results using execution script
   */
  private async runBacktests(executionScript: string, scanResults: any[]): Promise<any> {
    // This would run the execution script on each scan result
    // For now, return placeholder
    return {
      totalTrades: 0,
      winRate: 0,
      sharpeRatio: 0,
      totalReturn: 0,
      trades: [],
    };
  }

  /**
   * Agent analyzes backtest results as expert trader
   */
  private async analyzeResults(
    agent: TradingAgent,
    backtestResults: any,
    scanResults: any[]
  ): Promise<ExpertAnalysis> {
    const systemPrompt = agent.system_prompt || '';

    const analysisPrompt = `Analyze these backtest results as an expert trader with your personality:

Backtest Results:
${JSON.stringify(backtestResults, null, 2)}

Scan Results Count: ${scanResults.length}

Provide expert analysis:
1. What worked well?
2. What failed and why?
3. What context or data is missing?
4. What parameter changes would improve performance?

Return JSON matching ExpertAnalysis type with:
- summary (string)
- working_elements (array)
- failure_points (array)
- missing_context (array)
- parameter_recommendations (array)
- projected_performance (object)`;

    // Placeholder - would call Claude for analysis
    return {
      summary: 'Analysis placeholder',
      working_elements: [],
      failure_points: [],
      missing_context: [],
      parameter_recommendations: [],
      projected_performance: {
        current: { winRate: 0, sharpe: 0 },
        withRefinements: { winRate: 0, sharpe: 0 },
        confidence: 0,
      },
    };
  }

  /**
   * Agent proposes refinements based on analysis
   */
  private async proposeRefinements(
    agent: TradingAgent,
    analysis: ExpertAnalysis
  ): Promise<Refinement[]> {
    // Convert analysis into actionable refinements
    // Placeholder for now
    return [];
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
}
