/**
 * Polygon Intraday Data Service
 * Fetches 5-minute bars from Polygon API and caches in database
 */

import axios from 'axios';
import { getDatabase } from '../database/db';
import logger from './logger.service';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

export interface IntradayBar {
  timestamp: number; // Unix timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PolygonBar {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

class PolygonIntradayService {
  /**
   * Fetch 5-minute bars for a ticker and date range
   * Returns cached data if available, otherwise fetches from Polygon
   */
  async fetch5MinBars(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<IntradayBar[]> {
    logger.info(`Fetching 5-min bars for ${ticker} (${startDate} to ${endDate})`);

    // Check cache first
    const cachedBars = await this.getCachedBars(ticker, startDate, endDate);

    if (cachedBars.length > 0) {
      logger.info(`✓ Using ${cachedBars.length} cached 5-min bars for ${ticker}`);
      return cachedBars;
    }

    // Fetch from Polygon if not cached
    logger.info(`📡 Fetching 5-min bars from Polygon for ${ticker}`);
    const bars = await this.fetchFromPolygon(ticker, startDate, endDate);

    if (bars.length === 0) {
      logger.warn(`⚠️  No intraday data found for ${ticker}`);
      return [];
    }

    // Save to cache
    await this.saveToDatabase(ticker, bars);
    logger.info(`✓ Fetched and cached ${bars.length} bars for ${ticker}`);

    return bars;
  }

  /**
   * Get cached 5-minute bars from database
   */
  private async getCachedBars(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<IntradayBar[]> {
    try {
      const db = getDatabase();

      const startTimestamp = new Date(startDate).getTime();
      const endTimestamp = new Date(endDate).getTime() + (24 * 60 * 60 * 1000); // Include full end day

      const stmt = db.prepare(`
        SELECT timestamp, open, high, low, close, volume
        FROM ohlcv_data
        WHERE ticker = ?
          AND timeframe = '5min'
          AND timestamp >= ?
          AND timestamp <= ?
        ORDER BY timestamp ASC
      `);

      const rows = stmt.all(ticker, startTimestamp, endTimestamp) as any[];

      return rows.map(row => ({
        timestamp: row.timestamp,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume
      }));
    } catch (error: any) {
      logger.error('Error fetching cached bars:', error);
      return [];
    }
  }

  /**
   * Fetch 5-minute bars from Polygon API
   */
  private async fetchFromPolygon(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<IntradayBar[]> {
    if (!POLYGON_API_KEY) {
      logger.error('POLYGON_API_KEY not set');
      return [];
    }

    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${startDate}/${endDate}`;

      const response = await axios.get(url, {
        params: {
          apiKey: POLYGON_API_KEY,
          adjusted: true,
          sort: 'asc',
          limit: 50000 // Maximum allowed by Polygon
        },
        timeout: 30000, // 30 second timeout
      });

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results.map((bar: PolygonBar) => ({
          timestamp: bar.t,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v
        }));
      }

      return [];
    } catch (error: any) {
      if (error.response?.status === 429) {
        logger.warn(`⚠️  Rate limited on ${ticker}, waiting 60s...`);
        await this.sleep(60000);
        return this.fetchFromPolygon(ticker, startDate, endDate);
      }

      logger.error(`Error fetching ${ticker} from Polygon:`, error.message);
      return [];
    }
  }

  /**
   * Save bars to database
   */
  private async saveToDatabase(
    ticker: string,
    bars: IntradayBar[]
  ): Promise<void> {
    try {
      const db = getDatabase();

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO ohlcv_data (
          ticker, timestamp, open, high, low, close, volume, timeframe
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '5min')
      `);

      const insertMany = db.transaction((bars: IntradayBar[]) => {
        for (const bar of bars) {
          insertStmt.run(
            ticker,
            bar.timestamp,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume
          );
        }
      });

      insertMany(bars);
    } catch (error: any) {
      logger.error('Error saving bars to database:', error);
      // Don't throw - caching is optional
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate date range for "5 days before/after" a signal end date
   */
  getIntradayDateRange(signalEndDate: string): { startDate: string; endDate: string } {
    const endDate = new Date(signalEndDate);

    // 5 trading days before (roughly 7 calendar days to be safe)
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    // 5 trading days after (roughly 7 calendar days to be safe)
    const actualEndDate = new Date(endDate);
    actualEndDate.setDate(actualEndDate.getDate() + 7);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: actualEndDate.toISOString().split('T')[0]
    };
  }
}

export default new PolygonIntradayService();
