#!/usr/bin/env python3
"""
Check data quality and find testable scenarios
"""

import sqlite3

db = sqlite3.connect('/Users/edwardkim/Code/ai-backtest/backtesting.db')
cursor = db.cursor()

print("🔍 Checking OHLCV Data Quality\n")

# Check what tickers we have
cursor.execute("""
    SELECT ticker, COUNT(DISTINCT date(timestamp/1000, 'unixepoch')) as days,
           MIN(date(timestamp/1000, 'unixepoch')) as first_date,
           MAX(date(timestamp/1000, 'unixepoch')) as last_date
    FROM ohlcv_data
    GROUP BY ticker
    ORDER BY days DESC
    LIMIT 10
""")

print("Available Tickers:")
print("-" * 70)
for row in cursor.fetchall():
    print(f"{row[0]:8} {row[1]:4} days  ({row[2]} to {row[3]})")

print("\n" + "="*70 + "\n")

# Check for actual gaps on recent dates
cursor.execute("""
    WITH first_bar AS (
        SELECT
            ticker,
            date(timestamp/1000, 'unixepoch') as trade_date,
            open as first_open,
            MIN(timestamp) as first_ts
        FROM ohlcv_data
        WHERE date(timestamp/1000, 'unixepoch') >= date('now', '-10 days')
        GROUP BY ticker, trade_date
    ),
    prev_close AS (
        SELECT
            ticker,
            date(timestamp/1000, 'unixepoch') as trade_date,
            close as last_close,
            MAX(timestamp) as last_ts
        FROM ohlcv_data
        WHERE date(timestamp/1000, 'unixepoch') >= date('now', '-11 days')
        GROUP BY ticker, trade_date
    )
    SELECT
        f.ticker,
        f.trade_date,
        ROUND(((f.first_open - p.last_close) / p.last_close * 100), 2) as gap_pct,
        f.first_open,
        p.last_close
    FROM first_bar f
    JOIN prev_close p ON f.ticker = p.ticker
        AND p.trade_date = date(f.trade_date, '-1 day')
    WHERE ABS((f.first_open - p.last_close) / p.last_close * 100) > 0.5
    ORDER BY ABS(gap_pct) DESC
    LIMIT 20
""")

gaps = cursor.fetchall()

if gaps:
    print("📊 Recent Gaps (>0.5%):\n")
    print("Ticker    Date          Gap %     Open      Prev Close")
    print("-" * 70)
    for row in gaps:
        print(f"{row[0]:8}  {row[1]}  {row[2]:>6}%  ${row[3]:>7.2f}  ${row[4]:>7.2f}")

    print("\n💡 Test these ticker/date combinations:")
    print("-" * 70)
    for i, row in enumerate(gaps[:5], 1):
        print(f"{i}. {row[0]} on {row[1]} (Gap: {row[2]}%)")
else:
    print("❌ No significant gaps found in recent 10 days")
    print("\n💡 This might mean:")
    print("   1. Market has been calm recently (no big gaps)")
    print("   2. Data might not have market open prices")
    print("   3. Need to look at older dates")

db.close()
