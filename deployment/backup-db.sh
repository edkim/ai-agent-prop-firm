#!/bin/bash

###############################################################################
# Database Backup Script for AI Backtest Platform
#
# Features:
# - Creates timestamped SQLite backup
# - Compresses backup file
# - Uploads to DigitalOcean Spaces (S3-compatible)
# - Keeps last 30 days of backups
# - Verifies backup integrity
# - Sends notifications on failure
#
# Setup:
#   1. Install s3cmd: apt-get install -y s3cmd
#   2. Configure s3cmd: s3cmd --configure
#      - Access Key: Your DO Spaces key
#      - Secret Key: Your DO Spaces secret
#      - S3 Endpoint: nyc3.digitaloceanspaces.com (or your region)
#      - DNS-style bucket: %(bucket)s.nyc3.digitaloceanspaces.com
#   3. Add to crontab: crontab -e
#      0 3 * * * /var/www/ai-backtest/deployment/backup-db.sh >> /var/log/ai-backtest/backup.log 2>&1
#
# Usage:
#   ./backup-db.sh
###############################################################################

set -e  # Exit on error

# Configuration
APP_DIR="/var/www/ai-backtest/backend"
BACKUP_DIR="/var/backups/ai-backtest"
DB_PATH="${APP_DIR}/backtesting.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="backtesting_${TIMESTAMP}.db"
BACKUP_ARCHIVE="${BACKUP_NAME}.gz"
RETENTION_DAYS=30

# S3/Spaces configuration (set these or use s3cmd config)
S3_BUCKET="s3://your-backup-bucket"
S3_PATH="ai-backtest-backups"

# Notification (optional - requires sendmail or similar)
ALERT_EMAIL="your-email@example.com"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    # Send alert email (optional)
    # echo "$1" | mail -s "Backup Failed: AI Backtest" ${ALERT_EMAIL}
    exit 1
}

###############################################################################
# Step 1: Check if database exists
###############################################################################
log "Starting backup process..."

if [ ! -f "${DB_PATH}" ]; then
    error "Database file not found: ${DB_PATH}"
fi

###############################################################################
# Step 2: Create backup directory
###############################################################################
mkdir -p "${BACKUP_DIR}"

###############################################################################
# Step 3: Backup database with SQLite command (ensures consistency)
###############################################################################
log "Creating database backup..."

# Use sqlite3 .backup command for consistent backup
sqlite3 "${DB_PATH}" ".backup '${BACKUP_DIR}/${BACKUP_NAME}'" || error "SQLite backup failed"

# Verify backup file was created
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}" ]; then
    error "Backup file was not created"
fi

log "Backup created: ${BACKUP_NAME}"

###############################################################################
# Step 4: Verify backup integrity
###############################################################################
log "Verifying backup integrity..."

# Check if backup can be opened and queried
sqlite3 "${BACKUP_DIR}/${BACKUP_NAME}" "PRAGMA integrity_check;" > /tmp/integrity_check.txt || error "Integrity check failed"

INTEGRITY_RESULT=$(cat /tmp/integrity_check.txt)
if [ "$INTEGRITY_RESULT" != "ok" ]; then
    error "Backup integrity check failed: $INTEGRITY_RESULT"
fi

rm /tmp/integrity_check.txt
log "Backup integrity verified"

###############################################################################
# Step 5: Compress backup
###############################################################################
log "Compressing backup..."

gzip "${BACKUP_DIR}/${BACKUP_NAME}"

if [ ! -f "${BACKUP_DIR}/${BACKUP_ARCHIVE}" ]; then
    error "Compression failed"
fi

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_ARCHIVE}" | cut -f1)
log "Backup compressed: ${BACKUP_ARCHIVE} (${BACKUP_SIZE})"

###############################################################################
# Step 6: Upload to cloud storage (DigitalOcean Spaces / S3)
###############################################################################
if command -v s3cmd &> /dev/null; then
    log "Uploading backup to cloud storage..."

    s3cmd put "${BACKUP_DIR}/${BACKUP_ARCHIVE}" "${S3_BUCKET}/${S3_PATH}/${BACKUP_ARCHIVE}" || error "S3 upload failed"

    log "Backup uploaded successfully"
else
    log "Warning: s3cmd not installed, skipping cloud upload"
    log "Install with: apt-get install -y s3cmd && s3cmd --configure"
fi

###############################################################################
# Step 7: Clean up old local backups
###############################################################################
log "Cleaning up old backups (keeping last ${RETENTION_DAYS} days)..."

find "${BACKUP_DIR}" -name "backtesting_*.db.gz" -type f -mtime +${RETENTION_DAYS} -delete

REMAINING_BACKUPS=$(ls -1 "${BACKUP_DIR}"/backtesting_*.db.gz 2>/dev/null | wc -l)
log "Local backups remaining: ${REMAINING_BACKUPS}"

###############################################################################
# Step 8: Clean up old cloud backups (optional)
###############################################################################
if command -v s3cmd &> /dev/null; then
    log "Cleaning up old cloud backups..."

    # List all backups
    s3cmd ls "${S3_BUCKET}/${S3_PATH}/" > /tmp/s3_backups.txt || true

    # Delete backups older than retention period
    CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)

    while IFS= read -r line; do
        BACKUP_DATE=$(echo "$line" | awk '{print $1}')
        BACKUP_FILE=$(echo "$line" | awk '{print $4}')

        if [[ "$BACKUP_DATE" < "$CUTOFF_DATE" ]]; then
            log "Deleting old backup: $BACKUP_FILE"
            s3cmd del "$BACKUP_FILE" || true
        fi
    done < /tmp/s3_backups.txt

    rm /tmp/s3_backups.txt
fi

###############################################################################
# Summary
###############################################################################
log "=========================================================================="
log "✅ Backup completed successfully!"
log "=========================================================================="
log "Backup file: ${BACKUP_ARCHIVE}"
log "Backup size: ${BACKUP_SIZE}"
log "Location: ${BACKUP_DIR}"
log "Cloud: ${S3_BUCKET}/${S3_PATH}/${BACKUP_ARCHIVE}"
log "=========================================================================="

# Optional: Send success notification
# echo "Backup completed: ${BACKUP_ARCHIVE} (${BACKUP_SIZE})" | mail -s "Backup Success: AI Backtest" ${ALERT_EMAIL}

exit 0
