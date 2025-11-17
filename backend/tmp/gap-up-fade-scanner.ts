/**
 * Gap-Up Fade Scanner (SHORT-BIASED)
 *
 * Pattern: Gap up at open, price fades back below VWAP
 * Edge: Mean reversion - gap-ups often fail and fill
 *
 * Entry: SHORT when price crosses below VWAP after gap up
 * Target: Gap fill (previous close)
 * Stop: Price reclaims VWAP and continues higher
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// === ADJUSTABLE PARAMETERS ===
const MIN_GAP_PERCENT = 1.0;   // Minimum gap UP % (positive number)
const MIN_VOLUME_RATIO = 0.5;  // Minimum volume vs average
const MIN_VWAP_CROSSES = 1;    // Minimum VWAP breakdowns (crossings below)
const LOOKBACK_BARS = 20;      // Bars for volume average

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
  direction: 'SHORT';
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

        // Check if gap UP meets criteria (positive gap)
        if (gapPercent <= MIN_GAP_PERCENT) continue;

        // Calculate VWAP and detect crosses BELOW (for short entry)
        let vwapCrosses = 0;
        let wasAbove = false;

        for (let i = 0; i < dayBars.length; i++) {
          const vwap = calculateVWAP(dayBars, i);
          const isAbove = dayBars[i].close > vwap;

          // Detect cross from above VWAP to below (fade signal)
          if (i > 0 && wasAbove && !isAbove) {
            vwapCrosses++;
          }

          wasAbove = isAbove;
        }

        if (vwapCrosses < MIN_VWAP_CROSSES) continue;

        // Find signal bar (first VWAP breakdown)
        let signalBarIndex = -1;
        wasAbove = false;

        for (let i = 0; i < dayBars.length; i++) {
          const vwap = calculateVWAP(dayBars, i);
          const isAbove = dayBars[i].close > vwap;

          if (i > 0 && wasAbove && !isAbove) {
            signalBarIndex = i;
            break;
          }

          wasAbove = isAbove;
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
          direction: 'SHORT',
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
