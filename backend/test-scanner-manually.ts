import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import * as fs from 'fs';

// Create a temp database with synthetic data that MUST trigger a VWAP cross
const tempDbPath = '/tmp/test-vwap-cross-manual.db';
if (fs.existsSync(tempDbPath)) {
  fs.unlinkSync(tempDbPath);
}

const db = new Database(tempDbPath);

// Create schema
db.exec(`
  CREATE TABLE ohlcv_data (
    ticker TEXT,
    timestamp INTEGER,
    time_of_day TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume INTEGER,
    timeframe TEXT
  );
`);

// Insert 50 bars for 2025-10-27
// First 25 bars: price BELOW VWAP (close = 100, but dropping)
// Last 25 bars: price ABOVE VWAP (close = 110, rising)
const insert = db.prepare(`
  INSERT INTO ohlcv_data (ticker, timestamp, time_of_day, open, high, low, close, volume, timeframe)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const baseTimestamp = new Date('2025-10-27T04:00:00Z').getTime();
const oneBarMs = 5 * 60 * 1000; // 5 minutes

for (let i = 0; i < 50; i++) {
  const timestamp = baseTimestamp + (i * oneBarMs);
  const hours = Math.floor(i * 5 / 60) + 4;
  const minutes = (i * 5) % 60;
  const time_of_day = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

  let close, high, low, open;
  if (i < 25) {
    // First 25 bars: price LOW at 88-90 (definitively BELOW VWAP)
    close = 88 + (i * 0.08);
    high = close + 0.3;
    low = close - 0.3;
    open = close - 0.1;
  } else {
    // Last 25 bars: price jumps HIGH to 105+ (definitively ABOVE VWAP)
    close = 105 + ((i - 25) * 0.2);
    high = close + 0.5;
    low = close - 0.5;
    open = close - 0.2;
  }

  insert.run(
    'AAPL',
    timestamp,
    time_of_day,
    open,
    high,
    low,
    close,
    100000 + (i * 1000), // increasing volume
    '5min'
  );
}

db.close();

console.log('✅ Created temp database with 50 bars');
console.log('   First 25 bars: close ~88-90 (BELOW VWAP ~89)');
console.log('   Last 25 bars: close ~105-110 (ABOVE VWAP ~96)');
console.log('   Expected: VWAP cross signal at bar 25 (first bar with high price)');

// Use the simplified scanner
const scannerPath = './test-simple-vwap-scanner.ts';

if (!fs.existsSync(scannerPath)) {
  console.error(`❌ Scanner not found at: ${scannerPath}`);
  process.exit(1);
}

console.log(`\n🔍 Running scanner: ${scannerPath}`);

try {
  const result = execSync(
    `DATABASE_PATH=${tempDbPath} SCAN_TICKERS=AAPL npx ts-node ${scannerPath} 2>&1`,
    {
      encoding: 'utf-8',
      timeout: 30000
    }
  );

  console.log(`\n📋 Scanner output:`);
  console.log(result);
  console.log(`\n---END OUTPUT---`);

  // Try to extract JSON from output (last line should be JSON)
  const lines = result.trim().split('\n');
  const jsonLine = lines[lines.length - 1];

  try {
    const signals = JSON.parse(jsonLine);
    console.log(`\n✅ Scanner completed!`);
    console.log(`   Signals found: ${signals.length}`);
    if (signals.length > 0) {
      console.log(`   First signal:`, JSON.stringify(signals[0], null, 2));
    }
  } catch (e) {
    console.log(`\n❌ Failed to parse scanner output as JSON:`);
    console.log(`Last line: ${jsonLine}`);
  }
} catch (error: any) {
  console.error(`\n❌ Scanner execution failed:`);
  console.error(error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout);
  if (error.stderr) console.error('STDERR:', error.stderr);
}

// Clean up
fs.unlinkSync(tempDbPath);
console.log(`\n🧹 Cleaned up temp database`);
