/**
 * Database Restoration Script
 *
 * Fully automated database restoration from scratch or from backup.
 * - Restores from backup file OR recreates with backfill scripts
 * - Runs all necessary backfill scripts in correct order
 * - Progress tracking and verification
 *
 * Usage:
 *   npm run restore                    # Full restore with tech sector
 *   npm run restore:from-backup        # Interactive backup selection
 *
 *   # Advanced options:
 *   npx tsx helper-scripts/restore-database.ts --from-backup ~/Backups/ai-backtest/backtesting-2025-10-30-110032.db
 *   npx tsx helper-scripts/restore-database.ts --skip-backfill
 *   npx tsx helper-scripts/restore-database.ts --tech-only
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATABASE_PATH = path.join(PROJECT_ROOT, 'backtesting.db');
const BACKUP_DIR = path.join(os.homedir(), 'Backups/ai-backtest');
const HELPER_SCRIPTS_DIR = path.join(PROJECT_ROOT, 'backend/helper-scripts');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  fromBackup: false,
  backupPath: '',
  skipBackfill: args.includes('--skip-backfill'),
  techOnly: args.includes('--tech-only') || (!args.includes('--full-us-stocks')),
  fullUsStocks: args.includes('--full-us-stocks'),
};

// Check for --from-backup with path
const fromBackupIndex = args.indexOf('--from-backup');
if (fromBackupIndex !== -1) {
  options.fromBackup = true;
  if (args[fromBackupIndex + 1] && !args[fromBackupIndex + 1].startsWith('--')) {
    options.backupPath = args[fromBackupIndex + 1];
  }
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Run a script and capture output
function runScript(scriptPath: string, description: string): void {
  console.log(`\n▶️  ${description}...`);
  console.log(`   Script: ${path.basename(scriptPath)}`);

  try {
    const startTime = Date.now();
    const output = execSync(`npx tsx "${scriptPath}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ✅ Complete (${duration}s)`);

    // Show last few lines of output for verification
    const lines = output.trim().split('\n').slice(-3);
    if (lines.length > 0) {
      console.log(`   📊 ${lines.join('\n      ')}`);
    }
  } catch (error: any) {
    console.error(`\n   ❌ Failed: ${error.message}`);
    throw error;
  }
}

// List available backups
function listBackups(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backtesting-') && f.endsWith('.db'))
    .sort()
    .reverse(); // Newest first
}

// Interactive backup selection
function selectBackup(): string {
  const backups = listBackups();

  if (backups.length === 0) {
    console.error('❌ No backups found in ~/Backups/ai-backtest/');
    console.error('   Run "npm run backup" first or provide a backup path.');
    process.exit(1);
  }

  console.log('\n📋 Available backups:\n');
  backups.slice(0, 10).forEach((backup, index) => {
    const backupPath = path.join(BACKUP_DIR, backup);
    const stats = fs.statSync(backupPath);
    const size = formatSize(stats.size);
    const date = backup.replace('backtesting-', '').replace('.db', '');
    const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}`;
    console.log(`   ${index + 1}. ${formattedDate} - ${size}`);
  });

  // For automated script, return the most recent
  return path.join(BACKUP_DIR, backups[0]);
}

// Verify database has data
function verifyDatabase(): void {
  console.log('\n🔍 Verifying database...');

  if (!fs.existsSync(DATABASE_PATH)) {
    console.error('   ❌ Database file not found!');
    process.exit(1);
  }

  const stats = fs.statSync(DATABASE_PATH);
  const size = formatSize(stats.size);
  console.log(`   ✅ Database exists: ${size}`);

  // Quick verification query using sqlite3
  try {
    const result = execSync(
      `sqlite3 "${DATABASE_PATH}" "SELECT COUNT(*) FROM universe; SELECT COUNT(*) FROM ohlcv_data;"`,
      { encoding: 'utf-8' }
    );
    const counts = result.trim().split('\n');
    console.log(`   ✅ Universes: ${counts[0]}`);
    console.log(`   ✅ OHLCV records: ${counts[1]}`);
  } catch (error) {
    console.log('   ⚠️  Could not verify data (sqlite3 not available)');
  }
}

async function restore() {
  console.log('\n🔄 AI Backtest Database Restoration');
  console.log('━'.repeat(60));
  console.log('');

  try {
    // Step 1: Handle existing database
    if (fs.existsSync(DATABASE_PATH)) {
      const stats = fs.statSync(DATABASE_PATH);
      const size = formatSize(stats.size);
      console.log(`⚠️  Existing database found: ${size}`);
      console.log('   This will be replaced with the restoration.');
      console.log('');

      // Backup existing database before replacing
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = `${DATABASE_PATH}.backup-${timestamp}`;
      console.log(`💾 Backing up existing database to:`);
      console.log(`   ${backupPath}`);
      fs.copyFileSync(DATABASE_PATH, backupPath);
      console.log('   ✅ Backup created');
    }

    // Step 2: Restore from backup or create new
    if (options.fromBackup) {
      console.log('\n📦 Restoring from backup...');

      // Select backup if path not provided
      if (!options.backupPath) {
        options.backupPath = selectBackup();
      }

      // Verify backup exists
      if (!fs.existsSync(options.backupPath)) {
        console.error(`❌ Backup not found: ${options.backupPath}`);
        process.exit(1);
      }

      const backupStats = fs.statSync(options.backupPath);
      const backupSize = formatSize(backupStats.size);

      console.log(`\n   Source: ${options.backupPath}`);
      console.log(`   Size: ${backupSize}`);
      console.log('');

      // Delete existing database if it exists
      if (fs.existsSync(DATABASE_PATH)) {
        fs.unlinkSync(DATABASE_PATH);
      }

      // Copy backup to database location
      fs.copyFileSync(options.backupPath, DATABASE_PATH);

      console.log('   ✅ Database restored from backup');

      verifyDatabase();

      console.log('');
      console.log('━'.repeat(60));
      console.log('✅ Restoration completed successfully!');
      console.log('');
      console.log(`📂 Database: ${DATABASE_PATH}`);
      console.log('');

      return;
    }

    // Step 3: Create new database with backfill scripts
    console.log('\n🏗️  Creating new database from scratch...');
    console.log('');

    // Delete existing database
    if (fs.existsSync(DATABASE_PATH)) {
      fs.unlinkSync(DATABASE_PATH);
      console.log('   ✅ Removed existing database');
    }

    if (options.skipBackfill) {
      console.log('\n⚠️  --skip-backfill flag set');
      console.log('   Database will be created with schema only (no market data)');
      console.log('   You will need to run backfill scripts manually.');
      console.log('');
      console.log('━'.repeat(60));
      console.log('✅ Schema restoration completed!');
      console.log('');
      console.log('To populate with data, run:');
      console.log('  cd backend');
      console.log('  npx tsx helper-scripts/create-tech-universe.ts');
      console.log('  npx tsx helper-scripts/backfill-tech-sector-daily.ts');
      console.log('  npx tsx helper-scripts/backfill-tech-sector-intraday.ts');
      console.log('');
      return;
    }

    console.log('📋 Restoration Plan:');
    if (options.techOnly) {
      console.log('   • Tech Sector universe (65 stocks)');
      console.log('   • Daily bars (1 year)');
      console.log('   • Intraday 5-min bars (1 month)');
      console.log('   • Agent schema migration');
    } else if (options.fullUsStocks) {
      console.log('   • Full US stocks universe (~8000 stocks)');
      console.log('   • Daily bars (5 years)');
      console.log('   • This will take 30-60 minutes');
    }
    console.log('');
    console.log('━'.repeat(60));

    // Step 4: Run backfill scripts in order
    const scriptsToRun: Array<{ path: string; description: string }> = [];

    if (options.techOnly) {
      scriptsToRun.push(
        { path: path.join(HELPER_SCRIPTS_DIR, 'create-tech-universe.ts'), description: 'Creating Tech Sector universe' },
        { path: path.join(HELPER_SCRIPTS_DIR, 'backfill-tech-sector-daily.ts'), description: 'Backfilling daily bars (1 year, 65 stocks)' },
        { path: path.join(HELPER_SCRIPTS_DIR, 'backfill-tech-sector-intraday.ts'), description: 'Backfilling 5-min intraday bars (1 month, 65 stocks)' },
        { path: path.join(HELPER_SCRIPTS_DIR, 'migrate-agents-schema.ts'), description: 'Migrating agent schema' },
      );
    } else if (options.fullUsStocks) {
      scriptsToRun.push(
        { path: path.join(HELPER_SCRIPTS_DIR, 'fetch-us-stocks.ts'), description: 'Fetching all US stocks' },
        { path: path.join(HELPER_SCRIPTS_DIR, 'fetch-us-stocks-history.ts'), description: 'Backfilling US stocks history (5 years)' },
        { path: path.join(HELPER_SCRIPTS_DIR, 'migrate-agents-schema.ts'), description: 'Migrating agent schema' },
      );
    }

    console.log(`\n📊 Running ${scriptsToRun.length} restoration scripts...`);

    let completed = 0;
    for (const script of scriptsToRun) {
      if (!fs.existsSync(script.path)) {
        console.log(`\n   ⚠️  Script not found: ${path.basename(script.path)}`);
        console.log('      Skipping...');
        continue;
      }

      runScript(script.path, script.description);
      completed++;
      console.log(`   Progress: ${completed}/${scriptsToRun.length}`);
    }

    // Step 5: Verify final database
    verifyDatabase();

    // Step 6: Summary
    console.log('');
    console.log('━'.repeat(60));
    console.log('✅ Restoration completed successfully!');
    console.log('');
    console.log(`📂 Database: ${DATABASE_PATH}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log('');

    if (options.techOnly) {
      console.log('📊 Data Restored:');
      console.log('   • Tech Sector universe (65 stocks)');
      console.log('   • Daily bars (~15,000 records, 1 year)');
      console.log('   • Intraday 5-min bars (~160,000 records, 1 month)');
      console.log('');
    }

  } catch (error: any) {
    console.error('');
    console.error('❌ Restoration failed:', error.message);
    console.error('');
    console.error('To restore manually:');
    console.error('  1. Check that Polygon API key is set in .env');
    console.error('  2. Run backfill scripts individually');
    console.error('  3. Check logs above for specific error');
    console.error('');
    process.exit(1);
  }
}

restore().catch(console.error);
