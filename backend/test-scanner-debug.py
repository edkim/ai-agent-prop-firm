#!/usr/bin/env python3
"""
Test the scanner debug endpoint with the gap-down VWAP reclaim template
"""

import json
import requests

# Read the scanner template
with open('src/templates/scanners/gap-down-vwap-reclaim.ts', 'r') as f:
    scanner_code = f.read()

# Test on TSLA (known for gaps) on a recent date
payload = {
    "scannerCode": scanner_code,
    "ticker": "TSLA",
    "date": "2025-01-10",
    "explain": False
}

print("🔍 Testing Scanner Debug Endpoint")
print(f"   Ticker: {payload['ticker']}")
print(f"   Date: {payload['date']}")
print("")

# Call the debug endpoint
response = requests.post(
    'http://localhost:3000/api/scanner-debug',
    json=payload,
    timeout=30
)

result = response.json()

print("📊 Results:")
print(f"   Bars Scanned: {result['barsScanned']}")
print(f"   Signals Found: {result['signalsFound']}")
print("")

if result['signalsFound'] > 0:
    print("✅ Signals:")
    for signal in result.get('signals', []):
        print(f"   - Time: {signal['signal_time']}")
        print(f"     Entry: ${signal['entry_price']}")
        print(f"     Gap: {signal['gap_percent']}%")
        print(f"     Pattern Strength: {signal['pattern_strength']}")
        print("")
else:
    print("❌ No signals found")
    print("")
    print("Sample bars (first 5):")
    for bar in result['sampleBars'][:5]:
        print(f"   {bar['time_of_day']}: O${bar['open']:.2f} H${bar['high']:.2f} L${bar['low']:.2f} C${bar['close']:.2f}")
    print("")

if result.get('error'):
    print(f"⚠️  Error: {result['error']}")

print("")
print("Debug logs:")
for log in result.get('debugLogs', []):
    print(f"   {log}")
