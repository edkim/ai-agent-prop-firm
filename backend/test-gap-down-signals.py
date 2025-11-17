#!/usr/bin/env python3
"""Test scanner on gap-down candidates"""

import requests
import json

# Read scanner template
with open('src/templates/scanners/gap-down-vwap-reclaim.ts') as f:
    scanner = f.read()

# Gap-down candidates from check-data-quality.py
test_cases = [
    ("AFJKU", "2025-11-07", -41.88),  # Largest gap down
    ("AIRS", "2025-11-07", -30.21),
    ("CELUW", "2025-11-12", -28.16),
    ("AMPGW", "2025-11-11", -25.18),
    ("AERTW", "2025-11-11", -28.90),
]

print("🔍 Testing gap-down VWAP reclaim scanner on known gap-down days\n")
print("=" * 70)

signals_found = []

for ticker, date, expected_gap in test_cases:
    try:
        response = requests.post(
            'http://localhost:3000/api/scanner-debug',
            json={
                'scannerCode': scanner,
                'ticker': ticker,
                'date': date,
                'explain': False
            },
            timeout=30
        )
        result = response.json()

        status = "✅" if result['signalsFound'] > 0 else "❌"
        print(f"\n{status} {ticker} on {date} (Expected gap: {expected_gap:.1f}%)")
        print(f"   Bars scanned: {result['barsScanned']}")
        print(f"   Signals found: {result['signalsFound']}")

        if result.get('dataQualityWarnings'):
            for warning in result['dataQualityWarnings']:
                print(f"   ⚠️  {warning}")

        if result['signalsFound'] > 0:
            signals_found.append((ticker, date, result['signals']))
            for signal in result['signals']:
                print(f"   📊 Signal: Gap {signal['gap_percent']}%, Entry ${signal['entry_price']}, Strength {signal['pattern_strength']}")

        if result.get('error'):
            print(f"   ❌ Error: {result['error']}")

    except Exception as e:
        print(f"\n❌ {ticker} on {date}: Error - {str(e)}")

print("\n" + "=" * 70)
print(f"\n📊 Summary: Found {len(signals_found)} ticker/date combinations with signals\n")

if signals_found:
    print("✅ Signals detected on:")
    for ticker, date, signals in signals_found:
        print(f"   • {ticker} on {date}: {len(signals)} signal(s)")
else:
    print("❌ No signals found. Consider:")
    print("   1. Lowering MIN_GAP_PERCENT (currently 1.0%)")
    print("   2. Lowering MIN_VWAP_CROSSES (currently 1)")
    print("   3. Lowering MIN_VOLUME_RATIO (currently 1.2)")
