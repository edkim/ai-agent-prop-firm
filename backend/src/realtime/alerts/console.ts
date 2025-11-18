/**
 * Console Alert Channel
 *
 * Logs signals to console with formatting
 */

import { AlertChannel } from './types';
import { Signal } from '../patterns/types';

export class ConsoleAlert implements AlertChannel {
  name = 'console';
  enabled = true;

  async send(signal: Signal): Promise<void> {
    const timestamp = new Date(signal.timestamp).toLocaleTimeString();
    const rr = ((signal.target - signal.entry) / (signal.entry - signal.stop)).toFixed(1);

    console.log('\n🚨 SIGNAL DETECTED');
    console.log('═'.repeat(60));
    console.log(`Pattern:     ${signal.pattern}`);
    console.log(`Ticker:      ${signal.ticker}`);
    console.log(`Time:        ${timestamp} (${signal.time})`);
    console.log(`Confidence:  ${signal.confidence.toFixed(0)}%`);
    console.log('─'.repeat(60));
    console.log(`Entry:       $${signal.entry.toFixed(2)}`);
    console.log(`Stop:        $${signal.stop.toFixed(2)} (${this.percentDiff(signal.entry, signal.stop)})`);
    console.log(`Target:      $${signal.target.toFixed(2)} (${this.percentDiff(signal.entry, signal.target)})`);
    console.log(`Risk/Reward: ${rr}:1`);

    if (signal.metadata && Object.keys(signal.metadata).length > 0) {
      console.log('─'.repeat(60));
      console.log('Metadata:');
      for (const [key, value] of Object.entries(signal.metadata)) {
        console.log(`  ${key}: ${value}`);
      }
    }

    console.log('═'.repeat(60));
  }

  private percentDiff(entry: number, price: number): string {
    const pct = ((price - entry) / entry) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  }
}
