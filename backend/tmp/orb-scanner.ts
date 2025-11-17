/**
 * 5-Minute Opening Range Breakout Scanner
 *
 * Pattern: Price breaks above the first 5-minute range (09:30-09:35)
 *
 * Filters:
 * 1. Volume on breakout bar > 20-bar average
 * 2. QQQ above previous day's close (bullish market regime)
 *
 * Entry: LONG on breakout above opening range high
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// Scanner parameters
const MIN_VOLUME_RATIO = 1.0;  // Breakout volume must be >= average
const LOOKBACK_BARS = 20;       // For average volume calculation

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

function calculateAverageVolume(bars: Bar[], currentIndex: number, lookback: number): number {
  if (currentIndex < lookback) return 0;

  let totalVolume = 0;
  for (let i = currentIndex - lookback; i < currentIndex; i++) {
    totalVolume += bars[i].volume;
  }

  return totalVolume / lookback;
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
        const orRange = ((orHigh - orLow) / orLow) * 100;

        // Find breakout above OR high
        let breakoutBarIndex = -1;

        for (let i = 1; i < dayBars.length; i++) {
          const bar = dayBars[i];

          // Check if price breaks above OR high
          if (bar.high > orHigh) {
            // Check volume filter
            const avgVolume = calculateAverageVolume(dayBars, i, LOOKBACK_BARS);
            const volumeRatio = avgVolume > 0 ? bar.volume / avgVolume : 0;

            if (volumeRatio >= MIN_VOLUME_RATIO) {
              breakoutBarIndex = i;
              break;
            }
          }
        }

        if (breakoutBarIndex === -1) continue;

        // QQQ filter: Check if QQQ is above previous day's close
        const qqqPrevClose = getQQQPreviousClose(trade_date);
        const qqqCurrentBars = getRTHBars('QQQ', trade_date);

        if (qqqCurrentBars.length === 0 || qqqPrevClose === 0) continue;

        const qqqCurrentClose = qqqCurrentBars[qqqCurrentBars.length - 1].close;
        const qqqBullish = qqqCurrentClose > qqqPrevClose;

        if (!qqqBullish) continue;  // Skip if market not bullish

        // Calculate signal strength
        const breakoutBar = dayBars[breakoutBarIndex];
        const avgVolume = calculateAverageVolume(dayBars, breakoutBarIndex, LOOKBACK_BARS);
        const volumeRatio = avgVolume > 0 ? breakoutBar.volume / avgVolume : 0;

        const rangeStrength = Math.min(orRange * 20, 40);
        const volumeStrength = Math.min(volumeRatio * 20, 40);
        const timingStrength = Math.max(20 - breakoutBarIndex, 0);  // Earlier breakout = stronger
        const patternStrength = Math.floor(rangeStrength + volumeStrength + timingStrength);

        signals.push({
          ticker,
          signal_date: trade_date,
          signal_time: breakoutBar.time_of_day,
          direction: 'LONG',
          pattern_strength: patternStrength,
          entry_price: orHigh,  // Entry at OR high breakout
          or_high: orHigh,
          or_low: orLow,
          or_range: Math.round(orRange * 100) / 100,
          volume_ratio: Math.round(volumeRatio * 100) / 100,
          qqq_bullish: qqqBullish,
          metrics: {
            or_high: orHigh,
            or_low: orLow,
            or_range_percent: Math.round(orRange * 100) / 100,
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
