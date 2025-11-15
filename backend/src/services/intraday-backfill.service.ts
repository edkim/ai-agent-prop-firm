/**
 * Intraday Data Backfill Service
 * Fetches historical 5-minute bar data for specified universe
 */

import { getDatabase } from '../database/db';
import polygonService from './polygon.service';
import logger from './logger.service';
import * as fs from 'fs';
import * as path from 'path';

interface BackfillProgress {
  universe: string;
  startDate: string;
  endDate: string;
  totalTickers: number;
  completedTickers: string[];
  failedTickers: Array<{ ticker: string; error: string }>;
  lastUpdated: string;
  estimatedCompletion?: string;
}

interface BackfillOptions {
  universe?: string;
  months?: number;
  tickers?: string[];
  delayMs?: number;
  batchSize?: number;
  startDate?: string; // Custom start date (YYYY-MM-DD) for walk-forward
  endDate?: string;   // Custom end date (YYYY-MM-DD) for walk-forward
}

class IntradayBackfillService {
  private progressFilePath = path.join(__dirname, '../../backfill-progress-intraday.json');

  /**
   * Backfill 5-minute data for a universe
   */
  async backfillUniverse(options: BackfillOptions = {}): Promise<void> {
    const {
      universe = 'russell2000',
      months = 3,
      tickers: customTickers,
      delayMs = 1000, // 1 second for paid tier
      batchSize = 50,
    } = options;

    logger.info(`🚀 Starting intraday backfill for ${universe}...`);

    // Calculate date range
    // Support custom date ranges for walk-forward analysis
    const endDate = options.endDate ? new Date(options.endDate) : new Date();
    const startDate = options.startDate 
      ? new Date(options.startDate)
      : (() => {
          const d = new Date();
          d.setMonth(d.getMonth() - months);
          return d;
        })();

    const startDateStr = this.formatDate(startDate);
    const endDateStr = this.formatDate(endDate);

    logger.info(`📊 Date range: ${startDateStr} to ${endDateStr} (${months} months)`);

    // Get tickers
    const tickers = customTickers || this.getUniverseTickers(universe);
    logger.info(`📈 Found ${tickers.length} ${customTickers ? 'custom' : 'active'} tickers`);

    // Load or initialize progress
    const progress = this.loadProgress(universe, startDateStr, endDateStr, tickers);

    // Filter out already completed tickers
    const remainingTickers = tickers.filter(t => !progress.completedTickers.includes(t));

    if (remainingTickers.length === 0) {
      logger.info('✅ All tickers already have data! Backfill complete.');
      return;
    }

    logger.info(`📋 Resuming: ${remainingTickers.length} tickers remaining`);
    logger.info(`✓ Already completed: ${progress.completedTickers.length} tickers`);
    if (progress.failedTickers.length > 0) {
      logger.info(`⚠️  Previously failed: ${progress.failedTickers.length} tickers`);
    }

    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    // Process in batches
    let completed = progress.completedTickers.length;
    let failed = progress.failedTickers.length;

    for (let i = 0; i < remainingTickers.length; i += batchSize) {
      const batch = remainingTickers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(remainingTickers.length / batchSize);

      logger.info(`\n📦 Batch ${batchNum}/${totalBatches} (tickers ${i + 1}-${Math.min(i + batchSize, remainingTickers.length)}):`);

      for (const ticker of batch) {
        try {
          // Check if data already exists
          const hasData = await polygonService.hasData(ticker, '5min', startTimestamp, endTimestamp);

          if (hasData) {
            logger.info(`  ✓ ${ticker}: Data already cached`);
            progress.completedTickers.push(ticker);
            completed++;
          } else {
            // Fetch data
            const barCount = await polygonService.fetchAndStore(ticker, '5min', startDateStr, endDateStr);

            if (barCount > 0) {
              logger.info(`  ✓ ${ticker}: Fetched ${barCount} bars`);
              progress.completedTickers.push(ticker);
              completed++;
            } else {
              logger.info(`  ⚠️  ${ticker}: No data available`);
              progress.failedTickers.push({ ticker, error: 'No data available' });
              failed++;
            }
          }
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          logger.error(`  ❌ ${ticker}: ${errorMsg}`);
          progress.failedTickers.push({ ticker, error: errorMsg });
          failed++;

          // If rate limited, wait longer
          if (error.message?.includes('429')) {
            logger.info('  ⏳ Rate limited, waiting 60 seconds...');
            await this.sleep(60000);
          }
        }

        // Save progress after each ticker
        progress.lastUpdated = new Date().toISOString();
        this.saveProgress(progress);

        // Delay between tickers
        if (i + batch.indexOf(ticker) < remainingTickers.length - 1) {
          await this.sleep(delayMs);
        }
      }

      // Log progress
      const percentComplete = ((completed + failed) / tickers.length * 100).toFixed(1);
      const elapsed = Date.now() - new Date(progress.lastUpdated).getTime();
      const estimatedTotal = elapsed / (completed + failed) * tickers.length;
      const remaining = estimatedTotal - elapsed;

      logger.info(`\n📊 Progress: ${completed + failed}/${tickers.length} (${percentComplete}%)`);
      logger.info(`   ✅ Successful: ${completed}`);
      logger.info(`   ⚠️  Skipped/Failed: ${failed}`);
      if (remaining > 0) {
        const eta = new Date(Date.now() + remaining);
        logger.info(`   ⏱️  ETA: ${this.formatDuration(remaining)} (${eta.toLocaleTimeString()})`);
      }

      // Longer delay between batches
      if (i + batchSize < remainingTickers.length) {
        logger.info('⏸️  Batch complete, cooling down for 5 seconds...');
        await this.sleep(5000);
      }
    }

    // Final summary
    logger.info('\n' + '='.repeat(60));
    logger.info('✅ Backfill complete!');
    logger.info(`📊 Successfully fetched: ${completed} tickers`);
    if (failed > 0) {
      logger.info(`❌ Failed/No data: ${failed} tickers`);
      logger.info(`   (See ${this.progressFilePath} for details)`);
    }

    // Get database size
    const db = getDatabase();
    const sizeResult = db.prepare(`
      SELECT COUNT(*) as count FROM ohlcv_data WHERE timeframe = '5min'
    `).get() as { count: number };
    logger.info(`💾 Total 5-min bars in database: ${sizeResult.count.toLocaleString()}`);
    logger.info('='.repeat(60));

    // Clean up progress file on success
    if (failed === 0 && remainingTickers.length === tickers.length) {
      this.deleteProgressFile();
    }
  }

  /**
   * Get tickers from universe
   */
  private getUniverseTickers(universeName: string): string[] {
    const db = getDatabase();

    const tickers = db.prepare(`
      SELECT DISTINCT ticker FROM universe_stocks
      WHERE universe_id = (SELECT id FROM universe WHERE name = ?)
      AND is_active = 1
      ORDER BY ticker ASC
    `).all(universeName) as { ticker: string }[];

    return tickers.map(t => t.ticker);
  }

  /**
   * Load or initialize progress
   */
  private loadProgress(universe: string, startDate: string, endDate: string, allTickers: string[]): BackfillProgress {
    if (fs.existsSync(this.progressFilePath)) {
      try {
        const data = fs.readFileSync(this.progressFilePath, 'utf-8');
        const progress = JSON.parse(data) as BackfillProgress;

        // Verify progress matches current parameters
        if (progress.universe === universe &&
            progress.startDate === startDate &&
            progress.endDate === endDate) {
          logger.info('📂 Loaded existing progress file');
          return progress;
        } else {
          logger.info('🔄 Parameters changed, starting fresh backfill');
        }
      } catch (error) {
        logger.warn('⚠️  Could not parse progress file, starting fresh');
      }
    }

    // Initialize new progress
    return {
      universe,
      startDate,
      endDate,
      totalTickers: allTickers.length,
      completedTickers: [],
      failedTickers: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Save progress to file
   */
  private saveProgress(progress: BackfillProgress): void {
    fs.writeFileSync(this.progressFilePath, JSON.stringify(progress, null, 2));
  }

  /**
   * Delete progress file
   */
  private deleteProgressFile(): void {
    if (fs.existsSync(this.progressFilePath)) {
      fs.unlinkSync(this.progressFilePath);
      logger.info('🗑️  Removed progress file (backfill complete)');
    }
  }

  /**
   * Get backfill status
   */
  getStatus(): BackfillProgress | null {
    if (fs.existsSync(this.progressFilePath)) {
      try {
        const data = fs.readFileSync(this.progressFilePath, 'utf-8');
        return JSON.parse(data) as BackfillProgress;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new IntradayBackfillService();
