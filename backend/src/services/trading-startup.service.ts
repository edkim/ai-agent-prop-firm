/**
 * Trading Startup Service
 * Coordinates the initialization and startup of all trading services
 */

import { RealtimeDataService } from './realtime-data.service';
import { RealtimeScannerService } from './realtime-scanner.service';
import { ExecutionEngineService } from './execution-engine.service';
import { PositionMonitorService } from './position-monitor.service';
import tradingAgentService from './live-trading-agent.service';
import logger from './logger.service';

export class TradingStartupService {
  private realtimeDataService: RealtimeDataService;
  private realtimeScannerService: RealtimeScannerService;
  private executionEngineService: ExecutionEngineService;
  private positionMonitorService: PositionMonitorService;
  private isRunning: boolean = false;

  constructor() {
    this.realtimeDataService = new RealtimeDataService();
    this.realtimeScannerService = new RealtimeScannerService();
    this.executionEngineService = new ExecutionEngineService();
    this.positionMonitorService = new PositionMonitorService();
  }

  /**
   * Start all trading services
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️  Trading services already running');
      return;
    }

    try {
      logger.info('🚀 Starting autonomous trading services...');
      logger.info('');

      // Get configuration from environment
      const watchlistTickers = this.getWatchlistTickers();
      const timeframe = process.env.TRADING_TIMEFRAME || '5min';
      const autoExecutionEnabled = process.env.AUTO_EXECUTION_ENABLED === 'true';

      logger.info('📋 Configuration:');
      logger.info(`   Timeframe: ${timeframe}`);
      logger.info(`   Auto-execution: ${autoExecutionEnabled ? 'ENABLED ✅' : 'DISABLED (manual approval) ⏸️'}`);
      logger.info(`   Watchlist: ${watchlistTickers.length} tickers`);
      logger.info('');

      // Step 1: Get active trading agents
      const activeAgents = tradingAgentService.getAllAgents(true);

      if (activeAgents.length === 0) {
        logger.warn('⚠️  No active trading agents found. Skipping trading service startup.');
        logger.warn('   Create and activate an agent via the dashboard first.');
        return;
      }

      logger.info(`👥 Active Agents: ${activeAgents.length}`);
      activeAgents.forEach(agent => {
        logger.info(`   - ${agent.name} (${agent.timeframe})`);
        logger.info(`     Patterns: ${agent.strategies.join(', ')}`);
        logger.info(`     Risk: $${agent.riskLimits.maxPositionSize}/trade, $${agent.riskLimits.maxDailyLoss} daily loss limit`);
      });
      logger.info('');

      // Step 2: Connect to Polygon WebSocket for real-time data
      logger.info('🔌 Connecting to Polygon WebSocket...');
      await this.realtimeDataService.connect();
      logger.info('✅ WebSocket connected');
      logger.info('');

      // Step 3: Subscribe to watchlist tickers
      logger.info(`📡 Subscribing to ${watchlistTickers.length} tickers...`);
      await this.realtimeDataService.subscribeToTickers(watchlistTickers);
      logger.info(`✅ Subscribed to: ${watchlistTickers.join(', ')}`);
      logger.info('');

      // Step 4: Set up real-time bar handler for pattern detection
      logger.info('🔍 Initializing pattern scanner...');
      this.realtimeDataService.onBarUpdate(async (bar) => {
        try {
          // Scan for patterns on each new bar
          const signals = await this.realtimeScannerService.scanForPatterns(bar);

          if (signals.length > 0) {
            logger.info(`📊 ${signals.length} pattern(s) detected on ${bar.ticker}`);

            // Process each signal through execution engine
            for (const signal of signals) {
              await this.executionEngineService.processSignal(signal);
            }
          }
        } catch (error: any) {
          logger.error(`Error processing bar for ${bar.ticker}:`, error.message);
        }
      });
      logger.info('✅ Pattern scanner active');
      logger.info('');

      // Step 5: Start position monitoring for all active agents
      logger.info('👀 Starting position monitors...');
      for (const agent of activeAgents) {
        this.positionMonitorService.startMonitoring(agent.id);
        logger.info(`   ✅ Monitoring ${agent.name}`);
      }
      logger.info('');

      this.isRunning = true;

      // Summary
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('🎯 AUTONOMOUS TRADING SYSTEM ACTIVE');
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('');
      logger.info('System is now:');
      logger.info('  ✓ Monitoring real-time market data');
      logger.info('  ✓ Detecting bull flag & ascending triangle patterns');
      logger.info('  ✓ Analyzing signals with Claude AI');
      logger.info('  ✓ Running risk checks on all trades');
      if (autoExecutionEnabled) {
        logger.info('  ✓ Executing trades autonomously');
      } else {
        logger.info('  ⏸️  Awaiting manual approval for each trade');
      }
      logger.info('  ✓ Monitoring open positions');
      logger.info('  ✓ Managing stops and take profits');
      logger.info('');
      logger.info('View dashboard: http://localhost:5173');
      logger.info('');

      // Log activity
      for (const agent of activeAgents) {
        tradingAgentService.logActivity(
          agent.id,
          'SYSTEM_START',
          'Trading services started - autonomous mode active',
          undefined,
          {
            watchlist: watchlistTickers,
            autoExecution: autoExecutionEnabled,
            timeframe
          }
        );
      }

    } catch (error: any) {
      logger.error('❌ Failed to start trading services:', error);
      throw error;
    }
  }

  /**
   * Stop all trading services
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('⚠️  Trading services not running');
      return;
    }

    try {
      logger.info('🛑 Stopping trading services...');

      // Stop position monitoring
      const activeAgents = tradingAgentService.getAllAgents(true);
      for (const agent of activeAgents) {
        this.positionMonitorService.stopMonitoring(agent.id);
        logger.info(`   ✅ Stopped monitoring ${agent.name}`);

        // Log activity
        tradingAgentService.logActivity(
          agent.id,
          'SYSTEM_STOP',
          'Trading services stopped',
          undefined,
          {}
        );
      }

      // Disconnect WebSocket
      await this.realtimeDataService.disconnect();
      logger.info('✅ WebSocket disconnected');

      this.isRunning = false;
      logger.info('✅ Trading services stopped');

    } catch (error: any) {
      logger.error('❌ Error stopping trading services:', error);
      throw error;
    }
  }

  /**
   * Get watchlist tickers from environment
   */
  private getWatchlistTickers(): string[] {
    const watchlistEnv = process.env.WATCHLIST_TICKERS || '';

    if (!watchlistEnv) {
      logger.warn('⚠️  WATCHLIST_TICKERS not set, using defaults');
      return ['SPY', 'QQQ', 'IWM']; // Default watchlist
    }

    return watchlistEnv.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  /**
   * Get service status
   */
  getStatus() {
    const realtimeStatus = this.realtimeDataService.getStatus();

    return {
      isRunning: this.isRunning,
      websocketConnected: realtimeStatus.connected,
      subscribedTickers: realtimeStatus.subscribedTickers,
      activeAgents: tradingAgentService.getAllAgents(true).length,
    };
  }

  /**
   * Restart services (stop then start)
   */
  async restart(): Promise<void> {
    logger.info('🔄 Restarting trading services...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.start();
  }
}

// Singleton instance
const tradingStartupService = new TradingStartupService();

export default tradingStartupService;
