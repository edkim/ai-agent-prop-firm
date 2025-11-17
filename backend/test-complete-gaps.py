#!/usr/bin/env python3
import requests
import json

with open('src/templates/scanners/gap-down-vwap-reclaim.ts') as f:
    scanner = f.read()

# Gap-downs with complete data (>60 bars)
test_cases = [
    ("APLT", "2025-11-13", -69.99),
    ("AMZE", "2025-11-13", -61.27),
    ("ARDT", "2025-11-13", -37.21),
    ("APLX", "2025-11-13", -39.03),
    ("BTDR", "2025-11-11", -36.55),
]

print("🔍 Testing scanner on gap-downs with COMPLETE data\n")

for ticker, date, expected_gap in test_cases:
    response = requests.post(
        'http://localhost:3000/api/scanner-debug',
        json={'scannerCode': scanner, 'ticker': ticker, 'date': date},
        timeout=30
    )
    result = response.json()
    
    status = "✅" if result['signalsFound'] > 0 else "❌"
    print(f"{status} {ticker} {date}: {result['barsScanned']} bars, {result['signalsFound']} signals")
    
    if result['signalsFound'] > 0:
        for sig in result['signals']:
            print(f"   📊 Gap: {sig['gap_percent']}%, Entry: ${sig['entry_price']}, VWAP Crosses: {sig['vwap_crosses']}, Vol Ratio: {sig['volume_ratio']}")
