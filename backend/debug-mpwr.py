#!/usr/bin/env python3
"""Debug MPWR on 2025-11-14"""

import requests
import json

with open('src/templates/scanners/gap-down-vwap-reclaim.ts') as f:
    scanner = f.read()

response = requests.post(
    'http://localhost:3000/api/scanner-debug',
    json={'scannerCode': scanner, 'ticker': 'MPWR', 'date': '2025-11-14'},
    timeout=30
)

result = response.json()

print(f"📊 MPWR on 2025-11-14 Debug:\n")
print(f"Bars Scanned: {result['barsScanned']}")
print(f"Signals Found: {result['signalsFound']}\n")

if result.get('error'):
    print(f"❌ Error: {result['error']}\n")

print("First 15 bars of the day:")
print("-" * 80)
print(f"{'#':<3} {'Time':<10} {'Open':>8} {'High':>8} {'Low':>8} {'Close':>8} {'Volume':>10}")
print("-" * 80)

for i, bar in enumerate(result['sampleBars'][:15], 1):
    print(f"{i:<3} {bar['time_of_day']:<10} ${bar['open']:>7.2f} ${bar['high']:>7.2f} ${bar['low']:>7.2f} ${bar['close']:>7.2f} {bar['volume']:>10,}")

# Calculate VWAP for first few bars manually
print("\n" + "="*80)
print("Manual VWAP Calculation (first 5 bars):")
print("="*80)

cumVol = 0
cumVolPrice = 0
for i, bar in enumerate(result['sampleBars'][:5], 1):
    typical = (bar['high'] + bar['low'] + bar['close']) / 3
    cumVolPrice += typical * bar['volume']
    cumVol += bar['volume']
    vwap = cumVolPrice / cumVol if cumVol > 0 else 0

    above_vwap = "✅ ABOVE" if bar['close'] > vwap else "❌ BELOW"
    print(f"Bar {i} ({bar['time_of_day']}): Close=${bar['close']:.2f}, VWAP=${vwap:.2f} {above_vwap}")

if result['signalsFound'] > 0:
    print("\n✅ Signals found:")
    for sig in result['signals']:
        print(f"   Time: {sig['signal_time']}, Entry: ${sig['entry_price']}, Gap: {sig['gap_percent']}%")
else:
    print("\n❌ No signals generated")
    print("\nPossible reasons:")
    print("1. Gap might not be >= 1.0%")
    print("2. VWAP crosses might not meet MIN_VWAP_CROSSES threshold")
    print("3. Volume ratio might not meet MIN_VOLUME_RATIO threshold")
    print("4. Scanner might not have previous day close for gap calculation")
