/**
 * Gap-and-Go Scanner (TREND FOLLOWING - LONG)
 *
 * Pattern: Gap up at open, price HOLDS above VWAP (strength continuation)
 * Edge: Momentum - strong gaps continue higher
 *
 * Entry: LONG when price stays above VWAP after gap up (buying strength)
 * Target: Extended move (momentum continuation)
 * Stop: VWAP breakdown (momentum fails)
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// === ADJUSTABLE PARAMETERS ===
const MIN_GAP_PERCENT = 1.0;   // Minimum gap UP %
const MIN_VOLUME_RATIO = 0.5;  // Minimum volume vs average
const MIN_BARS_ABOVE_VWAP = 3; // Must hold above VWAP for X bars before entry
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
  bars_above_vwap: number;
  volume_ratio: number;
  metrics: {
    gap_percent: number;
    vwap_at_signal: number;
    volume_ratio: number;
    bars_above_vwap: number;
  };
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

function getRTHBars(ticker: string, date: string): Bar[] {
  const bars = db.prepare(`
    SELECT timestamp, time_of_day, open, high, low, close, volume
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
      AND time_of_day >= '09:30:00'
      AND time_of_day <= '16:00:00'
    ORDER BY timestamp ASC
  `).all(ticker, date) as Bar[];

  return bars;
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
    console.error('No tickers provided in SCAN_TICKERS', 'error');
    return [];
  }

  const signals: Signal[] = [];

  for (const ticker of tickers) {
    try {
      const datesResult = db.prepare(`
        SELECT DISTINCT date(timestamp/1000, 'unixepoch') as trade_date
        FROM ohlcv_data
        WHERE ticker = ?
          AND date(timestamp/1000, 'unixepoch') >= ?
          AND date(timestamp/1000, 'unixepoch') <= ?
          AND timeframe = '5min'
        ORDER BY trade_date ASC
      `).all(ticker, startDate, endDate) as { trade_date: string }[];

      for (const { trade_date } of datesResult) {
        const dayBars = getRTHBars(ticker, trade_date);
        if (dayBars.length < 10) continue;

        // Get previous day's RTH close
        let prevDate = getPreviousDate(trade_date);
        let prevBars = getRTHBars(ticker, prevDate);

        let attempts = 0;
        while (prevBars.length === 0 && attempts < 5) {
          prevDate = getPreviousDate(prevDate);
          prevBars = getRTHBars(ticker, prevDate);
          attempts++;
        }

        if (prevBars.length === 0) continue;

        const prevClose = prevBars[prevBars.length - 1].close;
        const openPrice = dayBars[0].open;
        const gapPercent = ((openPrice - prevClose) / prevClose) * 100;

        // Check if gap UP meets criteria
        if (gapPercent <= MIN_GAP_PERCENT) continue;

        // Find periods where price HOLDS above VWAP (strength)
        // Look for X consecutive bars above VWAP after gap up
        let consecutiveBarsAboveVWAP = 0;
        let signalBarIndex = -1;

        for (let i = 0; i < dayBars.length; i++) {
          const vwap = calculateVWAP(dayBars, i);
          const isAboveVWAP = dayBars[i].close > vwap;

          if (isAboveVWAP) {
            consecutiveBarsAboveVWAP++;

            // Signal when we've held above VWAP for MIN_BARS_ABOVE_VWAP
            if (consecutiveBarsAboveVWAP >= MIN_BARS_ABOVE_VWAP && signalBarIndex === -1) {
              signalBarIndex = i;
              break;
            }
          } else {
            consecutiveBarsAboveVWAP = 0; // Reset if we break below
          }
        }

        if (signalBarIndex === -1) continue;

        // Check volume
        const avgVolume = calculateAverageVolume(dayBars, signalBarIndex, LOOKBACK_BARS);
        const volumeRatio = avgVolume > 0 ? dayBars[signalBarIndex].volume / avgVolume : 0;

        if (volumeRatio < MIN_VOLUME_RATIO) continue;

        // Calculate pattern strength
        const gapStrength = Math.min(Math.abs(gapPercent) * 20, 50);
        const volumeStrength = Math.min(volumeRatio * 20, 30);
        const holdStrength = Math.min(consecutiveBarsAboveVWAP * 5, 20);
        const patternStrength = Math.floor(gapStrength + volumeStrength + holdStrength);

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
          bars_above_vwap: consecutiveBarsAboveVWAP,
          volume_ratio: Math.round(volumeRatio * 100) / 100,
          metrics: {
            gap_percent: Math.round(gapPercent * 100) / 100,
            vwap_at_signal: Math.round(vwap * 100) / 100,
            volume_ratio: Math.round(volumeRatio * 100) / 100,
            bars_above_vwap: consecutiveBarsAboveVWAP
          }
        });
      }
    } catch (error: any) {
      console.error(`Error scanning ${ticker}:`, error.message, 'error');
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
    console.error('Scan failed:', error, 'error');
    db.close();
    process.exit(1);
  });
