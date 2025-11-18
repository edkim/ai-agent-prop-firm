/**
 * Signal Manager
 *
 * Tracks active signals to avoid duplicate alerts
 */

import { Signal } from '../patterns/types';
import logger from '../../services/logger.service';

interface TrackedSignal {
  signal: Signal;
  firstSeen: number;
}

export class SignalManager {
  private signals: Map<string, TrackedSignal> = new Map();
  private readonly COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes

  /**
   * Check if a signal is new (not seen recently)
   */
  isNew(signal: Signal): boolean {
    const key = this.getKey(signal);
    const existing = this.signals.get(key);

    if (!existing) {
      return true;
    }

    // Check if cooldown has expired
    const timeSinceFirst = Date.now() - existing.firstSeen;
    return timeSinceFirst > this.COOLDOWN_MS;
  }

  /**
   * Add a signal to tracking
   */
  add(signal: Signal): void {
    const key = this.getKey(signal);

    this.signals.set(key, {
      signal,
      firstSeen: Date.now()
    });
  }

  /**
   * Get all active signals
   */
  getActive(): Signal[] {
    const now = Date.now();
    const active: Signal[] = [];

    for (const [key, tracked] of this.signals.entries()) {
      const age = now - tracked.firstSeen;

      if (age <= this.COOLDOWN_MS) {
        active.push(tracked.signal);
      } else {
        // Expired, remove
        this.signals.delete(key);
      }
    }

    return active;
  }

  /**
   * Clear all signals
   */
  clear(): void {
    this.signals.clear();
  }

  /**
   * Generate unique key for a signal
   */
  private getKey(signal: Signal): string {
    return `${signal.ticker}:${signal.pattern}`;
  }

  /**
   * Get count of active signals
   */
  getCount(): number {
    return this.getActive().length;
  }
}
