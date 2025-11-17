#!/usr/bin/env python3
import requests
import json

tickers = [
    "AMOD", "ARTL", "MPWR", "BNBX", "ADSK", "BNR", "AVGO", "AMD", "BCDA", "AKTX",
    "BGSF", "IWM", "AURE", "AIMD", "CET", "AMZN", "AAPL", "AIHS", "BBLG", "AKAN",
    "BFS", "BMR", "APT", "ABP", "BCG", "ANEL", "ADTX", "AMAT", "BIVI", "ADVB",
    "ACN", "ADBE", "BTBD", "BCCC", "QQQ", "BR", "AMS", "CBUS", "BTCT", "AVXX",
    "BFRG", "AXUP", "CDNS", "ATPC", "ADI", "AEHL", "ARBB", "BFRI", "AEC", "BRLS"
]

with open('src/templates/scanners/gap-down-vwap-reclaim.ts') as f:
    scanner = f.read()

signals_found = []
no_signals = []
errors = []

print(f"🔍 Testing {len(tickers)} tickers for gap-down VWAP reclaim signals on 2025-11-14\n")

for i, ticker in enumerate(tickers, 1):
    try:
        response = requests.post(
            'http://localhost:3000/api/scanner-debug',
            json={'scannerCode': scanner, 'ticker': ticker, 'date': '2025-11-14'},
            timeout=30
        )
        result = response.json()

        if result.get('error'):
            errors.append((ticker, result['error']))
            print(f"[{i}/{len(tickers)}] {ticker}: ❌ Error: {result['error']}")
        elif result['signalsFound'] > 0:
            sig = result['signals'][0]
            signals_found.append({
                'ticker': ticker,
                'gap_percent': sig['gap_percent'],
                'pattern_strength': sig['pattern_strength'],
                'entry_price': sig['entry_price'],
                'signal_time': sig['signal_time'],
                'vwap_crosses': sig['vwap_crosses'],
                'volume_ratio': sig['volume_ratio']
            })
            print(f"[{i}/{len(tickers)}] {ticker}: ✅ Signal found! Gap: {sig['gap_percent']}%, Strength: {sig['pattern_strength']}")
        else:
            no_signals.append(ticker)
            print(f"[{i}/{len(tickers)}] {ticker}: - No signal")

    except Exception as e:
        errors.append((ticker, str(e)))
        print(f"[{i}/{len(tickers)}] {ticker}: ❌ Exception: {e}")

print("\n" + "="*80)
print(f"📊 SUMMARY")
print("="*80)
print(f"Signals found: {len(signals_found)}")
print(f"No signals: {len(no_signals)}")
print(f"Errors: {len(errors)}")

if signals_found:
    print(f"\n✅ SIGNALS FOUND ({len(signals_found)}):")
    print("="*80)
    # Sort by pattern strength descending
    signals_found.sort(key=lambda x: x['pattern_strength'], reverse=True)
    for sig in signals_found:
        print(f"\n{sig['ticker']}:")
        print(f"  Gap: {sig['gap_percent']}%")
        print(f"  Pattern Strength: {sig['pattern_strength']}")
        print(f"  Entry: ${sig['entry_price']}")
        print(f"  Time: {sig['signal_time']}")
        print(f"  VWAP Crosses: {sig['vwap_crosses']}")
        print(f"  Volume Ratio: {sig['volume_ratio']}")

if errors:
    print(f"\n❌ ERRORS ({len(errors)}):")
    print("="*80)
    for ticker, error in errors:
        print(f"  {ticker}: {error}")
