#!/usr/bin/env python3
import requests
import json

with open('src/templates/scanners/gap-down-vwap-reclaim.ts') as f:
    scanner = f.read()

response = requests.post(
    'http://localhost:3000/api/scanner-debug',
    json={'scannerCode': scanner, 'ticker': 'QQQ', 'date': '2025-11-14'},
    timeout=30
)

result = response.json()

print(f"📊 QQQ on 2025-11-14:\n")
print(f"Bars scanned: {result['barsScanned']}")
print(f"Signals found: {result['signalsFound']}\n")

if result.get('dataQualityWarnings'):
    print("Data quality warnings:")
    for warning in result['dataQualityWarnings']:
        print(f"  {warning}")
    print()

if result.get('error'):
    print(f"❌ Error: {result['error']}\n")

if result['signalsFound'] > 0:
    print("✅ Signals found:")
    for sig in result['signals']:
        print(f"  Time: {sig['signal_time']}")
        print(f"  Gap: {sig['gap_percent']}%")
        print(f"  Entry: ${sig['entry_price']}")
        print(f"  VWAP Crosses: {sig['vwap_crosses']}")
        print(f"  Volume Ratio: {sig['volume_ratio']}")
        print(f"  Pattern Strength: {sig['pattern_strength']}")
else:
    print("❌ No signals found")
    
print("\nFirst 10 bars:")
for i, bar in enumerate(result['sampleBars'][:10], 1):
    print(f"{i}. {bar['time_of_day']}: Close=${bar['close']:.2f}, Vol={bar['volume']:,}")
