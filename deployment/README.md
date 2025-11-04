# Deployment Scripts & Configuration

This directory contains everything you need to deploy the AI Backtest Platform to a production VPS.

---

## Quick Start

**Total Time**: ~1.5-2 hours

```bash
# 1. Create VPS (DigitalOcean, Linode, etc.)
# 2. SSH into server
ssh root@your-server-ip

# 3. Run setup script
wget https://raw.githubusercontent.com/your-username/ai-backtest/main/deployment/setup-server.sh
chmod +x setup-server.sh
./setup-server.sh

# 4. Follow the guide
# See: deployment/DEPLOYMENT.md
```

---

## Files in This Directory

### 📋 Documentation

#### `DEPLOYMENT.md` ⭐ **START HERE**
Complete step-by-step guide to deploy your platform to production.

**What's inside**:
- VPS provisioning
- Server setup
- Application deployment
- HTTPS configuration
- Database backups
- Monitoring setup
- Troubleshooting

**Time**: 1.5-2 hours

---

#### `MONITORING.md`
Comprehensive guide for monitoring and alerting.

**What's inside**:
- UptimeRobot setup (uptime monitoring)
- PM2 monitoring (application metrics)
- Log management
- Performance monitoring
- Alert configuration
- Incident response playbook

**Time**: 30-45 minutes

---

### 🔧 Scripts

#### `setup-server.sh`
Automated server provisioning script.

**What it does**:
- Updates system packages
- Installs Node.js 18+
- Installs PM2 process manager
- Installs Caddy web server
- Configures firewall (UFW)
- Sets up fail2ban
- Creates directories and users

**Usage**:
```bash
chmod +x setup-server.sh
./setup-server.sh
```

**Time**: 5-10 minutes

---

#### `backup-db.sh`
Automated database backup script.

**What it does**:
- Creates SQLite backup with timestamp
- Compresses backup file
- Verifies backup integrity
- Uploads to cloud storage (DigitalOcean Spaces/S3)
- Cleans up old backups (30 day retention)

**Usage**:
```bash
# Manual backup
./backup-db.sh

# Schedule daily (via crontab)
0 3 * * * /var/www/ai-backtest/deployment/backup-db.sh
```

**Time**: 2-3 minutes per run

---

### ⚙️ Configuration Files

#### `Caddyfile`
Caddy web server configuration for HTTPS reverse proxy.

**Features**:
- Automatic SSL certificate provisioning (Let's Encrypt)
- HTTP to HTTPS redirect
- Security headers
- Gzip compression
- WebSocket support
- Request logging

**Usage**:
```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
# Edit and replace 'your-domain.com' with your actual domain
sudo nano /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

---

#### `ecosystem.config.js` (in backend/)
PM2 process manager configuration.

**Features**:
- Auto-restart on crashes
- Memory limit (1GB)
- Log rotation
- Cron restart (daily at 3am)
- Environment variables
- Graceful shutdown

**Usage**:
```bash
cd /var/www/ai-backtest/backend
pm2 start ecosystem.config.js
pm2 save
```

---

#### `.env.production.template` (in backend/)
Template for production environment variables.

**What's included**:
- Database path
- API keys (Anthropic, Polygon.io)
- JWT secrets
- CORS settings
- Cloud storage credentials
- Monitoring configuration
- Feature flags

**Usage**:
```bash
cp .env.production.template .env
nano .env  # Fill in your actual values
chmod 600 .env  # Secure permissions
```

---

## Deployment Phases

### Phase 1: Server Setup (15 min)
- ✅ Create VPS
- ✅ Set up DNS (optional)
- ✅ SSH into server
- ✅ Run setup script

### Phase 2: Application Deployment (15 min)
- ✅ Clone repository
- ✅ Install dependencies
- ✅ Configure .env
- ✅ Copy database from laptop

### Phase 3: HTTPS Setup (15 min)
- ✅ Configure Caddy
- ✅ Set up SSL certificate
- ✅ Test HTTPS

### Phase 4: Backups (10 min)
- ✅ Configure backup script
- ✅ Set up cloud storage
- ✅ Schedule daily backups

### Phase 5: Monitoring (15 min)
- ✅ Set up UptimeRobot
- ✅ Configure PM2 monitoring
- ✅ Test alerts

### Phase 6: Launch (10 min)
- ✅ Start application with PM2
- ✅ Verify API works
- ✅ Test paper trading

**Total**: ~1.5-2 hours

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        PRODUCTION VPS                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Caddy Web Server (Port 443)                           │ │
│  │  - HTTPS/SSL (Let's Encrypt)                           │ │
│  │  - Reverse Proxy                                       │ │
│  │  - Security Headers                                    │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Node.js Application (Port 3000)                       │ │
│  │  - Managed by PM2                                      │ │
│  │  - Auto-restart on crash                               │ │
│  │  - Memory limit: 1GB                                   │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  SQLite Database                                       │ │
│  │  - Daily automated backups                             │ │
│  │  - Cloud storage sync                                  │ │
│  │  - Integrity checks                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Monitoring                                            │ │
│  │  - PM2 process monitoring                              │ │
│  │  - Log aggregation                                     │ │
│  │  - Resource tracking                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │ HTTPS
                              │
                    ┌─────────┴──────────┐
                    │                    │
              ┌─────▼─────┐      ┌──────▼──────┐
              │  Frontend │      │ UptimeRobot │
              │    App    │      │  Monitoring │
              └───────────┘      └─────────────┘
```

---

## Security Features

✅ **Firewall**: UFW configured (SSH, HTTP, HTTPS only)
✅ **fail2ban**: Automatic IP blocking on failed attempts
✅ **SSL/TLS**: Automatic HTTPS with Let's Encrypt
✅ **Secrets**: Environment variables in secure .env file
✅ **Permissions**: Restricted file permissions (chmod 600)
✅ **Updates**: Automatic security updates
✅ **Backups**: Encrypted cloud backups

---

## Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| VPS (DigitalOcean $6/month) | $6-12/mo | Basic or Standard plan |
| DigitalOcean Spaces | $5/mo | 250GB storage |
| Domain (optional) | $12/yr | ~$1/month |
| **Total** | **~$12-18/mo** | |

**Free Services**:
- SSL certificates (Let's Encrypt)
- UptimeRobot monitoring
- PM2 process management
- Caddy web server

---

## Prerequisites

### Required

- [ ] VPS account (DigitalOcean, Linode, Vultr)
- [ ] SSH client
- [ ] Git access to repository
- [ ] API keys:
  - [ ] Anthropic Claude API key
  - [ ] Polygon.io API key

### Optional

- [ ] Domain name (for proper HTTPS)
- [ ] DigitalOcean Spaces account (for backups)
- [ ] Email account (for alerts)

---

## Post-Deployment Checklist

### Immediate (Day 1)

- [ ] Application is running: `pm2 status`
- [ ] HTTPS works: Visit https://your-domain.com
- [ ] API responds: `curl https://your-domain.com/api/learning-agents`
- [ ] Database accessible
- [ ] Logs are being written
- [ ] Backups configured
- [ ] Monitoring active

### Week 1

- [ ] Paper trading agent loaded
- [ ] No errors in logs
- [ ] Backup restoration tested
- [ ] Auto-restart verified (reboot test)
- [ ] SSL certificate valid
- [ ] Graduation flow works

### Month 1

- [ ] Paper trading performance tracked
- [ ] Backups retention working
- [ ] Disk space monitored
- [ ] Learning iterations successful
- [ ] All alerts functional

---

## Troubleshooting

### Application won't start
```bash
pm2 logs --err
cat /var/log/ai-backtest/error.log
```

### HTTPS not working
```bash
systemctl status caddy
journalctl -u caddy -n 50
```

### Database issues
```bash
sqlite3 backtesting.db "PRAGMA integrity_check;"
```

### Out of memory
```bash
free -h
pm2 restart ai-backtest-backend
```

**See**: `DEPLOYMENT.md` → "Common Issues & Solutions"

---

## Maintenance

### Daily (Automated)
- Database backups (via cron)
- Log rotation (via PM2)
- SSL renewal (via Caddy)

### Weekly (5 min)
- Check logs for errors
- Verify backups
- Review monitoring dashboard

### Monthly (30 min)
- System updates
- Review performance metrics
- Clean old logs
- Test backup restoration

---

## Updating the Application

```bash
# SSH into server
ssh root@your-server-ip

# Pull latest changes
cd /var/www/ai-backtest
git pull origin main

# Install dependencies
cd backend
npm install --production

# Restart
pm2 restart ai-backtest-backend

# Verify
pm2 logs
```

---

## Getting Help

1. **Check Documentation**:
   - `DEPLOYMENT.md` - Deployment guide
   - `MONITORING.md` - Monitoring guide

2. **Check Logs**:
   ```bash
   pm2 logs
   tail -f /var/log/ai-backtest/error.log
   ```

3. **Review Status**:
   ```bash
   pm2 status
   systemctl status caddy
   ```

4. **Search GitHub Issues**:
   - https://github.com/your-username/ai-backtest/issues

5. **Open New Issue**:
   - Include logs, error messages, and steps to reproduce

---

## Next Steps

After deployment:

1. ✅ **Monitor for 48 hours** - Verify stability
2. ✅ **Update frontend** - Point to new API URL
3. ✅ **Test paper trading** - Verify agents work
4. ✅ **Set up alerts** - Configure email/SMS
5. ✅ **Document credentials** - Save securely
6. ✅ **Test disaster recovery** - Practice restoration

---

## File Checklist

All deployment files:

```
deployment/
├── README.md                    # This file
├── DEPLOYMENT.md                # Complete deployment guide
├── MONITORING.md                # Monitoring setup guide
├── setup-server.sh              # Automated server setup
├── backup-db.sh                 # Database backup script
├── Caddyfile                    # HTTPS reverse proxy config
└── (ecosystem.config.js)        # PM2 config (in backend/)
└── (.env.production.template)   # Environment variables (in backend/)
```

---

## Support

- **Documentation**: This directory
- **Repository**: https://github.com/your-username/ai-backtest
- **Issues**: https://github.com/your-username/ai-backtest/issues

---

**Ready to deploy?** Start with `DEPLOYMENT.md` 🚀

**Last Updated**: 2025-11-04
