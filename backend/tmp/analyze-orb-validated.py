import json

with open('tmp/orb-results-validated.json') as f:
    lines = f.readlines()
    # Skip validation summary (first 4 lines)
    json_start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith('['):
            json_start = i
            break
    data = json.loads(''.join(lines[json_start:]))

trades = [t for t in data if t.get('pnlPercent') is not None]
errors = [t for t in trades if t.get('validationErrors')]

print(f"📈 OPENING RANGE BREAKOUT (PROPER IMPLEMENTATION)\n")
print(f"Strategy: Enter on FIRST break above OR high")
print(f"Entry: Market order at next bar open (ENFORCED)\n")
print(f"Total Signals: {len(data)}")
print(f"Executed Trades: {len(trades)}")
print(f"Trades with validation errors: {len(errors)}")
print(f"Clean trades: {len(trades) - len(errors)}\n")

if errors:
    print("⚠️ VALIDATION ERRORS FOUND:\n")
    for t in errors[:5]:
        print(f"{t['ticker']} {t['date']}:")
        for err in t.get('validationErrors', []):
            print(f"  - {err}")
    print()

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

# Timing analysis
by_timing = defaultdict(list)
for t in trades:
    entry_time = t.get('entryTime', '')
    if entry_time:
        hour = int(entry_time.split(':')[0])
        if hour == 9:
            bucket = '09:30-10:00'
        elif hour == 10:
            bucket = '10:00-11:00'
        elif hour == 11:
            bucket = '11:00-12:00'
        elif hour == 12:
            bucket = '12:00-13:00'
        else:
            bucket = '13:00+'
        by_timing[bucket].append(t['pnlPercent'])

print(f"\n⏰ Entry Time Analysis:\n")
for bucket in ['09:30-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00+']:
    if bucket in by_timing:
        pnls = by_timing[bucket]
        avg = sum(pnls) / len(pnls)
        winners_pct = len([p for p in pnls if p > 0]) / len(pnls) * 100
        print(f"  {bucket}: {len(pnls)} trades, avg {avg:+.2f}%, WR {winners_pct:.1f}%")

print(f"\n🏆 Top 5 Winners:\n")
top_winners = sorted(winners, key=lambda x: -x['pnlPercent'])[:5]
for t in top_winners:
    print(f"  {t['ticker']} {t['date']} (entry {t['entryTime']}): +{t['pnlPercent']:.2f}% ({t['exitReason']})")

print(f"\n📉 Top 5 Losers:\n")
top_losers = sorted(losers, key=lambda x: x['pnlPercent'])[:5]
for t in top_losers:
    print(f"  {t['ticker']} {t['date']} (entry {t['entryTime']}): {t['pnlPercent']:.2f}% ({t['exitReason']})")

# MU validation
mu_trades = [t for t in trades if t['ticker'] == 'MU' and t['date'] == '2025-10-23']
if mu_trades:
    print(f"\n" + "="*60)
    print(f"MU 2025-10-23 VALIDATION")
    print(f"="*60)
    mu = mu_trades[0]
    print(f"Entry Time: {mu['entryTime']} (vs 11:45 in buggy version)")
    print(f"Entry Price: ${mu['entryPrice']:.2f}")
    print(f"Lowest Price: ${mu['lowestPrice']:.2f} {'✓' if mu['lowestPrice'] <= mu['entryPrice'] else '✗ INVALID'}")
    print(f"Highest Price: ${mu['highestPrice']:.2f}")
    print(f"Exit: ${mu['exitPrice']:.2f} at {mu.get('exitTime', 'N/A')}")
    print(f"P&L: {mu['pnlPercent']:+.2f}%")
    if mu.get('validationErrors'):
        print(f"⚠️ Errors: {mu['validationErrors']}")

print(f"\n" + "="*60)
print(f"COMPARISON: ALL THREE VERSIONS")
print(f"="*60)
print(f"\n1. BUGGY (entry at OR high, delayed signal):")
print(f"   Signals: 168 | P&L: +56.89% | Avg: +0.34% | WR: 54.5% | PF: 3.27")
print(f"\n2. FIXED (entry at bar open, delayed signal):")
print(f"   Signals: 168 | P&L: -13.78% | Avg: -0.08% | WR: 39.4% | PF: 0.71")
print(f"\n3. PROPER (entry at bar open, immediate signal):")
print(f"   Signals: {len(trades)} | P&L: {total_pnl:+.2f}% | Avg: {avg_pnl:+.2f}% | WR: {len(winners)/len(trades)*100:.1f}% | PF: {profit_factor:.2f}")
print(f"\n{'✅ PROFITABLE' if avg_pnl > 0 else '❌ UNPROFITABLE'}")
