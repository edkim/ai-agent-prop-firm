#!/usr/bin/env python3
"""
Fetch S&P 500 ticker list from Wikipedia
"""

import pandas as pd
import sys

try:
    # Read S&P 500 list from Wikipedia
    url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
    tables = pd.read_html(url)
    sp500_table = tables[0]

    # Get ticker symbols
    tickers = sp500_table['Symbol'].tolist()

    # Clean up tickers (replace . with - for compatibility)
    tickers = [t.replace('.', '-') for t in tickers]

    print(f"Found {len(tickers)} S&P 500 tickers", file=sys.stderr)
    print(f"First 10: {', '.join(tickers[:10])}", file=sys.stderr)
    print(f"Last 10: {', '.join(tickers[-10:])}", file=sys.stderr)

    # Output as comma-separated list
    print(','.join(tickers))

except Exception as e:
    print(f"Error fetching S&P 500 list: {e}", file=sys.stderr)
    sys.exit(1)
