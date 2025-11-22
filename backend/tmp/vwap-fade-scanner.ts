/**
 * Weak-Context VWAP Fade Scanner (Short)
 *
 * Idea: In a weak market (QQQ down), and with a weak daily/5m tape, short the first retest of VWAP from below
 * on rejection. RTH only.
 */
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

// Parameters
const TIME_START = '09:35:00';
const TIME_END = '14:30:00';
const MAX_RET_APP = 2; // allow up to two valid VWAP tests (still first fills only)
const VWAP_BUFFER_PCT = 0.001; // 0.1% tolerance
const MIN_RVOL_RATIO = 1.0; // same-time-of-day RVOL
const RVOL_LOOKBACK_DAYS = 5;

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
  vwap_at_signal: number;
  volume_ratio: number;
  qqq_bearish: boolean;
  metrics: any;
}

function getRTHBars(ticker: string, date: string): Bar[] {
  return db
    .prepare(
      `SELECT timestamp, time_of_day, open, high, low, close, volume
       FROM ohlcv_data
       WHERE ticker = ?
         AND date(timestamp/1000, 'unixepoch') = ?
         AND timeframe = '5min'
         AND time_of_day >= '09:30:00'
         AND time_of_day <= '16:00:00'
       ORDER BY timestamp ASC`
    )
    .all(ticker, date) as Bar[];
}

function getPrevDate(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getSameTimeVolAvg(ticker: string, date: string, time: string, lookback: number): number {
  let vols: number[] = [];
  let cur = getPrevDate(date);
  for (let i = 0; i < lookback; i++) {
    const row = db
      .prepare(
        `SELECT volume FROM ohlcv_data
         WHERE ticker = ?
           AND date(timestamp/1000,'unixepoch') = ?
           AND timeframe='5min'
           AND time_of_day = ?`
      )
      .get(ticker, cur, time) as { volume: number } | undefined;
    if (row && row.volume) vols.push(row.volume);
    cur = getPrevDate(cur);
  }
  if (!vols.length) return 0;
  return vols.reduce((a, b) => a + b, 0) / vols.length;
}

function computeVWAPSoFar(bars: Bar[], uptoIndex: number): number {
  let pv = 0;
  let vol = 0;
  for (let i = 0; i <= uptoIndex; i++) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
  }
  return vol > 0 ? pv / vol : 0;
}

function dailyWeak(ticker: string, date: string): boolean {
  const prior = getPrevDate(date);
  const days = db
    .prepare(
      `SELECT open, high, low, close FROM ohlcv_data
       WHERE ticker = ?
         AND timeframe='1day'
         AND date(timestamp/1000,'unixepoch') <= ?
       ORDER BY timestamp DESC
       LIMIT 20`
    )
    .all(ticker, prior) as any[];
  if (days.length < 10) return false;
  const closes = days.map((d) => d.close);
  const ema = (arr: number[], len: number) => {
    const k = 2 / (len + 1);
    let e = arr.slice(0, len).reduce((a, b) => a + b, 0) / len;
    for (let i = len; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
    return e;
  };
  const ema20 = ema(closes, Math.min(20, closes.length));
  const ema50 = ema(closes, Math.min(50, closes.length));
  return (ema20 < ema50) || (closes[0] < ema20);
}

function qqqBearish(date: string): boolean {
  const qqqBars = getRTHBars('QQQ', date);
  const prevDate = getPrevDate(date);
  const prevBars = getRTHBars('QQQ', prevDate);
  if (!qqqBars.length || !prevBars.length) return false;
  const prevClose = prevBars[prevBars.length - 1].close;
  const lastBar = qqqBars[qqqBars.length - 1];
  const vwap = computeVWAPSoFar(qqqBars, qqqBars.length - 1);
  return lastBar.close < prevClose && lastBar.close < vwap;
}

async function scan(): Promise<Signal[]> {
  const tickers = process.env.SCAN_TICKERS?.split(',') || [];
  const startDate = process.env.SCAN_START_DATE || '';
  const endDate = process.env.SCAN_END_DATE || '';
  const signals: Signal[] = [];

  for (const ticker of tickers) {
    const dates = db
      .prepare(
        `SELECT DISTINCT date(timestamp/1000,'unixepoch') as d
         FROM ohlcv_data
         WHERE ticker = ?
           AND timeframe='5min'
           AND date(timestamp/1000,'unixepoch') BETWEEN ? AND ?
         ORDER BY d ASC`
      )
      .all(ticker, startDate, endDate) as { d: string }[];

    for (const { d } of dates) {
      const dayBars = getRTHBars(ticker, d);
      if (dayBars.length < 10) continue;
      if (!dailyWeak(ticker, d)) continue;
      if (!qqqBearish(d)) continue;

      // Track first valid VWAP retest rejection
      let tests = 0;

      for (let i = 1; i < dayBars.length; i++) {
        const bar = dayBars[i];
        if (bar.time_of_day < TIME_START || bar.time_of_day > TIME_END) continue;

        const vwap = computeVWAPSoFar(dayBars, i);
        // Require bar trades into VWAP (from below) and closes below VWAP
        const touched = bar.high >= vwap * (1 - VWAP_BUFFER_PCT);
        const below = bar.close < vwap;
        const priorBelow = dayBars[i - 1].high <= vwap; // coming from below
        if (!(touched && below && priorBelow)) continue;

        // RVOL same time
        const avgVol = getSameTimeVolAvg(ticker, d, bar.time_of_day, RVOL_LOOKBACK_DAYS);
        if (avgVol === 0) continue;
        const volRatio = bar.volume / avgVol;
        if (volRatio < MIN_RVOL_RATIO) continue;

        tests++;
        if (tests > MAX_RET_APP) break;

        signals.push({
          ticker,
          signal_date: d,
          signal_time: bar.time_of_day,
          direction: 'SHORT',
          pattern_strength: Math.round((volRatio * 20) + 40), // simple score
          entry_price: vwap,
          vwap_at_signal: vwap,
          volume_ratio: Math.round(volRatio * 100) / 100,
          qqq_bearish: true,
          metrics: {
            vwap,
            volume_ratio: Math.round(volRatio * 100) / 100
          }
        });

        break; // only first valid test
      }
    }
  }

  console.log(JSON.stringify(signals, null, 2));
  db.close();
  return signals;
}

scan().catch((err) => {
  console.error('Scan failed:', err);
  db.close();
  process.exit(1);
});
