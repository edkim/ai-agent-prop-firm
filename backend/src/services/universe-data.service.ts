/**
 * Universe Data Service
 *
 * Manages stock universes, data backfilling, and daily metrics calculation
 */

import { getDatabase } from '../database/db';
import polygonService from './polygon.service';
import { OHLCVBar } from '../types/strategy.types';

export interface Universe {
  id: number;
  name: string;
  description?: string;
  total_stocks: number;
  created_at: string;
  updated_at: string;
}

export interface UniverseStock {
  id: number;
  universe_id: number;
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  is_active: number;
  added_at: string;
}

export interface DailyMetrics {
  id?: number;
  ticker: string;
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_percent?: number;
  change_from_open?: number;
  volume_ratio?: number;
  volume_20d_avg?: number;
  high_low_range_percent?: number;
  close_to_high_percent?: number;
  close_to_low_percent?: number;
  sma_20?: number;
  sma_50?: number;
  sma_200?: number;
  price_to_sma20_percent?: number;
  price_to_sma50_percent?: number;
  price_to_sma200_percent?: number;
  rsi_14?: number;
  consecutive_up_days?: number;
  consecutive_down_days?: number;
  change_5d_percent?: number;
  change_10d_percent?: number;
  change_20d_percent?: number;
}

export class UniverseDataService {
  /**
   * Create a new universe
   */
  async createUniverse(name: string, description?: string): Promise<Universe> {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO universe (name, description, total_stocks)
      VALUES (?, ?, 0)
    `);

    const result = stmt.run(name, description || null);

    const universe = db.prepare('SELECT * FROM universe WHERE id = ?').get(result.lastInsertRowid) as Universe;

    console.log(`✅ Created universe: ${name} (ID: ${universe.id})`);

    return universe;
  }

  /**
   * Get universe by name
   */
  async getUniverseByName(name: string): Promise<Universe | null> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM universe WHERE name = ?');
    return stmt.get(name) as Universe | null;
  }

  /**
   * Get all universes
   */
  async getUniverses(): Promise<Universe[]> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM universe ORDER BY name');
    return stmt.all() as Universe[];
  }

  /**
   * Add tickers to a universe
   */
  async addTickersToUniverse(universeId: number, tickers: string[]): Promise<number> {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO universe_stocks (universe_id, ticker, is_active)
      VALUES (?, ?, 1)
    `);

    let addedCount = 0;

    const insertMany = db.transaction((tickers: string[]) => {
      for (const ticker of tickers) {
        const result = stmt.run(universeId, ticker.toUpperCase());
        if (result.changes > 0) {
          addedCount++;
        }
      }
    });

    insertMany(tickers);

    // Update universe total_stocks count
    db.prepare('UPDATE universe SET total_stocks = (SELECT COUNT(*) FROM universe_stocks WHERE universe_id = ? AND is_active = 1) WHERE id = ?')
      .run(universeId, universeId);

    console.log(`✅ Added ${addedCount} tickers to universe ${universeId}`);

    return addedCount;
  }

  /**
   * Get tickers in a universe
   */
  async getUniverseTickers(universeId: number, activeOnly: boolean = true): Promise<string[]> {
    const db = getDatabase();

    let query = 'SELECT ticker FROM universe_stocks WHERE universe_id = ?';
    if (activeOnly) {
      query += ' AND is_active = 1';
    }
    query += ' ORDER BY ticker';

    const stmt = db.prepare(query);
    const rows = stmt.all(universeId) as { ticker: string }[];

    return rows.map(row => row.ticker);
  }

  /**
   * Backfill daily data for an entire universe
   * NOTE: Only daily data is backfilled. Intraday data is fetched on-demand.
   */
  async backfillUniverseData(
    universeName: string,
    startDate: string,
    endDate: string,
    batchSize: number = 10
  ): Promise<void> {
    console.log(`\n📊 Starting backfill for ${universeName} universe...`);
    console.log(`   Date range: ${startDate} to ${endDate}`);
    console.log(`   Batch size: ${batchSize} tickers at a time\n`);

    // Get universe
    const universe = await this.getUniverseByName(universeName);
    if (!universe) {
      throw new Error(`Universe not found: ${universeName}`);
    }

    // Get all tickers
    const tickers = await this.getUniverseTickers(universe.id);
    console.log(`Found ${tickers.length} tickers in ${universeName} universe\n`);

    // Process in batches to avoid rate limiting
    let completedCount = 0;
    let failedCount = 0;
    const failedTickers: string[] = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(tickers.length / batchSize);

      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(ticker => this.backfillTickerDaily(ticker, startDate, endDate))
      );

      // Count results
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          completedCount++;
        } else {
          failedCount++;
          failedTickers.push(batch[j]);
          console.error(`   ❌ Failed to backfill ${batch[j]}: ${result.reason}`);
        }
      }

      console.log(`   ✅ Batch ${batchNum} completed: ${results.filter(r => r.status === 'fulfilled').length}/${batch.length} successful`);

      // Rate limiting delay between batches (Polygon has rate limits)
      if (i + batchSize < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ Backfill completed!`);
    console.log(`   Successful: ${completedCount}/${tickers.length}`);
    if (failedCount > 0) {
      console.log(`   Failed: ${failedCount}/${tickers.length}`);
      console.log(`   Failed tickers: ${failedTickers.join(', ')}`);
    }

    // Calculate daily metrics for all tickers
    console.log(`\n📈 Calculating daily metrics...`);
    await this.calculateDailyMetricsForUniverse(universeName, startDate, endDate);
  }

  /**
   * Backfill daily data for a single ticker
   */
  private async backfillTickerDaily(ticker: string, startDate: string, endDate: string): Promise<number> {
    // Check if data already exists
    const hasData = await polygonService.hasData(ticker, '1day', new Date(startDate).getTime(), new Date(endDate).getTime());

    if (hasData) {
      console.log(`   ⏭️  Skipping ${ticker} (data already exists)`);
      return 0;
    }

    // Fetch and store
    try {
      const count = await polygonService.fetchAndStore(ticker, '1day', startDate, endDate);
      if (count > 0) {
        console.log(`   ✅ ${ticker}: ${count} daily bars`);
      } else {
        console.log(`   ⚠️  ${ticker}: No data available`);
      }
      return count;
    } catch (error: any) {
      console.error(`   ❌ ${ticker}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch intraday data on-demand (for chart generation)
   * Caches the data in the database for future use
   */
  async fetchIntradayDataOnDemand(
    ticker: string,
    startDate: string,
    endDate: string,
    timeframe: '1min' | '5min' | '15min' | '30min' = '5min'
  ): Promise<OHLCVBar[]> {
    console.log(`📈 Fetching ${timeframe} data for ${ticker} (${startDate} to ${endDate})...`);

    // Check if already in database (cached from previous fetch)
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate).getTime();

    const cachedData = await polygonService.getHistoricalData(ticker, timeframe, startTimestamp, endTimestamp);

    if (cachedData && cachedData.length > 0) {
      console.log(`   ✓ Using cached data (${cachedData.length} bars)`);
      return cachedData;
    }

    // Fetch from Polygon
    try {
      await polygonService.fetchAndStore(ticker, timeframe, startDate, endDate);

      // Retrieve the stored data
      const data = await polygonService.getHistoricalData(ticker, timeframe, startTimestamp, endTimestamp);

      console.log(`   ✓ Fetched and cached ${data.length} bars`);
      return data;
    } catch (error: any) {
      console.error(`   ❌ Failed to fetch intraday data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate daily metrics for all tickers in a universe
   */
  async calculateDailyMetricsForUniverse(universeName: string, startDate: string, endDate: string): Promise<void> {
    const universe = await this.getUniverseByName(universeName);
    if (!universe) {
      throw new Error(`Universe not found: ${universeName}`);
    }

    const tickers = await this.getUniverseTickers(universe.id);
    console.log(`Calculating daily metrics for ${tickers.length} tickers...`);

    let completedCount = 0;

    for (const ticker of tickers) {
      try {
        await this.calculateDailyMetricsForTicker(ticker, startDate, endDate);
        completedCount++;

        if (completedCount % 50 === 0) {
          console.log(`   Progress: ${completedCount}/${tickers.length} tickers`);
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to calculate metrics for ${ticker}: ${error.message}`);
      }
    }

    console.log(`✅ Daily metrics calculated for ${completedCount}/${tickers.length} tickers`);
  }

  /**
   * Calculate daily metrics for a single ticker
   */
  private async calculateDailyMetricsForTicker(ticker: string, startDate: string, endDate: string): Promise<void> {
    // Get daily bars from database (extended range for calculations)
    const extendedStart = this.subtractDays(startDate, 250); // Need extra days for 200-day SMA
    const startTimestamp = new Date(extendedStart).getTime();
    const endTimestamp = new Date(endDate).getTime();

    const bars = await polygonService.getHistoricalData(ticker, '1day', startTimestamp, endTimestamp);

    if (bars.length === 0) {
      return;
    }

    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO daily_metrics (
        ticker, date, timestamp, open, high, low, close, volume,
        change_percent, change_from_open, volume_ratio, volume_20d_avg,
        high_low_range_percent, close_to_high_percent, close_to_low_percent,
        sma_20, sma_50, sma_200,
        price_to_sma20_percent, price_to_sma50_percent, price_to_sma200_percent,
        rsi_14, consecutive_up_days, consecutive_down_days,
        change_5d_percent, change_10d_percent, change_20d_percent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let consecutiveUp = 0;
    let consecutiveDown = 0;

    const transaction = db.transaction(() => {
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        const date = new Date(bar.timestamp).toISOString().split('T')[0];

        // Basic price metrics
        const change_percent = i > 0 ? ((bar.close - bars[i - 1].close) / bars[i - 1].close) * 100 : 0;
        const change_from_open = ((bar.close - bar.open) / bar.open) * 100;

        // Volume metrics
        const volume_20d_avg = this.calculateAverage(bars.slice(Math.max(0, i - 20), i).map(b => b.volume));
        const volume_ratio = volume_20d_avg > 0 ? bar.volume / volume_20d_avg : 1;

        // Range metrics
        const high_low_range_percent = ((bar.high - bar.low) / bar.open) * 100;
        const close_to_high_percent = bar.high > bar.low ? ((bar.close - bar.low) / (bar.high - bar.low)) * 100 : 50;
        const close_to_low_percent = 100 - close_to_high_percent;

        // Moving averages
        const sma_20 = this.calculateSMA(bars.slice(Math.max(0, i - 19), i + 1).map(b => b.close));
        const sma_50 = this.calculateSMA(bars.slice(Math.max(0, i - 49), i + 1).map(b => b.close));
        const sma_200 = this.calculateSMA(bars.slice(Math.max(0, i - 199), i + 1).map(b => b.close));

        // Price to MA percentages
        const price_to_sma20_percent = sma_20 ? ((bar.close - sma_20) / sma_20) * 100 : null;
        const price_to_sma50_percent = sma_50 ? ((bar.close - sma_50) / sma_50) * 100 : null;
        const price_to_sma200_percent = sma_200 ? ((bar.close - sma_200) / sma_200) * 100 : null;

        // RSI
        const rsi_14 = this.calculateRSI(bars.slice(Math.max(0, i - 14), i + 1).map(b => b.close));

        // Consecutive days
        if (i > 0) {
          if (bar.close > bars[i - 1].close) {
            consecutiveUp++;
            consecutiveDown = 0;
          } else if (bar.close < bars[i - 1].close) {
            consecutiveDown++;
            consecutiveUp = 0;
          }
        }

        // Multi-day changes
        const change_5d_percent = i >= 5 ? ((bar.close - bars[i - 5].close) / bars[i - 5].close) * 100 : null;
        const change_10d_percent = i >= 10 ? ((bar.close - bars[i - 10].close) / bars[i - 10].close) * 100 : null;
        const change_20d_percent = i >= 20 ? ((bar.close - bars[i - 20].close) / bars[i - 20].close) * 100 : null;

        stmt.run(
          ticker, date, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume,
          change_percent, change_from_open, volume_ratio, volume_20d_avg,
          high_low_range_percent, close_to_high_percent, close_to_low_percent,
          sma_20, sma_50, sma_200,
          price_to_sma20_percent, price_to_sma50_percent, price_to_sma200_percent,
          rsi_14, consecutiveUp, consecutiveDown,
          change_5d_percent, change_10d_percent, change_20d_percent
        );
      }
    });

    transaction();
  }

  /**
   * Get daily metrics for a ticker in a date range
   */
  async getDailyMetrics(ticker: string, startDate: string, endDate: string): Promise<DailyMetrics[]> {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM daily_metrics
      WHERE ticker = ? AND date >= ? AND date <= ?
      ORDER BY date ASC
    `);

    return stmt.all(ticker, startDate, endDate) as DailyMetrics[];
  }

  /**
   * Get daily OHLCV bars for chart generation
   * Returns minimal data needed for charting (no computed metrics)
   */
  async getDailyBarsForChart(ticker: string, startDate: string, endDate: string): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    const db = getDatabase();

    const stmt = db.prepare(`
      SELECT date, open, high, low, close, volume
      FROM daily_metrics
      WHERE ticker = ? AND date >= ? AND date <= ?
      ORDER BY date ASC
    `);

    return stmt.all(ticker, startDate, endDate) as Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  }

  // Helper methods

  private calculateSMA(values: number[]): number | null {
    if (values.length === 0) return null;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  private subtractDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}

// Export singleton instance
export default new UniverseDataService();
