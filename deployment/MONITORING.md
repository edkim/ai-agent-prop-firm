# Monitoring & Alerting Setup Guide

**Purpose**: Set up comprehensive monitoring for your AI Backtest Platform to ensure 24/7 reliability

---

## Overview

This guide covers:
- ✅ Uptime monitoring (UptimeRobot)
- ✅ Application monitoring (PM2 Plus)
- ✅ Error tracking (basic logging)
- ✅ Performance metrics
- ✅ Alert notifications

---

## 1. Uptime Monitoring (UptimeRobot - Free)

### Why?
Monitors if your server is accessible and sends alerts if it goes down.

### Setup

**Step 1: Create Account**
1. Go to https://uptimerobot.com/
2. Sign up (free tier includes 50 monitors)
3. Verify your email

**Step 2: Add HTTP Monitor**
1. Click "Add New Monitor"
2. Configure:
   - Monitor Type: `HTTP(s)`
   - Friendly Name: `AI Backtest API`
   - URL: `https://your-domain.com/health`
   - Monitoring Interval: `5 minutes`
3. Click "Create Monitor"

**Step 3: Add Alert Contacts**
1. Go to "My Settings" → "Alert Contacts"
2. Add your email
3. Add SMS (optional, requires phone verification)
4. Add Slack/Discord webhook (optional)

**Step 4: Test Alerts**
```bash
# SSH into your server
pm2 stop ai-backtest-backend

# Wait 5-10 minutes
# You should receive an alert email

# Start it back up
pm2 start ai-backtest-backend

# You should receive a "back online" alert
```

### UptimeRobot Dashboard

Monitor status at: https://uptimerobot.com/dashboard

---

## 2. PM2 Application Monitoring

### Option A: PM2 Built-in Monitoring (Free)

**Enable Monitoring**
```bash
# On your server
pm2 monit
```

This shows real-time:
- CPU usage
- Memory usage
- Active processes
- Logs

**View Logs**
```bash
# All logs
pm2 logs

# Error logs only
pm2 logs --err

# Last 50 lines
pm2 logs --lines 50

# Follow logs (real-time)
pm2 logs --raw
```

**Memory/CPU Stats**
```bash
pm2 status
```

### Option B: PM2 Plus (Advanced - Free Tier Available)

**Features**:
- Web dashboard
- Historical metrics
- Exception tracking
- Custom metrics
- Team collaboration

**Setup**:
1. Go to https://app.pm2.io/
2. Create account
3. Create bucket
4. Get public/secret keys

```bash
# Link your server
pm2 link <public-key> <secret-key>

# Or configure in ecosystem.config.js
# pmx: true
```

**Dashboard**: https://app.pm2.io/

---

## 3. Application Health Checks

### Add Health Endpoint

Your backend already has a health endpoint. Test it:

```bash
curl https://your-domain.com/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2025-11-04T10:30:00.000Z",
  "uptime": 3600,
  "database": "connected"
}
```

### Monitor Key Metrics

**Create a monitoring script** (`deployment/health-check.sh`):

```bash
#!/bin/bash

API_URL="https://your-domain.com"
ALERT_EMAIL="your-email@example.com"

# Check API health
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" ${API_URL}/health)

if [ "$RESPONSE" != "200" ]; then
    echo "API health check failed: HTTP ${RESPONSE}" | mail -s "Alert: API Down" ${ALERT_EMAIL}
    exit 1
fi

# Check database size
DB_PATH="/var/www/ai-backtest/backend/backtesting.db"
DB_SIZE=$(du -sh ${DB_PATH} | cut -f1)
echo "Database size: ${DB_SIZE}"

# Check disk space
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ ${DISK_USAGE} -gt 80 ]; then
    echo "Disk usage critical: ${DISK_USAGE}%" | mail -s "Alert: Disk Space" ${ALERT_EMAIL}
fi

# Check memory
MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
if [ ${MEM_USAGE} -gt 90 ]; then
    echo "Memory usage high: ${MEM_USAGE}%" | mail -s "Alert: Memory" ${ALERT_EMAIL}
fi

echo "Health check passed"
```

**Schedule it**:
```bash
chmod +x /var/www/ai-backtest/deployment/health-check.sh

# Add to crontab (every 5 minutes)
crontab -e
```

Add:
```
*/5 * * * * /var/www/ai-backtest/deployment/health-check.sh >> /var/log/ai-backtest/health-check.log 2>&1
```

---

## 4. Log Aggregation

### PM2 Log Management

**Configure log rotation** (in `ecosystem.config.js`):

```javascript
{
  error_file: '/var/log/ai-backtest/error.log',
  out_file: '/var/log/ai-backtest/output.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  combine_logs: true,
  merge_logs: true
}
```

**Install PM2 log rotate**:
```bash
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
```

### Manual Log Review

```bash
# Check for errors in last hour
grep -i error /var/log/ai-backtest/error.log | tail -50

# Check application logs
tail -f /var/log/ai-backtest/output.log

# Search for specific patterns
grep "graduation" /var/log/ai-backtest/output.log
grep "paper trading" /var/log/ai-backtest/output.log
```

---

## 5. Database Monitoring

### Monitor Database Growth

**Create monitoring script** (`deployment/db-stats.sh`):

```bash
#!/bin/bash

DB_PATH="/var/www/ai-backtest/backend/backtesting.db"

echo "=== Database Statistics ==="
echo "File size: $(du -h ${DB_PATH} | cut -f1)"
echo ""

sqlite3 ${DB_PATH} << 'EOF'
.mode column
.headers on

SELECT 'Trading Agents' as Table, COUNT(*) as Count FROM trading_agents
UNION ALL
SELECT 'Agent Iterations', COUNT(*) FROM agent_iterations
UNION ALL
SELECT 'Paper Accounts', COUNT(*) FROM paper_accounts
UNION ALL
SELECT 'Paper Trades', COUNT(*) FROM paper_trades
UNION ALL
SELECT 'Scanner Signals', COUNT(*) FROM scanner_signals
UNION ALL
SELECT 'OHLCV Data (rows)', COUNT(*) FROM ohlcv_data;

EOF
```

Run daily:
```bash
chmod +x /var/www/ai-backtest/deployment/db-stats.sh

# Add to crontab
0 9 * * * /var/www/ai-backtest/deployment/db-stats.sh | mail -s "Daily DB Stats" your-email@example.com
```

### Monitor Database Integrity

```bash
# Add to daily checks
sqlite3 /var/www/ai-backtest/backend/backtesting.db "PRAGMA integrity_check;"
```

---

## 6. Paper Trading Monitoring

### Key Metrics to Track

**Create paper trading dashboard** (`deployment/paper-trading-stats.sh`):

```bash
#!/bin/bash

DB_PATH="/var/www/ai-backtest/backend/backtesting.db"

echo "=== Paper Trading Statistics ==="
date
echo ""

sqlite3 ${DB_PATH} << 'EOF'
.mode column
.headers on

-- Active paper trading agents
SELECT
    'Active Paper Trading Agents' as Metric,
    COUNT(*) as Value
FROM trading_agents
WHERE status = 'paper_trading';

-- Today's trades
SELECT
    'Trades Today' as Metric,
    COUNT(*) as Value
FROM paper_trades
WHERE DATE(created_at) = DATE('now');

-- Win rate (last 30 days)
SELECT
    'Win Rate (30d)' as Metric,
    ROUND(AVG(CASE WHEN pnl > 0 THEN 1.0 ELSE 0.0 END) * 100, 1) || '%' as Value
FROM paper_trades
WHERE DATE(created_at) >= DATE('now', '-30 days');

-- Total P&L (last 30 days)
SELECT
    'Total P&L (30d)' as Metric,
    '$' || ROUND(SUM(pnl), 2) as Value
FROM paper_trades
WHERE DATE(created_at) >= DATE('now', '-30 days');

EOF
```

**Run hourly** to track performance:
```bash
chmod +x /var/www/ai-backtest/deployment/paper-trading-stats.sh

# Add to crontab (every hour)
0 * * * * /var/www/ai-backtest/deployment/paper-trading-stats.sh >> /var/log/ai-backtest/trading-stats.log
```

---

## 7. Performance Monitoring

### System Resources

**Install monitoring tools**:
```bash
apt-get install -y htop iotop nethogs
```

**Monitor in real-time**:
```bash
# CPU and memory
htop

# Disk I/O
iotop

# Network usage
nethogs

# Disk usage
df -h
du -sh /var/www/ai-backtest/*
```

### Node.js Performance

**Enable profiling** in `.env`:
```env
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=2048 --trace-warnings
```

**Monitor event loop lag**:

Add to your backend (optional):
```javascript
const eventLoopLag = require('event-loop-lag')(1000);
setInterval(() => {
  console.log('Event loop lag:', eventLoopLag(), 'ms');
}, 60000);
```

---

## 8. Alerting Rules

### Set Up Alert Thresholds

**Critical Alerts** (immediate action required):
- Server down (UptimeRobot)
- Application crashed (PM2)
- Database corrupted
- Disk space > 90%
- Memory usage > 95%

**Warning Alerts** (monitor closely):
- Response time > 5 seconds
- Error rate > 1%
- Disk space > 80%
- Memory usage > 85%
- Paper trading loss > $1000/day

**Info Alerts** (for awareness):
- Daily backup completed
- New agent graduated
- Paper trading summary (daily)

### Configure Email Alerts

**Setup sendmail** (optional):
```bash
apt-get install -y mailutils

# Test
echo "Test email" | mail -s "Test" your-email@example.com
```

---

## 9. Dashboard Setup (Optional)

### Option A: Simple Web Dashboard

Create `deployment/dashboard.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>AI Backtest Dashboard</title>
    <meta http-equiv="refresh" content="30">
    <style>
        body { font-family: monospace; padding: 20px; }
        .metric { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .ok { background: #d4edda; }
        .warn { background: #fff3cd; }
        .error { background: #f8d7da; }
    </style>
</head>
<body>
    <h1>AI Backtest Platform - Status</h1>
    <div id="status"></div>
    <script>
        async function updateStatus() {
            const res = await fetch('/api/health');
            const data = await res.json();
            document.getElementById('status').innerHTML = JSON.stringify(data, null, 2);
        }
        updateStatus();
        setInterval(updateStatus, 30000);
    </script>
</body>
</html>
```

Access at: `https://your-domain.com/dashboard.html`

### Option B: Grafana (Advanced)

If you want professional dashboards:

1. Install Grafana
2. Install Prometheus
3. Configure PM2 metrics export
4. Create custom dashboards

(See: https://grafana.com/docs/)

---

## 10. Incident Response Playbook

### Server Down

```bash
# 1. Check if server is reachable
ping your-server-ip

# 2. SSH in
ssh root@your-server-ip

# 3. Check PM2 status
pm2 status

# 4. Check logs
pm2 logs --err --lines 50

# 5. Restart if needed
pm2 restart all

# 6. Check Caddy
systemctl status caddy
journalctl -u caddy -n 50
```

### High Memory Usage

```bash
# 1. Check memory
free -h

# 2. Find memory hog
ps aux --sort=-%mem | head -10

# 3. Restart application
pm2 restart ai-backtest-backend

# 4. Increase memory limit if needed
# Edit ecosystem.config.js
# NODE_OPTIONS: '--max-old-space-size=2048'
```

### Database Issues

```bash
# 1. Check integrity
sqlite3 backtesting.db "PRAGMA integrity_check;"

# 2. Check size
ls -lh backtesting.db

# 3. Restore from backup if corrupted
pm2 stop all
cp backtesting.db backtesting.db.corrupt
gunzip -c /var/backups/ai-backtest/latest.db.gz > backtesting.db
pm2 start all
```

---

## Quick Reference: Monitoring Commands

```bash
# Application status
pm2 status
pm2 logs
pm2 monit

# System resources
htop
df -h
free -h

# Logs
tail -f /var/log/ai-backtest/output.log
grep -i error /var/log/ai-backtest/error.log

# Database
sqlite3 backtesting.db "SELECT COUNT(*) FROM paper_trades;"
ls -lh backtesting.db

# Network
netstat -tuln | grep 3000
curl -I https://your-domain.com/health

# Backups
ls -lh /var/backups/ai-backtest/
```

---

## Monitoring Checklist

### Daily
- [ ] Check UptimeRobot dashboard (1 min)
- [ ] Review PM2 status (1 min)
- [ ] Check error logs (2 min)
- [ ] Verify backup completed (1 min)

### Weekly
- [ ] Review paper trading performance (5 min)
- [ ] Check disk space usage (2 min)
- [ ] Review slow queries/errors (5 min)
- [ ] Test alert notifications (2 min)

### Monthly
- [ ] Review all monitoring dashboards (15 min)
- [ ] Analyze performance trends (15 min)
- [ ] Update alert thresholds if needed (10 min)
- [ ] Test backup restoration (15 min)

---

## Support Resources

- **UptimeRobot**: https://uptimerobot.com/help
- **PM2 Monitoring**: https://pm2.keymetrics.io/docs/usage/monitoring/
- **Linux Performance**: https://www.brendangregg.com/linuxperf.html

---

**Last Updated**: 2025-11-04
