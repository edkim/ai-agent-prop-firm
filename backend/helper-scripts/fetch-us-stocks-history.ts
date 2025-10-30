/**
 * Fetch 5 years of historical data for all US stocks
 * and compute daily metrics
 */

import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import axios from 'axios';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const BATCH_SIZE = 200; // Process 200 tickers at a time
const DELAY_BETWEEN_BATCHES = 0; // No delay between batches

interface PolygonBar {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface DailyMetrics {
  ticker: string;
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_percent: number;
  change_from_open: number;
  high_low_range_percent: number;
  close_to_high_percent: number;
  close_to_low_percent: number;
}

async function fetchHistoricalData(ticker: string, from: string, to: string): Promise<PolygonBar[]> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`;
    const response = await axios.get(url, {
      params: { apiKey: POLYGON_API_KEY, limit: 50000 },
    });

    if (response.data.results && response.data.results.length > 0) {
      return response.data.results;
    }
    return [];
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`⚠️  Rate limited on ${ticker}, waiting 60s...`);
      await sleep(60000);
      return fetchHistoricalData(ticker, from, to);
    }
    console.error(`Error fetching ${ticker}:`, error.message);
    return [];
  }
}

function computeDailyMetrics(ticker: string, bars: PolygonBar[]): DailyMetrics[] {
  const metrics: DailyMetrics[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const date = new Date(bar.t);
    const dateStr = date.toISOString().split('T')[0];

    const change_percent = i > 0 ? ((bar.c - bars[i - 1].c) / bars[i - 1].c) * 100 : 0;
    const change_from_open = ((bar.c - bar.o) / bar.o) * 100;
    const high_low_range_percent = ((bar.h - bar.l) / bar.o) * 100;
    const close_to_high_percent = ((bar.c - bar.l) / (bar.h - bar.l)) * 100;
    const close_to_low_percent = ((bar.h - bar.c) / (bar.h - bar.l)) * 100;

    metrics.push({
      ticker,
      date: dateStr,
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      change_percent,
      change_from_open,
      high_low_range_percent,
      close_to_high_percent,
      close_to_low_percent,
    });
  }

  // Compute additional metrics that require historical data
  return computeAdvancedMetrics(metrics);
}

function computeAdvancedMetrics(metrics: DailyMetrics[]): DailyMetrics[] {
  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i] as any;

    // Initialize all optional fields to null
    metric.volume_ratio = null;
    metric.volume_20d_avg = null;
    metric.sma_20 = null;
    metric.sma_50 = null;
    metric.sma_200 = null;
    metric.price_to_sma20_percent = null;
    metric.price_to_sma50_percent = null;
    metric.price_to_sma200_percent = null;
    metric.rsi_14 = null;
    metric.consecutive_up_days = 0;
    metric.consecutive_down_days = 0;
    metric.change_5d_percent = null;
    metric.change_10d_percent = null;
    metric.change_20d_percent = null;

    // Volume ratio (current / 20-day average)
    if (i >= 20) {
      const volumes = metrics.slice(i - 20, i).map(m => m.volume);
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      metric.volume_20d_avg = avgVolume;
      metric.volume_ratio = metric.volume / avgVolume;
    }

    // Moving averages
    if (i >= 20) {
      const closes20 = metrics.slice(i - 19, i + 1).map(m => m.close);
      metric.sma_20 = closes20.reduce((a, b) => a + b, 0) / 20;
      metric.price_to_sma20_percent = ((metric.close - metric.sma_20) / metric.sma_20) * 100;
    }

    if (i >= 50) {
      const closes50 = metrics.slice(i - 49, i + 1).map(m => m.close);
      metric.sma_50 = closes50.reduce((a, b) => a + b, 0) / 50;
      metric.price_to_sma50_percent = ((metric.close - metric.sma_50) / metric.sma_50) * 100;
    }

    if (i >= 200) {
      const closes200 = metrics.slice(i - 199, i + 1).map(m => m.close);
      metric.sma_200 = closes200.reduce((a, b) => a + b, 0) / 200;
      metric.price_to_sma200_percent = ((metric.close - metric.sma_200) / metric.sma_200) * 100;
    }

    // RSI
    if (i >= 14) {
      const changes = metrics.slice(i - 13, i + 1).map(m => m.change_percent);
      const gains = changes.map(c => (c > 0 ? c : 0));
      const losses = changes.map(c => (c < 0 ? Math.abs(c) : 0));
      const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      metric.rsi_14 = 100 - 100 / (1 + rs);
    }

    // Consecutive up/down days
    let consecutiveUp = 0;
    let consecutiveDown = 0;
    for (let j = i; j > 0 && j > i - 20; j--) {
      if (metrics[j].change_percent > 0) {
        if (consecutiveDown > 0) break;
        consecutiveUp++;
      } else if (metrics[j].change_percent < 0) {
        if (consecutiveUp > 0) break;
        consecutiveDown++;
      } else {
        break;
      }
    }
    metric.consecutive_up_days = consecutiveUp;
    metric.consecutive_down_days = consecutiveDown;

    // Multi-day changes
    if (i >= 5) {
      metric.change_5d_percent = ((metric.close - metrics[i - 5].close) / metrics[i - 5].close) * 100;
    }
    if (i >= 10) {
      metric.change_10d_percent = ((metric.close - metrics[i - 10].close) / metrics[i - 10].close) * 100;
    }
    if (i >= 20) {
      metric.change_20d_percent = ((metric.close - metrics[i - 20].close) / metrics[i - 20].close) * 100;
    }
  }

  return metrics as DailyMetrics[];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting US stocks historical data fetch...\n');

  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY environment variable not set');
    process.exit(1);
  }

  initializeDatabase();
  const db = getDatabase();

  // Get all US stock tickers
  const tickers = db
    .prepare(
      `SELECT ticker FROM universe_stocks WHERE universe_id = (SELECT id FROM universe WHERE name = 'us-stocks')`
    )
    .all() as { ticker: string }[];

  console.log(`📊 Found ${tickers.length} tickers to process\n`);

  if (tickers.length === 0) {
    console.error('❌ No tickers found. Run fetch-us-stocks.ts first to populate the universe.');
    process.exit(1);
  }

  // Date range: 5 years ago to today
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  console.log(`📅 Date range: ${fromDate} to ${toDate}\n`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO daily_metrics (
      ticker, date, timestamp, open, high, low, close, volume,
      change_percent, change_from_open, volume_ratio, volume_20d_avg,
      high_low_range_percent, close_to_high_percent, close_to_low_percent,
      sma_20, sma_50, sma_200,
      price_to_sma20_percent, price_to_sma50_percent, price_to_sma200_percent,
      rsi_14, consecutive_up_days, consecutive_down_days,
      change_5d_percent, change_10d_percent, change_20d_percent
    ) VALUES (
      @ticker, @date, @timestamp, @open, @high, @low, @close, @volume,
      @change_percent, @change_from_open, @volume_ratio, @volume_20d_avg,
      @high_low_range_percent, @close_to_high_percent, @close_to_low_percent,
      @sma_20, @sma_50, @sma_200,
      @price_to_sma20_percent, @price_to_sma50_percent, @price_to_sma200_percent,
      @rsi_14, @consecutive_up_days, @consecutive_down_days,
      @change_5d_percent, @change_10d_percent, @change_20d_percent
    )
  `);

  let processed = 0;
  let totalBars = 0;
  let skipped = 0;

  // Process in batches
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tickers.length / BATCH_SIZE)}`);
    console.log(`   Progress: ${processed + skipped}/${tickers.length} (${((processed + skipped) / tickers.length * 100).toFixed(1)}%)`);

    for (const { ticker } of batch) {
      try {
        console.log(`  Fetching ${ticker}...`);
        const bars = await fetchHistoricalData(ticker, fromDate, toDate);

        if (bars.length === 0) {
          console.log(`  ⚠️  No data for ${ticker}`);
          skipped++;
          continue;
        }

        const metrics = computeDailyMetrics(ticker, bars);

        // Insert in transaction
        const insertMany = db.transaction((metrics: any[]) => {
          for (const metric of metrics) {
            insertStmt.run(metric);
          }
        });

        insertMany(metrics);

        totalBars += bars.length;
        processed++;
        console.log(`  ✅ ${ticker}: ${bars.length} bars inserted`);

        // Small delay between tickers
        await sleep(100);
      } catch (error: any) {
        console.error(`  ❌ Error processing ${ticker}:`, error.message);
        skipped++;
      }
    }

    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < tickers.length) {
      console.log(`\n⏸️  Waiting 12 seconds before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log(`\n✅ Processing complete!`);
  console.log(`📊 Processed ${processed}/${tickers.length} tickers`);
  console.log(`⚠️  Skipped ${skipped} tickers (no data or errors)`);
  console.log(`📈 Total bars inserted: ${totalBars}`);

  // Verify final count
  const count = db.prepare('SELECT COUNT(*) as count FROM daily_metrics').get() as { count: number };
  console.log(`🗄️  Total rows in daily_metrics: ${count.count}`);

  closeDatabase();
  console.log('\n✨ Done!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
