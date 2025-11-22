/**
 * Real-Time Pattern Scanner
 *
 * Main entry point for the real-time scanning system.
 * Connects to Polygon websocket, maintains market state, and scans for patterns.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { PolygonStream } from './data/polygon-stream';
import { Scanner } from './engine/scanner';
import { registry } from './patterns/registry';
import { marketState } from './data/market-state';
import { GapAndHold } from './patterns/gap-and-hold';
import { NewSessionLow } from './patterns/new-session-low';
import { NewSessionHigh } from './patterns/new-session-high';
import { VWAPFade } from './patterns/vwap-fade';
import logger from '../services/logger.service';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

if (!POLYGON_API_KEY) {
  logger.error('POLYGON_API_KEY not found in environment variables');
  process.exit(1);
}

// Default tickers to scan (can be overridden via env)
const DEFAULT_TICKERS = [
  // Indices
  'QQQ', 'SPY', 'IWM',
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA',
  // Tech/Semis
  'AMD', 'INTC', 'AVGO', 'NFLX', 'CRM',
  // Crypto-adjacent (good for fade patterns)
  'ETHE', 'GBTC', 'MSTR', 'MARA', 'CLSK', 'RIOT',
  // Blue chips
  'BA', 'CAT', 'JPM', 'GS', 'V', 'MA',
  // Volatility
  'UVXY', 'SOXL', 'TQQQ'
];

const TICKERS = process.env.SCAN_TICKERS?.split(',') || DEFAULT_TICKERS;
const SCAN_INTERVAL_MS = 5 * 60 * 1000;  // Scan every 5 minutes

class RealTimeScanner {
  private stream: PolygonStream;
  private scanner: Scanner;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.stream = new PolygonStream(POLYGON_API_KEY!, TICKERS);
    this.scanner = new Scanner();

    // Register patterns
    this.registerPatterns();
  }

  /**
   * Register all patterns
   */
  private registerPatterns(): void {
    logger.info('Registering patterns...');

    // Register all patterns
    // registry.register(GapAndHold);
    registry.register(NewSessionLow);
    // registry.register(NewSessionHigh);
    // registry.register(VWAPFade);

    // Add more patterns here as they're created

    const summary = registry.getSummary();
    logger.info(`✓ Registered ${summary.total} patterns (${summary.enabled} enabled)`);
  }

  /**
   * Start the scanner
   */
  async start(): Promise<void> {
    logger.info('═'.repeat(60));
    logger.info('Real-Time Pattern Scanner');
    logger.info('═'.repeat(60));
    logger.info(`Tickers: ${TICKERS.length}`);
    logger.info(`Patterns: ${registry.getActive().length}`);
    logger.info(`Scan interval: ${SCAN_INTERVAL_MS / 1000}s`);
    logger.info('═'.repeat(60));

    try {
      // Connect to Polygon websocket
      await this.stream.connect();

      logger.info('✓ Real-time data stream started');

      // Start periodic scanning
      this.startScanning();

      // Handle graceful shutdown
      this.setupShutdownHandlers();

      logger.info('\n✓ Scanner is running. Press Ctrl+C to stop.\n');
      logger.info('Waiting for market data...');

      // Keep-alive heartbeat to show scanner is running
      setInterval(() => {
        const stats = this.scanner.getStats();
        logger.info(`[Heartbeat] Scans: ${stats.totalScans}, Active signals: ${stats.activeSignals}, Tickers: ${stats.tickersTracked}`);
      }, 60000);  // Every 60 seconds
    } catch (error) {
      logger.error('Failed to start scanner:', error);
      process.exit(1);
    }
  }

  /**
   * Start periodic scanning
   */
  private startScanning(): void {
    // Run initial scan after 10 seconds (give time for bars to accumulate)
    setTimeout(() => {
      this.scanner.scan();
    }, 10000);

    // Then scan every interval
    this.scanInterval = setInterval(() => {
      this.scanner.scan();
    }, SCAN_INTERVAL_MS);

    logger.info(`✓ Scanning every ${SCAN_INTERVAL_MS / 1000}s`);
  }

  /**
   * Stop the scanner
   */
  private async stop(): Promise<void> {
    logger.info('\nStopping scanner...');

    // Stop scanning
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    // Disconnect from stream
    this.stream.disconnect();

    // Print final stats
    const stats = this.scanner.getStats();
    const memStats = marketState.getMemoryStats();

    logger.info('\n' + '═'.repeat(60));
    logger.info('Final Statistics');
    logger.info('═'.repeat(60));
    logger.info(`Total scans: ${stats.totalScans}`);
    logger.info(`Active signals: ${stats.activeSignals}`);
    logger.info(`Tickers tracked: ${memStats.tickers}`);
    logger.info(`Total bars in memory: ${memStats.totalBars}`);
    logger.info(`Avg bars per ticker: ${memStats.avgBarsPerTicker.toFixed(1)}`);
    logger.info('═'.repeat(60));

    logger.info('\n✓ Scanner stopped');
    process.exit(0);
  }

  /**
   * Setup handlers for graceful shutdown
   */
  private setupShutdownHandlers(): void {
    process.on('SIGINT', () => {
      this.stop();
    });

    process.on('SIGTERM', () => {
      this.stop();
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      logger.error('Stack:', error.stack);
      // Don't stop - log and continue
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', reason);
      logger.error('Promise:', promise);
      // Don't stop - log and continue
    });
  }
}

// Start the scanner
const scanner = new RealTimeScanner();
scanner.start();
