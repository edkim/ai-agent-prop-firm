import Database from 'better-sqlite3';

const db = new Database('/Users/edwardkim/Code/ai-backtest/backtesting.db', { readonly: true });

function isEDT(date: string): boolean {
  const d = new Date(date + 'T12:00:00Z');
  return d >= new Date('2025-03-09') && d < new Date('2025-11-02');
}

function getRTHBoundaries(date: string): { startHour: number; endHour: number } {
  if (isEDT(date)) {
    return { startHour: 13, endHour: 20 };
  } else {
    return { startHour: 14, endHour: 21 };
  }
}

const testDates = ['2025-10-30', '2025-10-31', '2025-11-06', '2025-11-07'];

for (const date of testDates) {
  const { startHour, endHour } = getRTHBoundaries(date);
  console.log(`\n${date} (${isEDT(date) ? 'EDT' : 'EST'}): RTH = ${startHour}:30-${endHour}:00 UTC`);

  const allBars = db.prepare(`
    SELECT
      strftime('%H:%M', datetime(timestamp/1000, 'unixepoch')) as time_utc,
      open, close
    FROM ohlcv_data
    WHERE ticker = 'AAPL'
      AND date(timestamp/1000, 'unixepoch') = ?
      AND timeframe = '5min'
    ORDER BY timestamp
  `).all(date);

  console.log(`  All bars: ${allBars.length}`);
  if (allBars.length > 0) {
    console.log(`  First bar: ${(allBars[0] as any).time_utc} - Open: $${(allBars[0] as any).open}`);
    console.log(`  Last bar: ${(allBars[allBars.length - 1] as any).time_utc} - Close: $${(allBars[allBars.length - 1] as any).close}`);
  }

  // Now filter for RTH
  const rthBars = allBars.filter((b: any) => {
    const [hour, minute] = b.time_utc.split(':').map(Number);
    return (hour > startHour && hour < endHour) ||
           (hour === startHour && minute >= 30) ||
           (hour === endHour && minute === 0);
  });

  console.log(`  RTH bars: ${rthBars.length}`);
  if (rthBars.length > 0) {
    console.log(`  RTH First: ${(rthBars[0] as any).time_utc} - Open: $${(rthBars[0] as any).open}`);
    console.log(`  RTH Last: ${(rthBars[rthBars.length - 1] as any).time_utc} - Close: $${(rthBars[rthBars.length - 1] as any).close}`);
  }
}

db.close();
