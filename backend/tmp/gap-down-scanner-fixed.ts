/**
 * Gap Down VWAP Reclaim Scanner - FIXED VERSION
 *
 * FIXES:
 * 1. Proper RTH (Regular Trading Hours) filtering: 9:30 AM - 4:00 PM ET
 * 2. Correct gap calculation using RTH open/close only
 * 3. DST-aware timezone handling
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// === ADJUSTABLE PARAMETERS ===
const MIN_GAP_PERCENT = 1.0;  // Start with loose filter to test
const MIN_VOLUME_RATIO = 0.5; // Start with loose filter to test
const MIN_VWAP_CROSSES = 1;   // Start with loose filter to test
const LOOKBACK_BARS = 20;

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

/**
 * Determine if a date is during EDT (Daylight Saving Time) or EST
 * 2025 DST: March 9 - November 2
 */
function isEDT(date: string): boolean {
  const d = new Date(date + 'T12:00:00Z');
  const year = d.getUTCFullYear();

  // DST starts second Sunday in March, ends first Sunday in November
  if (year === 2025) {
    return d >= new Date('2025-03-09') && d < new Date('2025-11-02');
  }

  // Generic calculation for other years (simplified)
  const month = d.getUTCMonth() + 1;
  return month >= 3 && month < 11;
}

/**
 * Get RTH time boundaries in UTC for a given date
 * RTH = 9:30 AM - 4:00 PM ET
 */
function getRTHBoundaries(date: string): { startHour: number; endHour: number } {
  if (isEDT(date)) {
    // EDT: UTC-4, so 9:30 AM EDT = 13:30 UTC, 4:00 PM EDT = 20:00 UTC
    return { startHour: 13, endHour: 20 };
  } else {
    // EST: UTC-5, so 9:30 AM EST = 14:30 UTC, 4:00 PM EST = 21:00 UTC
    return { startHour: 14, endHour: 21 };
  }
}

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

function calculateAverageVolume(bars: Bar[], currentIndex: number, lookback: number): number {
  if (currentIndex < lookback) return 0;

  let totalVolume = 0;
  for (let i = currentIndex - lookback; i < currentIndex; i++) {
    totalVolume += bars[i].volume;
  }

  return totalVolume / lookback;
}

/**
 * Get RTH bars for a specific date
 */
function getRTHBars(ticker: string, date: string): Bar[] {
  const { startHour, endHour } = getRTHBoundaries(date);

  // For RTH, we want bars from 9:30 AM to 4:00 PM ET
  // First bar: 9:30 AM ET (13:30 or 14:30 UTC depending on DST)
  // Last bar: 3:55 PM ET (19:55 or 20:55 UTC) for 5-min bars

  const bars = db.prepare(`
    SELECT
      timestamp,
      time_of_day,
      open, high, low, close, volume
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
      AND (
        (CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) > ? AND
         CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) < ?)
        OR
        (CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) = ? AND
         CAST(strftime('%M', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) >= 30)
        OR
        (CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) = ? AND
         CAST(strftime('%M', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) < 60)
      )
    ORDER BY timestamp ASC
  `).all(ticker, date, startHour, endHour, startHour, endHour) as Bar[];

  return bars;
}

/**
 * Get RTH close for a specific date (last RTH bar close price)
 */
function getRTHClose(ticker: string, date: string): number | null {
  const bars = getRTHBars(ticker, date);
  return bars.length > 0 ? bars[bars.length - 1].close : null;
}

/**
 * Get RTH open for a specific date (first RTH bar open price)
 */
function getRTHOpen(ticker: string, date: string): number | null {
  const bars = getRTHBars(ticker, date);
  return bars.length > 0 ? bars[0].open : null;
}

function getPreviousDate(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function scan(): Promise<Signal[]> {
  const tickers = process.env.SCAN_TICKERS?.split(',') || [];
  const startDate = process.env.SCAN_START_DATE || '';
  const endDate = process.env.SCAN_END_DATE || '';

  if (tickers.length === 0) {
    console.error('No tickers provided in SCAN_TICKERS');
    return [];
  }

  const signals: Signal[] = [];

  for (const ticker of tickers) {
    try {
      // Get unique trading days in the range
      const datesResult = db.prepare(`
        SELECT DISTINCT date(timestamp/1000, 'unixepoch') as trade_date
        FROM ohlcv_data
        WHERE ticker = ?
          AND date(timestamp/1000, 'unixepoch') >= ?
          AND date(timestamp/1000, 'unixepoch') <= ?
        ORDER BY trade_date ASC
      `).all(ticker, startDate, endDate) as { trade_date: string }[];

      for (const { trade_date } of datesResult) {
        const dayBars = getRTHBars(ticker, trade_date);

        if (dayBars.length < 10) continue;

        // Get previous day's RTH close
        let prevDate = getPreviousDate(trade_date);
        let prevClose = getRTHClose(ticker, prevDate);

        // If no data for previous day (e.g., weekend), try day before that
        let attempts = 0;
        while (prevClose === null && attempts < 5) {
          prevDate = getPreviousDate(prevDate);
          prevClose = getRTHClose(ticker, prevDate);
          attempts++;
        }

        if (prevClose === null) continue;

        const openPrice = dayBars[0].open;
        const gapPercent = ((openPrice - prevClose) / prevClose) * 100;

        // Check if gap down meets criteria
        if (gapPercent >= -MIN_GAP_PERCENT) continue;

        // Calculate VWAP and detect crosses
        let vwapCrosses = 0;
        let wasBelow = false;

        for (let i = 0; i < dayBars.length; i++) {
          const vwap = calculateVWAP(dayBars, i);
          const isBelow = dayBars[i].close < vwap;

          if (i > 0 && wasBelow && !isBelow) {
            vwapCrosses++;
          }

          wasBelow = isBelow;
        }

        if (vwapCrosses < MIN_VWAP_CROSSES) continue;

        // Find signal bar (first VWAP cross)
        let signalBarIndex = -1;
        wasBelow = false;

        for (let i = 0; i < dayBars.length; i++) {
          const vwap = calculateVWAP(dayBars, i);
          const isBelow = dayBars[i].close < vwap;

          if (i > 0 && wasBelow && !isBelow) {
            signalBarIndex = i;
            break;
          }

          wasBelow = isBelow;
        }

        if (signalBarIndex === -1) continue;

        // Check volume
        const avgVolume = calculateAverageVolume(dayBars, signalBarIndex, LOOKBACK_BARS);
        const volumeRatio = avgVolume > 0 ? dayBars[signalBarIndex].volume / avgVolume : 0;

        if (volumeRatio < MIN_VOLUME_RATIO) continue;

        // Calculate pattern strength
        const gapStrength = Math.min(Math.abs(gapPercent) * 20, 50);
        const volumeStrength = Math.min(volumeRatio * 20, 30);
        const crossStrength = Math.min(vwapCrosses * 10, 20);
        const patternStrength = Math.floor(gapStrength + volumeStrength + crossStrength);

        const vwap = calculateVWAP(dayBars, signalBarIndex);
        const signalBar = dayBars[signalBarIndex];

        signals.push({
          ticker,
          signal_date: trade_date,
          signal_time: signalBar.time_of_day,
          direction: 'LONG',
          pattern_strength: patternStrength,
          entry_price: signalBar.close,
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
      }
    } catch (error: any) {
      console.error(`Error scanning ${ticker}:`, error.message);
    }
  }

  return signals;
}

scan()
  .then(signals => {
    console.log(JSON.stringify(signals, null, 2));
    db.close();
  })
  .catch(error => {
    console.error('Scan failed:', error);
    db.close();
    process.exit(1);
  });
