#!/bin/bash

# Run afternoon backtest and analyze
npx ts-node tmp/orb-execution-simple.ts > tmp/orb-results-afternoon-final.json 2>&1

echo "Execution completed. Analyzing..."

python3 << 'PYTHON'
import json

with open('tmp/orb-results-afternoon-final.json') as f:
    lines = f.readlines()
    json_start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith('['):
            json_start = i
            break
    data = json.loads(''.join(lines[json_start:]))

trades = [t for t in data if t.get('pnlPercent') is not None]

print(f"\n📈 AFTERNOON ORB BACKTEST (Aug 17 - Oct 13)")
print(f"=" * 60)
print(f"\nFilter: Entry time >= 12:00 PM")
print(f"Date Range: 2025-08-17 to 2025-10-13 (out-of-sample)\n")

print(f"Total Trades: {len(trades)}")

if len(trades) == 0:
    print("\nNo trades executed.")
    exit()

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
profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

print(f"Profit Factor: {profit_factor:.2f}")

from collections import defaultdict
by_reason = defaultdict(list)
for t in trades:
    by_reason[t['exitReason']].append(t['pnlPercent'])

print(f"\n📋 Exit Reasons:\n")
for reason, pnls in sorted(by_reason.items(), key=lambda x: -len(x[1])):
    avg = sum(pnls) / len(pnls)
    print(f"  {reason}: {len(pnls)} trades, avg {avg:+.2f}%")

print(f"\n📊 All Trades:\n")
for t in trades:
    sign = "+" if t['pnlPercent'] > 0 else ""
    print(f"  {t['ticker']:6} {t['date']}  Entry {t['entryTime']}  {sign}{t['pnlPercent']:6.2f}%  {t['exitReason']}")

print(f"\n" + "=" * 60)
print("COMPARISON WITH ORIGINAL TEST PERIOD (Oct 14 - Nov 12)")
print("=" * 60)
print(f"\nAfternoon only (Aug 17 - Oct 13): {len(trades)} trades, {avg_pnl:+.2f}% avg, {profit_factor:.2f} PF")
print(f"All entries (Oct 14 - Nov 12):     482 trades, -0.02% avg, 0.96 PF")
print(f"\n{'✅ PROFITABLE' if avg_pnl > 0 else '❌ UNPROFITABLE'}")
PYTHON
