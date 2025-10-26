/**
 * Chart Generator Service
 *
 * Generates chart thumbnails for scan results using ChartJS on the server side.
 * Stores generated charts in the database as base64-encoded PNG images.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { getDatabase } from '../database/db';

export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartThumbnailRequest {
  ticker: string;
  startDate: string;
  endDate: string;
  bars: DailyBar[];
}

export interface ChartThumbnailResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  chartData: string; // base64 encoded PNG
  width: number;
  height: number;
}

export class ChartGeneratorService {
  private chartJSNodeCanvas: ChartJSNodeCanvas;
  private readonly width = 300;
  private readonly height = 150;

  constructor() {
    this.chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: this.width,
      height: this.height,
      backgroundColour: 'white'
    });
  }

  /**
   * Generate a chart thumbnail for the given ticker and date range
   */
  async generateThumbnail(request: ChartThumbnailRequest): Promise<ChartThumbnailResponse> {
    const { ticker, startDate, endDate, bars } = request;

    // Check if we already have this chart cached
    const cached = this.getCachedThumbnail(ticker, startDate, endDate);
    if (cached) {
      console.log(`📊 Using cached chart for ${ticker} (${startDate} to ${endDate})`);
      return cached;
    }

    console.log(`🎨 Generating chart for ${ticker} (${startDate} to ${endDate})...`);

    // Sort bars by date
    const sortedBars = [...bars].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Extract data for chart
    const labels = sortedBars.map(bar => bar.date);
    const closePrices = sortedBars.map(bar => bar.close);

    // Calculate min/max for y-axis with 5% padding
    const minPrice = Math.min(...closePrices);
    const maxPrice = Math.max(...closePrices);
    const padding = (maxPrice - minPrice) * 0.05;

    // Generate chart configuration
    const configuration = {
      type: 'line' as const,
      data: {
        labels,
        datasets: [{
          label: ticker,
          data: closePrices,
          borderColor: 'rgb(59, 130, 246)', // Blue
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 3,
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: `${ticker}`,
            font: {
              size: 12,
              weight: 'bold' as const
            }
          }
        },
        scales: {
          x: {
            display: true,
            ticks: {
              maxTicksLimit: 6,
              font: {
                size: 8
              }
            },
            grid: {
              display: false
            }
          },
          y: {
            display: true,
            min: minPrice - padding,
            max: maxPrice + padding,
            ticks: {
              maxTicksLimit: 5,
              font: {
                size: 8
              },
              callback: function(value: any) {
                return '$' + value.toFixed(2);
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          }
        }
      }
    };

    // Render chart to buffer
    const buffer = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);

    // Convert to base64
    const base64Image = buffer.toString('base64');

    // Save to database
    this.saveThumbnail(ticker, startDate, endDate, base64Image);

    console.log(`✅ Chart generated and cached for ${ticker}`);

    return {
      ticker,
      startDate,
      endDate,
      chartData: base64Image,
      width: this.width,
      height: this.height
    };
  }

  /**
   * Get cached thumbnail from database
   */
  private getCachedThumbnail(
    ticker: string,
    startDate: string,
    endDate: string
  ): ChartThumbnailResponse | null {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT chart_data, width, height
        FROM chart_thumbnails
        WHERE ticker = ? AND start_date = ? AND end_date = ?
      `);

      const row = stmt.get(ticker, startDate, endDate) as any;

      if (row) {
        return {
          ticker,
          startDate,
          endDate,
          chartData: row.chart_data,
          width: row.width,
          height: row.height
        };
      }

      return null;
    } catch (error: any) {
      console.error('Error fetching cached thumbnail:', error);
      return null;
    }
  }

  /**
   * Save thumbnail to database
   */
  private saveThumbnail(
    ticker: string,
    startDate: string,
    endDate: string,
    chartData: string
  ): void {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO chart_thumbnails (ticker, start_date, end_date, chart_data, width, height)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, start_date, end_date) DO UPDATE SET
          chart_data = excluded.chart_data,
          created_at = CURRENT_TIMESTAMP
      `);

      stmt.run(ticker, startDate, endDate, chartData, this.width, this.height);
    } catch (error: any) {
      console.error('Error saving thumbnail to database:', error);
      // Don't throw - caching is optional
    }
  }

  /**
   * Clear all cached thumbnails (useful for testing or cache invalidation)
   */
  clearCache(): number {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM chart_thumbnails');
      const result = stmt.run();
      console.log(`🗑️  Cleared ${result.changes} cached thumbnails`);
      return result.changes;
    } catch (error: any) {
      console.error('Error clearing thumbnail cache:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { totalCached: number; tickers: string[] } {
    try {
      const db = getDatabase();

      const countStmt = db.prepare('SELECT COUNT(*) as count FROM chart_thumbnails');
      const countRow = countStmt.get() as any;

      const tickersStmt = db.prepare('SELECT DISTINCT ticker FROM chart_thumbnails ORDER BY ticker');
      const tickerRows = tickersStmt.all() as any[];

      return {
        totalCached: countRow.count,
        tickers: tickerRows.map(row => row.ticker)
      };
    } catch (error: any) {
      console.error('Error getting cache stats:', error);
      return { totalCached: 0, tickers: [] };
    }
  }
}

// Export singleton instance
export const chartGeneratorService = new ChartGeneratorService();
