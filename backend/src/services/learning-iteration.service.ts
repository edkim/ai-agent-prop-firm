/**
 * Learning Iteration Service
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
import { LearningAgentManagementService } from './learning-agent-management.service';
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
import { execSync } from 'child_process';

// Default backtest configuration
const DEFAULT_BACKTEST_CONFIG: AgentBacktestConfig = {
  max_signals_per_iteration: 200,     // Cap at 200 signals for statistical significance
  max_signals_per_ticker_date: 2,     // Max 2 signals per ticker per day
  max_signals_per_date: 200,           // Max 200 signals per unique date
  min_pattern_strength: 0,             // Minimum quality score (0 = accept all)
  backtest_timeout_ms: 120000,         // 2 minute timeout per backtest
};

// Template execution configuration
// Set to false to skip template testing and use only custom execution scripts (faster iterations)
// Set to true to test all templates and compare with custom execution (comprehensive testing)
const ENABLE_TEMPLATE_EXECUTION = false;

export class LearningIterationService {
  private agentMgmt: LearningAgentManagementService;
  private claude: ClaudeService;
  private knowledgeExtraction: AgentKnowledgeExtractionService;
  private scanner: ScannerService;
  private backtest: BacktestService;
  private performanceMonitor: PerformanceMonitorService;
  private refinementApproval: RefinementApprovalService;
  private scriptExecution: ScriptExecutionService;
  private templateRenderer: TemplateRendererService;

  constructor() {
    this.agentMgmt = new LearningAgentManagementService();
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
  async runIteration(agentId: string, manualGuidance?: string): Promise<IterationResult> {
    const agent = await this.agentMgmt.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get current iteration number
    const iterationNumber = await this.getNextIterationNumber(agentId);

    // Create iteration-specific logger
    const logger = createIterationLogger(agentId, iterationNumber);
    logger.info('Starting learning iteration', { agentName: agent.name, hasManualGuidance: !!manualGuidance });

    try {
      // Step 1: Generate strategy (scan + execution)
      logger.info('Step 1: Generating strategy');
      const strategy = await this.generateStrategy(agent, iterationNumber, manualGuidance);
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

      // Step 2.5: For iteration 2+, regenerate execution script with actual signals
      // Always regenerate to ensure it uses the actual signal structure from scanner
      if (iterationNumber > 1 && scanResults.length > 0) {
        logger.info('Step 2.5: Regenerating execution script with actual scanner signals');
        const previousIteration = this.getPreviousIteration(agent.id, iterationNumber);
        const knowledge = await this.getAgentKnowledge(agent.id);
        const knowledgeSummary = this.formatKnowledgeSummary(knowledge, agent);

        if (previousIteration && previousIteration.backtest_results && previousIteration.expert_analysis) {
          const agentPersonality = `${agent.trading_style} trader with ${agent.risk_tolerance} risk tolerance, focusing on ${agent.pattern_focus.join(', ')}.`;

          const executionResult = await this.claude.generateExecutionScript({
            agentPersonality,
            winningTemplate: previousIteration.winning_template || 'time_based',
            templatePerformances: previousIteration.backtest_results.templateResults || [],
            executionAnalysis: previousIteration.expert_analysis.execution_analysis || {},
            agentKnowledge: knowledgeSummary,
            scannerContext: strategy.rationale,
            actualScannerSignals: scanResults.slice(0, 5)  // Pass first 5 signals as samples
          });

          strategy.executionScript = executionResult.script;
          logger.info('✅ Execution script regenerated with actual signals');
        }
      }

      if (scanResults.length === 0) {
        logger.warn('No signals found - iteration will continue with empty results');
      }

      // Step 3: Run backtests on scan results
      logger.info('Step 3: Running backtests with template library');
      const backtestResults = await this.runBacktests(strategy.executionScript, scanResults, agent.name, iterationNumber, strategy.executionTokenUsage);
      logger.info('Backtests complete', {
        totalTrades: backtestResults.totalTrades,
        winningTemplate: backtestResults.winningTemplate,
        profitFactor: backtestResults.profitFactor,
        templatesResults: backtestResults.templateResults?.length || 0
      });

      // Update strategy with signal-embedded execution script for database storage
      // This ensures the database stores the actual executed code, not the template with empty signals
      if (backtestResults.embeddedExecutionScript) {
        strategy.executionScript = backtestResults.embeddedExecutionScript;
        logger.info('Updated strategy with signal-embedded execution script');
      }

      // Step 4: Agent analyzes results
      logger.info('Step 4: Analyzing results');
      let analysis: ExpertAnalysis;

      if (scanResults.length === 0) {
        // Special case: Scanner found 0 signals - analyze scanner filters
        logger.warn('No signals found - analyzing scanner for filter adjustments');

        // Get previous iteration to provide context
        const prevIteration = await this.getPreviousIteration(agentId, iterationNumber);
        const previousSignals = prevIteration?.signals_found;

        // Get agent knowledge for context
        const knowledgeItems = await this.knowledgeExtraction.getAgentKnowledge(agentId);
        const knowledgeContext = knowledgeItems.length > 0
          ? knowledgeItems.map((k: any) => `- ${k.insight}`).join('\n')
          : 'No prior knowledge yet';

        // Call Claude to analyze the scanner and suggest filter adjustments
        const zeroSignalAnalysis = await this.claudeService.analyzeZeroSignalScanner({
          agentPersonality: agent.instructions || 'You are a trading agent learning to identify profitable patterns.',
          scannerScript: strategy.scanScript,
          agentKnowledge: knowledgeContext,
          previousIterationSignals: previousSignals
        });

        // Convert to ExpertAnalysis format
        analysis = {
          summary: zeroSignalAnalysis.summary,
          parameter_recommendations: zeroSignalAnalysis.parameter_recommendations || [],
          strategic_insights: zeroSignalAnalysis.restrictive_filters_identified || [],
          trade_quality_assessment: 'No signals to assess - scanner too restrictive',
          risk_assessment: zeroSignalAnalysis.quality_assurance || 'Filters need adjustment',
          market_condition_notes: zeroSignalAnalysis.expected_signal_increase || 'Unknown'
        };

        logger.info('Zero-signal analysis complete', {
          restrictiveFilters: zeroSignalAnalysis.restrictive_filters_identified?.length || 0,
          recommendations: zeroSignalAnalysis.parameter_recommendations?.length || 0
        });
      } else if (backtestResults.totalTrades === 0) {
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
        manualGuidance,
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
   * Get the previous iteration for an agent
   */
  private getPreviousIteration(agentId: string, currentIterationNumber: number): any | null {
    const db = getDatabase();
    const previousIteration = db.prepare(`
      SELECT * FROM agent_iterations
      WHERE learning_agent_id = ? AND iteration_number = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(agentId, currentIterationNumber - 1) as any;

    if (!previousIteration) {
      return null;
    }

    // Parse JSON fields
    if (previousIteration.backtest_results) {
      previousIteration.backtest_results = JSON.parse(previousIteration.backtest_results);
    }
    if (previousIteration.expert_analysis) {
      previousIteration.expert_analysis = JSON.parse(previousIteration.expert_analysis);
    }
    if (previousIteration.refinements_suggested) {
      previousIteration.refinements_suggested = JSON.parse(previousIteration.refinements_suggested);
    }

    return previousIteration;
  }

  /**
   * Generate strategy scripts for this agent using Claude
   */
  private async generateStrategy(
    agent: TradingAgent,
    iterationNumber: number,
    manualGuidance?: string
  ): Promise<{
    scanScript: string;
    executionScript: string;
    rationale: string;
    scannerTokenUsage?: any;
    executionTokenUsage?: any;
    scannerPrompt?: string;
    executionPrompt?: string;
  }> {
    // Get agent's accumulated knowledge
    const knowledge = await this.getAgentKnowledge(agent.id);
    const knowledgeSummary = this.formatKnowledgeSummary(knowledge, agent);

    console.log(`   Agent personality: ${agent.trading_style}, ${agent.risk_tolerance}`);
    console.log(`   Pattern focus: ${agent.pattern_focus.join(', ')}`);
    if (manualGuidance) {
      console.log(`   Manual guidance provided: ${manualGuidance.substring(0, 100)}...`);
    }

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

    // Add manual guidance if provided - this takes priority over automated learnings
    if (manualGuidance && manualGuidance.trim() !== '') {
      scannerQuery += `\n\n🎯 MANUAL GUIDANCE FROM USER (PRIORITY):\n${manualGuidance.trim()}\n\nIMPORTANT: The user has provided specific guidance above. Incorporate this guidance into your strategy generation. This takes priority over automated refinements.`;
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

    // Step 2: Execution script generation
    let executionScript = '';
    let executionTokenUsage: any = undefined;
    let executionRationale = '';
    let executionResult: any = undefined;

    if (iterationNumber === 1) {
      // First iteration: generate custom execution script based on agent's strategy
      console.log(`   Iteration 1: Generating custom execution script based on agent strategy...`);

      const agentPersonality = `${agent.trading_style} trader with ${agent.risk_tolerance} risk tolerance, focusing on ${agent.pattern_focus.join(', ')}.`;

      executionResult = await this.claude.generateExecutionScriptFromStrategy({
        agentInstructions: agent.instructions,
        agentPersonality,
        patternFocus: agent.pattern_focus,
        tradingStyle: agent.trading_style,
        riskTolerance: agent.risk_tolerance,
        marketConditions: agent.market_conditions,
        scannerContext: scannerResult.explanation
      });

      executionScript = executionResult.script;
      executionRationale = executionResult.rationale;
      executionTokenUsage = executionResult.tokenUsage;
      console.log(`   ✅ Strategy-aligned execution script generated`);
    } else {
      // Subsequent iterations: generate custom execution script based on learnings
      console.log(`   Iteration ${iterationNumber}: Generating custom execution script based on learnings...`);

      const previousIteration = this.getPreviousIteration(agent.id, iterationNumber);

      if (previousIteration && previousIteration.backtest_results && previousIteration.expert_analysis) {
        const agentPersonality = `${agent.trading_style} trader with ${agent.risk_tolerance} risk tolerance, focusing on ${agent.pattern_focus.join(', ')}.`;

        executionResult = await this.claude.generateExecutionScript({
          agentPersonality,
          winningTemplate: previousIteration.winning_template || 'time_based',
          templatePerformances: previousIteration.backtest_results.templateResults || [],
          executionAnalysis: previousIteration.expert_analysis.execution_analysis || {},
          agentKnowledge: knowledgeSummary,
          scannerContext: scannerResult.explanation
        });

        executionScript = executionResult.script;
        executionRationale = executionResult.rationale;
        // Note: executionTokenUsage would need to be captured from the Claude API call
        console.log(`   ✅ Custom execution script generated`);
      } else {
        console.log(`   ⚠️  No previous iteration found, falling back to template library`);
        executionRationale = 'No previous iteration data available, using template library.';
      }
    }

    const rationale = iterationNumber === 1
      ? `Initial strategy: ${scannerResult.explanation}. ${executionRationale}`
      : `Iteration ${iterationNumber}: Applied learnings to refine scanner. ${executionRationale}`;

    return {
      scanScript: scannerResult.script,
      executionScript,  // Empty for iteration 1, custom script for iteration 2+
      rationale,
      scannerTokenUsage: scannerResult.tokenUsage,
      executionTokenUsage,
      scannerPrompt: scannerResult.prompt || scannerQuery,
      executionPrompt: executionResult?.prompt || `Generated ${iterationNumber === 1 ? 'initial' : 'refined'} execution script`
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
  private async runBacktests(executionScript: string, scanResults: any[], agentName: string, iterationNumber: number, tokenUsage?: any): Promise<any> {
    if (scanResults.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        trades: [],
        templateResults: [],
        embeddedExecutionScript: null  // No signals to embed
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
    let customTrades: any[] = []; // Track custom script trades

    if (ENABLE_TEMPLATE_EXECUTION) {
      console.log(`   \n   Testing ${DEFAULT_TEMPLATES.length} execution templates...`);
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
    }

    // Track the embedded script for database storage
    let embeddedExecutionScript: string | null = null;

    // Test custom execution script if provided (for iterations 2+)
    if (executionScript && executionScript.trim() !== '') {
      console.log(`\n   📊 Testing custom execution script`);

      const allTrades: any[] = [];
      let successfulBacktests = 0;

      // Execute custom script for all signals
      const scriptId = uuidv4();
      const sanitizedAgentName = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const scriptPath = path.join(__dirname, '../../generated-scripts/success', new Date().toISOString().split('T')[0], `iter${iterationNumber}-${sanitizedAgentName}-${scriptId}-custom-execution.ts`);

      // Ensure directory exists
      const dir = path.dirname(scriptPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      try {
        // Embed signals data into the custom script
        // The custom script expects to read from stdin, but we'll embed the data directly
        const signalsJson = JSON.stringify(filteredResults, null, 2);

        // Replace either the readFileSync pattern OR the empty array placeholder
        let scriptWithSignals = executionScript.replace(
          /const input = require\('fs'\)\.readFileSync\(0, 'utf-8'\);?\s*const signals = JSON\.parse\(input\);?/g,
          `const signals = ${signalsJson};`
        );

        // Also handle the placeholder pattern: const signals = [];
        scriptWithSignals = scriptWithSignals.replace(
          /const signals\s*=\s*\[\s*\];?/g,
          `const signals = ${signalsJson};`
        );

        // Store the embedded version for database storage
        embeddedExecutionScript = scriptWithSignals;

        // Fix import paths: Claude generates ../../src/database/db but script is nested 3 levels deep
        // generated-scripts/success/YYYY-MM-DD/ -> need ../../../src/database/db
        scriptWithSignals = scriptWithSignals.replace(
          /from ['"]\.\.\/\.\.\/src\//g,
          `from '../../../src/`
        );

        // Add database initialization if missing
        // Look for import of getDatabase and add initializeDatabase import if not present
        if (!scriptWithSignals.includes('initializeDatabase')) {
          scriptWithSignals = scriptWithSignals.replace(
            /import \{ getDatabase \} from ['"]\.\.\/\.\.\/\.\.\/src\/database\/db['"]/,
            `import { initializeDatabase, getDatabase } from '../../../src/database/db'`
          );
        }

        // Add database initialization call before executeSignals if missing
        // Look for the pattern where executeSignals is called
        if (!scriptWithSignals.includes('initializeDatabase(')) {
          scriptWithSignals = scriptWithSignals.replace(
            /async function executeSignals\(signals: Signal\[\]\): Promise<Trade\[\]> \{[\s\S]*?const db = getDatabase\(\);/,
            (match) => {
              // Add initialization call before getDatabase
              return match.replace(
                'const db = getDatabase();',
                `const dbPath = process.env.DATABASE_PATH || './backtesting.db';\n  initializeDatabase(dbPath);\n  const db = getDatabase();`
              );
            }
          );
        }

        // Save modified script to file
        fs.writeFileSync(scriptPath, scriptWithSignals);

        // Execute with 120 second timeout
        const result = await this.scriptExecution.executeScript(scriptPath, 120000, tokenUsage);

        if (result.success && result.data) {
          // Parse results - handle both array and object formats
          let trades: any[] = [];
          if (Array.isArray(result.data)) {
            trades = result.data;
          } else if (result.data.trades) {
            trades = result.data.trades;
          }

          allTrades.push(...trades);
          customTrades = trades; // Store for empty template results fallback
          successfulBacktests = 1;
          console.log(`      ✅ Custom execution completed: ${trades.length} trades`);
        } else {
          console.log(`      ⚠️  Custom execution failed: ${result.error || 'Unknown error'}`);
        }
      } catch (error: any) {
        console.error(`      Error executing custom script: ${error.message}`);
      }

      if (allTrades.length > 0) {
        // Calculate performance metrics
        const aggregated = this.aggregateBacktestResults(allTrades);
        const profitFactor = this.calculateProfitFactor(allTrades);

        templateResults.push({
          template: 'custom',
          templateDisplayName: 'Custom Execution (Claude-Generated)',
          trades: allTrades,
          totalTrades: allTrades.length,
          winRate: aggregated.winRate,
          sharpeRatio: aggregated.sharpeRatio,
          totalReturn: aggregated.totalReturn,
          profitFactor: profitFactor,
          avgWin: this.calculateAvgWin(allTrades),
          avgLoss: this.calculateAvgLoss(allTrades)
        });

        console.log(`      Custom execution: PF ${profitFactor.toFixed(2)}, WR ${(aggregated.winRate * 100).toFixed(1)}%, Trades ${allTrades.length}`);
      }
    }

    // Sort by profit factor (best first)
    templateResults.sort((a, b) => b.profitFactor - a.profitFactor);

    console.log(`\n   📈 Template Performance Summary:`);
    if (templateResults.length === 0) {
      console.log(`   No template results (ENABLE_TEMPLATE_EXECUTION=${ENABLE_TEMPLATE_EXECUTION})`);

      // No templates ran, return default/empty results
      return {
        totalTrades: customTrades?.length || 0,
        winRate: customTrades && customTrades.length > 0 ?
          customTrades.filter((t: any) => t.pnl > 0).length / customTrades.length : 0,
        sharpeRatio: 0,
        totalReturn: customTrades?.reduce((sum: number, t: any) => sum + t.pnl, 0) || 0,
        trades: customTrades || [],
        profitFactor: 0,
        templateResults: [],
        winningTemplate: 'custom',
        recommendation: 'Templates disabled - using custom execution script only',
        embeddedExecutionScript: embeddedExecutionScript  // Include the signal-embedded script
      };
    }

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
      recommendation: `${winner.templateDisplayName} template performed best with profit factor ${winner.profitFactor.toFixed(2)}`,
      embeddedExecutionScript: embeddedExecutionScript  // Include the signal-embedded script
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
      request.learning_agent_id,
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
      WHERE learning_agent_id = ?
    `).get(agentId) as { max_iteration: number | null };

    return (result.max_iteration || 0) + 1;
  }

  private async getAgentKnowledge(agentId: string): Promise<any[]> {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM agent_knowledge
      WHERE learning_agent_id = ?
      ORDER BY confidence DESC, created_at DESC
    `).all(agentId);
  }

  private formatKnowledgeSummary(knowledge: any[], agent: TradingAgent): string {
    return this.knowledgeExtraction.formatKnowledgeForStrategyGeneration(
      knowledge,
      agent.pattern_focus
    );
  }

  private getGitCommitHash(): string | null {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: __dirname }).trim();
    } catch (error) {
      console.error('Failed to get git commit hash:', error);
      return null;
    }
  }

  private async saveIteration(data: any): Promise<AgentIteration> {
    const db = getDatabase();
    const id = uuidv4();

    const iteration: AgentIteration = {
      id,
      learning_agent_id: data.agentId,
      iteration_number: data.iterationNumber,
      scan_script: data.strategy.scanScript,
      execution_script: data.strategy.executionScript,
      scanner_prompt: data.strategy.scannerPrompt || null,
      execution_prompt: data.strategy.executionPrompt || null,
      version_notes: `Iteration ${data.iterationNumber}`,
      manual_guidance: data.manualGuidance || null,
      signals_found: data.scanResults.length,
      backtest_results: data.backtestResults,
      win_rate: data.backtestResults.winRate || 0,
      sharpe_ratio: data.backtestResults.sharpeRatio || 0,
      total_return: data.backtestResults.totalReturn || 0,
      winning_template: data.backtestResults.winningTemplate || null,
      expert_analysis: JSON.stringify(data.analysis),
      refinements_suggested: data.refinements,
      iteration_status: 'completed',
      git_commit_hash: this.getGitCommitHash(),
      created_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO agent_iterations (
        id, learning_agent_id, iteration_number, scan_script, execution_script, scanner_prompt, execution_prompt,
        version_notes, manual_guidance, signals_found, backtest_results, win_rate, sharpe_ratio,
        total_return, winning_template, expert_analysis, refinements_suggested, iteration_status, git_commit_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      iteration.id,
      iteration.learning_agent_id,
      iteration.iteration_number,
      iteration.scan_script,
      iteration.execution_script,
      iteration.scanner_prompt,
      iteration.execution_prompt,
      iteration.version_notes,
      iteration.manual_guidance,
      iteration.signals_found,
      JSON.stringify(iteration.backtest_results),
      iteration.win_rate,
      iteration.sharpe_ratio,
      iteration.total_return,
      iteration.winning_template,
      iteration.expert_analysis,
      JSON.stringify(iteration.refinements_suggested),
      iteration.iteration_status,
      iteration.git_commit_hash,
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
      WHERE learning_agent_id = ? AND is_current_version = 1
    `).get(agentId) as { version: string } | undefined;

    const newVersion = this.incrementVersion(currentVersion?.version || 'v0.0');

    return {
      id: uuidv4(),
      learning_agent_id: agentId,
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
      WHERE learning_agent_id = ? AND is_current_version = 1
    `).run(strategy.learning_agent_id);

    // Insert new version
    db.prepare(`
      INSERT INTO agent_strategies (
        id, learning_agent_id, version, scan_script, execution_script,
        backtest_sharpe, backtest_win_rate, backtest_total_return,
        is_current_version, parent_version, changes_from_parent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      strategy.id,
      strategy.learning_agent_id,
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

  /**
   * Preview what the next iteration's scanner prompt would be without executing
   */
  async previewNextIteration(agentId: string): Promise<{
    scannerPrompt: string;
    nextIterationNumber: number;
    agentInstructions: string;
    learningsApplied?: Array<{
      iteration: number;
      insight: string;
      confidence: number;
    }>;
  }> {
    const agent = await this.agentMgmt.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const nextIterationNumber = await this.getNextIterationNumber(agentId);

    // Build scanner prompt using the same logic as generateStrategy()
    let scannerQuery: string;
    let learningsApplied: Array<{ iteration: number; insight: string; confidence: number }> = [];

    if (nextIterationNumber === 1) {
      // Iteration 1: Use agent's instructions or pattern focus
      if (agent.instructions && agent.instructions.trim() !== '') {
        scannerQuery = agent.instructions;
      } else {
        scannerQuery = `Find ${agent.pattern_focus.join(' or ')} patterns in ${agent.market_conditions.join(' or ')} market conditions. Trading style: ${agent.trading_style}, risk tolerance: ${agent.risk_tolerance}.`;
      }
    } else {
      // Iteration 2+: Get learnings from previous iterations
      const db = getDatabase();
      const previousIterations = db.prepare(`
        SELECT iteration_number, expert_analysis, win_rate, total_return
        FROM agent_iterations
        WHERE agent_id = ?
        ORDER BY iteration_number DESC
        LIMIT 3
      `).all(agentId) as any[];

      // Extract key insights from previous iterations
      const insights: string[] = [];
      for (const iter of previousIterations) {
        try {
          if (iter.expert_analysis) {
            const analysis = typeof iter.expert_analysis === 'string'
              ? JSON.parse(iter.expert_analysis)
              : iter.expert_analysis;

            // Extract summary as key insight
            if (analysis.summary) {
              insights.push(`Iteration ${iter.iteration_number}: ${analysis.summary}`);
              learningsApplied.push({
                iteration: iter.iteration_number,
                insight: analysis.summary,
                confidence: iter.win_rate || 0.5
              });
            }

            // Extract parameter recommendations
            if (analysis.parameter_recommendations) {
              for (const param of analysis.parameter_recommendations.slice(0, 2)) {
                if (param.expectedImprovement) {
                  insights.push(`- ${param.expectedImprovement}`);
                }
              }
            }
          }
        } catch (error) {
          // Skip malformed analysis
          continue;
        }
      }

      const knowledgeSummary = insights.join('\n');

      if (agent.instructions && agent.instructions.trim() !== '') {
        // Specialized strategy with custom instructions
        scannerQuery = agent.instructions;

        // Append learnings to refine the custom strategy
        if (knowledgeSummary && knowledgeSummary.trim() !== '') {
          scannerQuery += `\n\nINCORPORATE THESE LEARNINGS:\n${knowledgeSummary}`;
        }
      } else {
        // Generic agent - use pattern focus with learnings
        scannerQuery = `Find ${agent.pattern_focus.join(' or ')} patterns incorporating these learnings:\n${knowledgeSummary}`;
      }
    }

    return {
      scannerPrompt: scannerQuery,
      nextIterationNumber,
      agentInstructions: agent.instructions,
      learningsApplied: learningsApplied.length > 0 ? learningsApplied : undefined
    };
  }
}
