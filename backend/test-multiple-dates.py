#!/usr/bin/env python3
"""
Test scanner on multiple recent dates to find gap-downs
"""

import json
import requests

# Read the scanner template
with open('src/templates/scanners/gap-down-vwap-reclaim.ts', 'r') as f:
    scanner_code = f.read()

# Test on multiple recent dates
test_cases = [
    ("TSLA", "2025-11-15"),
    ("TSLA", "2025-11-14"),
    ("TSLA", "2025-11-13"),
    ("NVDA", "2025-11-15"),
    ("NVDA", "2025-11-14"),
    ("NVDA", "2025-11-13"),
    ("AMD", "2025-11-15"),
    ("AMD", "2025-11-14"),
]

print("🔍 Testing scanner on multiple recent dates...")
print("Looking for gap-down patterns...\n")

found_signals = []

for ticker, date in test_cases:
    payload = {
        "scannerCode": scanner_code,
        "ticker": ticker,
        "date": date,
        "explain": False
    }

    try:
        response = requests.post(
            'http://localhost:3000/api/scanner-debug',
            json=payload,
            timeout=30
        )
        result = response.json()

        print(f"{ticker} {date}: ", end='')

        if result['signalsFound'] > 0:
            print(f"✅ {result['signalsFound']} signal(s) found!")
            found_signals.append({
                'ticker': ticker,
                'date': date,
                'signals': result['signals']
            })
        else:
            print(f"❌ No signals")

    except Exception as e:
        print(f"⚠️  Error: {e}")

print("\n" + "="*60)
print(f"\n📊 Summary: Found signals on {len(found_signals)} days\n")

if found_signals:
    print("✅ Gap-down patterns detected:\n")
    for item in found_signals:
        print(f"   {item['ticker']} on {item['date']}:")
        for signal in item['signals']:
            print(f"      Time: {signal['signal_time']}")
            print(f"      Entry: ${signal['entry_price']}")
            print(f"      Gap: {signal['gap_percent']}%")
            print(f"      Pattern Strength: {signal['pattern_strength']}")
            print()

    print("💡 Use these ticker/date combinations to test and iterate!")
else:
    print("❌ No gap-down patterns found in recent data")
    print("   Try:")
    print("   1. Lower MIN_GAP_PERCENT to 1.0% in template")
    print("   2. Test on older volatile dates")
    print("   3. Check if data exists for these dates")
