/**
 * Gap Down VWAP Reclaim Scanner Template
 *
 * Pattern: Gap down at open, price reclaims VWAP intraday
 * Edge: Mean reversion after panic selling
 *
 * Parameters (modify to iterate faster):
 * - MIN_GAP_PERCENT: Minimum gap down size (default: 2%)
 * - MIN_VOLUME_RATIO: Minimum volume vs average (default: 1.5x)
 * - MIN_VWAP_CROSSES: Minimum VWAP recrosses (default: 1)
 */

import Database from 'better-sqlite3';

// Get database path from environment or use default
const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// === ADJUSTABLE PARAMETERS ===
const MIN_GAP_PERCENT = 2.0;      // Minimum gap down % (try: 1.0, 1.5, 2.0, 3.0) - TIGHTENED
const MIN_VOLUME_RATIO = 1.5;     // Minimum volume ratio (try: 1.0, 1.2, 1.5, 2.0) - TIGHTENED
const MIN_VWAP_CROSSES = 2;       // Minimum VWAP recrosses (try: 1, 2) - TIGHTENED
const LOOKBACK_BARS = 20;         // Bars for volume average (try: 10, 20, 30)

interface Bar {
  timestamp: number;
  time_of_day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Signal {
  ticker: string;
  signal_date: string;
  signal_time: string;
  direction: 'LONG';
  pattern_strength: number;
  entry_price: number;
  gap_percent: number;
  vwap_crosses: number;
  volume_ratio: number;
  metrics: {
    gap_percent: number;
    vwap_at_signal: number;
    volume_ratio: number;
    vwap_crosses: number;
  };
}

// Calculate VWAP for bars up to current index
function calculateVWAP(bars: Bar[], upToIndex: number): number {
  let cumVolume = 0;
  let cumVolumePrice = 0;

  for (let i = 0; i <= upToIndex; i++) {
    const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
    cumVolumePrice += typical * bars[i].volume;
    cumVolume += bars[i].volume;
  }

  return cumVolume > 0 ? cumVolumePrice / cumVolume : 0;
}

// Calculate average volume for previous bars
function calculateAverageVolume(bars: Bar[], currentIndex: number, lookback: number): number {
  if (currentIndex < lookback) return 0;

  let totalVolume = 0;
  for (let i = currentIndex - lookback; i < currentIndex; i++) {
    totalVolume += bars[i].volume;
  }

  return totalVolume / lookback;
}

// Main scanner function
async function scan(): Promise<Signal[]> {
  const tickers = process.env.SCAN_TICKERS?.split(',') || [];
  const startDate = process.env.SCAN_START_DATE || '';
  const endDate = process.env.SCAN_END_DATE || '';

  if (tickers.length === 0) {
    console.error('No tickers provided in SCAN_TICKERS');
    return [];
  }

  const signals: Signal[] = [];

  // Calculate one day before start date to get previous close for gap calculation
  const startDateObj = new Date(startDate);
  startDateObj.setDate(startDateObj.getDate() - 1);
  const queryStartDate = startDateObj.toISOString().split('T')[0];

  for (const ticker of tickers) {
    try {
      // Get all bars for this ticker in date range (regular trading hours only)
      // Query starts one day before to get previous close for gap calculation
      // Filter for regular hours: 14:00-21:30 UTC covers 9:30 AM - 4:00 PM ET across DST changes
      const bars = db.prepare(`
        SELECT
          timestamp,
          strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time_of_day,
          open, high, low, close, volume
        FROM ohlcv_data
        WHERE ticker = ?
          AND date(timestamp/1000, 'unixepoch') >= date(?)
          AND date(timestamp/1000, 'unixepoch') <= date(?)
          AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) >= 14
          AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) <= 21
        ORDER BY timestamp ASC
      `).all(ticker, queryStartDate, endDate) as Bar[];

      if (bars.length === 0) continue;

      // Group by date
      const barsByDate: { [date: string]: Bar[] } = {};
      for (const bar of bars) {
        const date = new Date(bar.timestamp).toISOString().split('T')[0];
        if (!barsByDate[date]) barsByDate[date] = [];
        barsByDate[date].push(bar);
      }

      // Process each date (only dates in the original scan range)
      for (const [date, dayBars] of Object.entries(barsByDate)) {
        // Skip dates before the original start date (we only fetched them for gap calculation)
        if (date < startDate || date > endDate) {
          continue;
        }

        if (dayBars.length < 10) {
          continue; // Need enough bars
        }

        // Get previous day's close for gap calculation
        const prevDate = getPreviousDate(date);
        const prevDayBars = barsByDate[prevDate];
        if (!prevDayBars || prevDayBars.length === 0) {
          continue;
        }

        const prevClose = prevDayBars[prevDayBars.length - 1].close;
        const openPrice = dayBars[0].open;
        const gapPercent = ((openPrice - prevClose) / prevClose) * 100;

        // Check if gap down meets criteria
        if (gapPercent >= -MIN_GAP_PERCENT) continue;

        // Track VWAP crosses
        let vwapCrosses = 0;
        let wasBelow = openPrice < calculateVWAP(dayBars, 0);

        // Process each bar looking for VWAP reclaim
        for (let i = 1; i < dayBars.length; i++) {
          const vwap = calculateVWAP(dayBars, i);
          const isBelow = dayBars[i].close < vwap;

          // Count crosses (from below to above)
          if (wasBelow && !isBelow) {
            vwapCrosses++;
          }

          wasBelow = isBelow;

          // Check if we have enough crosses
          if (vwapCrosses >= MIN_VWAP_CROSSES) {
            // Check volume
            const avgVolume = calculateAverageVolume(dayBars, i, Math.min(LOOKBACK_BARS, i));
            const volumeRatio = avgVolume > 0 ? dayBars[i].volume / avgVolume : 0;

            if (volumeRatio >= MIN_VOLUME_RATIO) {
              // Generate signal
              const patternStrength = Math.min(100,
                (Math.abs(gapPercent) / 5 * 30) +  // Gap size contributes 30pts
                (vwapCrosses * 20) +                // VWAP crosses contribute 20pts each
                (Math.min(volumeRatio, 3) / 3 * 50) // Volume contributes up to 50pts
              );

              signals.push({
                ticker,
                signal_date: date,
                signal_time: dayBars[i].time_of_day,
                direction: 'LONG',
                pattern_strength: Math.round(patternStrength),
                entry_price: dayBars[i].close,
                gap_percent: Math.round(gapPercent * 100) / 100,
                vwap_crosses: vwapCrosses,
                volume_ratio: Math.round(volumeRatio * 100) / 100,
                metrics: {
                  gap_percent: Math.round(gapPercent * 100) / 100,
                  vwap_at_signal: Math.round(vwap * 100) / 100,
                  volume_ratio: Math.round(volumeRatio * 100) / 100,
                  vwap_crosses: vwapCrosses
                }
              });

              break; // One signal per ticker per day
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`Error scanning ${ticker}:`, error.message);
    }
  }

  return signals;
}

// Helper to get previous date (simple version, doesn't account for weekends)
function getPreviousDate(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

// Execute scanner
scan()
  .then(signals => {
    console.log(JSON.stringify(signals, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Scanner error:', error);
    process.exit(1);
  });
