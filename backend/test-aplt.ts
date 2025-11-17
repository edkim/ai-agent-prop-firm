import Database from 'better-sqlite3';
const db = new Database('/Users/edwardkim/Code/ai-backtest/backtesting.db', { readonly: true });

const MIN_GAP_PERCENT = 1.0;
const MIN_VOLUME_RATIO = 1.2;
const MIN_VWAP_CROSSES = 1;

const ticker = 'APLT';
const date = '2025-11-13';

// Get bars for the day (regular hours)
const bars = db.prepare(`
  SELECT timestamp, open, high, low, close, volume,
    strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time_of_day
  FROM ohlcv_data
  WHERE ticker = ? AND timeframe = '5min'
    AND date(timestamp/1000, 'unixepoch') = ?
    AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) >= 14
    AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) <= 21
  ORDER BY timestamp ASC
`).all(ticker, date);

console.log(`Bars for ${ticker} on ${date}: ${bars.length}`);

// Get previous day close
const prevDate = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];
const prevBars = db.prepare(`
  SELECT close FROM ohlcv_data
  WHERE ticker = ? AND timeframe = '5min'
    AND date(timestamp/1000, 'unixepoch') = ?
  ORDER BY timestamp DESC LIMIT 1
`).get(ticker, prevDate);

if (!prevBars) {
  console.log(`No previous day data for ${prevDate}`);
  process.exit(0);
}

const prevClose = prevBars.close;
const openPrice = bars[0].open;
const gapPercent = ((openPrice - prevClose) / prevClose) * 100;

console.log(`Previous close: $${prevClose.toFixed(4)}`);
console.log(`Open price: $${openPrice.toFixed(4)}`);
console.log(`Gap: ${gapPercent.toFixed(2)}%`);
console.log(`Gap check: ${gapPercent} >= -${MIN_GAP_PERCENT} ? ${gapPercent >= -MIN_GAP_PERCENT ? 'SKIP' : 'PASS'}`);

// Calculate VWAP for first few bars
let cumVol = 0;
let cumVolPrice = 0;
let vwapCrosses = 0;
let wasBelow = openPrice < ((bars[0].high + bars[0].low + bars[0].close) / 3);

console.log(`\nFirst 5 bars:`);
for (let i = 0; i < Math.min(5, bars.length); i++) {
  const bar = bars[i];
  const typical = (bar.high + bar.low + bar.close) / 3;
  cumVolPrice += typical * bar.volume;
  cumVol += bar.volume;
  const vwap = cumVol > 0 ? cumVolPrice / cumVol : 0;

  const isBelow = bar.close < vwap;
  if (wasBelow && !isBelow) vwapCrosses++;
  wasBelow = isBelow;

  console.log(`Bar ${i + 1}: Close=$${bar.close.toFixed(4)}, VWAP=$${vwap.toFixed(4)}, ${bar.close > vwap ? 'ABOVE' : 'BELOW'}`);
}

console.log(`\nVWAP crosses: ${vwapCrosses} (need ${MIN_VWAP_CROSSES})`);
