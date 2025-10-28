/**
 * Real-Time Data Service
 * Manages WebSocket connection to Polygon.io for live market data streaming
 */

import { WebSocketClient, IStocksEvent } from '@polygon.io/client-js';
import { getDatabase } from '../database/db';
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
  private wsClient: WebSocketClient | null = null;
  private subscribedTickers: Set<string> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private dataCallbacks: ((bar: Bar) => void)[] = [];

  /**
   * Initialize and connect to Polygon WebSocket
   */
  async connect(): Promise<void> {
    if (!POLYGON_API_KEY) {
      throw new Error('POLYGON_API_KEY not set in environment');
    }

    if (this.isConnected) {
      logger.warn('Already connected to Polygon WebSocket');
      return;
    }

    try {
      logger.info('📡 Connecting to Polygon WebSocket...');

      // Create WebSocket client
      this.wsClient = new WebSocketClient({
        apiKey: POLYGON_API_KEY,
        feed: 'delayed.polygon.io', // Use 'delayed.polygon.io' for free tier
        market: 'stocks',
      });

      // Handle connection
      this.wsClient.onConnect(() => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.info('✅ Connected to Polygon WebSocket');
      });

      // Handle disconnection
      this.wsClient.onDisconnect(() => {
        this.isConnected = false;
        logger.warn('❌ Disconnected from Polygon WebSocket');
        this.handleDisconnection();
      });

      // Handle errors
      this.wsClient.onError((error: Error) => {
        logger.error('Polygon WebSocket error:', error);
      });

      // Handle aggregate bars (1-min, 5-min, etc.)
      this.wsClient.onAggregateSecond((event: IStocksEvent) => {
        this.handleAggregateBar(event, '1min');
      });

      // Connect
      await this.wsClient.connect();

    } catch (error: any) {
      logger.error('Failed to connect to Polygon WebSocket:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time data for specific tickers
   */
  async subscribeToTickers(tickers: string[]): Promise<void> {
    if (!this.wsClient || !this.isConnected) {
      throw new Error('WebSocket not connected. Call connect() first.');
    }

    const newTickers = tickers.filter(t => !this.subscribedTickers.has(t));

    if (newTickers.length === 0) {
      logger.info('All tickers already subscribed');
      return;
    }

    try {
      // Subscribe to aggregate (second) bars
      for (const ticker of newTickers) {
        this.wsClient.subscribeToAggregateSecond(ticker);
        this.subscribedTickers.add(ticker);
        logger.info(`📊 Subscribed to ${ticker}`);
      }

      logger.info(`✅ Subscribed to ${newTickers.length} ticker(s)`);
    } catch (error: any) {
      logger.error('Failed to subscribe to tickers:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from specific tickers
   */
  async unsubscribeFromTickers(tickers: string[]): Promise<void> {
    if (!this.wsClient || !this.isConnected) {
      return;
    }

    for (const ticker of tickers) {
      if (this.subscribedTickers.has(ticker)) {
        this.wsClient.unsubscribeFromAggregateSecond(ticker);
        this.subscribedTickers.delete(ticker);
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
   * Handle incoming aggregate bar data
   */
  private handleAggregateBar(event: IStocksEvent, timeframe: string): void {
    try {
      const bar: Bar = {
        ticker: event.pair.toUpperCase(),
        timestamp: event.start || Date.now(),
        open: event.open || 0,
        high: event.high || 0,
        low: event.low || 0,
        close: event.close || 0,
        volume: event.volume || 0,
        timeframe
      };

      // Validate bar data
      if (!this.validateBar(bar)) {
        logger.warn(`⚠️ Invalid bar data for ${bar.ticker}`, bar);
        return;
      }

      // Store in database
      this.storeBar(bar);

      // Notify callbacks
      this.dataCallbacks.forEach(callback => {
        try {
          callback(bar);
        } catch (error: any) {
          logger.error('Error in bar callback:', error);
        }
      });

    } catch (error: any) {
      logger.error('Error handling aggregate bar:', error);
    }
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

    // Check for stale data (more than 5 minutes old)
    const now = Date.now();
    const barAge = now - bar.timestamp;

    if (barAge > 300000) { // 5 minutes
      logger.warn(`⚠️ Stale bar for ${bar.ticker}: ${barAge / 1000}s old`);
      return false;
    }

    return true;
  }

  /**
   * Store bar in database
   */
  private storeBar(bar: Bar): void {
    try {
      const db = getDatabase();

      db.prepare(`
        INSERT OR REPLACE INTO realtime_bars (
          ticker, timestamp, open, high, low, close, volume, timeframe
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bar.ticker,
        bar.timestamp,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.timeframe
      );

    } catch (error: any) {
      logger.error(`Failed to store bar for ${bar.ticker}:`, error);
    }
  }

  /**
   * Handle disconnection with exponential backoff
   */
  private async handleDisconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);

    logger.info(`🔄 Reconnecting to Polygon WebSocket (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay / 1000}s...`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();

      // Resubscribe to tickers
      if (this.subscribedTickers.size > 0) {
        const tickers = Array.from(this.subscribedTickers);
        this.subscribedTickers.clear(); // Clear before resubscribing
        await this.subscribeToTickers(tickers);
      }

    } catch (error: any) {
      logger.error('Reconnection failed:', error);
      this.handleDisconnection(); // Try again
    }
  }

  /**
   * Disconnect from Polygon WebSocket
   */
  async disconnect(): Promise<void> {
    if (this.wsClient) {
      try {
        this.wsClient.disconnect();
        this.isConnected = false;
        this.subscribedTickers.clear();
        logger.info('Disconnected from Polygon WebSocket');
      } catch (error: any) {
        logger.error('Error disconnecting:', error);
      }
    }
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
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Get recent bars for a ticker
   */
  getRecentBars(ticker: string, timeframe: string, limit: number = 100): Bar[] {
    const db = getDatabase();

    const bars = db.prepare(`
      SELECT ticker, timestamp, open, high, low, close, volume, timeframe
      FROM realtime_bars
      WHERE ticker = ? AND timeframe = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(ticker, timeframe, limit) as Bar[];

    return bars.reverse(); // Return in chronological order
  }
}

// Singleton instance
const realtimeDataService = new RealtimeDataService();

export default realtimeDataService;
