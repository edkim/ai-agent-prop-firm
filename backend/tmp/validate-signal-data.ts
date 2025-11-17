/**
 * Validate Scanner Signal Data Against Polygon
 *
 * Checks the three signals flagged by QA:
 * - AAPL 2025-10-31
 * - INTC 2025-10-14
 * - AMAT 2025-11-07
 */

import Database from 'better-sqlite3';
import axios from 'axios';
import * as fs from 'fs';

const POLYGON_API_KEY = '3O79I9XrQ1JKME6vB6q1Q3s8_CUxIDUt';
const dbPath = '/Users/edwardkim/Code/ai-backtest/backtesting.db';
const db = new Database(dbPath, { readonly: true });

interface ValidationCase {
  ticker: string;
  date: string;
  prevDate: string;
  reportedGap: number;
  entryTime: string;
  entryPrice: number;
}

const testCases: ValidationCase[] = [
  {
    ticker: 'AAPL',
    date: '2025-10-31',
    prevDate: '2025-10-30',
    reportedGap: -3.0,
    entryTime: '14:25',
    entryPrice: 270.46
  },
  {
    ticker: 'INTC',
    date: '2025-10-14',
    prevDate: '2025-10-11', // Friday before Monday
    reportedGap: -5.07,
    entryTime: '14:15',
    entryPrice: 36.225
  },
  {
    ticker: 'AMAT',
    date: '2025-11-07',
    prevDate: '2025-11-06',
    reportedGap: -1.36,
    entryTime: '14:30',
    entryPrice: 232.265
  }
];

async function getPolygonDailyBar(ticker: string, date: string) {
  try {
    const url = `https://api.polygon.io/v1/open-close/${ticker}/${date}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    console.error(`Error fetching ${ticker} ${date}:`, error.message);
    return null;
  }
}

async function validateCase(testCase: ValidationCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Validating: ${testCase.ticker} ${testCase.date}`);
  console.log(`${'='.repeat(60)}`);

  // Get Polygon data for previous day and signal day
  const prevDayData = await getPolygonDailyBar(testCase.ticker, testCase.prevDate);
  const signalDayData = await getPolygonDailyBar(testCase.ticker, testCase.date);

  if (!prevDayData || !signalDayData) {
    console.log('❌ Could not fetch Polygon data');
    return;
  }

  console.log(`\n📊 POLYGON DATA (Adjusted=true):`);
  console.log(`  ${testCase.prevDate} Close: $${prevDayData.close}`);
  console.log(`  ${testCase.date} Open:  $${signalDayData.open}`);

  const polygonGap = ((signalDayData.open - prevDayData.close) / prevDayData.close) * 100;
  console.log(`  Calculated Gap: ${polygonGap > 0 ? '+' : ''}${polygonGap.toFixed(2)}%`);

  // Query our database
  console.log(`\n💾 OUR DATABASE DATA:`);

  // Get previous day close from our DB
  const prevDayBars = db.prepare(`
    SELECT timestamp, time_of_day, close,
           strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time_utc
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
    ORDER BY timestamp DESC
    LIMIT 5
  `).all(testCase.ticker, testCase.prevDate);

  console.log(`  ${testCase.prevDate} bars found: ${prevDayBars.length}`);
  if (prevDayBars.length > 0) {
    console.log(`  Last bar close: $${(prevDayBars[0] as any).close} at ${(prevDayBars[0] as any).time_of_day || (prevDayBars[0] as any).time_utc}`);
  }

  // Get signal day open from our DB
  const signalDayBars = db.prepare(`
    SELECT timestamp, time_of_day, open, high, low, close,
           strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time_utc
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
    ORDER BY timestamp ASC
    LIMIT 5
  `).all(testCase.ticker, testCase.date);

  console.log(`  ${testCase.date} bars found: ${signalDayBars.length}`);
  if (signalDayBars.length > 0) {
    console.log(`  First bar open: $${(signalDayBars[0] as any).open} at ${(signalDayBars[0] as any).time_of_day || (signalDayBars[0] as any).time_utc}`);

    const ourGap = prevDayBars.length > 0
      ? ((((signalDayBars[0] as any).open - (prevDayBars[0] as any).close) / (prevDayBars[0] as any).close) * 100)
      : 0;
    console.log(`  Our Calculated Gap: ${ourGap > 0 ? '+' : ''}${ourGap.toFixed(2)}%`);
  }

  // Check entry bar
  console.log(`\n🎯 ENTRY VALIDATION:`);
  console.log(`  Reported Entry Time: ${testCase.entryTime}`);
  console.log(`  Reported Entry Price: $${testCase.entryPrice}`);

  const entryBar = db.prepare(`
    SELECT open, high, low, close, time_of_day,
           strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time_utc
    FROM ohlcv_data
    WHERE ticker = ?
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
      AND (time_of_day LIKE ? OR strftime('%H:%M', datetime(timestamp/1000, 'unixepoch')) = ?)
    LIMIT 1
  `).get(testCase.ticker, testCase.date, `${testCase.entryTime}%`, testCase.entryTime.substring(0, 5));

  if (entryBar) {
    const bar = entryBar as any;
    console.log(`  Entry Bar Found: ${bar.time_of_day || bar.time_utc}`);
    console.log(`  Bar Range: Low=$${bar.low}, High=$${bar.high}`);
    const inRange = testCase.entryPrice >= bar.low && testCase.entryPrice <= bar.high;
    console.log(`  Entry Price in Range? ${inRange ? '✅' : '❌'}`);
    if (!inRange) {
      console.log(`  ERROR: Entry price $${testCase.entryPrice} is outside [$${bar.low}, $${bar.high}]`);
    }
  } else {
    console.log(`  ❌ Entry bar not found in database`);
  }

  // Summary
  console.log(`\n📝 SUMMARY:`);
  console.log(`  Reported Gap: ${testCase.reportedGap}%`);
  console.log(`  Polygon Gap:  ${polygonGap > 0 ? '+' : ''}${polygonGap.toFixed(2)}%`);
  console.log(`  Match: ${Math.abs(testCase.reportedGap - polygonGap) < 0.1 ? '✅' : '❌'}`);

  // Small delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 13000)); // Polygon free tier: 5 calls/min
}

async function main() {
  console.log('🔍 Validating Scanner Signals Against Polygon Data\n');

  for (const testCase of testCases) {
    await validateCase(testCase);
  }

  db.close();
  console.log(`\n${'='.repeat(60)}`);
  console.log('Validation Complete');
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
