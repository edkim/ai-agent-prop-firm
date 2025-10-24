/**
 * Load Universe Script
 *
 * Loads stock universe data from JSON files into the database
 *
 * Usage:
 *   npx ts-node src/scripts/load-universe.ts <universe-file>
 *
 * Example:
 *   npx ts-node src/scripts/load-universe.ts data/russell2000-sample.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeDatabase } from '../database/db';
import universeDataService from '../services/universe-data.service';

interface UniverseFile {
  name: string;
  description: string;
  total: number;
  note?: string;
  tickers: string[];
}

async function loadUniverse(filePath: string): Promise<void> {
  console.log(`\n📂 Loading universe from: ${filePath}\n`);

  // Read the file
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');
  const universeData: UniverseFile = JSON.parse(fileContent);

  console.log(`Universe: ${universeData.name}`);
  console.log(`Description: ${universeData.description}`);
  console.log(`Total tickers in file: ${universeData.tickers.length}`);
  if (universeData.note) {
    console.log(`Note: ${universeData.note}`);
  }
  console.log('');

  // Create or get existing universe
  let universe = await universeDataService.getUniverseByName(universeData.name);

  if (universe) {
    console.log(`✓ Universe "${universeData.name}" already exists (ID: ${universe.id})`);
    console.log(`  Current total stocks: ${universe.total_stocks}`);
  } else {
    console.log(`Creating new universe: ${universeData.name}...`);
    universe = await universeDataService.createUniverse(universeData.name, universeData.description);
  }

  // Add tickers to universe
  console.log(`\nAdding ${universeData.tickers.length} tickers to universe...`);
  const addedCount = await universeDataService.addTickersToUniverse(universe.id, universeData.tickers);

  console.log(`\n✅ Successfully added ${addedCount} new tickers`);
  console.log(`   (${universeData.tickers.length - addedCount} were already in the universe)`);

  // Get updated universe
  const updatedUniverse = await universeDataService.getUniverseByName(universeData.name);
  if (updatedUniverse) {
    console.log(`\n📊 Universe "${updatedUniverse.name}" now has ${updatedUniverse.total_stocks} active stocks`);
  }

  console.log('\n✅ Universe load completed!\n');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Please provide a universe file path');
    console.error('Usage: npx ts-node src/scripts/load-universe.ts <universe-file>');
    console.error('Example: npx ts-node src/scripts/load-universe.ts data/russell2000-sample.json');
    process.exit(1);
  }

  const filePath = args[0];

  try {
    // Initialize database
    initializeDatabase();

    // Load universe
    await loadUniverse(filePath);

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error loading universe:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
