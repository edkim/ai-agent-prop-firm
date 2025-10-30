#!/bin/bash

###############################################################################
# Install Scheduled Backup Service
#
# Installs launchd job for daily automated database backups at 2 AM.
#
# Usage:
#   bash backend/helper-scripts/install-scheduled-backup.sh
###############################################################################

set -e

echo ""
echo "🔧 Installing AI Backtest Scheduled Backup Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configuration
PLIST_SOURCE="$(dirname "$0")/com.aibacktest.backup.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.aibacktest.backup.plist"
LABEL="com.aibacktest.backup"

# Verify source plist exists
if [ ! -f "$PLIST_SOURCE" ]; then
    echo "❌ Error: Plist file not found at $PLIST_SOURCE"
    exit 1
fi

echo "📄 Source: $PLIST_SOURCE"
echo "📍 Destination: $PLIST_DEST"
echo ""

# Unload existing job if present
if launchctl list | grep -q "$LABEL"; then
    echo "⚙️  Unloading existing job..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    echo "   ✅ Unloaded"
fi

# Copy plist to LaunchAgents
echo "📋 Installing plist file..."
cp "$PLIST_SOURCE" "$PLIST_DEST"
echo "   ✅ Copied to $PLIST_DEST"

# Load the job
echo ""
echo "🚀 Loading scheduled backup job..."
launchctl load "$PLIST_DEST"
echo "   ✅ Loaded"

# Verify job is loaded
echo ""
echo "🔍 Verifying installation..."
if launchctl list | grep -q "$LABEL"; then
    echo "   ✅ Service is active"
else
    echo "   ❌ Service not found"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Installation complete!"
echo ""
echo "📅 Schedule: Daily at 2:00 AM"
echo "📂 Backup location: ~/Backups/ai-backtest/"
echo "📝 Logs: ~/Backups/ai-backtest/backup.log"
echo ""
echo "Commands:"
echo "  • View status:    launchctl list | grep com.aibacktest.backup"
echo "  • View logs:      tail -f ~/Backups/ai-backtest/backup.log"
echo "  • Uninstall:      launchctl unload ~/Library/LaunchAgents/com.aibacktest.backup.plist"
echo "  • Reinstall:      bash backend/helper-scripts/install-scheduled-backup.sh"
echo ""
echo "To test immediately:"
echo "  cd backend && npm run backup"
echo ""
