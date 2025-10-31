/**
 * Populate Russell 2000 Universe (Universe ID 2)
 * Loads tickers from IWM ETF holdings CSV
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeDatabase, getDatabase, closeDatabase } from '../src/database/db';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function populateRussell2000Universe() {
  console.log('📊 Russell 2000 Universe Population');
  console.log('=====================================\n');

  // Initialize database
  initializeDatabase();
  const db = getDatabase();
  const csvPath = '/tmp/iwm_holdings.csv';

  // Read and parse CSV
  console.log('📖 Reading IWM holdings CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');

  // Skip header lines (first 10 lines are metadata/headers)
  const dataLines = lines.slice(10).filter(line => line.trim() !== '');

  console.log(`   Found ${dataLines.length} holdings in CSV\n`);

  // Create or update universe entry
  console.log('🌐 Creating/updating universe entry...');
  const existingUniverse = db.prepare('SELECT * FROM universe WHERE id = 2').get();

  if (existingUniverse) {
    db.prepare('UPDATE universe SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 2').run(
      'Russell 2000',
      'Russell 2000 Index - Small-cap US stocks'
    );
    console.log('   Updated existing universe record\n');
  } else {
    db.prepare('INSERT INTO universe (id, name, description, total_stocks) VALUES (?, ?, ?, ?)').run(
      2,
      'Russell 2000',
      'Russell 2000 Index - Small-cap US stocks',
      0
    );
    console.log('   Created new universe record\n');
  }

  // Clear existing universe_id 2 entries
  console.log('🗑️  Clearing existing universe_id 2 stock entries...');
  const deleted = db.prepare('DELETE FROM universe_stocks WHERE universe_id = 2').run();
  console.log(`   Deleted ${deleted.changes} existing entries\n`);

  // Parse and insert
  console.log('💾 Inserting Russell 2000 tickers...');
  const insertStmt = db.prepare(`
    INSERT INTO universe_stocks (universe_id, ticker, name, sector, industry, market_cap, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of dataLines) {
    try {
      // Parse CSV line (handling quoted fields)
      const fields = parseCsvLine(line);

      if (fields.length < 3) {
        skipped++;
        continue;
      }

      const ticker = fields[0]?.replace(/"/g, '').trim();
      const name = fields[1]?.replace(/"/g, '').trim();
      const sector = fields[2]?.replace(/"/g, '').trim();

      // Skip if no ticker
      if (!ticker || ticker === '') {
        skipped++;
        continue;
      }

      // Insert into database
      insertStmt.run(
        2,              // universe_id
        ticker,
        name || ticker,
        sector || 'Unknown',
        null,           // industry (not provided in IWM CSV)
        null,           // market_cap (not parsed from CSV)
        1               // is_active
      );

      inserted++;

      if (inserted % 100 === 0) {
        process.stdout.write(`   Inserted ${inserted} tickers...\r`);
      }
    } catch (error: any) {
      errors.push(`${line.substring(0, 50)}: ${error.message}`);
      skipped++;
    }
  }

  console.log(`\n✅ Insertion complete!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped: ${skipped}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors (showing first 5):`);
    errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
  }

  // Verify and update universe total
  console.log('\n📊 Verification:');
  const count = db.prepare('SELECT COUNT(*) as count FROM universe_stocks WHERE universe_id = 2').get() as { count: number };
  console.log(`   Total tickers in universe_id 2: ${count.count}`);

  // Update universe total_stocks count
  db.prepare('UPDATE universe SET total_stocks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 2').run(count.count);

  // Show sector breakdown
  const sectors = db.prepare(`
    SELECT sector, COUNT(*) as count
    FROM universe_stocks
    WHERE universe_id = 2
    GROUP BY sector
    ORDER BY count DESC
    LIMIT 10
  `).all() as Array<{ sector: string; count: number }>;

  console.log('\n   Top sectors:');
  sectors.forEach(s => {
    console.log(`   - ${s.sector}: ${s.count} tickers`);
  });

  console.log('\n✅ Russell 2000 universe population complete!');

  // Close database
  closeDatabase();
}

/**
 * Parse CSV line handling quoted fields with commas
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Push final field
  if (current) {
    fields.push(current);
  }

  return fields;
}

// Run
populateRussell2000Universe().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
