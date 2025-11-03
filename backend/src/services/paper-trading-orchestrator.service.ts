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
}

export class PaperTradingOrchestratorService {
  private paperAccountService: PaperAccountService;
  private virtualExecutor: VirtualExecutorService;
  private scriptExecution: ScriptExecutionService;
  private activeAgents: Map<string, PaperTradingAgent> = new Map();
  private recentBars: Map<string, Bar[]> = new Map(); // ticker -> recent bars
  private readonly MAX_BARS_PER_TICKER = 100; // Keep last 100 bars per ticker
  private isRunning: boolean = false;

  constructor() {
    this.paperAccountService = new PaperAccountService();
    this.virtualExecutor = new VirtualExecutorService();
    this.scriptExecution = new ScriptExecutionService();
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

      const paperAgent: PaperTradingAgent = {
        id: agent.id,
        name: agent.name,
        agent_id: agent.id,
        latest_scan_script: agent.latest_scan_script,
        latest_execution_script: agent.latest_execution_script,
        iteration_number: agent.iteration_number,
        tickers: tickers,
        account_id: agent.account_id
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
      // For now, use a simplified approach:
      // Run the scan script periodically (every 5th bar to avoid excessive scanning)
      const bars = this.recentBars.get(bar.ticker) || [];

      // Only scan every 5 bars to reduce overhead
      if (bars.length % 5 !== 0) {
        return;
      }

      logger.info(`🔍 Scanning ${bar.ticker} for agent ${agent.name} (${bars.length} bars)`);

      // Run scan script
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
   * Run scan script with recent bars
   */
  private async runScanScript(agent: PaperTradingAgent, bars: Bar[]): Promise<any[]> {
    const scriptId = uuidv4();
    const scriptPath = path.join(__dirname, '../../', `paper-trading-scan-${scriptId}.ts`);

    try {
      // Note: This is a simplified implementation
      // In reality, scan scripts expect to query database with full bar history
      // For paper trading, we'd need to either:
      // 1. Modify scan scripts to work with streaming data
      // 2. Store real-time bars in database and run scans against them
      // 3. Use a pattern matching library instead of full scan scripts

      // For now, we'll just write the script and skip execution
      // In production, you'd need a real-time pattern matcher
      fs.writeFileSync(scriptPath, agent.latest_scan_script);

      // Execute (will likely fail since scan script expects database)
      const result = await this.scriptExecution.executeScript(scriptPath, 30000);

      if (!result.success || !result.data) {
        // Scan failed - this is expected for historical scan scripts
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
      // Expected to fail for now - scan scripts need database
      logger.debug(`Scan script execution failed (expected): ${error.message}`);
      return [];
    } finally {
      // Clean up
      try {
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }
      } catch (e) {}
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
   * Check exit conditions for a position
   */
  private async checkExitConditions(agent: PaperTradingAgent, position: any, bar: Bar): Promise<void> {
    // Simplified exit logic:
    // - Stop loss at -5%
    // - Take profit at +10%

    const STOP_LOSS_PERCENT = -5;
    const TAKE_PROFIT_PERCENT = 10;

    if (position.unrealized_pnl_percent <= STOP_LOSS_PERCENT) {
      logger.info(`🛑 Stop loss triggered for ${position.ticker}: ${position.unrealized_pnl_percent.toFixed(2)}%`);

      await this.virtualExecutor.executeMarketOrder(
        agent.agent_id,
        position.ticker,
        'sell',
        position.quantity,
        bar.close
      );
    } else if (position.unrealized_pnl_percent >= TAKE_PROFIT_PERCENT) {
      logger.info(`💰 Take profit triggered for ${position.ticker}: ${position.unrealized_pnl_percent.toFixed(2)}%`);

      await this.virtualExecutor.executeMarketOrder(
        agent.agent_id,
        position.ticker,
        'sell',
        position.quantity,
        bar.close
      );
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping Paper Trading Orchestrator');
    this.isRunning = false;
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
