/**
 * Backtest Set Service
 *
 * Manages sample sets (collections of pattern occurrences) and scan results
 */

import { getDatabase } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import polygonService from './polygon.service';

export interface BacktestSet {
  id: string;
  name: string;
  description?: string;
  pattern_type?: string;
  total_samples: number;
  created_at: string;
  updated_at: string;
}

export interface ScanResult {
  id: string;
  backtest_set_id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  peak_date?: string;
  total_change_percent?: number;
  peak_change_percent?: number;
  volume_spike_ratio?: number;
  pattern_duration_days?: number;
  notes?: string;
  tags?: string[];
  daily_bars?: any[];
  created_at: string;
}

export interface CreateBacktestSetRequest {
  name: string;
  description?: string;
  pattern_type?: string;
}

export interface AddScanResultRequest {
  backtest_set_id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  peak_date?: string;
  notes?: string;
  tags?: string[];
}

export class BacktestSetService {
  /**
   * Create a new sample set
   */
  async createBacktestSet(data: CreateBacktestSetRequest): Promise<BacktestSet> {
    const db = getDatabase();
    const id = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO backtest_sets (id, name, description, pattern_type, total_samples)
      VALUES (?, ?, ?, ?, 0)
    `);

    stmt.run(id, data.name, data.description || null, data.pattern_type || null);

    const result = db.prepare('SELECT * FROM backtest_sets WHERE id = ?').get(id) as BacktestSet;

    console.log(`✅ Created sample set: ${data.name} (ID: ${id})`);

    return result;
  }

  /**
   * Get all sample sets
   */
  async getBacktestSets(): Promise<BacktestSet[]> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM backtest_sets ORDER BY created_at DESC');
    return stmt.all() as BacktestSet[];
  }

  /**
   * Get a specific sample set by ID
   */
  async getBacktestSet(id: string): Promise<BacktestSet | null> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM backtest_sets WHERE id = ?');
    return stmt.get(id) as BacktestSet | null;
  }

  /**
   * Update a sample set
   */
  async updateBacktestSet(id: string, data: Partial<CreateBacktestSetRequest>): Promise<BacktestSet | null> {
    const db = getDatabase();

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.pattern_type !== undefined) {
      updates.push('pattern_type = ?');
      values.push(data.pattern_type);
    }

    if (updates.length === 0) {
      return this.getBacktestSet(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE backtest_sets
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.getBacktestSet(id);
  }

  /**
   * Delete a sample set and all its scan results
   */
  async deleteBacktestSet(id: string): Promise<boolean> {
    const db = getDatabase();

    // Delete all scan results first (CASCADE should handle this, but being explicit)
    db.prepare('DELETE FROM scan_results WHERE backtest_set_id = ?').run(id);

    // Delete the sample set
    const result = db.prepare('DELETE FROM backtest_sets WHERE id = ?').run(id);

    console.log(`✅ Deleted sample set ${id}`);

    return result.changes > 0;
  }

  /**
   * Add a scan result to a sample set
   */
  async addScanResult(data: AddScanResultRequest): Promise<ScanResult> {
    const db = getDatabase();
    const id = uuidv4();

    // Calculate pattern metrics from daily data
    const metrics = await this.calculatePatternMetrics(
      data.ticker,
      data.start_date,
      data.end_date,
      data.peak_date
    );

    // Fetch daily bars for the pattern period (extended for context)
    const dailyBars = await this.fetchDailyBarsForPattern(
      data.ticker,
      data.start_date,
      data.end_date
    );

    const stmt = db.prepare(`
      INSERT INTO scan_results (
        id, backtest_set_id, ticker, start_date, end_date, peak_date,
        total_change_percent, peak_change_percent, volume_spike_ratio, pattern_duration_days,
        notes, tags, daily_bars
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.backtest_set_id,
      data.ticker,
      data.start_date,
      data.end_date,
      data.peak_date || null,
      metrics.total_change_percent,
      metrics.peak_change_percent,
      metrics.volume_spike_ratio,
      metrics.pattern_duration_days,
      data.notes || null,
      data.tags ? JSON.stringify(data.tags) : null,
      JSON.stringify(dailyBars)
    );

    // Update sample set total count
    db.prepare('UPDATE backtest_sets SET total_samples = (SELECT COUNT(*) FROM scan_results WHERE backtest_set_id = ?) WHERE id = ?')
      .run(data.backtest_set_id, data.backtest_set_id);

    const result = db.prepare('SELECT * FROM scan_results WHERE id = ?').get(id) as any;

    // Parse JSON fields
    if (result.tags) {
      result.tags = JSON.parse(result.tags);
    }
    if (result.daily_bars) {
      result.daily_bars = JSON.parse(result.daily_bars);
    }

    console.log(`✅ Added scan result: ${data.ticker} (${data.start_date} to ${data.end_date})`);

    return result as ScanResult;
  }

  /**
   * Get all scan results for a sample set
   */
  async getScanResults(backtestSetId: string): Promise<ScanResult[]> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM scan_results WHERE backtest_set_id = ? ORDER BY created_at DESC');
    const results = stmt.all(backtestSetId) as any[];

    // Parse JSON fields
    return results.map(result => ({
      ...result,
      tags: result.tags ? JSON.parse(result.tags) : [],
      daily_bars: result.daily_bars ? JSON.parse(result.daily_bars) : []
    })) as ScanResult[];
  }

  /**
   * Get a specific scan result
   */
  async getScanResult(id: string): Promise<ScanResult | null> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM scan_results WHERE id = ?');
    const result = stmt.get(id) as any;

    if (!result) return null;

    // Parse JSON fields
    return {
      ...result,
      tags: result.tags ? JSON.parse(result.tags) : [],
      daily_bars: result.daily_bars ? JSON.parse(result.daily_bars) : []
    } as ScanResult;
  }

  /**
   * Delete a scan result
   */
  async deleteScanResult(id: string): Promise<boolean> {
    const db = getDatabase();

    // Get the backtest_set_id before deleting
    const result = db.prepare('SELECT backtest_set_id FROM scan_results WHERE id = ?').get(id) as any;

    if (!result) return false;

    // Delete the scan result
    db.prepare('DELETE FROM scan_results WHERE id = ?').run(id);

    // Update sample set total count
    db.prepare('UPDATE backtest_sets SET total_samples = (SELECT COUNT(*) FROM scan_results WHERE backtest_set_id = ?) WHERE id = ?')
      .run(result.backtest_set_id, result.backtest_set_id);

    console.log(`✅ Deleted scan result ${id}`);

    return true;
  }

  /**
   * Update a scan result
   */
  async updateScanResult(id: string, data: Partial<AddScanResultRequest>): Promise<ScanResult | null> {
    const db = getDatabase();

    const updates: string[] = [];
    const values: any[] = [];

    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes);
    }
    if (data.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(data.tags));
    }
    if (data.peak_date !== undefined) {
      updates.push('peak_date = ?');
      values.push(data.peak_date);
    }

    if (updates.length === 0) {
      return this.getScanResult(id);
    }

    values.push(id);

    const stmt = db.prepare(`
      UPDATE scan_results
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.getScanResult(id);
  }

  /**
   * Calculate pattern metrics from daily data
   */
  private async calculatePatternMetrics(
    ticker: string,
    startDate: string,
    endDate: string,
    peakDate?: string
  ): Promise<{
    total_change_percent: number;
    peak_change_percent: number;
    volume_spike_ratio: number;
    pattern_duration_days: number;
  }> {
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate).getTime();

    // Fetch daily bars
    const bars = await polygonService.getHistoricalData(ticker, '1day', startTimestamp, endTimestamp);

    if (bars.length === 0) {
      return {
        total_change_percent: 0,
        peak_change_percent: 0,
        volume_spike_ratio: 1,
        pattern_duration_days: 0
      };
    }

    // Calculate metrics
    const startPrice = bars[0].open;
    const endPrice = bars[bars.length - 1].close;
    const total_change_percent = ((endPrice - startPrice) / startPrice) * 100;

    // Find peak price
    let peakPrice = startPrice;
    let peakBar = bars[0];

    for (const bar of bars) {
      if (bar.high > peakPrice) {
        peakPrice = bar.high;
        peakBar = bar;
      }
    }

    const peak_change_percent = ((peakPrice - startPrice) / startPrice) * 100;

    // Calculate volume spike ratio (max volume / average volume)
    const avgVolume = bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
    const maxVolume = Math.max(...bars.map(bar => bar.volume));
    const volume_spike_ratio = maxVolume / avgVolume;

    const pattern_duration_days = bars.length;

    return {
      total_change_percent,
      peak_change_percent,
      volume_spike_ratio,
      pattern_duration_days
    };
  }

  /**
   * Fetch daily bars for pattern (with extended context)
   */
  private async fetchDailyBarsForPattern(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    // Extend date range for context (30 days before and after)
    const start = new Date(startDate);
    start.setDate(start.getDate() - 30);

    const end = new Date(endDate);
    end.setDate(end.getDate() + 30);

    const startTimestamp = start.getTime();
    const endTimestamp = end.getTime();

    const bars = await polygonService.getHistoricalData(ticker, '1day', startTimestamp, endTimestamp);

    // Return in a simplified format for storage
    return bars.map(bar => ({
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));
  }
}

// Export singleton instance
export default new BacktestSetService();
