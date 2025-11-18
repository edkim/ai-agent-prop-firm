/**
 * Real-Time Scanner Engine
 *
 * Scans all tickers against all active patterns on every bar update
 */

import { marketState } from '../data/market-state';
import { registry } from '../patterns/registry';
import { alertManager } from '../alerts/alert-manager';
import { SignalManager } from './signal-manager';
import { ScanResult } from '../patterns/types';
import logger from '../../services/logger.service';

export class Scanner {
  private signalManager = new SignalManager();
  private scanCount = 0;
  private isScanning = false;

  /**
   * Perform a full scan of all tickers
   */
  async scan(): Promise<ScanResult> {
    if (this.isScanning) {
      logger.warn('Scan already in progress, skipping...');
      return this.emptyResult();
    }

    this.isScanning = true;
    const startTime = Date.now();

    try {
      const patterns = registry.getActive();
      const tickers = marketState.getAllTickers();

      this.scanCount++;

      logger.info(`\n[Scan #${this.scanCount}] Scanning ${tickers.length} tickers with ${patterns.length} patterns...`);

      if (patterns.length === 0) {
        logger.warn('No active patterns registered!');
        return this.emptyResult();
      }

      let signalsFound = 0;

      // Scan all tickers × all patterns
      for (const ticker of tickers) {
        const state = marketState.getState(ticker);
        if (!state) continue;

        for (const pattern of patterns) {
          try {
            // Pre-filter if pattern defines it
            if (pattern.shouldScan && !pattern.shouldScan(state)) {
              continue;
            }

            // Check minimum bars
            if (pattern.minBars && state.bars.length < pattern.minBars) {
              continue;
            }

            // Run pattern scan
            const signal = pattern.scan(state);

            if (signal) {
              // Check if this is a new signal
              if (this.signalManager.isNew(signal)) {
                signalsFound++;
                this.signalManager.add(signal);

                // Send alert
                await alertManager.send(signal);
              }
            }
          } catch (error) {
            logger.error(`Error scanning ${ticker} with ${pattern.name}:`, error);
          }
        }
      }

      const durationMs = Date.now() - startTime;

      logger.info(`✓ Scan #${this.scanCount} complete: ${signalsFound} new signals in ${durationMs}ms`);

      return {
        scanId: this.scanCount,
        timestamp: Date.now(),
        tickersScanned: tickers.length,
        patternsRun: patterns.length,
        signalsFound,
        durationMs
      };
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get active signals
   */
  getActiveSignals() {
    return this.signalManager.getActive();
  }

  /**
   * Get scan statistics
   */
  getStats() {
    return {
      totalScans: this.scanCount,
      activeSignals: this.signalManager.getCount(),
      tickersTracked: marketState.getTickerCount(),
      activePatterns: registry.getActive().length
    };
  }

  /**
   * Clear signal history
   */
  clearSignals() {
    this.signalManager.clear();
  }

  private emptyResult(): ScanResult {
    return {
      scanId: this.scanCount,
      timestamp: Date.now(),
      tickersScanned: 0,
      patternsRun: 0,
      signalsFound: 0,
      durationMs: 0
    };
  }
}
