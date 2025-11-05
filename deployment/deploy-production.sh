#!/bin/bash

###############################################################################
# Production Deployment Script
#
# This script deploys the latest code from GitHub to the production server.
# It uses git to pull changes and properly manages dependencies.
#
# Prerequisites:
#   - SSH deploy key configured on server
#   - Git repository initialized on server
#   - Server: 104.131.34.225
#
# Usage:
#   ./deployment/deploy-production.sh
#
# What it does:
#   1. Tests local build
#   2. Pulls latest code from GitHub on server
#   3. Installs/updates dependencies
#   4. Restarts application via PM2
#   5. Verifies health
###############################################################################

set -e  # Exit on error

# Configuration
SERVER="root@104.131.34.225"
APP_DIR="/var/www/ai-backtest"
BACKEND_DIR="${APP_DIR}/backend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Production Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Step 1: Test local dependencies
echo -e "${YELLOW}[1/6]${NC} Checking local dependencies..."
cd "$(dirname "$0")/../backend"
if [ ! -d "node_modules" ]; then
    echo -e "${RED}✗${NC} node_modules not found. Run 'npm install' first."
    exit 1
fi
echo -e "${GREEN}✓${NC} Local dependencies OK"
echo -e "${YELLOW}Note:${NC} Using ts-node-dev in production (build step skipped)"

# Step 2: Check git status
echo ""
echo -e "${YELLOW}[2/6]${NC} Checking git status..."
if git diff-index --quiet HEAD --; then
    echo -e "${GREEN}✓${NC} No uncommitted changes"
else
    echo -e "${RED}✗${NC} You have uncommitted changes"
    echo "Please commit or stash your changes before deploying"
    git status -s
    exit 1
fi

# Step 3: Pull latest code on server
echo ""
echo -e "${YELLOW}[3/6]${NC} Pulling latest code from GitHub..."
ssh $SERVER "cd ${APP_DIR} && git pull origin main"
echo -e "${GREEN}✓${NC} Code updated on server"

# Step 4: Install dependencies
echo ""
echo -e "${YELLOW}[4/6]${NC} Installing/updating dependencies..."
ssh $SERVER "cd ${BACKEND_DIR} && npm install"
echo -e "${GREEN}✓${NC} Dependencies updated"

# Step 5: Restart application
echo ""
echo -e "${YELLOW}[5/6]${NC} Restarting application..."
ssh $SERVER "pm2 restart ai-backtest-backend"
echo "Waiting for application to start..."
sleep 8
echo -e "${GREEN}✓${NC} Application restarted"

# Step 6: Verify health
echo ""
echo -e "${YELLOW}[6/6]${NC} Verifying application health..."

# Try health check up to 3 times with delays
MAX_ATTEMPTS=3
for i in $(seq 1 $MAX_ATTEMPTS); do
    HEALTH_CHECK=$(ssh $SERVER "curl -s http://localhost:3000/health")
    if echo "$HEALTH_CHECK" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✓${NC} Application is healthy"
        echo "$HEALTH_CHECK"
        break
    else
        if [ $i -lt $MAX_ATTEMPTS ]; then
            echo "Health check attempt $i failed, retrying in 3 seconds..."
            sleep 3
        else
            echo -e "${RED}✗${NC} Health check failed after $MAX_ATTEMPTS attempts"
            echo "$HEALTH_CHECK"
            exit 1
        fi
    fi
done

# Success
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Server: https://104.131.34.225"
echo "Health: https://104.131.34.225/health"
echo ""
echo "View logs: ssh $SERVER 'pm2 logs ai-backtest-backend'"
echo "Check status: ssh $SERVER 'pm2 status'"
echo ""
