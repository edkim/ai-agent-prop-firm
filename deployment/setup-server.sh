#!/bin/bash

###############################################################################
# VPS Setup Script for AI Backtest Platform
#
# This script sets up a fresh Ubuntu 22.04 server with:
# - Node.js 18+
# - PM2 process manager
# - Caddy web server (HTTPS)
# - Firewall configuration
# - Automatic backups
# - Monitoring tools
#
# Usage:
#   1. SSH into your VPS: ssh root@your-server-ip
#   2. Download this script: wget https://raw.githubusercontent.com/your-repo/deployment/setup-server.sh
#   3. Make executable: chmod +x setup-server.sh
#   4. Run: ./setup-server.sh
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ai-backtest"
APP_DIR="/var/www/${APP_NAME}"
APP_USER="appuser"
NODE_VERSION="18"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

###############################################################################
# Step 1: System Update
###############################################################################
log "Updating system packages..."
apt-get update
apt-get upgrade -y

log "Installing essential packages..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    ufw \
    fail2ban \
    htop \
    rsync \
    sqlite3 \
    unzip

###############################################################################
# Step 2: Create Application User
###############################################################################
log "Creating application user..."
if id "${APP_USER}" &>/dev/null; then
    warn "User ${APP_USER} already exists, skipping..."
else
    useradd -m -s /bin/bash ${APP_USER}
    log "User ${APP_USER} created"
fi

###############################################################################
# Step 3: Install Node.js
###############################################################################
log "Installing Node.js ${NODE_VERSION}..."
if command -v node &> /dev/null; then
    log "Node.js already installed: $(node --version)"
else
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    log "Node.js installed: $(node --version)"
    log "npm installed: $(npm --version)"
fi

###############################################################################
# Step 4: Install PM2
###############################################################################
log "Installing PM2..."
npm install -g pm2
pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}
log "PM2 installed: $(pm2 --version)"

###############################################################################
# Step 5: Install Caddy (HTTPS Web Server)
###############################################################################
log "Installing Caddy..."
if command -v caddy &> /dev/null; then
    log "Caddy already installed: $(caddy version)"
else
    apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt update
    apt install -y caddy
    log "Caddy installed: $(caddy version)"
fi

###############################################################################
# Step 6: Configure Firewall
###############################################################################
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # HTTP (for Let's Encrypt)
ufw allow 443/tcp  # HTTPS
ufw --force enable
log "Firewall configured and enabled"

###############################################################################
# Step 7: Configure fail2ban
###############################################################################
log "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban
log "fail2ban enabled"

###############################################################################
# Step 8: Create Application Directory
###############################################################################
log "Creating application directory..."
mkdir -p ${APP_DIR}
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}
log "Application directory created: ${APP_DIR}"

###############################################################################
# Step 9: Create Backup Directory
###############################################################################
log "Creating backup directory..."
mkdir -p /var/backups/${APP_NAME}
chown -R ${APP_USER}:${APP_USER} /var/backups/${APP_NAME}
log "Backup directory created: /var/backups/${APP_NAME}"

###############################################################################
# Step 10: Create Log Directory
###############################################################################
log "Creating log directory..."
mkdir -p /var/log/${APP_NAME}
chown -R ${APP_USER}:${APP_USER} /var/log/${APP_NAME}
log "Log directory created: /var/log/${APP_NAME}"

###############################################################################
# Summary
###############################################################################
echo ""
echo "=========================================================================="
echo -e "${GREEN}✅ Server setup complete!${NC}"
echo "=========================================================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository to ${APP_DIR}"
echo "   cd ${APP_DIR}"
echo "   git clone https://github.com/your-username/ai-backtest.git ."
echo ""
echo "2. Install dependencies:"
echo "   cd ${APP_DIR}/backend"
echo "   npm install"
echo ""
echo "3. Copy your .env file:"
echo "   scp .env user@server:${APP_DIR}/backend/.env"
echo ""
echo "4. Copy your database:"
echo "   scp backtesting.db user@server:${APP_DIR}/backend/"
echo ""
echo "5. Configure Caddy (see deployment/Caddyfile)"
echo "   sudo cp deployment/Caddyfile /etc/caddy/Caddyfile"
echo "   sudo systemctl restart caddy"
echo ""
echo "6. Start the application with PM2:"
echo "   cd ${APP_DIR}/backend"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "7. Check status:"
echo "   pm2 status"
echo "   pm2 logs"
echo ""
echo "=========================================================================="
echo "System Information:"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - PM2: $(pm2 --version)"
echo "  - Caddy: $(caddy version)"
echo "  - App Directory: ${APP_DIR}"
echo "  - App User: ${APP_USER}"
echo "  - Backup Directory: /var/backups/${APP_NAME}"
echo "=========================================================================="
