import json

with open('tmp/orb-results.json') as f:
    lines = f.readlines()
    data = json.loads(''.join(lines[1:]))

trades = [t for t in data if t.get('pnlPercent') is not None]

print(f"📈 OPENING RANGE BREAKOUT (5-Min ORB)\n")
print(f"Filters: Volume > Average, QQQ > Prev Close\n")
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

# Comparison with gap strategies
print(f"\n" + "="*60)
print(f"COMPARISON WITH GAP STRATEGIES")
print(f"="*60)
print(f"\nOpening Range Breakout:  {avg_pnl:+.2f}% avg | {len(winners)/len(trades)*100:.1f}% WR")
print(f"Gap-Down Reclaim (LONG): -0.31% avg | 33.3% WR")
print(f"Gap-Up Fade (SHORT):     -0.33% avg | 20.0% WR")
print(f"Gap-And-Go (LONG):       -0.18% avg | 28.6% WR")
print(f"\n{'✅ PROFITABLE' if avg_pnl > 0 else '❌ UNPROFITABLE'}")
