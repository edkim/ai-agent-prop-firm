/**
 * Data Backfill Service
 * Automatically fetches the latest daily data for all tickers
 */

import { getDatabase } from '../database/db';
import axios from 'axios';
import logger from './logger.service';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface PolygonBar {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

class DataBackfillService {
  private isRunning = false;
  private lastRunTime: Date | null = null;

  /**
   * Check if backfill is needed (run once per hour max)
   */
  private shouldRun(): boolean {
    if (this.isRunning) {
      logger.info('⏭️  Data backfill already running, skipping...');
      return false;
    }

    if (this.lastRunTime) {
      const hoursSinceLastRun = (Date.now() - this.lastRunTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun < 1) {
        logger.info('⏭️  Data backfill ran recently, skipping...');
        return false;
      }
    }

    return true;
  }

  /**
   * Fetch latest daily data for all Russell 2000 tickers
   * Runs in the background without blocking the scan
   */
  async backfillLatestData(): Promise<void> {
    if (!this.shouldRun()) {
      return;
    }

    this.isRunning = true;
    this.lastRunTime = new Date();

    // Run in background - don't await
    this.performBackfill().catch(error => {
      logger.error('Error during data backfill:', error);
    }).finally(() => {
      this.isRunning = false;
    });

    logger.info('🔄 Data backfill started in background');
  }

  private async performBackfill(): Promise<void> {
    const db = getDatabase();

    // Get latest date in database
    const latestRow = db
      .prepare('SELECT MAX(date) as latest_date FROM daily_metrics')
      .get() as { latest_date: string | null };

    if (!latestRow?.latest_date) {
      logger.info('📊 No existing data found, skipping backfill');
      return;
    }

    const latestDate = new Date(latestRow.latest_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if we need to backfill
    const daysSinceLastUpdate = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastUpdate === 0) {
      logger.info('✅ Data is already up to date');
      return;
    }

    logger.info(`📅 Latest data: ${latestRow.latest_date}, backfilling ${daysSinceLastUpdate} days`);

    // Get all Russell 2000 tickers
    const tickers = db
      .prepare(
        `SELECT DISTINCT ticker FROM universe_stocks
         WHERE universe_id = (SELECT id FROM universe WHERE name = 'russell2000')`
      )
      .all() as { ticker: string }[];

    logger.info(`📊 Backfilling ${tickers.length} tickers`);

    const fromDate = new Date(latestDate);
    fromDate.setDate(fromDate.getDate() + 1);
    const toDate = new Date();

    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];

    let updated = 0;
    let errors = 0;

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      for (const { ticker } of batch) {
        try {
          const bars = await this.fetchHistoricalData(ticker, fromStr, toStr);
          if (bars.length > 0) {
            await this.insertBars(ticker, bars);
            updated++;
          }
        } catch (error: any) {
          errors++;
          logger.error(`Error backfilling ${ticker}:`, error.message);
        }

        // Small delay between requests
        await this.sleep(100);
      }

      // Longer delay between batches
      if (i + BATCH_SIZE < tickers.length) {
        await this.sleep(5000);
      }
    }

    logger.info(`✅ Backfill complete: ${updated} tickers updated, ${errors} errors`);
  }

  private async fetchHistoricalData(ticker: string, from: string, to: string): Promise<PolygonBar[]> {
    if (!POLYGON_API_KEY) {
      return [];
    }

    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`;
      const response = await axios.get(url, {
        params: { apiKey: POLYGON_API_KEY, limit: 500 },
        timeout: 10000,
      });

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results;
      }
      return [];
    } catch (error: any) {
      if (error.response?.status === 429) {
        // Rate limited - wait and retry once
        await this.sleep(60000);
        return this.fetchHistoricalData(ticker, from, to);
      }
      throw error;
    }
  }

  private async insertBars(ticker: string, bars: PolygonBar[]): Promise<void> {
    const db = getDatabase();

    // Get previous bars for computing metrics
    const previousBars = db
      .prepare(
        `SELECT * FROM daily_metrics
         WHERE ticker = ?
         ORDER BY date DESC
         LIMIT 200`
      )
      .all(ticker) as any[];

    previousBars.reverse();

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO daily_metrics (
        ticker, date, timestamp, open, high, low, close, volume,
        change_percent, change_from_open, volume_ratio, volume_20d_avg,
        high_low_range_percent, close_to_high_percent, close_to_low_percent,
        sma_20, sma_50, sma_200,
        price_to_sma20_percent, price_to_sma50_percent, price_to_sma200_percent,
        rsi_14, consecutive_up_days, consecutive_down_days,
        change_5d_percent, change_10d_percent, change_20d_percent
      ) VALUES (
        @ticker, @date, @timestamp, @open, @high, @low, @close, @volume,
        @change_percent, @change_from_open, @volume_ratio, @volume_20d_avg,
        @high_low_range_percent, @close_to_high_percent, @close_to_low_percent,
        @sma_20, @sma_50, @sma_200,
        @price_to_sma20_percent, @price_to_sma50_percent, @price_to_sma200_percent,
        @rsi_14, @consecutive_up_days, @consecutive_down_days,
        @change_5d_percent, @change_10d_percent, @change_20d_percent
      )
    `);

    for (const bar of bars) {
      const date = new Date(bar.t);
      const dateStr = date.toISOString().split('T')[0];

      // Compute metrics
      const prevBar = previousBars[previousBars.length - 1];
      const change_percent = prevBar ? ((bar.c - prevBar.close) / prevBar.close) * 100 : 0;
      const change_from_open = ((bar.c - bar.o) / bar.o) * 100;
      const high_low_range_percent = ((bar.h - bar.l) / bar.o) * 100;
      const close_to_high_percent = bar.h !== bar.l ? ((bar.c - bar.l) / (bar.h - bar.l)) * 100 : 0;
      const close_to_low_percent = bar.h !== bar.l ? ((bar.h - bar.c) / (bar.h - bar.l)) * 100 : 0;

      // Compute volume metrics
      let volume_ratio = null;
      let volume_20d_avg = null;
      if (previousBars.length >= 20) {
        const volumes = previousBars.slice(-20).map((b: any) => b.volume);
        volume_20d_avg = volumes.reduce((a: number, b: number) => a + b, 0) / 20;
        volume_ratio = bar.v / volume_20d_avg;
      }

      // Compute SMAs
      let sma_20 = null;
      let price_to_sma20_percent = null;
      if (previousBars.length >= 19) {
        const closes = [...previousBars.slice(-19).map((b: any) => b.close), bar.c];
        sma_20 = closes.reduce((a, b) => a + b, 0) / 20;
        price_to_sma20_percent = ((bar.c - sma_20) / sma_20) * 100;
      }

      let sma_50 = null;
      let price_to_sma50_percent = null;
      if (previousBars.length >= 49) {
        const closes = [...previousBars.slice(-49).map((b: any) => b.close), bar.c];
        sma_50 = closes.reduce((a, b) => a + b, 0) / 50;
        price_to_sma50_percent = ((bar.c - sma_50) / sma_50) * 100;
      }

      let sma_200 = null;
      let price_to_sma200_percent = null;
      if (previousBars.length >= 199) {
        const closes = [...previousBars.slice(-199).map((b: any) => b.close), bar.c];
        sma_200 = closes.reduce((a, b) => a + b, 0) / 200;
        price_to_sma200_percent = ((bar.c - sma_200) / sma_200) * 100;
      }

      // Compute multi-day changes
      let change_5d_percent = null;
      if (previousBars.length >= 5) {
        change_5d_percent = ((bar.c - previousBars[previousBars.length - 5].close) / previousBars[previousBars.length - 5].close) * 100;
      }

      let change_10d_percent = null;
      if (previousBars.length >= 10) {
        change_10d_percent = ((bar.c - previousBars[previousBars.length - 10].close) / previousBars[previousBars.length - 10].close) * 100;
      }

      let change_20d_percent = null;
      if (previousBars.length >= 20) {
        change_20d_percent = ((bar.c - previousBars[previousBars.length - 20].close) / previousBars[previousBars.length - 20].close) * 100;
      }

      insertStmt.run({
        ticker,
        date: dateStr,
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        change_percent,
        change_from_open,
        volume_ratio,
        volume_20d_avg,
        high_low_range_percent,
        close_to_high_percent,
        close_to_low_percent,
        sma_20,
        sma_50,
        sma_200,
        price_to_sma20_percent,
        price_to_sma50_percent,
        price_to_sma200_percent,
        rsi_14: null, // Would need full RSI calculation
        consecutive_up_days: 0, // Would need full calculation
        consecutive_down_days: 0,
        change_5d_percent,
        change_10d_percent,
        change_20d_percent,
      });

      // Add to previous bars for next iteration
      previousBars.push({
        ticker,
        date: dateStr,
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      });

      // Keep only last 200 for memory efficiency
      if (previousBars.length > 200) {
        previousBars.shift();
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new DataBackfillService();
