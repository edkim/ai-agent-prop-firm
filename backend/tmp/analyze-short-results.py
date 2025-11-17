import json

with open('tmp/short-backtest-results.json') as f:
    lines = f.readlines()
    data = json.loads(''.join(lines[1:]))  # Skip first line (stderr)

trades = [t for t in data if t.get('pnlPercent') is not None]

print(f"📊 SHORT Strategy Results (Gap-Up Fade)\n")
print(f"Total Trades: {len(trades)}")
print(f"Winners: {len([t for t in trades if t['pnlPercent'] > 0])} ({len([t for t in trades if t['pnlPercent'] > 0])/len(trades)*100:.1f}%)")
print(f"Losers: {len([t for t in trades if t['pnlPercent'] < 0])} ({len([t for t in trades if t['pnlPercent'] < 0])/len(trades)*100:.1f}%)")

winners = [t for t in trades if t['pnlPercent'] > 0]
losers = [t for t in trades if t['pnlPercent'] < 0]

avg_win = sum(t['pnlPercent'] for t in winners) / len(winners) if winners else 0
avg_loss = sum(t['pnlPercent'] for t in losers) / len(losers) if losers else 0
avg_pnl = sum(t['pnlPercent'] for t in trades) / len(trades)
total_pnl = sum(t['pnlPercent'] for t in trades)

print(f"\nAvg Win: +{avg_win:.2f}%")
print(f"Avg Loss: {avg_loss:.2f}%")
print(f"Avg P&L: {avg_pnl:.2f}%")
print(f"Total P&L: {total_pnl:.2f}%")

gross_profit = sum(t['pnlPercent'] for t in winners)
gross_loss = abs(sum(t['pnlPercent'] for t in losers))
profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0

print(f"Profit Factor: {profit_factor:.2f}")

# Group by exit reason
from collections import defaultdict
by_reason = defaultdict(list)
for t in trades:
    by_reason[t['exitReason']].append(t['pnlPercent'])

print(f"\n📋 Exit Reasons:\n")
for reason, pnls in sorted(by_reason.items(), key=lambda x: -len(x[1])):
    avg = sum(pnls) / len(pnls)
    print(f"  {reason}: {len(pnls)} trades, avg {avg:+.2f}%")

# Top winners/losers
print(f"\n🏆 Top 5 Winners:\n")
top_winners = sorted(winners, key=lambda x: -x['pnlPercent'])[:5]
for t in top_winners:
    print(f"  {t['ticker']} {t['date']}: +{t['pnlPercent']:.2f}% ({t['exitReason']})")

print(f"\n📉 Top 5 Losers:\n")
top_losers = sorted(losers, key=lambda x: x['pnlPercent'])[:5]
for t in top_losers:
    print(f"  {t['ticker']} {t['date']}: {t['pnlPercent']:.2f}% ({t['exitReason']})")
