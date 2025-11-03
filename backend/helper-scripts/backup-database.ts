/**
 * Database Backup Script
 *
 * Backs up the SQLite database and generated scripts to external location.
 * - Copies database to ~/Backups/ai-backtest/
 * - Filename format: backtesting-YYYY-MM-DD-HHmmss.db
 * - Keeps last 30 backups (auto-cleanup)
 * - Also backs up claude-generated-scripts directory
 *
 * Usage:
 *   npm run backup
 *   npx tsx backend/helper-scripts/backup-database.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATABASE_PATH = path.join(PROJECT_ROOT, 'backtesting.db');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'backend/claude-generated-scripts');
const BACKUP_DIR = path.join(os.homedir(), 'Documents/ai-backtest-backups');
const MAX_BACKUPS = 30;

// Get timestamp for filename
function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Delete old backups keeping only the most recent MAX_BACKUPS
function cleanupOldBackups(backupDir: string, prefix: string): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.db'))
    .sort()
    .reverse(); // Newest first (due to timestamp format)

  if (files.length <= MAX_BACKUPS) {
    return;
  }

  const toDelete = files.slice(MAX_BACKUPS);
  console.log(`\n🗑️  Cleaning up ${toDelete.length} old backup(s)...`);

  for (const file of toDelete) {
    const filePath = path.join(backupDir, file);
    fs.unlinkSync(filePath);
    console.log(`   Deleted: ${file}`);
  }
}

// Copy directory recursively
function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function backup() {
  console.log('\n📦 AI Backtest Database Backup');
  console.log('━'.repeat(60));
  console.log('');

  try {
    // Verify database exists
    if (!fs.existsSync(DATABASE_PATH)) {
      console.error(`❌ Database not found: ${DATABASE_PATH}`);
      process.exit(1);
    }

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(BACKUP_DIR)) {
      console.log(`📁 Creating backup directory: ${BACKUP_DIR}`);
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Generate backup filename with timestamp
    const timestamp = getTimestamp();
    const backupFilename = `backtesting-${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupFilename);

    // Get database size
    const dbStats = fs.statSync(DATABASE_PATH);
    const dbSize = formatSize(dbStats.size);

    // Copy database
    console.log(`📊 Database: ${DATABASE_PATH}`);
    console.log(`   Size: ${dbSize}`);
    console.log('');
    console.log(`💾 Backing up to: ${BACKUP_DIR}/`);
    console.log(`   ${backupFilename}`);

    fs.copyFileSync(DATABASE_PATH, backupPath);

    // Verify backup
    const backupStats = fs.statSync(backupPath);
    if (backupStats.size !== dbStats.size) {
      console.error(`❌ Backup verification failed! Size mismatch.`);
      process.exit(1);
    }

    console.log(`   ✅ Database backup complete (${dbSize})`);

    // Backup generated scripts if directory exists
    if (fs.existsSync(SCRIPTS_DIR)) {
      const scriptBackupDir = path.join(BACKUP_DIR, `claude-scripts-${timestamp}`);
      console.log('');
      console.log(`📜 Backing up generated scripts...`);
      console.log(`   ${scriptBackupDir}`);

      copyDirectory(SCRIPTS_DIR, scriptBackupDir);

      const scriptFiles = fs.readdirSync(SCRIPTS_DIR).length;
      console.log(`   ✅ Scripts backup complete (${scriptFiles} files)`);
    }

    // Cleanup old backups
    cleanupOldBackups(BACKUP_DIR, 'backtesting-');

    // Summary
    console.log('');
    console.log('━'.repeat(60));
    console.log('✅ Backup completed successfully!');
    console.log('');
    console.log(`📂 Backup location: ${BACKUP_DIR}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log('');

    // List recent backups
    const recentBackups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backtesting-') && f.endsWith('.db'))
      .sort()
      .reverse()
      .slice(0, 5);

    console.log(`📋 Recent backups (showing ${recentBackups.length} of ${Math.min(MAX_BACKUPS, fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).length)}):`);
    for (const backup of recentBackups) {
      const backupPath = path.join(BACKUP_DIR, backup);
      const stats = fs.statSync(backupPath);
      const size = formatSize(stats.size);
      const date = backup.replace('backtesting-', '').replace('.db', '');
      const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}`;
      console.log(`   ${formattedDate} - ${size}`);
    }
    console.log('');
  } catch (error: any) {
    console.error('');
    console.error('❌ Backup failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

backup().catch(console.error);
