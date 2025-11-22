import json

with open('tmp/orb-results-fixed.json') as f:
    lines = f.readlines()
    data = json.loads(''.join(lines[1:]))

trades = [t for t in data if t.get('pnlPercent') is not None]

print(f"📈 OPENING RANGE BREAKOUT (FIXED EXECUTION)\n")
print(f"Fix: Use realistic entry price (bar open) instead of historical OR high\n")
print(f"Total Trades: {len(trades)}")
winners = [t for t in trades if t['pnlPercent'] > 0]
losers = [t for t in trades if t['pnlPercent'] < 0]
print(f"Winners: {len(winners)} ({len(winners)/len(trades)*100:.1f}%)")
print(f"Losers: {len(losers)} ({len(losers)/len(trades)*100:.1f}%)")

avg_win = sum(t['pnlPercent'] for t in winners) / len(winners) if winners else 0
avg_loss = sum(t['pnlPercent'] for t in losers) / len(losers) if losers else 0
avg_pnl = sum(t['pnlPercent'] for t in trades) / len(trades)
total_pnl = sum(t['pnlPercent'] for t in trades)

print(f"\nAvg Win: +{avg_win:.2f}%")
print(f"Avg Loss: {avg_loss:.2f}%")
print(f"Avg P&L: {avg_pnl:+.2f}%")
print(f"Total P&L: {total_pnl:+.2f}%")

gross_profit = sum(t['pnlPercent'] for t in winners)
gross_loss = abs(sum(t['pnlPercent'] for t in losers))
profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0

print(f"Profit Factor: {profit_factor:.2f}")

from collections import defaultdict
by_reason = defaultdict(list)
for t in trades:
    by_reason[t['exitReason']].append(t['pnlPercent'])

print(f"\n📋 Exit Reasons:\n")
for reason, pnls in sorted(by_reason.items(), key=lambda x: -len(x[1])):
    avg = sum(pnls) / len(pnls)
    print(f"  {reason}: {len(pnls)} trades, avg {avg:+.2f}%")

print(f"\n🏆 Top 5 Winners:\n")
top_winners = sorted(winners, key=lambda x: -x['pnlPercent'])[:5]
for t in top_winners:
    print(f"  {t['ticker']} {t['date']}: +{t['pnlPercent']:.2f}% ({t['exitReason']})")

print(f"\n📉 Top 5 Losers:\n")
top_losers = sorted(losers, key=lambda x: x['pnlPercent'])[:5]
for t in top_losers:
    print(f"  {t['ticker']} {t['date']}: {t['pnlPercent']:.2f}% ({t['exitReason']})")

# Sample MU trade for validation
print(f"\n" + "="*60)
print(f"SAMPLE TRADE VALIDATION: MU 2025-10-23")
print(f"="*60)
mu_trade = [t for t in trades if t['ticker'] == 'MU' and t['date'] == '2025-10-23'][0]
print(f"Entry Time: {mu_trade['entryTime']}")
print(f"Entry Price: ${mu_trade['entryPrice']:.2f}")
print(f"Exit Time: {mu_trade.get('exitTime', 'N/A')}")
print(f"Exit Price: ${mu_trade['exitPrice']:.2f}")
print(f"Lowest Price: ${mu_trade['lowestPrice']:.2f}")
print(f"Highest Price: ${mu_trade['highestPrice']:.2f}")
print(f"OR High: ${mu_trade['orHigh']:.2f}")
print(f"OR Low: ${mu_trade['orLow']:.2f}")
print(f"P&L: {mu_trade['pnlPercent']:+.2f}%")
print(f"Exit Reason: {mu_trade['exitReason']}")

# Comparison
print(f"\n" + "="*60)
print(f"COMPARISON: ORIGINAL vs FIXED")
print(f"="*60)
print(f"\nORIGINAL (buggy entry at OR high):")
print(f"  Total P&L: +56.89% | Avg: +0.34% | WR: 54.5% | PF: 3.27")
print(f"\nFIXED (realistic entry at bar open):")
print(f"  Total P&L: {total_pnl:+.2f}% | Avg: {avg_pnl:+.2f}% | WR: {len(winners)/len(trades)*100:.1f}% | PF: {profit_factor:.2f}")
print(f"\n{'✅ PROFITABLE' if avg_pnl > 0 else '❌ UNPROFITABLE'}")
