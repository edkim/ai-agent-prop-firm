# Database Management Guide

Complete guide to managing the AI Backtest Platform database including backup, restoration, and troubleshooting.

---

## Table of Contents

1. [Database Overview](#database-overview)
2. [Database Location](#database-location)
3. [Backup System](#backup-system)
4. [Restoration](#restoration)
5. [Backfill Scripts Reference](#backfill-scripts-reference)
6. [Scheduled Backups](#scheduled-backups)
7. [Troubleshooting](#troubleshooting)

---

## Database Overview

**Database Type**: SQLite
**File**: `backtesting.db`
**Location**: `/Users/YOUR_USERNAME/Code/ai-backtest/backtesting.db` (project root)
**Size**: ~43 MB (varies with data)
**Tables**: 37 tables
**Records**: ~175,000+ (depends on backfill scope)

### Data Classification

#### 🔴 Irreplaceable Data (Cannot be restored)
- **Trading agent configurations** (`trading_agents`)
- **Agent learning history** (`agent_knowledge`, `agent_iterations`, `agent_strategies`)
- **Trading records** (`executed_trades`, `trade_recommendations`, `portfolio_state`, `risk_metrics`)
- **Pattern discovery work** (`backtest_sets`, `scan_results`, `claude_analyses`)
- **User-created strategies** (`strategies`, `backtests`, `trades`)

#### 🟢 Recoverable Data (Via backfill scripts)
- **Market data** (`ohlcv_data`, `daily_metrics`)
- **Universe definitions** (`universe`, `universe_stocks`)

#### 🟡 Partially Recoverable
- **Earnings events** (requires external API)
- **Support/resistance levels** (requires recalculation)
- **News events** (limited historical availability)

---

## Database Location

The database is stored in the **project root** with an **absolute path** to eliminate confusion.

### Configuration

**Environment Variable**:
```bash
DATABASE_PATH=/Users/YOUR_USERNAME/Code/ai-backtest/backtesting.db
```

**Location**: `.env` file in project root

**Why Absolute Path?**
- Relative paths resolve from `process.cwd()` which varies by execution context
- Absolute path ensures consistency regardless of where scripts are run from
- Eliminates "database not found" errors

### Verification

Check the database path being used:
```bash
# In .env file
cat .env | grep DATABASE_PATH

# Test server connection
curl http://localhost:3000/api/scanner/universes
```

---

## Backup System

Automated daily backups protect irreplaceable data (agent learning, trading history, pattern collections).

### Backup Location

```
~/Backups/ai-backtest/
├── backtesting-2025-10-30-110032.db
├── backtesting-2025-10-29-020000.db
├── claude-scripts-2025-10-30-110032/
└── backup.log
```

### Backup Features

- **Timestamped filenames**: `backtesting-YYYY-MM-DD-HHmmss.db`
- **Auto-cleanup**: Keeps last 30 backups
- **Includes generated scripts**: `claude-generated-scripts/` directory
- **Verification**: Size check after backup
- **Scheduled**: Daily at 2:00 AM (via launchd)

### Manual Backup

```bash
cd backend
npm run backup
```

**Output**:
```
📦 AI Backtest Database Backup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Database: /Users/edwardkim/Code/ai-backtest/backtesting.db
   Size: 42.84MB

💾 Backing up to: ~/Backups/ai-backtest/
   backtesting-2025-10-30-110032.db
   ✅ Database backup complete (42.84MB)

📜 Backing up generated scripts...
   ✅ Scripts backup complete (47 files)

✅ Backup completed successfully!
```

### Backup Script Location

`backend/helper-scripts/backup-database.ts`

---

## Restoration

Complete database restoration from backup or from scratch.

### Restore from Backup

**Quick restore** (uses most recent backup):
```bash
cd backend
npm run restore:from-backup
```

**Restore from specific backup**:
```bash
npx tsx helper-scripts/restore-database.ts --from-backup ~/Backups/ai-backtest/backtesting-2025-10-30-110032.db
```

### Restore from Scratch

**Full restoration** (Tech Sector with market data):
```bash
cd backend
npm run restore
```

This will:
1. Create new empty database
2. Run backfill scripts in order:
   - Create Tech Sector universe (65 stocks)
   - Backfill daily bars (1 year)
   - Backfill 5-min intraday bars (1 month)
   - Migrate agent schema
3. Verify data loaded correctly

**Time**: ~5-10 minutes depending on API rate limits

### Restore Options

```bash
# Skip market data backfill (schema only)
npx tsx helper-scripts/restore-database.ts --skip-backfill

# Tech sector only (default, ~65 stocks)
npx tsx helper-scripts/restore-database.ts --tech-only

# All US stocks (~8000 stocks, takes 30-60 minutes)
npx tsx helper-scripts/restore-database.ts --full-us-stocks
```

### Safety Features

- **Automatic backup before restore**: Existing database is backed up with `.backup-TIMESTAMP` suffix
- **Verification**: Checks universe and OHLCV record counts after restore
- **Progress tracking**: Shows which script is running and estimated time
- **Error handling**: Clear error messages with recovery instructions

---

## Backfill Scripts Reference

All scripts located in: `backend/helper-scripts/`

### Market Data Scripts

| Script | Data | Timeframe | Scope | Time |
|--------|------|-----------|-------|------|
| `create-tech-universe.ts` | Tech Sector universe | N/A | 65 stocks | <1 min |
| `backfill-tech-sector-daily.ts` | Daily bars + 27 metrics | 1 year | 65 stocks | 2-3 min |
| `backfill-tech-sector-intraday.ts` | 5-min intraday bars | 1 month | 65 stocks | 5-8 min |
| `fetch-us-stocks.ts` | All US stocks list | N/A | ~8000 stocks | 2-3 min |
| `fetch-us-stocks-history.ts` | Daily bars + metrics | 5 years | All US | 30-60 min |
| `populate-us-stocks.ts` | US stocks from file | N/A | Variable | <1 min |
| `populate-russell2000.ts` | Russell 2000 from file | N/A | 2000 stocks | <1 min |
| `fetch-russell2000-history.ts` | Daily bars + metrics | 5 years | Russell 2000 | 20-30 min |

### Schema & Utility Scripts

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `migrate-agents-schema.ts` | Add learning lab columns | After database creation |
| `fix-time-of-day.ts` | Populate time_of_day field | After intraday backfill |

### Technical Indicators Calculated

Daily backfill scripts compute:
- **Moving Averages**: SMA 20, 50, 200
- **Momentum**: RSI (14-day), multi-day % changes (5d, 10d, 20d)
- **Volume**: Volume ratios, average volume
- **Patterns**: Consecutive up/down days
- **Price**: Distance from highs/lows

### Manual Script Execution

```bash
cd /Users/YOUR_USERNAME/Code/ai-backtest

# Create universe
npx tsx backend/helper-scripts/create-tech-universe.ts

# Backfill daily data
npx tsx backend/helper-scripts/backfill-tech-sector-daily.ts

# Backfill intraday data
npx tsx backend/helper-scripts/backfill-tech-sector-intraday.ts

# Migrate agent schema
npx tsx backend/helper-scripts/migrate-agents-schema.ts
```

### Dependencies

- **Polygon.io API key**: Required for all market data backfills
- **Environment variable**: `POLYGON_API_KEY` in `.env`
- **Rate limits**: 5 requests/minute (free tier), 100/minute (paid)

---

## Scheduled Backups

Daily automated backups run at 2:00 AM via macOS launchd.

### Installation

```bash
bash backend/helper-scripts/install-scheduled-backup.sh
```

### Management Commands

```bash
# Check status
launchctl list | grep com.aibacktest.backup

# View logs
tail -f ~/Backups/ai-backtest/backup.log

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.aibacktest.backup.plist

# Reinstall
bash backend/helper-scripts/install-scheduled-backup.sh
```

### Configuration

**Plist File**: `~/Library/LaunchAgents/com.aibacktest.backup.plist`

**Schedule**:
- **Frequency**: Daily
- **Time**: 2:00 AM
- **Logs**: `~/Backups/ai-backtest/backup.log`
- **Error logs**: `~/Backups/ai-backtest/backup-error.log`

**Customizing Schedule**:

Edit the plist file and change the `StartCalendarInterval`:

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>2</integer>  <!-- Change hour (0-23) -->
    <key>Minute</key>
    <integer>0</integer>  <!-- Change minute (0-59) -->
</dict>
```

Then reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.aibacktest.backup.plist
launchctl load ~/Library/LaunchAgents/com.aibacktest.backup.plist
```

---

## Troubleshooting

### Database Not Found

**Symptoms**:
- Empty universe API response: `{"universes": []}`
- "Database not initialized" errors
- Server creates new empty database

**Cause**: Server is using wrong database path or creating new database

**Solution**:
1. Check `.env` file has correct absolute path:
   ```bash
   cat .env | grep DATABASE_PATH
   # Should show: DATABASE_PATH=/Users/YOUR_USERNAME/Code/ai-backtest/backtesting.db
   ```

2. Verify database exists:
   ```bash
   ls -lh /Users/YOUR_USERNAME/Code/ai-backtest/backtesting.db
   ```

3. Restart backend server:
   ```bash
   cd backend
   lsof -ti:3000 | xargs kill -9
   npm run dev
   ```

4. Test API:
   ```bash
   curl http://localhost:3000/api/scanner/universes
   ```

### Empty Database After Restore

**Symptoms**:
- Database file exists but has no data
- API returns empty results

**Cause**: Restore ran with `--skip-backfill` or backfill scripts failed

**Solution**:
```bash
cd backend

# Run backfill scripts manually
npx tsx helper-scripts/create-tech-universe.ts
npx tsx helper-scripts/backfill-tech-sector-daily.ts
npx tsx helper-scripts/backfill-tech-sector-intraday.ts
npx tsx helper-scripts/migrate-agents-schema.ts
```

### Polygon API Rate Limit Errors

**Symptoms**:
- Backfill scripts fail with 429 errors
- "Rate limit exceeded" messages

**Solution**:
1. **Free tier**: Wait 60 seconds between batches (scripts handle automatically)
2. **Paid tier**: Increase concurrent requests in script
3. **Reduce scope**: Use `--tech-only` instead of `--full-us-stocks`

### Scheduled Backup Not Running

**Symptoms**:
- No new backups appearing in `~/Backups/ai-backtest/`
- Backup log not updated

**Diagnosis**:
```bash
# Check if job is loaded
launchctl list | grep com.aibacktest.backup
# Should show: -	0	com.aibacktest.backup

# Check logs
cat ~/Backups/ai-backtest/backup-error.log
```

**Common Issues**:

1. **npm not found**:
   - Edit plist file, change `/usr/local/bin/npm` to full npm path
   - Find path: `which npm`

2. **Permissions**:
   - Ensure backup directory is writable: `ls -ld ~/Backups/ai-backtest`

3. **Environment variables**:
   - launchd has limited PATH, verify paths in plist are absolute

### Database Corruption

**Symptoms**:
- "database disk image is malformed" errors
- Server crashes on startup
- Queries fail randomly

**Recovery**:
1. **Restore from backup**:
   ```bash
   cd backend
   npm run restore:from-backup
   ```

2. **If recent backup unavailable**, try SQLite integrity check:
   ```bash
   sqlite3 backtesting.db "PRAGMA integrity_check;"
   ```

3. **Last resort**, restore from scratch:
   ```bash
   npm run restore
   ```

### Backup Disk Space

**Symptoms**:
- "No space left on device" errors
- Backups failing

**Check disk usage**:
```bash
du -sh ~/Backups/ai-backtest/
df -h ~
```

**Solution**:
- Backups auto-cleanup after 30 (keeps last 30)
- Manually delete old backups if needed
- Adjust `MAX_BACKUPS` in `backup-database.ts`

---

## Quick Reference

### Essential Commands

```bash
# Backup
cd backend && npm run backup

# Restore from most recent backup
cd backend && npm run restore:from-backup

# Restore from scratch (Tech Sector)
cd backend && npm run restore

# Check database size
ls -lh backtesting.db

# View backup history
ls -lth ~/Backups/ai-backtest/*.db | head -5

# Test database connection
curl http://localhost:3000/api/scanner/universes
```

### File Locations

| Item | Path |
|------|------|
| **Database** | `/Users/YOUR_USERNAME/Code/ai-backtest/backtesting.db` |
| **Backups** | `~/Backups/ai-backtest/` |
| **Backup script** | `backend/helper-scripts/backup-database.ts` |
| **Restore script** | `backend/helper-scripts/restore-database.ts` |
| **Backfill scripts** | `backend/helper-scripts/` |
| **Scheduled backup plist** | `~/Library/LaunchAgents/com.aibacktest.backup.plist` |
| **Backup logs** | `~/Backups/ai-backtest/backup.log` |

---

## Additional Resources

- **SQLite Documentation**: https://www.sqlite.org/docs.html
- **Polygon.io API**: https://polygon.io/docs/stocks
- **launchd Guide**: `man launchd.plist`

---

*Last Updated*: October 30, 2025
*Version*: 1.0
