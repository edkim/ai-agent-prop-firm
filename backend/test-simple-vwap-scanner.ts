import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface ScanMatch {
  ticker: string;
  signal_date: string;
  signal_time: string;
  pattern_strength: number;
  direction: 'LONG' | 'SHORT';
  metrics: {
    entry_price: number;
    vwap: number;
    previous_close: number;
    previous_vwap: number;
    volume: number;
    distance_from_vwap_percent: number;
  };
}

async function runScan(): Promise<ScanMatch[]> {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();
  const results: ScanMatch[] = [];

  const tickerList = (process.env.SCAN_TICKERS || '').split(',').filter(t => t.trim());

  if (tickerList.length === 0) {
    throw new Error('SCAN_TICKERS environment variable must be set');
  }

  console.error(`🔍 Scanning ${tickerList.length} tickers for VWAP cross patterns...`);

  const placeholders = tickerList.map(() => '?').join(',');
  const tickersStmt = db.prepare(`
    SELECT DISTINCT ticker FROM ohlcv_data
    WHERE ticker IN (${placeholders})
      AND timeframe = '5min'
      AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
  `);
  const tickers = tickersStmt.all(...tickerList, '2025-10-26', '2025-10-28') as any[];

  console.error(`✅ Found ${tickers.length} tickers with data`);
  console.error(`   Tickers: ${JSON.stringify(tickers)}`);

  for (const { ticker } of tickers) {
    const barsStmt = db.prepare(`
      SELECT timestamp, open, high, low, close, volume, time_of_day,
             date(timestamp/1000, 'unixepoch') as date
      FROM ohlcv_data
      WHERE ticker = ?
        AND timeframe = '5min'
        AND date(timestamp/1000, 'unixepoch') BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    const allBars = barsStmt.all(ticker, '2025-10-26', '2025-10-28') as any[];

    console.error(`   ${ticker}: ${allBars.length} bars retrieved`);
    if (allBars.length > 0) {
      console.error(`      First bar date: ${allBars[0].date}`);
      console.error(`      Last bar date: ${allBars[allBars.length - 1].date}`);
    }

    if (allBars.length < 2) continue;

    const barsByDay: { [date: string]: any[] } = {};
    for (const bar of allBars) {
      if (!barsByDay[bar.date]) barsByDay[bar.date] = [];
      barsByDay[bar.date].push(bar);
    }

    for (const [date, dayBars] of Object.entries(barsByDay)) {
      console.error(`   Processing date ${date}: ${dayBars.length} bars`);
      if (dayBars.length < 2) continue;

      const barsWithVWAP = [];
      let cumVol = 0;
      let cumVolPrice = 0;

      for (const bar of dayBars) {
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        cumVolPrice += typicalPrice * bar.volume;
        cumVol += bar.volume;
        barsWithVWAP.push({
          ...bar,
          vwap: cumVol === 0 ? 0 : cumVolPrice / cumVol
        });
      }

      console.error(`   Calculated VWAP for ${barsWithVWAP.length} bars`);
      // Show a few sample bars
      for (let i = 0; i < Math.min(5, barsWithVWAP.length); i++) {
        const b = barsWithVWAP[i];
        console.error(`      Bar ${i}: close=${b.close.toFixed(2)}, vwap=${b.vwap.toFixed(2)}`);
      }
      if (barsWithVWAP.length > 25) {
        const b = barsWithVWAP[25];
        console.error(`      Bar 25: close=${b.close.toFixed(2)}, vwap=${b.vwap.toFixed(2)}`);
      }
      if (barsWithVWAP.length > 26) {
        const b = barsWithVWAP[26];
        console.error(`      Bar 26: close=${b.close.toFixed(2)}, vwap=${b.vwap.toFixed(2)} <-- Expected cross here!`);
      }

      let crossesFound = 0;
      for (let i = 1; i < barsWithVWAP.length; i++) {
        const current = barsWithVWAP[i];
        const previous = barsWithVWAP[i - 1];

        const previousBelowVWAP = previous.close <= previous.vwap;
        const currentAboveVWAP = current.close > current.vwap;

        if (previousBelowVWAP && currentAboveVWAP) {
          crossesFound++;
          if (crossesFound <= 3) {
            console.error(`      ✅ CROSS at bar ${i}: prev close=${previous.close.toFixed(2)} <= prev vwap=${previous.vwap.toFixed(2)}, curr close=${current.close.toFixed(2)} > curr vwap=${current.vwap.toFixed(2)}`);
          }
          const distancePercent = ((current.close - current.vwap) / current.vwap) * 100;

          results.push({
            ticker,
            signal_date: date,
            signal_time: current.time_of_day,
            pattern_strength: 75,
            direction: 'LONG',
            metrics: {
              entry_price: current.close,
              vwap: current.vwap,
              previous_close: previous.close,
              previous_vwap: previous.vwap,
              volume: current.volume,
              distance_from_vwap_percent: distancePercent
            }
          });
        }
      }

      console.error(`   Total crosses found on ${date}: ${crossesFound}`);
    }
  }

  return results;
}

runScan().then(results => {
  const sortedResults = results.sort((a, b) => b.pattern_strength - a.pattern_strength);
  const topResults = sortedResults.slice(0, 500);
  console.error(`✅ Scan complete! Found ${results.length} VWAP cross pattern matches`);
  console.log(JSON.stringify(topResults));
}).catch(err => {
  console.error('❌ Scanner error:', err);
  process.exit(1);
});
