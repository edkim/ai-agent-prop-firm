/**
 * Paper Trading Startup Service
 * Initializes and coordinates paper trading services for graduated agents
 */

import { RealtimeDataService } from './realtime-data.service';
import { PaperTradingOrchestratorService } from './paper-trading-orchestrator.service';
import { VirtualExecutorService } from './virtual-executor.service';
import logger from './logger.service';

export class PaperTradingStartupService {
  private realtimeDataService: RealtimeDataService;
  private orchestrator: PaperTradingOrchestratorService;
  private virtualExecutor: VirtualExecutorService;
  private positionMonitorInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.realtimeDataService = new RealtimeDataService();
    this.orchestrator = new PaperTradingOrchestratorService();
    this.virtualExecutor = new VirtualExecutorService();
  }

  /**
   * Start all paper trading services
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️  Paper trading services already running');
      return;
    }

    try {
      logger.info('🎓 Starting paper trading services...');
      logger.info('');

      // Step 1: Initialize orchestrator (loads paper_trading agents)
      logger.info('📋 Loading paper trading agents...');
      await this.orchestrator.initialize();

      const stats = this.orchestrator.getStats();

      if (stats.active_agents === 0) {
        logger.warn('⚠️  No agents in paper_trading status found');
        logger.warn('   Graduate an agent first using: npx ts-node helper-scripts/graduate-vwap-agent.ts');
        return;
      }

      logger.info(`✅ Loaded ${stats.active_agents} paper trading agent(s)`);
      logger.info('');

      // Step 2: Get tickers to watch
      const watchedTickers = this.orchestrator.getWatchedTickers();

      if (watchedTickers.length === 0) {
        logger.warn('⚠️  No tickers to watch (agents have no scan scripts)');
        return;
      }

      logger.info(`📊 Tickers to monitor: ${watchedTickers.length}`);
      logger.info(`   ${watchedTickers.join(', ')}`);
      logger.info('');

      // Step 3: Connect to Polygon for real-time data
      logger.info('🔌 Connecting to Polygon REST API...');
      await this.realtimeDataService.connect();
      logger.info('✅ Polygon connected (60s polling)');
      logger.info('');

      // Step 4: Subscribe to tickers
      logger.info(`📡 Subscribing to ${watchedTickers.length} tickers...`);
      await this.realtimeDataService.subscribeToTickers(watchedTickers);
      logger.info('✅ Subscriptions active');
      logger.info('');

      // Step 5: Register bar update callback
      logger.info('🔗 Wiring orchestrator to real-time data...');
      this.realtimeDataService.onBarUpdate(async (bar) => {
        try {
          // Forward bar to orchestrator for signal processing
          await this.orchestrator.processBar(bar);

          // Also forward to virtual executor for order fills
          await this.virtualExecutor.processBar(bar);
        } catch (error: any) {
          logger.error(`Error processing bar for ${bar.ticker}:`, error.message);
        }
      });
      logger.info('✅ Bar processing pipeline active');
      logger.info('');

      // Step 6: Start position monitoring loop (every 60 seconds)
      logger.info('👀 Starting position monitoring...');
      this.positionMonitorInterval = setInterval(async () => {
        try {
          await this.orchestrator.monitorPositions();
        } catch (error: any) {
          logger.error('Error in position monitoring:', error.message);
        }
      }, 60000); // 60 seconds
      logger.info('✅ Position monitoring active (60s interval)');
      logger.info('');

      this.isRunning = true;

      // Summary
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('💰 PAPER TRADING SYSTEM ACTIVE');
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('');
      logger.info('System is now:');
      logger.info(`  ✓ Running ${stats.active_agents} paper trading agent(s)`);
      logger.info(`  ✓ Monitoring ${watchedTickers.length} tickers in real-time`);
      logger.info('  ✓ Scanning for signals every 60 seconds');
      logger.info('  ✓ Simulating order fills with realistic slippage');
      logger.info('  ✓ Tracking positions and P&L');
      logger.info('  ✓ Auto-closing positions at stop/profit targets');
      logger.info('');
      logger.info('Virtual Accounts:');
      logger.info('  • Initial Balance: $100,000 per agent');
      logger.info('  • Max Position Size: 20% of equity');
      logger.info('  • Max Positions: 10 concurrent');
      logger.info('  • Stop Loss: -5%');
      logger.info('  • Take Profit: +10%');
      logger.info('');
      logger.info('View dashboard: http://localhost:5173');
      logger.info('');

    } catch (error: any) {
      logger.error('❌ Failed to start paper trading services:', error);
      throw error;
    }
  }

  /**
   * Stop all paper trading services
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('⚠️  Paper trading services not running');
      return;
    }

    try {
      logger.info('🛑 Stopping paper trading services...');

      // Stop position monitoring
      if (this.positionMonitorInterval) {
        clearInterval(this.positionMonitorInterval);
        this.positionMonitorInterval = null;
        logger.info('   ✅ Position monitoring stopped');
      }

      // Stop orchestrator
      await this.orchestrator.stop();
      logger.info('   ✅ Orchestrator stopped');

      // Disconnect from Polygon
      await this.realtimeDataService.disconnect();
      logger.info('   ✅ Polygon disconnected');

      this.isRunning = false;
      logger.info('✅ Paper trading services stopped');

    } catch (error: any) {
      logger.error('❌ Error stopping paper trading services:', error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    const realtimeStatus = this.realtimeDataService.getStatus();
    const orchestratorStats = this.orchestrator.getStats();
    const executorStats = this.virtualExecutor.getStats();

    return {
      isRunning: this.isRunning,
      polygonConnected: realtimeStatus.connected,
      subscribedTickers: realtimeStatus.subscribedTickers,
      activeAgents: orchestratorStats.active_agents,
      watchedTickers: orchestratorStats.watched_tickers,
      pendingOrders: executorStats.pending_orders,
      activeAccounts: executorStats.active_accounts
    };
  }

  /**
   * Restart services (stop then start)
   */
  async restart(): Promise<void> {
    logger.info('🔄 Restarting paper trading services...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.start();
  }

  /**
   * Get performance summary for all paper trading agents
   */
  async getPerformanceSummary(): Promise<any[]> {
    const stats = this.orchestrator.getStats();

    if (!stats.is_running || stats.active_agents === 0) {
      return [];
    }

    // TODO: Get agent IDs from orchestrator
    // For now, return empty array
    return [];
  }
}

// Singleton instance
const paperTradingStartupService = new PaperTradingStartupService();

export default paperTradingStartupService;
