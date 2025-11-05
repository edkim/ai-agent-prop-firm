# Paper Trading Monitoring Guide 📊

## Quick Status Check

### Check if Paper Trading is Running
```bash
ssh root@104.131.34.225 "curl -s http://localhost:3000/health"
```

### View Live Trading Activity
```bash
# Real-time logs (Ctrl+C to exit)
ssh root@104.131.34.225 "pm2 logs ai-backtest-backend"

# Last 50 lines
ssh root@104.131.34.225 "pm2 logs ai-backtest-backend --lines 50 --nostream"
```

---

## Paper Trading APIs

### Get All Paper Trading Accounts
```bash
ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/accounts" | jq .
```

### Get Account Performance
```bash
# Replace {account_id} with actual ID
ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/accounts/{account_id}" | jq .
```

### View Open Positions
```bash
ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/positions" | jq .
```

### View Trade History
```bash
ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/trades" | jq .
```

### Overall Paper Trading Status
```bash
ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/status" | jq .
```

---

## What to Watch For

### Good Signs ✅
- Agents scanning for signals
- Positions being opened/closed
- P&L being tracked
- No error messages

### Bad Signs ⚠️
- Errors in logs
- No trading activity for extended period
- App crashes/restarts frequently
- Database locked errors

---

## Monitoring Dashboard (Local)

If you want to watch it live from your laptop:

### 1. Port Forward to Production
```bash
# In a terminal, keep this running:
ssh -L 3000:localhost:3000 root@104.131.34.225
```

### 2. Access in Browser
Open: http://localhost:3000/api/paper-trading/status

---

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Server health check |
| `/api/paper-trading/status` | Overall paper trading status |
| `/api/paper-trading/accounts` | All paper trading accounts |
| `/api/paper-trading/positions` | Current open positions |
| `/api/paper-trading/trades` | Trade history |
| `/api/agents` | All learning agents |

---

## Example: Watch Live Trading

### Terminal 1: Live Logs
```bash
ssh root@104.131.34.225 "pm2 logs ai-backtest-backend | grep -E '(SIGNAL|BUY|SELL|PROFIT|LOSS)'"
```

### Terminal 2: Position Monitor (refresh every 30s)
```bash
while true; do
  clear
  echo "=== PAPER TRADING POSITIONS ==="
  ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/positions" | jq '.[] | {ticker, quantity, entry_price, current_price, pnl}'
  sleep 30
done
```

### Terminal 3: Account Summary (refresh every 60s)
```bash
while true; do
  clear
  echo "=== PAPER TRADING ACCOUNTS ==="
  ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/accounts" | jq '.[] | {agent_name, balance: .current_balance, pnl: .total_pnl, positions: .open_positions}'
  sleep 60
done
```

---

## Troubleshooting

### App Stopped Running
```bash
ssh root@104.131.34.225 "cd /var/www/ai-backtest/backend && pm2 restart ai-backtest-backend"
```

### Check for Errors
```bash
ssh root@104.131.34.225 "pm2 logs ai-backtest-backend --err --lines 100"
```

### Database Issues
```bash
# Check if database is accessible
ssh root@104.131.34.225 "ls -lh /var/www/ai-backtest/backend/backtesting.db"
```

---

## Performance Metrics to Track

### Daily
- Total P&L across all accounts
- Number of trades executed
- Win rate (wins / total trades)
- Average profit per winning trade
- Average loss per losing trade

### Weekly
- Best performing agent
- Most traded ticker
- Largest winning trade
- Largest losing trade
- Sharpe ratio

### Monthly
- Total return %
- Max drawdown
- Number of consecutive wins/losses
- Strategy effectiveness

---

## Alerts to Set Up (Optional)

### Email/Slack Notifications
You could set up alerts for:
- 📈 Big wins (>$1000 profit on single trade)
- 📉 Big losses (>$500 loss on single trade)
- ⚠️ Account drawdown >10%
- 🚨 App crashes
- ✅ Daily P&L summary

---

## Production Server Info

- **Server:** 104.131.34.225
- **API:** http://104.131.34.225:3000 (internal only)
- **HTTPS:** https://104.131.34.225 (with self-signed cert)
- **Logs:** `/var/log/ai-backtest/`
- **Database:** `/var/www/ai-backtest/backend/backtesting.db`

---

## Quick Commands Cheat Sheet

```bash
# Check app status
ssh root@104.131.34.225 "pm2 status"

# View logs
ssh root@104.131.34.225 "pm2 logs --lines 50"

# Restart app
ssh root@104.131.34.225 "pm2 restart ai-backtest-backend"

# Check health
ssh root@104.131.34.225 "curl -s http://localhost:3000/health"

# View paper trading summary
ssh root@104.131.34.225 "curl -s http://localhost:3000/api/paper-trading/status | jq ."

# Watch live
ssh root@104.131.34.225 "pm2 logs ai-backtest-backend"
```

---

## Next Steps

1. ✅ **Verify app is running** - Check health endpoint
2. 📊 **Check paper trading status** - See if agents are active
3. 👀 **Watch logs** - See real-time activity
4. 📈 **Monitor performance** - Track P&L
5. 🎉 **Celebrate wins!**

Happy trading! 🚀
