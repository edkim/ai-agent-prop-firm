/**
 * Alert System Types
 */

import { Signal } from '../patterns/types';

export interface AlertChannel {
  name: string;
  enabled: boolean;
  send(signal: Signal): Promise<void>;
}

export interface AlertConfig {
  minConfidence?: number;     // Only alert if confidence >= this
  patterns?: string[];         // Only alert for these patterns (empty = all)
  tickers?: string[];          // Only alert for these tickers (empty = all)
}
