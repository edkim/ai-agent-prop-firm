/**
 * Alert Manager
 *
 * Routes signals to multiple alert channels with filtering
 */

import { AlertChannel, AlertConfig } from './types';
import { Signal } from '../patterns/types';
import logger from '../../services/logger.service';
import { ConsoleAlert } from './console';

class AlertManager {
  private channels: Map<string, AlertChannel> = new Map();
  private config: AlertConfig = {};

  constructor() {
    // Register console alert by default
    this.registerChannel(new ConsoleAlert());
  }

  /**
   * Register an alert channel
   */
  registerChannel(channel: AlertChannel): void {
    this.channels.set(channel.name, channel);
    logger.info(`✓ Registered alert channel: ${channel.name}`);
  }

  /**
   * Unregister an alert channel
   */
  unregisterChannel(name: string): void {
    this.channels.delete(name);
    logger.info(`✓ Unregistered alert channel: ${name}`);
  }

  /**
   * Enable a channel
   */
  enableChannel(name: string): void {
    const channel = this.channels.get(name);
    if (channel) {
      channel.enabled = true;
      logger.info(`✓ Enabled alert channel: ${name}`);
    }
  }

  /**
   * Disable a channel
   */
  disableChannel(name: string): void {
    const channel = this.channels.get(name);
    if (channel) {
      channel.enabled = false;
      logger.info(`✓ Disabled alert channel: ${name}`);
    }
  }

  /**
   * Set alert configuration (filters)
   */
  setConfig(config: AlertConfig): void {
    this.config = config;
    logger.info('✓ Updated alert config');
  }

  /**
   * Send a signal to all enabled channels (with filtering)
   */
  async send(signal: Signal): Promise<void> {
    // Apply filters
    if (!this.shouldAlert(signal)) {
      return;
    }

    // Send to all enabled channels
    const promises: Promise<void>[] = [];

    for (const channel of this.channels.values()) {
      if (channel.enabled) {
        promises.push(
          channel.send(signal).catch(err => {
            logger.error(`Failed to send alert via ${channel.name}:`, err);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Check if signal passes filters
   */
  private shouldAlert(signal: Signal): boolean {
    // Min confidence filter
    if (this.config.minConfidence !== undefined) {
      if (signal.confidence < this.config.minConfidence) {
        return false;
      }
    }

    // Pattern filter
    if (this.config.patterns && this.config.patterns.length > 0) {
      if (!this.config.patterns.includes(signal.pattern)) {
        return false;
      }
    }

    // Ticker filter
    if (this.config.tickers && this.config.tickers.length > 0) {
      if (!this.config.tickers.includes(signal.ticker)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get list of registered channels
   */
  getChannels(): Array<{ name: string; enabled: boolean }> {
    return Array.from(this.channels.values()).map(ch => ({
      name: ch.name,
      enabled: ch.enabled
    }));
  }
}

// Singleton instance
export const alertManager = new AlertManager();
