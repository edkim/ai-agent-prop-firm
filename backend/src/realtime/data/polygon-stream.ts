/**
 * Polygon WebSocket Stream
 *
 * Connects to Polygon.io websocket and streams real-time bar data
 */

import WebSocket from 'ws';
import { marketState } from './market-state';
import { Bar } from '../patterns/types';
import { getETDate, getETTime, isRTH } from '../utils/timezone';
import logger from '../../services/logger.service';

interface PolygonMessage {
  ev: string;  // Event type
  sym: string; // Symbol
  s?: number;  // Start timestamp (ms)
  o?: number;  // Open
  h?: number;  // High
  l?: number;  // Low
  c?: number;  // Close
  v?: number;  // Volume
  vw?: number; // VWAP
}

export class PolygonStream {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private tickers: string[];
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;
  private isConnected = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(apiKey: string, tickers: string[]) {
    this.apiKey = apiKey;
    this.tickers = tickers;
  }

  /**
   * Connect to Polygon websocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = 'wss://socket.polygon.io/stocks';

      logger.info(`Connecting to Polygon websocket...`);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.info('✓ WebSocket connected');

        // Authenticate
        this.send({ action: 'auth', params: this.apiKey });

        // Wait for auth confirmation
        const authTimeout = setTimeout(() => {
          reject(new Error('Authentication timeout'));
        }, 10000);

        const authHandler = (message: string) => {
          const data = JSON.parse(message);

          logger.info(`[AuthHandler] Received message: ${message}`);
          logger.info(`[AuthHandler] Parsed data: ${JSON.stringify(data)}`);
          logger.info(`[AuthHandler] data[0]: ${JSON.stringify(data[0])}`);
          logger.info(`[AuthHandler] data[0]?.status: ${data[0]?.status}`);

          if (data[0]?.status === 'auth_success') {
            clearTimeout(authTimeout);
            this.isConnected = true;
            this.reconnectAttempts = 0;

            logger.info('✓ Authenticated with Polygon');
            logger.info('Calling subscribe()...');

            // Subscribe to 5-minute aggregates
            try {
              this.subscribe();
              logger.info('subscribe() completed');
            } catch (err) {
              logger.error('Error in subscribe():', err);
            }

            // Start heartbeat
            logger.info('Starting heartbeat...');
            this.startHeartbeat();
            logger.info('Heartbeat started');

            logger.info('Resolving connection promise...');
            resolve();
            logger.info('Connection promise resolved');
          } else if (data[0]?.status === 'auth_failed') {
            clearTimeout(authTimeout);
            reject(new Error('Authentication failed'));
          }
        };

        this.ws!.once('message', authHandler);
      });

      this.ws.on('message', (data: string) => {
        try {
          const messages: PolygonMessage[] = JSON.parse(data);
          this.handleMessages(messages);
        } catch (error) {
          logger.error('Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        // Don't exit - will attempt reconnect on close
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || 'No reason provided';
        logger.warn(`WebSocket closed. Code: ${code}, Reason: ${reasonStr}`);
        this.isConnected = false;
        this.stopHeartbeat();

        // Don't exit process - attempt to reconnect
        logger.info('Attempting to reconnect...');
        this.attemptReconnect();
      });

      this.ws.on('ping', () => {
        // Respond to pings to keep connection alive
        if (this.ws) {
          this.ws.pong();
        }
      });
    });
  }

  /**
   * Subscribe to ticker aggregates
   */
  private subscribe(): void {
    if (!this.ws || !this.isConnected) {
      logger.warn('Cannot subscribe: not connected');
      return;
    }

    // Subscribe to 5-minute aggregates for all tickers
    const subscriptions = this.tickers.map(t => `AM.${t}`);  // AM = Aggregate Minute

    logger.info(`Subscribing to ${this.tickers.length} tickers: ${this.tickers.join(', ')}`);

    this.send({
      action: 'subscribe',
      params: subscriptions.join(',')
    });

    logger.info(`✓ Subscription message sent`);
  }

  /**
   * Handle incoming messages
   */
  private handleMessages(messages: PolygonMessage[]): void {
    for (const msg of messages) {
      // AM = Aggregate Minute bar
      if (msg.ev === 'AM') {
        this.handleBar(msg);
      }
      // Status messages
      else if (msg.ev === 'status') {
        logger.info(`Status: ${JSON.stringify(msg)}`);
      }
    }
  }

  /**
   * Handle bar data
   */
  private handleBar(msg: PolygonMessage): void {
    if (!msg.s || !msg.o || !msg.h || !msg.l || !msg.c || !msg.v) {
      return;
    }

    const ticker = msg.sym;
    const timestamp = msg.s;

    // Normalize to ET timezone
    const dateET = getETDate(timestamp);
    const timeET = getETTime(timestamp);
    const isRegularHours = isRTH(timestamp);

    const bar: Bar = {
      timestamp,
      time: timeET,
      date: dateET,
      open: msg.o,
      high: msg.h,
      low: msg.l,
      close: msg.c,
      volume: msg.v,
      isRTH: isRegularHours
    };

    // Update market state
    marketState.updateBar(ticker, bar);

    // Log extended hours bars (optional - can be noisy)
    // if (!isRegularHours) {
    //   logger.info(`Extended hours bar: ${ticker} ${dateET} ${timeET}`);
    // }
  }

  /**
   * Send message to websocket
   */
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);  // Every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnect attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;

    logger.info(`Reconnecting in ${this.RECONNECT_DELAY / 1000}s (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);

    setTimeout(() => {
      this.connect().catch(err => {
        logger.error('Reconnect failed:', err);
      });
    }, this.RECONNECT_DELAY);
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    logger.info('✓ Disconnected from Polygon');
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected;
  }

  /**
   * Add more tickers to subscription
   */
  addTickers(tickers: string[]): void {
    if (!this.isConnected) {
      logger.warn('Cannot add tickers: not connected');
      return;
    }

    this.tickers.push(...tickers);

    const subscriptions = tickers.map(t => `AM.${t}`);

    this.send({
      action: 'subscribe',
      params: subscriptions.join(',')
    });

    logger.info(`✓ Added ${tickers.length} tickers to subscription`);
  }

  /**
   * Remove tickers from subscription
   */
  removeTickers(tickers: string[]): void {
    if (!this.isConnected) {
      logger.warn('Cannot remove tickers: not connected');
      return;
    }

    this.tickers = this.tickers.filter(t => !tickers.includes(t));

    const subscriptions = tickers.map(t => `AM.${t}`);

    this.send({
      action: 'unsubscribe',
      params: subscriptions.join(',')
    });

    logger.info(`✓ Removed ${tickers.length} tickers from subscription`);
  }
}
