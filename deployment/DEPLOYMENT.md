# AI Backtest Platform - Production Deployment Guide

**Last Updated**: 2025-11-04
**Target Environment**: Ubuntu 22.04 VPS (DigitalOcean, Linode, Vultr, etc.)
**Estimated Time**: 1.5-2 hours

---

## Overview

This guide will help you deploy the AI Backtest Platform to a production VPS with:

- ✅ 24/7 uptime (runs independently of your laptop)
- ✅ HTTPS with auto-renewed SSL certificates
- ✅ Auto-restart on crashes (PM2)
- ✅ Automatic database backups
- ✅ Monitoring and alerting
- ✅ Secure configuration

---

## Prerequisites

### Required

- [ ] VPS account (DigitalOcean, Linode, Vultr, etc.)
- [ ] Domain name (optional but recommended for HTTPS)
- [ ] SSH client (Terminal on Mac/Linux, PuTTY on Windows)
- [ ] Git repository access
- [ ] API keys (Anthropic Claude, Polygon.io)

### Recommended

- [ ] DigitalOcean Spaces account (for cloud backups)
- [ ] UptimeRobot account (for uptime monitoring)
- [ ] Email account for alerts

---

## Quick Start

For the impatient, here's the TL;DR:

```bash
# 1. Create VPS and SSH in
ssh root@your-server-ip

# 2. Download and run setup script
wget https://raw.githubusercontent.com/your-repo/deployment/setup-server.sh
chmod +x setup-server.sh
./setup-server.sh

# 3. Clone repository
cd /var/www/ai-backtest
git clone https://github.com/your-username/ai-backtest.git .

# 4. Install dependencies
cd backend
npm install

# 5. Copy files from laptop
# (Run from your laptop)
scp .env root@your-server:/var/www/ai-backtest/backend/
scp backtesting.db root@your-server:/var/www/ai-backtest/backend/

# 6. Configure Caddy
sudo cp deployment/Caddyfile /etc/caddy/Caddyfile
# Edit the file and replace 'your-domain.com' with your actual domain
sudo nano /etc/caddy/Caddyfile
sudo systemctl restart caddy

# 7. Start application
pm2 start ecosystem.config.js
pm2 save

# Done! Visit https://your-domain.com
```

---

## Detailed Step-by-Step Guide

### Phase 1: VPS Provisioning (15 minutes)

#### 1.1 Create VPS

**DigitalOcean**:
1. Go to https://www.digitalocean.com/
2. Click "Create" → "Droplets"
3. Choose:
   - Image: Ubuntu 22.04 LTS
   - Plan: Basic ($6/month or $12/month recommended)
   - Datacenter: Closest to your users
   - Authentication: SSH Key (recommended) or Password
4. Click "Create Droplet"
5. Note your server IP address

**Linode** / **Vultr**: Similar process, choose Ubuntu 22.04

#### 1.2 Set up DNS (if using a domain)

1. Go to your domain registrar (Namecheap, GoDaddy, etc.)
2. Add an A record:
   - Host: `@` (or subdomain like `api`)
   - Value: Your server IP address
   - TTL: 3600
3. Wait 5-10 minutes for DNS propagation
4. Test: `nslookup your-domain.com` should return your IP

#### 1.3 SSH into server

```bash
# Using password
ssh root@your-server-ip

# Using SSH key
ssh -i ~/.ssh/your-key root@your-server-ip
```

---

### Phase 2: Server Setup (20 minutes)

#### 2.1 Run automated setup script

The setup script installs and configures everything you need:

```bash
# Download setup script
wget https://raw.githubusercontent.com/your-username/ai-backtest/main/deployment/setup-server.sh

# Make executable
chmod +x setup-server.sh

# Run (takes ~5-10 minutes)
./setup-server.sh
```

**What it installs**:
- Node.js 18+
- PM2 process manager
- Caddy web server
- SQLite3
- fail2ban (security)
- UFW firewall

**Manual setup** (if script fails):

<details>
<summary>Click to expand manual setup instructions</summary>

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

# Install other tools
apt-get install -y git sqlite3 rsync fail2ban

# Create app user
useradd -m -s /bin/bash appuser

# Create directories
mkdir -p /var/www/ai-backtest
mkdir -p /var/backups/ai-backtest
mkdir -p /var/log/ai-backtest
chown -R appuser:appuser /var/www/ai-backtest /var/backups/ai-backtest /var/log/ai-backtest

# Configure firewall
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

</details>

#### 2.2 Verify installation

```bash
node --version  # Should be v18.x or higher
npm --version
pm2 --version
caddy version
sqlite3 --version
```

---

### Phase 3: Application Deployment (15 minutes)

#### 3.1 Clone repository

```bash
cd /var/www/ai-backtest
git clone https://github.com/your-username/ai-backtest.git .

# Or if using SSH
git clone git@github.com:your-username/ai-backtest.git .
```

#### 3.2 Install dependencies

```bash
cd /var/www/ai-backtest/backend
npm install --production
```

#### 3.3 Create .env file

```bash
# Copy template
cp .env.production.template .env

# Edit with your actual values
nano .env
```

**Required values**:
- `ANTHROPIC_API_KEY` - Your Claude API key
- `POLYGON_API_KEY` - Your Polygon.io API key
- `DATABASE_PATH` - `/var/www/ai-backtest/backend/backtesting.db`
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `SESSION_SECRET` - Generate with: `openssl rand -base64 32`

**Important**: Replace ALL placeholder values!

#### 3.4 Copy database from laptop

**On your laptop**:

```bash
# Copy database file
scp backtesting.db root@your-server-ip:/var/www/ai-backtest/backend/

# Verify copy
ssh root@your-server-ip "ls -lh /var/www/ai-backtest/backend/backtesting.db"
```

#### 3.5 Set permissions

```bash
cd /var/www/ai-backtest
chown -R appuser:appuser .
chmod 600 backend/.env
chmod 644 backend/backtesting.db
```

---

### Phase 4: HTTPS Setup (15 minutes)

#### 4.1 Configure Caddy

```bash
# Copy Caddyfile
cp /var/www/ai-backtest/deployment/Caddyfile /etc/caddy/Caddyfile

# Edit and replace 'your-domain.com' with your actual domain
nano /etc/caddy/Caddyfile
```

**If you don't have a domain**:
- Uncomment the IP-based configuration section
- This will use a self-signed certificate (browser warning)

#### 4.2 Test and restart Caddy

```bash
# Test configuration
caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
systemctl restart caddy

# Check status
systemctl status caddy

# View logs
journalctl -u caddy -f
```

#### 4.3 Verify HTTPS

```bash
# Should return HTML without errors
curl -I https://your-domain.com
```

**Troubleshooting**:
- Check DNS: `nslookup your-domain.com`
- Check firewall: `ufw status`
- Check Caddy logs: `journalctl -u caddy -n 50`

---

### Phase 5: Database Backups (10 minutes)

#### 5.1 Make backup script executable

```bash
chmod +x /var/www/ai-backtest/deployment/backup-db.sh
```

#### 5.2 Configure cloud storage (optional but recommended)

**DigitalOcean Spaces**:

```bash
# Install s3cmd
apt-get install -y s3cmd

# Configure
s3cmd --configure
```

Enter:
- Access Key: Your DO Spaces access key
- Secret Key: Your DO Spaces secret key
- S3 Endpoint: `nyc3.digitaloceanspaces.com` (or your region)
- DNS-style bucket: `%(bucket)s.nyc3.digitaloceanspaces.com`

#### 5.3 Test backup

```bash
# Run backup manually
/var/www/ai-backtest/deployment/backup-db.sh

# Check backup was created
ls -lh /var/backups/ai-backtest/
```

#### 5.4 Schedule daily backups

```bash
# Edit crontab for appuser
crontab -e -u appuser

# Add this line (runs daily at 3am)
0 3 * * * /var/www/ai-backtest/deployment/backup-db.sh >> /var/log/ai-backtest/backup.log 2>&1
```

---

### Phase 6: Start Application (10 minutes)

#### 6.1 Update PM2 ecosystem config

```bash
cd /var/www/ai-backtest/backend
nano ecosystem.config.js
```

Update:
- `cwd`: Verify it's `/var/www/ai-backtest/backend`
- `env.DATABASE_PATH`: Verify it matches your .env

#### 6.2 Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup systemd -u appuser --hp /home/appuser
# Run the command it outputs

# Check status
pm2 status
pm2 logs ai-backtest-backend

# Monitor
pm2 monit
```

#### 6.3 Test API

```bash
# Health check
curl https://your-domain.com/health

# Get agents (should return JSON)
curl https://your-domain.com/api/learning-agents
```

---

### Phase 7: Monitoring & Alerting (15 minutes)

#### 7.1 Set up UptimeRobot (free)

1. Go to https://uptimerobot.com/
2. Create account
3. Add monitor:
   - Type: HTTP(s)
   - URL: `https://your-domain.com/health`
   - Interval: 5 minutes
   - Alert contacts: Your email
4. Save

#### 7.2 Configure PM2 monitoring (optional)

```bash
# Link to PM2 Plus (free tier)
pm2 link your-public-key your-secret-key
```

Get keys from: https://app.pm2.io/

#### 7.3 Test alerts

```bash
# Stop app (should trigger alert)
pm2 stop ai-backtest-backend

# Check you received email from UptimeRobot

# Start app again
pm2 start ai-backtest-backend
```

---

## Post-Deployment Checklist

### Immediate

- [ ] Application is running: `pm2 status`
- [ ] HTTPS works: `curl -I https://your-domain.com`
- [ ] API responds: `curl https://your-domain.com/api/learning-agents`
- [ ] Database is accessible: `sqlite3 backend/backtesting.db "SELECT COUNT(*) FROM trading_agents;"`
- [ ] Logs are being written: `tail -f /var/log/ai-backtest/output.log`
- [ ] Backups configured: `crontab -l`
- [ ] Monitoring active: Check UptimeRobot dashboard

### Within 24 Hours

- [ ] Verify paper trading agent loaded
- [ ] Check for any errors in logs
- [ ] Test backup restoration
- [ ] Verify auto-restart works (reboot server)
- [ ] Check SSL certificate: https://www.ssllabs.com/ssltest/
- [ ] Set up database access from laptop (if needed)

### Within 1 Week

- [ ] Monitor paper trading performance
- [ ] Review backup retention
- [ ] Check disk space usage: `df -h`
- [ ] Review logs for errors: `pm2 logs --err`
- [ ] Test graduation flow
- [ ] Verify learning iterations work

---

## Common Issues & Solutions

### Issue: Application won't start

```bash
# Check logs
pm2 logs ai-backtest-backend --err --lines 50

# Check .env file
cat backend/.env | grep -v "^#"

# Check database permissions
ls -l backend/backtesting.db

# Test database
sqlite3 backend/backtesting.db "PRAGMA integrity_check;"
```

### Issue: HTTPS not working

```bash
# Check Caddy status
systemctl status caddy

# Check Caddy logs
journalctl -u caddy -n 50

# Check DNS
nslookup your-domain.com

# Check firewall
ufw status
```

### Issue: Out of memory

```bash
# Check memory usage
free -h

# Increase Node.js memory limit in ecosystem.config.js
# Add to env: NODE_OPTIONS: '--max-old-space-size=2048'

# Restart
pm2 restart ai-backtest-backend
```

### Issue: Database locked

```bash
# Check for multiple processes
ps aux | grep node

# Kill any rogue processes
pm2 delete all
pm2 start ecosystem.config.js
```

---

## Maintenance Tasks

### Daily (Automated)

- Database backups (via cron)
- Log rotation (via PM2)
- SSL certificate renewal (via Caddy)

### Weekly (Manual)

```bash
# Check disk space
df -h

# Check logs for errors
pm2 logs --err --lines 100

# Check backup count
ls -l /var/backups/ai-backtest/

# Review UptimeRobot reports
```

### Monthly (Manual)

```bash
# Update system
apt-get update && apt-get upgrade -y

# Update Node.js packages
cd /var/www/ai-backtest/backend
npm outdated
npm update

# Clean up old logs
find /var/log/ai-backtest -name "*.log" -mtime +30 -delete

# Review server metrics
pm2 monit
htop
```

---

## Updating the Application

### Method 1: Git Pull (Recommended)

```bash
# SSH into server
ssh root@your-server-ip

# Navigate to app directory
cd /var/www/ai-backtest

# Pull latest changes
git pull origin main

# Install any new dependencies
cd backend
npm install --production

# Restart application
pm2 restart ai-backtest-backend

# Verify
pm2 logs ai-backtest-backend
```

### Method 2: PM2 Deploy

Configure deploy section in `ecosystem.config.js`, then:

```bash
# From your laptop
pm2 deploy production setup  # First time only
pm2 deploy production update
```

---

## Backup & Recovery

### Manual Backup

```bash
# Create backup
/var/www/ai-backtest/deployment/backup-db.sh

# Download to laptop
scp root@your-server:/var/backups/ai-backtest/backtesting_20251104_030000.db.gz ./
```

### Restore from Backup

```bash
# Stop application
pm2 stop ai-backtest-backend

# Backup current database
cp backend/backtesting.db backend/backtesting.db.old

# Restore from backup
gunzip -c /var/backups/ai-backtest/backtesting_TIMESTAMP.db.gz > backend/backtesting.db

# Verify integrity
sqlite3 backend/backtesting.db "PRAGMA integrity_check;"

# Restart application
pm2 start ai-backtest-backend
```

---

## Security Best Practices

### Hardening Checklist

- [ ] Use SSH keys (disable password authentication)
- [ ] Enable UFW firewall
- [ ] Install fail2ban
- [ ] Keep system updated
- [ ] Use strong passwords/secrets
- [ ] Restrict `.env` permissions (600)
- [ ] Regular backups
- [ ] Monitor logs for suspicious activity
- [ ] Use HTTPS only
- [ ] Implement rate limiting

### Additional Security

```bash
# Disable password authentication for SSH
nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
systemctl restart sshd

# Configure fail2ban for SSH
systemctl enable fail2ban
systemctl start fail2ban

# Set up automatic security updates
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

---

## Monitoring Dashboards

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Logs
pm2 logs

# Memory/CPU usage
pm2 status
```

### System Monitoring

```bash
# CPU and Memory
htop

# Disk usage
df -h

# Network connections
netstat -tuln

# Recent logs
tail -f /var/log/ai-backtest/output.log
```

---

## Cost Estimate

**Monthly Costs**:
- VPS (DigitalOcean $6-12/month): $6-12
- DigitalOcean Spaces (250GB): $5
- Domain name (if new): $12/year = $1/month
- **Total**: ~$12-18/month

**One-Time Costs**:
- Domain name: $10-15/year (if you don't have one)

---

## Support & Resources

- **Documentation**: This file
- **Repository**: https://github.com/your-username/ai-backtest
- **Issues**: https://github.com/your-username/ai-backtest/issues
- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **Caddy Docs**: https://caddyserver.com/docs/
- **DigitalOcean Tutorials**: https://www.digitalocean.com/community/tutorials

---

## Next Steps

After successful deployment:

1. **Monitor for 48 hours**: Check logs, verify backups, test API
2. **Update frontend**: Point frontend to `https://your-domain.com/api`
3. **Test paper trading**: Verify agents load and execute correctly
4. **Set up monitoring alerts**: Configure email/SMS alerts
5. **Document server details**: Save IP, passwords, API keys securely
6. **Test disaster recovery**: Practice restoring from backup

---

**Congratulations! Your AI Backtest Platform is now running 24/7 in production! 🎉**

For questions or issues, open an issue on GitHub or contact support.

---

**Last Updated**: 2025-11-04
**Version**: 1.0
