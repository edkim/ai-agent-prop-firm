/**
 * Date Query Service
 *
 * Handles querying the database for special dates:
 * - Earnings announcement dates
 * - All trading days for a ticker
 * - Custom date lists
 */

import { getDatabase } from '../database/db';
import { DateQueryFilter } from '../types/script.types';

export class DateQueryService {
  /**
   * Query dates based on filter criteria
   */
  async queryDates(filter: DateQueryFilter): Promise<string[]> {
    if (filter.type === 'earnings') {
      return this.queryEarningsDates(filter);
    }

    if (filter.type === 'all-trading-days') {
      return this.queryAllTradingDays(filter);
    }

    if (filter.type === 'specific' && filter.customDates) {
      return filter.customDates;
    }

    return [];
  }

  /**
   * Query earnings announcement dates for a ticker
   */
  private queryEarningsDates(filter: DateQueryFilter): string[] {
    if (!filter.ticker) {
      throw new Error('Earnings query requires a ticker');
    }

    const db = getDatabase();

    const limit = filter.limit || 5;
    const order = filter.order === 'asc' ? 'ASC' : 'DESC';

    const query = `
      SELECT earnings_date
      FROM earnings_events
      WHERE ticker = ?
      ORDER BY earnings_date ${order}
      LIMIT ?
    `;

    const rows = db.prepare(query).all(filter.ticker, limit) as { earnings_date: string }[];

    // Extract just the date strings and ensure they're in YYYY-MM-DD format
    const dates = rows.map(row => {
      // If earnings_date is already a string in YYYY-MM-DD format
      if (typeof row.earnings_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.earnings_date)) {
        return row.earnings_date.split('T')[0]; // Remove time portion if present
      }

      // If it's a timestamp, convert it
      if (typeof row.earnings_date === 'number') {
        return new Date(row.earnings_date).toISOString().split('T')[0];
      }

      return row.earnings_date;
    });

    // Reverse if descending to get chronological order
    if (order === 'DESC') {
      dates.reverse();
    }

    return dates;
  }

  /**
   * Query all trading days for a ticker (days with data)
   */
  private queryAllTradingDays(filter: DateQueryFilter): string[] {
    if (!filter.ticker) {
      throw new Error('All-trading-days query requires a ticker');
    }

    const db = getDatabase();

    const limit = filter.limit || 100;
    const order = filter.order === 'asc' ? 'ASC' : 'DESC';

    // Get distinct dates from OHLCV data
    const query = `
      SELECT DISTINCT date(timestamp / 1000, 'unixepoch') as trade_date
      FROM ohlcv_data
      WHERE ticker = ?
      ORDER BY trade_date ${order}
      LIMIT ?
    `;

    const rows = db.prepare(query).all(filter.ticker, limit) as { trade_date: string }[];

    const dates = rows.map(row => row.trade_date);

    // Reverse if descending to get chronological order
    if (order === 'DESC') {
      dates.reverse();
    }

    return dates;
  }

  /**
   * Check if a ticker has earnings data
   */
  hasEarningsData(ticker: string): boolean {
    const db = getDatabase();

    const query = `
      SELECT COUNT(*) as count
      FROM earnings_events
      WHERE ticker = ?
    `;

    const result = db.prepare(query).get(ticker) as { count: number };

    return result.count > 0;
  }

  /**
   * Get most recent earnings date for a ticker
   */
  getLatestEarningsDate(ticker: string): string | null {
    const db = getDatabase();

    const query = `
      SELECT earnings_date
      FROM earnings_events
      WHERE ticker = ?
      ORDER BY earnings_date DESC
      LIMIT 1
    `;

    const result = db.prepare(query).get(ticker) as { earnings_date: string } | undefined;

    if (!result) {
      return null;
    }

    // Ensure proper format
    if (typeof result.earnings_date === 'string') {
      return result.earnings_date.split('T')[0];
    }

    if (typeof result.earnings_date === 'number') {
      return new Date(result.earnings_date).toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Get count of earnings events for a ticker
   */
  getEarningsCount(ticker: string): number {
    const db = getDatabase();

    const query = `
      SELECT COUNT(*) as count
      FROM earnings_events
      WHERE ticker = ?
    `;

    const result = db.prepare(query).get(ticker) as { count: number };

    return result.count;
  }
}

// Export singleton instance
export default new DateQueryService();
