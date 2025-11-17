import json

strategies = [
    {
        'name': 'Gap-Down VWAP Reclaim (LONG Mean Reversion)',
        'file': 'tmp/backtest-results-clean.json',
        'description': 'Enter LONG when gap down crosses back above VWAP'
    },
    {
        'name': 'Gap-Up Fade (SHORT Mean Reversion)',
        'file': 'tmp/short-backtest-results.json',
        'description': 'Enter SHORT when gap up crosses back below VWAP'
    },
    {
        'name': 'Gap-And-Go (LONG Trend Following)',
        'file': 'tmp/gap-and-go-results.json',
        'description': 'Enter LONG when gap up holds above VWAP (ride strength)'
    }
]

print("=" * 80)
print("COMPREHENSIVE GAP STRATEGY COMPARISON")
print("Test Period: Oct 14 - Nov 12, 2025 (23 trading days)")
print("=" * 80)
print()

for strat in strategies:
    with open(strat['file']) as f:
        lines = f.readlines()
        # Skip first line if it's not JSON
        if lines[0].strip().startswith('['):
            data = json.loads(''.join(lines))
        else:
            data = json.loads(''.join(lines[1:]))

    trades = [t for t in data if t.get('pnlPercent') is not None]

    if len(trades) == 0:
        print(f"❌ {strat['name']}")
        print(f"   {strat['description']}")
        print(f"   No trades executed")
        print()
        continue

    winners = [t for t in trades if t['pnlPercent'] > 0]
    losers = [t for t in trades if t['pnlPercent'] < 0]

    win_rate = len(winners) / len(trades) * 100
    avg_win = sum(t['pnlPercent'] for t in winners) / len(winners) if winners else 0
    avg_loss = sum(t['pnlPercent'] for t in losers) / len(losers) if losers else 0
    avg_pnl = sum(t['pnlPercent'] for t in trades) / len(trades)
    total_pnl = sum(t['pnlPercent'] for t in trades)

    gross_profit = sum(t['pnlPercent'] for t in winners)
    gross_loss = abs(sum(t['pnlPercent'] for t in losers))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0

    # Expectancy per trade
    expectancy = avg_pnl

    print(f"{'✓' if expectancy > 0 else '✗'} {strat['name']}")
    print(f"   {strat['description']}")
    print(f"   Trades: {len(trades)} | Win Rate: {win_rate:.1f}% | Expectancy: {expectancy:+.2f}%")
    print(f"   Avg Win: +{avg_win:.2f}% | Avg Loss: {avg_loss:.2f}% | Profit Factor: {profit_factor:.2f}")
    print(f"   Total P&L: {total_pnl:+.2f}%")
    print()

print("=" * 80)
print("KEY FINDINGS:")
print("=" * 80)
print()
print("🔴 ALL THREE STRATEGIES ARE UNPROFITABLE")
print()
print("Common failure pattern:")
print("  • VWAP whipsaw - first cross is often a fakeout")
print("  • Price immediately reverses back through VWAP")
print("  • Stop losses triggered 67-80% of the time")
print()
print("Strategy Comparison:")
print("  • Mean reversion (both directions): ~-0.32% expectancy")
print("  • Trend following: -0.18% expectancy (slightly better but still negative)")
print()
print("Possible reasons for failure:")
print("  • Oct-Nov 2025 market conditions unfavorable for gap trading")
print("  • 50-ticker sample may be insufficient")
print("  • VWAP alone is not strong enough signal for entries/exits")
print("  • Need additional filters (volume, market regime, etc.)")
print()
