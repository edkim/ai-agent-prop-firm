/**
 * Pattern Registry
 *
 * Manages all active patterns that should be scanned in real-time.
 * Patterns can be dynamically added/removed.
 */

import { Pattern } from './types';
import logger from '../../services/logger.service';

class PatternRegistry {
  private patterns: Map<string, Pattern> = new Map();
  private enabled: Set<string> = new Set();

  /**
   * Register a pattern (and enable it by default)
   */
  register(pattern: Pattern): void {
    if (this.patterns.has(pattern.name)) {
      logger.warn(`Pattern '${pattern.name}' is already registered. Overwriting.`);
    }

    this.patterns.set(pattern.name, pattern);
    this.enabled.add(pattern.name);

    logger.info(`✓ Registered pattern: ${pattern.name}`);
  }

  /**
   * Unregister a pattern
   */
  unregister(name: string): void {
    if (!this.patterns.has(name)) {
      logger.warn(`Pattern '${name}' not found.`);
      return;
    }

    this.patterns.delete(name);
    this.enabled.delete(name);

    logger.info(`✓ Unregistered pattern: ${name}`);
  }

  /**
   * Enable a pattern (already registered)
   */
  enable(name: string): void {
    if (!this.patterns.has(name)) {
      logger.warn(`Pattern '${name}' not found.`);
      return;
    }

    this.enabled.add(name);
    logger.info(`✓ Enabled pattern: ${name}`);
  }

  /**
   * Disable a pattern (keeps it registered)
   */
  disable(name: string): void {
    this.enabled.delete(name);
    logger.info(`✓ Disabled pattern: ${name}`);
  }

  /**
   * Get all enabled patterns
   */
  getActive(): Pattern[] {
    const active: Pattern[] = [];

    for (const name of this.enabled) {
      const pattern = this.patterns.get(name);
      if (pattern) {
        active.push(pattern);
      }
    }

    return active;
  }

  /**
   * Get all registered patterns (enabled + disabled)
   */
  getAll(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get a specific pattern by name
   */
  get(name: string): Pattern | undefined {
    return this.patterns.get(name);
  }

  /**
   * Check if a pattern is registered
   */
  has(name: string): boolean {
    return this.patterns.has(name);
  }

  /**
   * Check if a pattern is enabled
   */
  isEnabled(name: string): boolean {
    return this.enabled.has(name);
  }

  /**
   * Get summary of registered patterns
   */
  getSummary(): { total: number; enabled: number; disabled: number; patterns: Array<{ name: string; enabled: boolean }> } {
    const patterns = Array.from(this.patterns.keys()).map(name => ({
      name,
      enabled: this.enabled.has(name)
    }));

    return {
      total: this.patterns.size,
      enabled: this.enabled.size,
      disabled: this.patterns.size - this.enabled.size,
      patterns
    };
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.enabled.clear();
    logger.info('✓ Cleared all patterns');
  }
}

// Singleton instance
export const registry = new PatternRegistry();
