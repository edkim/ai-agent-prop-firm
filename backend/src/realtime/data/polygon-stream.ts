/**
 * Polygon/Massive WebSocket Stream
 *
 * Connects to Massive.com websocket and streams real-time bar data
 */

import WebSocket from 'ws';
import { marketState } from './market-state';
import { Bar } from '../patterns/types';
import { getETDate, getETTime, isRTH } from '../utils/timezone';
import logger from '../../services/logger.service';

interface PolygonMessage {
  ev: string;  // Event type
  sym?: string; // Symbol
  s?: number;  // Start timestamp (ms)
  o?: number;  // Open
  h?: number;  // High
  l?: number;  // Low
  c?: number;  // Close
  v?: number;  // Volume
  vw?: number; // VWAP
  status?: string; // Status (for auth messages)
  message?: string; // Message (for status messages)
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
   * Connect to Massive.com websocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = 'wss://socket.massive.com/stocks';

      logger.info(`Connecting to Massive.com websocket...`);

      this.ws = new WebSocket(url);

      let authTimeout: NodeJS.Timeout | null = null;
      let authResolved = false;

      this.ws.on('open', () => {
        logger.info('✓ WebSocket connected');

        // Authenticate
        this.send({ action: 'auth', params: this.apiKey });

        // Wait for auth confirmation
        authTimeout = setTimeout(() => {
          if (!authResolved) {
            logger.error('❌ Authentication timeout - no auth_success received within 10s');
            logger.error('This usually means:');
            logger.error('  1. Your API key is invalid or expired');
            logger.error('  2. Your Polygon.io key needs to be migrated to Massive.com');
            logger.error('  3. Get a new key at: https://massive.com/dashboard/keys');
            reject(new Error('Authentication timeout'));
          }
        }, 10000);
      });

      this.ws.on('message', (data: string) => {
        try {
          const messages: PolygonMessage[] = JSON.parse(data);

          // Handle authentication if not yet connected
          if (!this.isConnected) {
            for (const msg of messages) {
              if (msg.ev === 'status') {
                if (msg.status === 'auth_success') {
                  if (authTimeout) clearTimeout(authTimeout);
                  authResolved = true;
                  this.isConnected = true;
                  this.reconnectAttempts = 0;

                  logger.info('✓ Authenticated with Massive.com');

                  // Subscribe to tickers
                  this.subscribe();

                  // Start heartbeat
                  this.startHeartbeat();

                  logger.info('✓ Real-time data stream started');
                  resolve();
                  return;
                } else if (msg.status === 'auth_failed') {
                  if (authTimeout) clearTimeout(authTimeout);
                  authResolved = true;
                  logger.error('❌ Authentication failed');
                  logger.error('Check your API key at: https://massive.com/dashboard/keys');
                  reject(new Error('Authentication failed'));
                  return;
                }
              }
            }
          }

          // Handle regular messages
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

    // Subscribe to 1-minute aggregates for all tickers
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
    if (!msg.sym || !msg.s || !msg.o || !msg.h || !msg.l || !msg.c || !msg.v) {
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

    // Log first bar received as confirmation
    if (marketState.getState(ticker)?.bars.length === 1) {
      logger.info(`✓ Received first bar for ${ticker}: ${dateET} ${timeET} close=$${msg.c.toFixed(2)}`);
    }
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
    logger.info('✓ Disconnected from Massive.com');
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
