/**
 * Paper Trading Orchestrator Service
 * Runs graduated agents' strategies in real-time using live market data
 */

import { getDatabase } from '../database/db';
import { PaperAccountService } from './paper-account.service';
import { VirtualExecutorService } from './virtual-executor.service';
import logger from './logger.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScriptExecutionService } from './script-execution.service';
import { ExecutionTemplateExitsService } from './execution-template-exits.service';
import { ExitStrategyConfig } from '../types/agent.types';

interface Bar {
  ticker: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
}

interface PaperTradingAgent {
  id: string;
  name: string;
  agent_id: string;
  latest_scan_script: string;
  latest_execution_script: string | null;
  iteration_number: number;
  tickers: string[];
  account_id: string;
  exit_strategy_config: ExitStrategyConfig | null;
  persistent_scan_script_path?: string; // Path to reusable scan script file
}

export class PaperTradingOrchestratorService {
  private paperAccountService: PaperAccountService;
  private virtualExecutor: VirtualExecutorService;
  private scriptExecution: ScriptExecutionService;
  private templateExits: ExecutionTemplateExitsService;
  private activeAgents: Map<string, PaperTradingAgent> = new Map();
  private recentBars: Map<string, Bar[]> = new Map(); // ticker -> recent bars
  private positionMetadata: Map<string, any> = new Map(); // positionId -> metadata for template exits
  private readonly MAX_BARS_PER_TICKER = 100; // Keep last 100 bars per ticker
  private isRunning: boolean = false;

  constructor() {
    this.paperAccountService = new PaperAccountService();
    this.virtualExecutor = new VirtualExecutorService();
    this.scriptExecution = new ScriptExecutionService();
    this.templateExits = new ExecutionTemplateExitsService();
  }

  /**
   * Initialize and load all paper trading agents
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Paper Trading Orchestrator');

    // Load all agents with paper_trading status
    await this.loadPaperTradingAgents();

    // Register for bar updates (will be called by RealtimeDataService)
    this.isRunning = true;

    logger.info(`✅ Orchestrator initialized with ${this.activeAgents.size} paper trading agents`);
  }

  /**
   * Load all agents with paper_trading status
   */
  private async loadPaperTradingAgents(): Promise<void> {
    const db = getDatabase();

    // Get all paper_trading agents with their latest iteration
    const agents = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.status,
        a.exit_strategy_config,
        i.scan_script as latest_scan_script,
        i.execution_script as latest_execution_script,
        i.iteration_number,
        p.id as account_id
      FROM trading_agents a
      LEFT JOIN paper_accounts p ON p.agent_id = a.id
      LEFT JOIN (
        SELECT agent_id, scan_script, execution_script, iteration_number
        FROM agent_iterations
        WHERE (agent_id, iteration_number) IN (
          SELECT agent_id, MAX(iteration_number)
          FROM agent_iterations
          GROUP BY agent_id
        )
      ) i ON i.agent_id = a.id
      WHERE a.status = 'paper_trading'
      AND p.status = 'active'
    `).all() as any[];

    logger.info(`Found ${agents.length} paper trading agents`);

    for (const agent of agents) {
      if (!agent.latest_scan_script) {
        logger.warn(`Agent ${agent.name} (${agent.id}) has no scan script, skipping`);
        continue;
      }

      // Extract tickers from scan script (simplified - assumes tickers are hardcoded)
      const tickers = this.extractTickersFromScript(agent.latest_scan_script);

      if (tickers.length === 0) {
        logger.warn(`No tickers found for agent ${agent.name}, skipping`);
        continue;
      }

      // Parse exit strategy config
      let exitConfig: ExitStrategyConfig | null = null;
      if (agent.exit_strategy_config) {
        try {
          exitConfig = JSON.parse(agent.exit_strategy_config);
          logger.info(`📊 Agent ${agent.name} will use "${exitConfig?.template}" exit template`);
        } catch (error) {
          logger.warn(`Failed to parse exit_strategy_config for agent ${agent.name}, using fallback`);
        }
      } else {
        logger.info(`📊 Agent ${agent.name} has no exit template configured, using simple exits`);
      }

      // Create persistent scan script for this agent (avoid file creation overhead on each scan)
      let persistentScriptPath: string | undefined;
      try {
        persistentScriptPath = this.createPersistentScanScript(agent.id, agent.latest_scan_script);
      } catch (error: any) {
        logger.error(`Failed to create persistent scan script for agent ${agent.name}: ${error.message}`);
      }

      const paperAgent: PaperTradingAgent = {
        id: agent.id,
        name: agent.name,
        agent_id: agent.id,
        latest_scan_script: agent.latest_scan_script,
        latest_execution_script: agent.latest_execution_script,
        iteration_number: agent.iteration_number,
        tickers: tickers,
        account_id: agent.account_id,
        exit_strategy_config: exitConfig,
        persistent_scan_script_path: persistentScriptPath
      };

      this.activeAgents.set(agent.id, paperAgent);
      logger.info(`📊 Loaded agent: ${agent.name} - Watching ${tickers.length} tickers`);
    }
  }

  /**
   * Extract ticker symbols from scan script (simplified heuristic)
   */
  private extractTickersFromScript(scanScript: string): string[] {
    const tickers: Set<string> = new Set();

    // Look for patterns like ticker: 'AAPL' or "AAPL"
    const tickerPatterns = [
      /ticker:\s*['"]([A-Z]{1,5})['"]/g,
      /symbol:\s*['"]([A-Z]{1,5})['"]/g,
      /['"]([A-Z]{2,5})['"]\s*:/g,
    ];

    for (const pattern of tickerPatterns) {
      let match;
      while ((match = pattern.exec(scanScript)) !== null) {
        tickers.add(match[1]);
      }
    }

    // Fallback: Look for array of tickers
    const arrayPattern = /\[([^\]]+)\]/g;
    let match;
    while ((match = arrayPattern.exec(scanScript)) !== null) {
      const content = match[1];
      const tickerMatches = content.match(/['"]([A-Z]{1,5})['"]/g);
      if (tickerMatches) {
        tickerMatches.forEach(t => {
          const ticker = t.replace(/['"]/g, '');
          if (ticker.length >= 1 && ticker.length <= 5) {
            tickers.add(ticker);
          }
        });
      }
    }

    return Array.from(tickers);
  }

  /**
   * Get list of all tickers being watched by paper trading agents
   */
  getWatchedTickers(): string[] {
    const allTickers = new Set<string>();

    for (const agent of this.activeAgents.values()) {
      agent.tickers.forEach(ticker => allTickers.add(ticker));
    }

    return Array.from(allTickers);
  }

  /**
   * Process a new bar from real-time data service
   */
  async processBar(bar: Bar): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Store bar in recent history
      if (!this.recentBars.has(bar.ticker)) {
        this.recentBars.set(bar.ticker, []);
      }

      const bars = this.recentBars.get(bar.ticker)!;
      bars.push(bar);

      // Keep only last N bars
      if (bars.length > this.MAX_BARS_PER_TICKER) {
        bars.shift();
      }

      // Check virtual executor for pending order fills
      await this.virtualExecutor.processBar(bar);

      // Check agents watching this ticker
      for (const agent of this.activeAgents.values()) {
        if (agent.tickers.includes(bar.ticker)) {
          await this.processAgentSignals(agent, bar);
        }
      }

    } catch (error: any) {
      logger.error(`Error processing bar for ${bar.ticker}:`, error.message);
    }
  }

  /**
   * Process potential signals for an agent based on new bar
   */
  private async processAgentSignals(agent: PaperTradingAgent, bar: Bar): Promise<void> {
    try {
      // Scan on EVERY bar (now efficient with persistent scripts and optimized polling)
      const bars = this.recentBars.get(bar.ticker) || [];

      logger.info(`🔍 Scanning ${bar.ticker} for agent ${agent.name} (${bars.length} bars)`);

      // Run scan script (no file I/O overhead with persistent script)
      const signals = await this.runScanScript(agent, bars);

      if (signals.length === 0) {
        return;
      }

      logger.info(`📊 Agent ${agent.name} found ${signals.length} signal(s) for ${bar.ticker}`);

      // Process each signal
      for (const signal of signals) {
        await this.executeSignal(agent, signal, bar);
      }

    } catch (error: any) {
      logger.error(`Error processing signals for agent ${agent.name}:`, error.message);
    }
  }

  /**
   * Create a persistent scan script file for an agent (created once, reused many times)
   */
  private createPersistentScanScript(agentId: string, scanScript: string): string {
    const scriptPath = path.join(__dirname, '../../', `paper-trading-agent-${agentId}.ts`);

    // Adapt script for real-time use
    const adaptedScript = this.adaptScanScriptForRealTime(scanScript);

    // Write once
    fs.writeFileSync(scriptPath, adaptedScript);
    logger.info(`📝 Created persistent scan script for agent ${agentId}: ${scriptPath}`);

    return scriptPath;
  }

  /**
   * Adapt scan script for real-time paper trading
   * Modifies date ranges to only scan today's session (from 9:30am ET onwards)
   */
  private adaptScanScriptForRealTime(scanScript: string): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Replace hardcoded date ranges with today only
    let adapted = scanScript;

    // Replace startDate = '2025-XX-XX' with today
    adapted = adapted.replace(
      /const\s+startDate\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/g,
      `const startDate = '${today}'`
    );

    // Replace endDate = '2025-XX-XX' with today
    adapted = adapted.replace(
      /const\s+endDate\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/g,
      `const endDate = '${today}'`
    );

    // If querying ohlcv_data, add time filter helper for 9:30am onwards
    // (ohlcv_data has time_of_day column, but this helper is for legacy compatibility)
    if (adapted.includes('ohlcv_data')) {
      // Add a helper function to calculate time of day from timestamp
      const timeHelper = `
// Helper: Calculate time of day from timestamp
function getTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toTimeString().split(' ')[0]; // HH:MM:SS
}
`;
      // Insert helper before the main scan function
      adapted = adapted.replace(
        /async function runScan\(\)/,
        `${timeHelper}\nasync function runScan()`
      );
    }

    return adapted;
  }

  /**
   * Run scan script with recent bars (using persistent script file - no file I/O overhead)
   */
  private async runScanScript(agent: PaperTradingAgent, bars: Bar[]): Promise<any[]> {
    // Use persistent script path (created once at agent initialization)
    const scriptPath = agent.persistent_scan_script_path;

    if (!scriptPath || !fs.existsSync(scriptPath)) {
      logger.warn(`Persistent scan script not found for agent ${agent.name}`);
      return [];
    }

    try {
      // Execute persistent script (no file creation/deletion overhead)
      const result = await this.scriptExecution.executeScript(scriptPath, 90000);

      if (!result.success || !result.data) {
        return [];
      }

      // Parse results
      let signals: any[] = [];
      if (Array.isArray(result.data)) {
        signals = result.data;
      } else {
        signals = (result.data as any)?.matches || (result.data as any)?.signals || [];
      }

      // Filter for recent signals only (within last 5 minutes)
      const recentSignals = signals.filter(s => {
        const signalTime = new Date(s.timestamp || s.date).getTime();
        const latestBarTime = bars[bars.length - 1].timestamp;
        return Math.abs(latestBarTime - signalTime) < 5 * 60 * 1000; // 5 minutes
      });

      return recentSignals;

    } catch (error: any) {
      // Log scan failures for debugging
      logger.info(`Scan script execution failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute a trading signal
   */
  private async executeSignal(agent: PaperTradingAgent, signal: any, bar: Bar): Promise<void> {
    try {
      // Extract signal details
      const ticker = signal.ticker || bar.ticker;
      const side = signal.side || signal.direction || 'buy';
      const entry = signal.entry || signal.entryPrice || bar.close;

      // Calculate position size (simplified - use 10% of account equity)
      const account = this.paperAccountService.getAccountById(agent.account_id);
      const positionValue = account.equity * 0.10;
      const quantity = Math.floor(positionValue / entry);

      if (quantity === 0) {
        logger.warn(`Position size too small for ${ticker}, skipping`);
        return;
      }

      logger.info(`🎯 Executing ${side} signal for ${ticker}: ${quantity} shares @ $${entry.toFixed(2)}`);

      // Execute market order
      await this.virtualExecutor.executeMarketOrder(
        agent.agent_id,
        ticker,
        side as 'buy' | 'sell',
        quantity,
        entry,
        signal.id
      );

      logger.info(`✅ Signal executed successfully for ${agent.name}`);

    } catch (error: any) {
      logger.error(`Failed to execute signal for ${agent.name}:`, error.message);
    }
  }

  /**
   * Monitor positions and check for exits
   */
  async monitorPositions(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      for (const agent of this.activeAgents.values()) {
        const positions = this.paperAccountService.getPositions(agent.agent_id);

        for (const position of positions) {
          // Get current price from recent bars
          const recentBars = this.recentBars.get(position.ticker);
          if (!recentBars || recentBars.length === 0) {
            continue;
          }

          const currentBar = recentBars[recentBars.length - 1];

          // Update position with current price
          await this.paperAccountService.updatePositionPrice(
            agent.account_id,
            position.ticker,
            currentBar.close
          );

          // Check for exit conditions (simplified - use stop loss and take profit)
          await this.checkExitConditions(agent, position, currentBar);
        }

        // Update account equity
        await this.paperAccountService.updateEquity(agent.agent_id);
      }

    } catch (error: any) {
      logger.error('Error monitoring positions:', error.message);
    }
  }

  /**
   * Check exit conditions for a position using template-based exits
   */
  private async checkExitConditions(agent: PaperTradingAgent, position: any, bar: Bar): Promise<void> {
    try {
      // Get recent bars for this ticker (need prior bar for price action trailing)
      const recentBars = this.recentBars.get(position.ticker);
      if (!recentBars || recentBars.length < 2) {
        return; // Need at least 2 bars for template logic
      }

      const currentBar = recentBars[recentBars.length - 1];
      const priorBar = recentBars[recentBars.length - 2];

      // Get or initialize position metadata
      const positionKey = `${agent.agent_id}-${position.ticker}`;
      let metadata = this.positionMetadata.get(positionKey);

      // Build position object for template exits service
      const templatePosition = {
        side: position.side || 'LONG',
        entry_price: position.entry_price,
        current_price: bar.close,
        highest_price: position.highest_price || bar.high,
        lowest_price: position.lowest_price || bar.low,
        unrealized_pnl_percent: position.unrealized_pnl_percent,
        metadata: metadata
      };

      // Convert Bar to template service format
      const templateBar = {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        time_of_day: this.getTimeOfDay(bar.timestamp)
      };

      const templatePriorBar = {
        timestamp: priorBar.timestamp,
        open: priorBar.open,
        high: priorBar.high,
        low: priorBar.low,
        close: priorBar.close,
        volume: priorBar.volume,
        time_of_day: this.getTimeOfDay(priorBar.timestamp)
      };

      // Use template-based exit logic
      let exitDecision;
      if (agent.exit_strategy_config) {
        exitDecision = this.templateExits.checkExit(
          agent.exit_strategy_config,
          templatePosition,
          templateBar,
          templatePriorBar
        );
      } else {
        // Fallback to simple exit if no template configured
        exitDecision = this.templateExits.checkExit(
          { template: 'simple' },
          templatePosition,
          templateBar,
          templatePriorBar
        );
      }

      // Update metadata if changed
      if (exitDecision.updatedMetadata) {
        this.positionMetadata.set(positionKey, exitDecision.updatedMetadata);
      }

      // Execute exit if triggered
      if (exitDecision.shouldExit) {
        logger.info(
          `🎯 Exit triggered for ${position.ticker}: ${exitDecision.exitReason} ` +
          `(P&L: ${position.unrealized_pnl_percent.toFixed(2)}%)`
        );

        await this.virtualExecutor.executeMarketOrder(
          agent.agent_id,
          position.ticker,
          'sell',
          position.quantity,
          exitDecision.exitPrice
        );

        // Clean up metadata after exit
        this.positionMetadata.delete(positionKey);
      }

    } catch (error: any) {
      logger.error(`Error checking exit conditions for ${position.ticker}:`, error.message);
      // Don't throw - continue monitoring other positions
    }
  }

  /**
   * Extract time of day from timestamp
   */
  private getTimeOfDay(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toTimeString().split(' ')[0]; // Returns HH:MM:SS
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping Paper Trading Orchestrator');
    this.isRunning = false;

    // Clean up persistent script files
    for (const agent of this.activeAgents.values()) {
      if (agent.persistent_scan_script_path && fs.existsSync(agent.persistent_scan_script_path)) {
        try {
          fs.unlinkSync(agent.persistent_scan_script_path);
          logger.info(`Cleaned up persistent script for agent ${agent.name}`);
        } catch (e) {
          logger.warn(`Failed to clean up script for agent ${agent.name}`);
        }
      }
    }

    this.activeAgents.clear();
    this.recentBars.clear();
  }

  /**
   * Get orchestrator stats
   */
  getStats(): {
    active_agents: number;
    watched_tickers: number;
    is_running: boolean;
  } {
    return {
      active_agents: this.activeAgents.size,
      watched_tickers: this.getWatchedTickers().length,
      is_running: this.isRunning
    };
  }

  /**
   * Get agent performance summary
   */
  async getAgentPerformance(agentId: string): Promise<any> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in paper trading`);
    }

    const stats = this.paperAccountService.getPerformanceStats(agent.agent_id);
    const positions = this.paperAccountService.getPositions(agent.agent_id);
    const recentTrades = this.paperAccountService.getTrades(agent.agent_id, 20);

    return {
      agent_name: agent.name,
      account_id: agent.account_id,
      performance: stats,
      open_positions: positions,
      recent_trades: recentTrades
    };
  }
}
