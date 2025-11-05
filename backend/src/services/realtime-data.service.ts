/**
 * Real-Time Data Service (REST API Polling)
 * Polls Polygon.io REST API for latest 5-minute bars
 */

import { getDatabase } from '../database/db';
import { PolygonService } from './polygon.service';
import logger from './logger.service';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

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

class RealtimeDataService {
  private polygonService: PolygonService;
  private subscribedTickers: Set<string> = new Set();
  private isConnected: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private dataCallbacks: ((bar: Bar) => void)[] = [];
  private lastFetchTimestamps: Map<string, number> = new Map();
  private readonly POLL_INTERVAL_MS = 300000; // 5 minutes (matches 5-min bar timeframe)
  private readonly TIMEFRAME = '5min';

  constructor() {
    this.polygonService = new PolygonService(POLYGON_API_KEY);
  }

  /**
   * Initialize lastFetchTimestamps from database (for restart recovery)
   */
  private initializeLastFetchTimestamps(): void {
    try {
      const db = getDatabase();

      // Get most recent bar timestamp for each subscribed ticker
      for (const ticker of this.subscribedTickers) {
        const result = db.prepare(`
          SELECT MAX(timestamp) as lastTimestamp
          FROM ohlcv_data
          WHERE ticker = ? AND timeframe = ?
        `).get(ticker, this.TIMEFRAME) as { lastTimestamp: number | null };

        if (result && result.lastTimestamp) {
          this.lastFetchTimestamps.set(ticker, result.lastTimestamp);
          logger.info(`📊 ${ticker}: Resuming from ${new Date(result.lastTimestamp).toISOString()}`);
        }
      }
    } catch (error: any) {
      logger.warn('Could not initialize from database, will use default timestamps:', error.message);
    }
  }

  /**
   * Initialize and start polling
   */
  async connect(): Promise<void> {
    if (!POLYGON_API_KEY) {
      throw new Error('POLYGON_API_KEY not set in environment');
    }

    if (this.isConnected) {
      logger.warn('Already connected to Polygon REST API');
      return;
    }

    try {
      logger.info('📡 Starting Polygon REST API polling...');

      this.isConnected = true;

      // Initialize timestamps from database (for restart recovery)
      this.initializeLastFetchTimestamps();

      // Start polling immediately
      await this.pollLatestBars();

      // Set up recurring polling
      this.pollingInterval = setInterval(async () => {
        try {
          await this.pollLatestBars();
        } catch (error: any) {
          logger.error('Error in polling loop:', error.message);
        }
      }, this.POLL_INTERVAL_MS);

      logger.info(`✅ Polling started - checking every ${this.POLL_INTERVAL_MS / 1000}s`);

    } catch (error: any) {
      logger.error('Failed to start polling:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Poll Polygon API for latest bars for all subscribed tickers
   */
  private async pollLatestBars(): Promise<void> {
    if (this.subscribedTickers.size === 0) {
      return;
    }

    const now = Date.now();
    const tickers = Array.from(this.subscribedTickers);

    logger.info(`🔄 Polling ${tickers.length} tickers for latest 5-min bars...`);

    // Fetch latest bars for all tickers in parallel
    const fetchPromises = tickers.map(ticker => this.fetchLatestBarForTicker(ticker, now));

    try {
      await Promise.allSettled(fetchPromises);
      logger.info(`✅ Poll complete - checked ${tickers.length} tickers`);
    } catch (error: any) {
      logger.error('Error during parallel fetch:', error);
    }
  }

  /**
   * Fetch latest bar for a specific ticker
   */
  private async fetchLatestBarForTicker(ticker: string, now: number): Promise<void> {
    try {
      // Get last fetch timestamp or default to 30 minutes ago
      const lastTimestamp = this.lastFetchTimestamps.get(ticker) || (now - 30 * 60 * 1000);

      // Fetch bars from last timestamp to now
      const fromDate = new Date(lastTimestamp).toISOString().split('T')[0];
      const toDate = new Date(now).toISOString().split('T')[0];

      const bars = await this.polygonService.fetchAggregates(
        ticker,
        5, // 5-minute bars
        'minute',
        fromDate,
        toDate,
        100 // Limit to recent bars
      );

      logger.info(`[DEBUG] ${ticker}: API returned ${bars.length} bars for range ${fromDate} to ${toDate}, lastTimestamp=${new Date(lastTimestamp).toISOString()}`);

      if (bars.length === 0) {
        return;
      }

      // Process new bars
      let newBarsCount = 0;
      let skippedCount = 0;
      for (const polygonBar of bars) {
        // Skip if we've already processed this bar
        if (polygonBar.t <= lastTimestamp) {
          skippedCount++;
          continue;
        }

        const bar: Bar = {
          ticker: ticker.toUpperCase(),
          timestamp: polygonBar.t,
          open: polygonBar.o,
          high: polygonBar.h,
          low: polygonBar.l,
          close: polygonBar.c,
          volume: polygonBar.v,
          timeframe: this.TIMEFRAME
        };

        // Validate bar
        if (!this.validateBar(bar)) {
          continue;
        }

        // Store in database
        this.storeBar(bar);

        // Notify callbacks
        this.notifyCallbacks(bar);

        newBarsCount++;

        // Update last timestamp
        this.lastFetchTimestamps.set(ticker, polygonBar.t);
      }

      if (newBarsCount > 0) {
        logger.info(`📊 ${ticker}: ${newBarsCount} new 5-min bar(s)`);
      }

    } catch (error: any) {
      logger.error(`Error fetching bars for ${ticker}:`, error.message);
    }
  }

  /**
   * Subscribe to tickers for polling
   */
  async subscribeToTickers(tickers: string[]): Promise<void> {
    const newTickers = tickers.filter(t => !this.subscribedTickers.has(t));

    if (newTickers.length === 0) {
      logger.info('All tickers already subscribed');
      return;
    }

    for (const ticker of newTickers) {
      this.subscribedTickers.add(ticker);
      logger.info(`📊 Subscribed to ${ticker}`);
    }

    logger.info(`✅ Subscribed to ${newTickers.length} ticker(s)`);

    // If already polling, fetch data for new tickers immediately
    if (this.isConnected) {
      const now = Date.now();
      for (const ticker of newTickers) {
        this.fetchLatestBarForTicker(ticker, now).catch(err => {
          logger.error(`Initial fetch failed for ${ticker}:`, err.message);
        });
      }
    }
  }

  /**
   * Unsubscribe from specific tickers
   */
  async unsubscribeFromTickers(tickers: string[]): Promise<void> {
    for (const ticker of tickers) {
      if (this.subscribedTickers.has(ticker)) {
        this.subscribedTickers.delete(ticker);
        this.lastFetchTimestamps.delete(ticker);
        logger.info(`📊 Unsubscribed from ${ticker}`);
      }
    }
  }

  /**
   * Register a callback to receive bar updates
   */
  onBarUpdate(callback: (bar: Bar) => void): void {
    this.dataCallbacks.push(callback);
  }

  /**
   * Notify all callbacks of new bar
   */
  private notifyCallbacks(bar: Bar): void {
    this.dataCallbacks.forEach(callback => {
      try {
        callback(bar);
      } catch (error: any) {
        logger.error('Error in bar callback:', error);
      }
    });
  }

  /**
   * Validate bar data quality
   */
  private validateBar(bar: Bar): boolean {
    // Check for valid prices
    if (bar.close <= 0 || bar.high < bar.low) {
      return false;
    }

    if (bar.close > bar.high || bar.close < bar.low) {
      return false;
    }

    if (bar.open > bar.high || bar.open < bar.low) {
      return false;
    }

    // Don't check for stale data in REST polling - historical bars are expected
    return true;
  }

  /**
   * Store bar in database
   */
  private storeBar(bar: Bar): void {
    try {
      const db = getDatabase();

      // Insert into ohlcv_data table (used by scanner scripts)
      // Calculate time_of_day and day_of_week for scanner compatibility
      const barDate = new Date(bar.timestamp);
      const timeOfDay = barDate.toTimeString().split(' ')[0]; // HH:MM:SS
      const dayOfWeek = barDate.getDay(); // 0=Sunday, 6=Saturday

      db.prepare(`
        INSERT OR REPLACE INTO ohlcv_data (
          ticker, timestamp, open, high, low, close, volume, timeframe, time_of_day, day_of_week
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bar.ticker,
        bar.timestamp,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.timeframe,
        timeOfDay,
        dayOfWeek
      );

    } catch (error: any) {
      logger.error(`Failed to store bar for ${bar.ticker}:`, error);
    }
  }

  /**
   * Disconnect and stop polling
   */
  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isConnected = false;
    this.subscribedTickers.clear();
    this.lastFetchTimestamps.clear();

    logger.info('Disconnected from Polygon REST API - polling stopped');
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    subscribedTickers: string[];
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      subscribedTickers: Array.from(this.subscribedTickers),
      reconnectAttempts: 0 // Not applicable for REST polling
    };
  }

  /**
   * Get recent bars for a ticker
   */
  getRecentBars(ticker: string, timeframe: string, limit: number = 100): Bar[] {
    const db = getDatabase();

    const bars = db.prepare(`
      SELECT ticker, timestamp, open, high, low, close, volume, timeframe
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(ticker, timeframe, limit) as Bar[];

    return bars.reverse(); // Return in chronological order
  }
}

// Export class for instantiation
export { RealtimeDataService };

// Singleton instance
const realtimeDataService = new RealtimeDataService();

export default realtimeDataService;
