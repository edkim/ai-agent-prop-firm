#!/usr/bin/env python3
import sqlite3

db = sqlite3.connect('/Users/edwardkim/Code/ai-backtest/backtesting.db')
cursor = db.cursor()

# Get prev close
cursor.execute("""
SELECT close FROM ohlcv_data
WHERE ticker='QQQ' AND timeframe='5min'
  AND date(timestamp/1000, 'unixepoch') = '2025-11-13'
  AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) >= 14
  AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) <= 21
ORDER BY timestamp DESC LIMIT 1
""")
prev_close = cursor.fetchone()[0]

# Get first 10 bars of 11-14
cursor.execute("""
SELECT 
  strftime('%H:%M:%S', datetime(timestamp/1000, 'unixepoch')) as time,
  open, high, low, close, volume
FROM ohlcv_data
WHERE ticker='QQQ' AND timeframe='5min'
  AND date(timestamp/1000, 'unixepoch') = '2025-11-14'
  AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) >= 14
  AND CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) <= 21
ORDER BY timestamp ASC
LIMIT 10
""")

bars = cursor.fetchall()
first_open = bars[0][1]
gap_pct = ((first_open - prev_close) / prev_close) * 100

print(f"QQQ Gap Analysis for 2025-11-14:")
print(f"Previous close (2025-11-13): ${prev_close:.2f}")
print(f"Open (2025-11-14): ${first_open:.2f}")
print(f"Gap: {gap_pct:.2f}%")
print(f"Gap meets -1.0% threshold? {gap_pct <= -1.0}\n")

print("First 10 bars with VWAP:")
cumVol = 0
cumVolPrice = 0

for i, bar in enumerate(bars, 1):
    time, open_, high, low, close, volume = bar
    typical = (high + low + close) / 3
    cumVolPrice += typical * volume
    cumVol += volume
    vwap = cumVolPrice / cumVol if cumVol > 0 else 0
    
    relation = "ABOVE" if close > vwap else "BELOW"
    print(f"{i}. {time}: Close=${close:.2f}, VWAP=${vwap:.2f} ({relation})")

db.close()
