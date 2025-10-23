/**
 * Polygon API Service
 * Handles fetching historical market data from Polygon.io
 */

import axios, { AxiosInstance } from 'axios';
import { OHLCVBar, EarningsEvent } from '../types/strategy.types';
import { getDatabase } from '../database/db';

interface PolygonBar {
  t: number;  // timestamp
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

interface PolygonResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
  count: number;
}

export class PolygonService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = 'https://api.polygon.io';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.POLYGON_API_KEY || '';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * Fetch historical aggregates (bars) for a ticker
   */
  async fetchAggregates(
    ticker: string,
    multiplier: number,
    timespan: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month',
    from: string,
    to: string,
    limit: number = 50000
  ): Promise<PolygonBar[]> {
    if (!this.apiKey) {
      throw new Error('Polygon API key is required. Please set POLYGON_API_KEY environment variable.');
    }

    try {
      const url = `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`;

      const response = await this.client.get<PolygonResponse>(url, {
        params: {
          adjusted: true,
          sort: 'asc',
          limit,
          apiKey: this.apiKey,
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Polygon API error: ${response.data.status}`);
      }

      return response.data.results || [];
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Polygon API error: ${error.response.status} - ${error.response.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Convert Polygon bar to OHLCVBar format
   */
  private convertBar(polygonBar: PolygonBar): OHLCVBar {
    const timestamp = polygonBar.t;
    const date = new Date(timestamp);

    return {
      timestamp,
      open: polygonBar.o,
      high: polygonBar.h,
      low: polygonBar.l,
      close: polygonBar.c,
      volume: polygonBar.v,
      timeOfDay: this.extractTimeOfDay(date),
      dayOfWeek: date.getDay(),
    };
  }

  /**
   * Extract time of day in HH:MM:SS format
   */
  private extractTimeOfDay(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Fetch and store historical data in database
   */
  async fetchAndStore(
    ticker: string,
    timeframe: '10sec' | '1min' | '5min' | '15min' | '30min' | '1hour' | '1day' | '1week' | '1month',
    from: string,
    to: string
  ): Promise<number> {
    const { multiplier, timespan } = this.parseTimeframe(timeframe);

    console.log(`Fetching ${ticker} ${timeframe} data from ${from} to ${to}...`);

    const bars = await this.fetchAggregates(ticker, multiplier, timespan, from, to);

    if (bars.length === 0) {
      console.log('No data returned from Polygon API');
      return 0;
    }

    const db = getDatabase();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO ohlcv_data
        (ticker, timestamp, open, high, low, close, volume, timeframe, time_of_day, day_of_week)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;

    const insertMany = db.transaction((bars: PolygonBar[]) => {
      for (const bar of bars) {
        const ohlcvBar = this.convertBar(bar);
        insert.run(
          ticker,
          ohlcvBar.timestamp,
          ohlcvBar.open,
          ohlcvBar.high,
          ohlcvBar.low,
          ohlcvBar.close,
          ohlcvBar.volume,
          timeframe,
          ohlcvBar.timeOfDay,
          ohlcvBar.dayOfWeek
        );
        insertedCount++;
      }
    });

    insertMany(bars);

    console.log(`Stored ${insertedCount} bars for ${ticker} ${timeframe}`);
    return insertedCount;
  }

  /**
   * Get historical data from database
   */
  async getHistoricalData(
    ticker: string,
    timeframe: string,
    from?: number,
    to?: number
  ): Promise<OHLCVBar[]> {
    const db = getDatabase();

    let query = `
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay, day_of_week as dayOfWeek
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ?
    `;

    const params: any[] = [ticker, timeframe];

    if (from) {
      query += ' AND timestamp >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND timestamp <= ?';
      params.push(to);
    }

    query += ' ORDER BY timestamp ASC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as OHLCVBar[];

    return rows;
  }

  /**
   * Parse timeframe string into multiplier and timespan
   */
  private parseTimeframe(timeframe: string): { multiplier: number; timespan: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' } {
    const map: Record<string, { multiplier: number; timespan: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' }> = {
      '10sec': { multiplier: 10, timespan: 'second' },
      '1min': { multiplier: 1, timespan: 'minute' },
      '5min': { multiplier: 5, timespan: 'minute' },
      '15min': { multiplier: 15, timespan: 'minute' },
      '30min': { multiplier: 30, timespan: 'minute' },
      '1hour': { multiplier: 1, timespan: 'hour' },
      '1day': { multiplier: 1, timespan: 'day' },
      '1week': { multiplier: 1, timespan: 'week' },
      '1month': { multiplier: 1, timespan: 'month' },
    };

    const result = map[timeframe];
    if (!result) {
      throw new Error(`Invalid timeframe: ${timeframe}`);
    }

    return result;
  }

  /**
   * Check if data exists in database for given parameters
   */
  async hasData(ticker: string, timeframe: string, from?: number, to?: number): Promise<boolean> {
    const db = getDatabase();

    let query = 'SELECT COUNT(*) as count FROM ohlcv_data WHERE ticker = ? AND timeframe = ?';
    const params: any[] = [ticker, timeframe];

    if (from) {
      query += ' AND timestamp >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND timestamp <= ?';
      params.push(to);
    }

    const stmt = db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count > 0;
  }

  /**
   * Fetch earnings calendar for a ticker
   */
  async fetchEarningsCalendar(ticker: string, limit: number = 100): Promise<any[]> {
    if (!this.apiKey) {
      throw new Error('Polygon API key is required. Please set POLYGON_API_KEY environment variable.');
    }

    try {
      const url = `/vX/reference/financials`;

      const response = await this.client.get(url, {
        params: {
          ticker,
          limit,
          apiKey: this.apiKey,
          sort: 'filing_date',
          order: 'desc'
        },
      });

      if (response.data.status === 'ERROR') {
        throw new Error(`Polygon API error: ${response.data.error}`);
      }

      return response.data.results || [];
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Polygon API error: ${error.response.status} - ${error.response.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Store earnings event in database
   */
  async storeEarningsEvent(event: EarningsEvent): Promise<void> {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO earnings_events
        (ticker, fiscal_period, fiscal_year, report_date, report_timestamp, time_of_day,
         eps_estimate, eps_actual, revenue_estimate, revenue_actual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.ticker,
      event.fiscalPeriod || null,
      event.fiscalYear || null,
      event.reportDate,
      event.reportTimestamp || null,
      event.timeOfDay || null,
      event.epsEstimate || null,
      event.epsActual || null,
      event.revenueEstimate || null,
      event.revenueActual || null
    );
  }

  /**
   * Get earnings events for a ticker in a date range
   */
  async getEarningsEvents(ticker: string, fromDate?: string, toDate?: string): Promise<EarningsEvent[]> {
    const db = getDatabase();

    let query = 'SELECT * FROM earnings_events WHERE ticker = ?';
    const params: any[] = [ticker];

    if (fromDate) {
      query += ' AND report_date >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      query += ' AND report_date <= ?';
      params.push(toDate);
    }

    query += ' ORDER BY report_date DESC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      ticker: row.ticker,
      fiscalPeriod: row.fiscal_period,
      fiscalYear: row.fiscal_year,
      reportDate: row.report_date,
      reportTimestamp: row.report_timestamp,
      timeOfDay: row.time_of_day,
      epsEstimate: row.eps_estimate,
      epsActual: row.eps_actual,
      revenueEstimate: row.revenue_estimate,
      revenueActual: row.revenue_actual,
    }));
  }

  /**
   * Check if ticker has earnings on a specific date
   */
  async hasEarningsOnDate(ticker: string, date: string): Promise<EarningsEvent | null> {
    const db = getDatabase();

    const stmt = db.prepare('SELECT * FROM earnings_events WHERE ticker = ? AND report_date = ? LIMIT 1');
    const row = stmt.get(ticker, date) as any;

    if (!row) return null;

    return {
      id: row.id,
      ticker: row.ticker,
      fiscalPeriod: row.fiscal_period,
      fiscalYear: row.fiscal_year,
      reportDate: row.report_date,
      reportTimestamp: row.report_timestamp,
      timeOfDay: row.time_of_day,
      epsEstimate: row.eps_estimate,
      epsActual: row.eps_actual,
      revenueEstimate: row.revenue_estimate,
      revenueActual: row.revenue_actual,
    };
  }
}

// Export singleton instance
export default new PolygonService();
