/**
 * Chart Generator Service
 *
 * Generates chart thumbnails for scan results using ChartJS on the server side.
 * Stores generated charts in the database as base64-encoded PNG images.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { getDatabase } from '../database/db';
import 'chartjs-adapter-date-fns';

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
  signalDate?: string; // Optional: if provided, line changes from blue to green at this date
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
    const { ticker, startDate, endDate, bars, signalDate } = request;

    // Check if we already have this chart cached
    const cached = this.getCachedThumbnail(ticker, startDate, endDate, signalDate);
    if (cached) {
      console.log(`📊 Using cached chart for ${ticker} (${startDate} to ${endDate}${signalDate ? ` signal: ${signalDate}` : ''})`);
      return cached;
    }

    console.log(`🎨 Generating chart for ${ticker} (${startDate} to ${endDate}${signalDate ? ` signal: ${signalDate}` : ''})...`);

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

    // Create datasets - split at signal date if provided
    let datasets;
    if (signalDate) {
      // Find the index of the signal date
      const signalIndex = labels.findIndex(date => date === signalDate);

      if (signalIndex > 0) {
        // Split data into before and after signal
        const beforeData = closePrices.map((price, idx) => idx <= signalIndex ? price : null);
        const afterData = closePrices.map((price, idx) => idx >= signalIndex ? price : null);

        datasets = [
          {
            label: `${ticker} (before signal)`,
            data: beforeData,
            borderColor: 'rgb(59, 130, 246)', // Blue
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 1,
            pointHoverRadius: 3,
            spanGaps: false,
          },
          {
            label: `${ticker} (after signal)`,
            data: afterData,
            borderColor: 'rgb(34, 197, 94)', // Green
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 1,
            pointHoverRadius: 3,
            spanGaps: false,
          }
        ];
      } else {
        // Signal date not found, use single dataset
        datasets = [{
          label: ticker,
          data: closePrices,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 3,
        }];
      }
    } else {
      // No signal date, use single blue dataset
      datasets = [{
        label: ticker,
        data: closePrices,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 1,
        pointHoverRadius: 3,
      }];
    }

    // Generate chart configuration
    const configuration = {
      type: 'line' as const,
      data: {
        labels,
        datasets
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
    this.saveThumbnail(ticker, startDate, endDate, base64Image, signalDate);

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
    endDate: string,
    signalDate?: string
  ): ChartThumbnailResponse | null {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT chart_data, width, height
        FROM chart_thumbnails
        WHERE ticker = ? AND start_date = ? AND end_date = ? AND signal_date ${signalDate ? '= ?' : 'IS NULL'}
      `);

      const row = signalDate
        ? stmt.get(ticker, startDate, endDate, signalDate) as any
        : stmt.get(ticker, startDate, endDate) as any;

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
    chartData: string,
    signalDate?: string
  ): void {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO chart_thumbnails (ticker, start_date, end_date, signal_date, chart_data, width, height)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, start_date, end_date, signal_date) DO UPDATE SET
          chart_data = excluded.chart_data,
          created_at = CURRENT_TIMESTAMP
      `);

      stmt.run(ticker, startDate, endDate, signalDate || null, chartData, this.width, this.height);
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

  /**
   * Generate daily context chart for Claude analysis
   * Shows daily bars from end date → 30 days after (or latest available)
   * Large format: 1400x700px with volume bars
   */
  async generateDailyContextChart(
    ticker: string,
    signalStartDate: string,
    signalEndDate: string,
    bars: DailyBar[]
  ): Promise<Buffer> {
    console.log(`🎨 Generating daily context chart for ${ticker}...`);

    // Sort bars by date
    const sortedBars = [...bars].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Extract data
    const labels = sortedBars.map(bar => bar.date);
    const priceData = sortedBars.map(bar => bar.close);
    const volumeData = sortedBars.map(bar => ({
      x: bar.date,
      y: bar.volume
    }));

    // Calculate average volume for reference line
    const avgVolume = sortedBars.reduce((sum, bar) => sum + bar.volume, 0) / sortedBars.length;

    // Chart configuration
    const configuration: any = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${ticker} Price (Close)`,
            data: priceData,
            yAxisID: 'price',
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            type: 'bar',
            label: 'Volume',
            data: volumeData,
            yAxisID: 'volume',
            backgroundColor: sortedBars.map(bar =>
              bar.close >= bar.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            ),
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: {
          padding: 20
        },
        scales: {
          x: {
            type: 'category',
            ticks: {
              color: 'white',
              font: { size: 11 },
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          price: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: 'white',
              font: { size: 11 },
              callback: function(value: any) {
                return '$' + value.toFixed(2);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            title: {
              display: true,
              text: 'Price ($)',
              color: 'white',
              font: { size: 13 }
            }
          },
          volume: {
            type: 'linear',
            position: 'right',
            ticks: {
              color: 'white',
              font: { size: 11 },
              callback: function(value: any) {
                return (value / 1000000).toFixed(1) + 'M';
              }
            },
            grid: {
              display: false
            },
            title: {
              display: true,
              text: 'Volume',
              color: 'white',
              font: { size: 13 }
            },
            max: avgVolume * 6 // Scale to show volume spikes
          }
        },
        plugins: {
          title: {
            display: true,
            text: `${ticker} - Daily Context (${signalStartDate} to ${signalEndDate} highlighted)`,
            color: 'white',
            font: { size: 16, weight: 'bold' }
          },
          legend: {
            display: false
          }
        }
      }
    };

    // Render chart
    const canvas = new ChartJSNodeCanvas({
      width: 1400,
      height: 700,
      backgroundColour: '#1a1a2e'
    });

    return await canvas.renderToBuffer(configuration);
  }

  /**
   * Generate intraday detail chart for Claude analysis
   * Shows 5-min bars from 5 days before signal end → 5 days after
   * Large format: 1400x700px with volume bars
   */
  async generateIntradayDetailChart(
    ticker: string,
    signalEndDate: string,
    bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>
  ): Promise<Buffer> {
    console.log(`🎨 Generating intraday detail chart for ${ticker}...`);

    if (bars.length === 0) {
      throw new Error('No intraday bars provided for chart generation');
    }

    // Sort bars by timestamp
    const sortedBars = [...bars].sort((a, b) => a.timestamp - b.timestamp);

    // Extract data
    const labels = sortedBars.map(bar => new Date(bar.timestamp).toISOString());
    const priceData = sortedBars.map(bar => ({
      x: new Date(bar.timestamp),
      y: bar.close
    }));
    const volumeData = sortedBars.map(bar => ({
      x: new Date(bar.timestamp),
      y: bar.volume
    }));

    // Calculate average volume
    const avgVolume = sortedBars.reduce((sum, bar) => sum + bar.volume, 0) / sortedBars.length;

    // Chart configuration
    const configuration: any = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${ticker} Price (Close)`,
            data: priceData,
            yAxisID: 'price',
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 3
          },
          {
            type: 'bar',
            label: 'Volume',
            data: volumeData,
            yAxisID: 'volume',
            backgroundColor: sortedBars.map(bar =>
              bar.close >= bar.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            ),
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: {
          padding: 20
        },
        scales: {
          x: {
            type: 'category',
            ticks: {
              color: 'white',
              font: { size: 10 },
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          price: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: 'white',
              font: { size: 11 },
              callback: function(value: any) {
                return '$' + value.toFixed(2);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            title: {
              display: true,
              text: 'Price ($)',
              color: 'white',
              font: { size: 13 }
            }
          },
          volume: {
            type: 'linear',
            position: 'right',
            ticks: {
              color: 'white',
              font: { size: 11 },
              callback: function(value: any) {
                return (value / 1000).toFixed(0) + 'K';
              }
            },
            grid: {
              display: false
            },
            title: {
              display: true,
              text: 'Volume',
              color: 'white',
              font: { size: 13 }
            },
            max: avgVolume * 6
          }
        },
        plugins: {
          title: {
            display: true,
            text: `${ticker} - Intraday Detail (5-min bars around ${signalEndDate})`,
            color: 'white',
            font: { size: 16, weight: 'bold' }
          },
          legend: {
            display: false
          }
        }
      }
    };

    // Render chart
    const canvas = new ChartJSNodeCanvas({
      width: 1400,
      height: 700,
      backgroundColour: '#1a1a2e'
    });

    return await canvas.renderToBuffer(configuration);
  }
}

// Export singleton instance
export const chartGeneratorService = new ChartGeneratorService();
