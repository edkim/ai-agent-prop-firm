/**
 * 5-Minute Opening Range Breakout Scanner
 *
 * Pattern: First breakout above opening range high (09:30-09:35), early in session.
 * Filters: Same-time RVOL, bullish QQQ regime.
 * Entry intent: Next bar after the breakout; if not reachable, no trade.
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// Scanner parameters
const MIN_RVOL_RATIO = 1.0;             // Breakout bar volume >= same time-of-day average (prior days)
const RVOL_LOOKBACK_DAYS = 5;           // Prior days to compute same-time RVOL
const BREAKOUT_TIME_CUTOFF = '10:30:00';// Ignore late breakouts

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
  or_high: number;
  or_low: number;
  or_range: number;
  volume_ratio: number;
  qqq_bullish: boolean;
  metrics: {
    or_high: number;
    or_low: number;
    or_range_percent: number;
    volume_ratio: number;
    qqq_prev_close: number;
    qqq_current_close: number;
  };
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

function getQQQPreviousClose(date: string): number {
  // Get previous trading day's close for QQQ
  let prevDate = getPreviousDate(date);
  let attempts = 0;

  while (attempts < 5) {
    const prevBars = getRTHBars('QQQ', prevDate);
    if (prevBars.length > 0) {
      return prevBars[prevBars.length - 1].close;
    }
    prevDate = getPreviousDate(prevDate);
    attempts++;
  }

  return 0;
}

function getSameTimeVolumeAverage(ticker: string, date: string, timeOfDay: string, lookbackDays: number): number {
  let volumes: number[] = [];
  let currentDate = getPreviousDate(date);
  let attempts = 0;

  while (attempts < lookbackDays) {
    const row = db.prepare(`
      SELECT volume FROM ohlcv_data
      WHERE ticker = ?
        AND date(timestamp/1000, 'unixepoch') = ?
        AND timeframe = '5min'
        AND time_of_day = ?
    `).get(ticker, currentDate, timeOfDay) as { volume: number } | undefined;

    if (row && row.volume) {
      volumes.push(row.volume);
    }

    currentDate = getPreviousDate(currentDate);
    attempts++;
  }

  if (volumes.length === 0) return 0;
  return volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
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

        // Opening Range: First bar (09:30-09:35)
        const orBar = dayBars[0];
        if (orBar.time_of_day !== '09:30:00') continue;

        const orHigh = orBar.high;
        const orLow = orBar.low;
        const orRangePct = ((orHigh - orLow) / orLow) * 100;

        // Find FIRST breakout above OR high, within cutoff, with RVOL
        let breakoutBarIndex = -1;
        let breakoutVolumeRatio = 0;

        for (let i = 1; i < dayBars.length; i++) {
          const bar = dayBars[i];
          if (bar.time_of_day > BREAKOUT_TIME_CUTOFF) break;

          // First true breakout (prior bar not above OR high)
          const prevBar = dayBars[i - 1];
          if (!(prevBar.high <= orHigh && bar.high > orHigh)) continue;

          const avgSameTimeVol = getSameTimeVolumeAverage(ticker, trade_date, bar.time_of_day, RVOL_LOOKBACK_DAYS);
          if (avgSameTimeVol === 0) {
            console.error(`Missing RVOL benchmark for ${ticker} ${trade_date} ${bar.time_of_day}`);
            continue;
          }
          const volumeRatio = bar.volume / avgSameTimeVol;
          if (volumeRatio < MIN_RVOL_RATIO) continue;

          breakoutBarIndex = i;
          breakoutVolumeRatio = volumeRatio;
          break;
        }

        if (breakoutBarIndex === -1) continue;

        // QQQ filter: Check if QQQ is above previous day's close
        const qqqPrevClose = getQQQPreviousClose(trade_date);
        const qqqCurrentBars = getRTHBars('QQQ', trade_date);

        if (qqqCurrentBars.length === 0 || qqqPrevClose === 0) continue;

        const qqqCurrentClose = qqqCurrentBars[qqqCurrentBars.length - 1].close;
        const qqqBullish = qqqCurrentClose > qqqPrevClose;

        if (!qqqBullish) continue;  // Skip if market not bullish

        const breakoutBar = dayBars[breakoutBarIndex];
        const volumeRatio = breakoutVolumeRatio;

        const rangeStrength = Math.min(orRangePct * 20, 40);
        const volumeStrength = Math.min(volumeRatio * 20, 40);
        const timingStrength = Math.max(20 - breakoutBarIndex, 0);  // Earlier breakout = stronger
        const patternStrength = Math.floor(rangeStrength + volumeStrength + timingStrength);

        signals.push({
          ticker,
          signal_date: trade_date,
          signal_time: breakoutBar.time_of_day,
          direction: 'LONG',
          pattern_strength: patternStrength,
          entry_price: orHigh,  // Intent: enter next bar at/above OR high
          or_high: orHigh,
          or_low: orLow,
          or_range: Math.round(orRangePct * 100) / 100,
          volume_ratio: Math.round(volumeRatio * 100) / 100,
          qqq_bullish: qqqBullish,
          metrics: {
            or_high: orHigh,
            or_low: orLow,
            or_range_percent: Math.round(orRangePct * 100) / 100,
            volume_ratio: Math.round(volumeRatio * 100) / 100,
            qqq_prev_close: Math.round(qqqPrevClose * 100) / 100,
            qqq_current_close: Math.round(qqqCurrentClose * 100) / 100
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
