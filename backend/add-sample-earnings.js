/**
 * Helper script to add sample earnings events for testing
 * Run with: node add-sample-earnings.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'backtesting.db');
const db = new Database(dbPath);

console.log('Adding sample earnings events...\n');

const earningsData = [
  {
    ticker: 'AAPL',
    report_date: '2024-02-01',
    time_of_day: 'BMO',
    fiscal_period: 'Q1',
    fiscal_year: '2024',
    eps_estimate: 2.10,
    eps_actual: 2.18
  },
  {
    ticker: 'AAPL',
    report_date: '2024-05-02',
    time_of_day: 'AMC',
    fiscal_period: 'Q2',
    fiscal_year: '2024',
    eps_estimate: 1.50,
    eps_actual: 1.53
  },
  {
    ticker: 'AAPL',
    report_date: '2024-08-01',
    time_of_day: 'AMC',
    fiscal_period: 'Q3',
    fiscal_year: '2024',
    eps_estimate: 1.35,
    eps_actual: 1.40
  },
  {
    ticker: 'AAPL',
    report_date: '2024-11-01',
    time_of_day: 'AMC',
    fiscal_period: 'Q4',
    fiscal_year: '2024',
    eps_estimate: 1.39,
    eps_actual: 1.46
  },
  {
    ticker: 'NVDA',
    report_date: '2024-02-21',
    time_of_day: 'AMC',
    fiscal_period: 'Q4',
    fiscal_year: '2024',
    eps_estimate: 4.60,
    eps_actual: 5.16
  },
  {
    ticker: 'NVDA',
    report_date: '2024-05-22',
    time_of_day: 'AMC',
    fiscal_period: 'Q1',
    fiscal_year: '2025',
    eps_estimate: 5.59,
    eps_actual: 6.12
  },
  {
    ticker: 'MSFT',
    report_date: '2024-01-30',
    time_of_day: 'AMC',
    fiscal_period: 'Q2',
    fiscal_year: '2024',
    eps_estimate: 2.78,
    eps_actual: 2.93
  },
  {
    ticker: 'MSFT',
    report_date: '2024-04-25',
    time_of_day: 'AMC',
    fiscal_period: 'Q3',
    fiscal_year: '2024',
    eps_estimate: 2.82,
    eps_actual: 2.94
  }
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO earnings_events
    (ticker, fiscal_period, fiscal_year, report_date, time_of_day, eps_estimate, eps_actual)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((events) => {
  for (const event of events) {
    stmt.run(
      event.ticker,
      event.fiscal_period,
      event.fiscal_year,
      event.report_date,
      event.time_of_day,
      event.eps_estimate,
      event.eps_actual
    );
    console.log(`✓ Added ${event.ticker} earnings on ${event.report_date} (${event.time_of_day})`);
  }
});

try {
  insertMany(earningsData);
  console.log(`\n✅ Successfully added ${earningsData.length} earnings events!`);
  console.log('\nYou can now test strategies with earnings filters.');
} catch (error) {
  console.error('❌ Error adding earnings:', error.message);
  process.exit(1);
}

db.close();
