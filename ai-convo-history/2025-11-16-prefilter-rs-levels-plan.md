# Prefilter + RS/Levels Plan
**Date:** 2025-11-16  
**Status:** Draft

## Motivation
- **Realistic workflow:** Live/paper flow is “pick a daily watchlist, then trade intraday.” Backtests should mirror that cadence (daily prefilter → per-bar scan) to avoid unrealistic all-universe per-bar scans.
- **Reusability:** Let prompts define universe, benchmark, and filters (RS, 52w proximity, S/R clearance, earnings/news, RVOL) without hard-coding tickers.
- **Performance:** Daily prefilters and cached features keep large universes (e.g., R2K) practical; intraday scans only run on the selected list.
- **Reproducibility:** Store prefilter outputs and parameters with backtests/paper sessions to replay and compare consistently.

## Feature Outline
- **Daily features (snapshot after prior close):**
  - 52w high/low and % distance.
  - Long-term levels: clustered pivot highs/lows (3–6 months daily), touch counts.
  - Anchored VWAPs from key events (earnings, major gaps, 52w H/L).
  - Clearance to nearest resistance/support (pct and ATR).
  - Liquidity: median 5m volume; spread if available.
  - Events: earnings today/tomorrow; news flag (future).
  - Premarket RVOL: premarket volume vs 30d premarket avg.
- **Prefilter runner (daily or on-demand):**
  - Inputs: universe, benchmark, RS lookback (daily or intraday short window), top N, filters (52w proximity, level clearance, earnings/news, RVOL, liquidity).
  - Steps: load universe → compute RS vs benchmark (optional) → apply filters → rank (e.g., RS desc, then RVOL, then liquidity) → select top N → emit tickers + metadata.
- **Intraday scan alignment:**
  - Backtest: per day, run prefilter once (no lookahead), cache list, then per-bar VWAP logic on that list; store prefilter result with the backtest.
  - Live/paper: same cadence; optionally refresh intraday RS on short windows.
- **Helpers/contract:**
  - Leave `SCAN_TICKERS` as override; if absent, allow fetching by `SCAN_UNIVERSE`.
  - Expose helpers: `getIntradayData`, `calculateRelativeStrength`, `findPivotResistance`, `findSupport`, `findResistance`, `distanceFromLevel`, `calculateATR`, etc.
  - Prompt pattern: “Prefilter: top N by RS vs BENCH over LOOKBACK in UNIVERSE with filters {...}. Then apply VWAP logic.”
- **Schema (outline):**
  - `daily_features`: per ticker/date/universe, store long-term levels, 52w metrics, clearance, liquidity, RVOL, events.
  - `prefilter_runs`: optional log of params + selected tickers for reproducibility.

## System Prompt Example (scanner personality)
You are an intraday scanner that first builds a daily watchlist, then runs per-bar logic. When SCAN_TICKERS is not provided, you may fetch tickers from the configured universe (e.g., SCAN_UNIVERSE=SP500). You must:
- Run a prefilter once per day to select top N tickers by relative strength vs the benchmark (default benchmark SPY; configurable via prompt), optionally filtered by 52w proximity, clearance to long-term resistance, earnings/news flags, liquidity, and premarket RVOL.
- Use helpers: getIntradayData, calculateRelativeStrength, findPivotResistance, findSupport, findResistance, distanceFromLevel, calculateATR, calculateVWAP.
- Avoid lookahead: prefilter uses only data available up to the selection time (e.g., prior close or the specified intraday lookback).
- After selecting the daily list, run intraday VWAP logic per bar only on that list.
- Emit JSON signals; write progress to stderr only.

## Prompt Examples (supported after implementation)
1) “Use universe SP500. Prefilter: top 20 by RS vs SPY over the last 60 minutes of 5m bars, liquidity > 500k median 5m volume, premarket RVOL > 2. Then apply VWAP reclaim logic with level clearance ≥0.4 ATR to next resistance.”
2) “Universe XLK. Select tickers within 5% of their 52w high and top 15 by RS vs XLK over the past month (daily). Exclude tickers with earnings today/tomorrow. Then run an opening-range VWAP breakout scan.”
3) “Universe RUSSELL2000. Choose 25 names closest (≤0.3 ATR) to long-term pivot resistance (3–6 month daily pivots) with touch count ≥2 and RS vs IWM > 0 over the last 90 minutes. Then scan for VWAP fades into that resistance.”
4) “Universe SP500. Filter tickers where next major resistance is within 1 ATR above and there is earnings or significant news today, and premarket RVOL > 2. Then run a VWAP reclaim long-only scan.”

# Original discussion
Here’s a detailed plan to support flexible prefilters (RS, 52w proximity, long-term S/R, news/earnings, RVOL) and daily/ intraday alignment.

  Goals

  - Let prompts/configs define prefilters like “top N RS vs benchmark,” “within 5% of 52w high,” “near long-term resistance,” “earnings/news + premarket RVOL > 2.”
  - Run prefilters on a daily cadence (or short intraday window) to produce a ticker list; run VWAP/intraday logic per bar on that list.
  - Avoid lookahead; keep performance sane on large universes (e.g., R2K).

  Feature computation (daily job)

  - Universe: use universe_stocks per named universe (SP500, R2K, sector ETFs).
  - Daily features per ticker (snapshot after prior close):
      - 52w high/low, % distance to 52w highs/lows.
      - Long-term levels: clustered pivot highs/lows over last 3–6 months of daily bars; store top-of-band/low-of-band and touch counts.
      - Anchored VWAPs from key events: prior earnings day, major gaps (≥X%), and 52w high/low date.
      - Level clearance: % and ATR distance to nearest resistance/support above/below (from long-term levels and PDH/PDL).
      - Liquidity: median 5m volume (recent period), average spread if available.
      - Events: earnings today/tomorrow, news flags (future), econ blackout flags (global).
      - Premarket RVOL: premarket volume vs 30-day premarket average.
  - Store in a daily_features table (ticker, date, universe, feature JSON or columns) so intraday scans don’t recompute long histories.

  Prefilter runner (daily or on-demand)

  - Inputs (from prompt/config): universe name, benchmark ticker, RS lookback (daily or intraday bars), top N, filters (52w proximity, level clearance thresholds, earnings/news flags, liquidity
    thresholds, premarket RVOL).
  - Flow:
      1. Load universe tickers.
      2. Optionally compute RS vs benchmark (daily: past month; intraday: last 60–120m) using calculateRelativeStrength.
      3. Apply filters: 52w proximity, clearance to long-term resistance/support, earnings/news flag, premarket RVOL > threshold, liquidity min.
      4. Rank (e.g., by RS desc, then RVOL, then liquidity) and select top N.
      5. Emit ticker list + metadata (params used) to be consumed by the intraday scan; store alongside backtest/paper session for reproducibility.

  Intraday scan alignment

  - Backtests: for each day, run the prefilter once (using only data up to that time—e.g., prior close for 52w/long-term, and if intraday RS is requested, use only bars in the lookback window before scan
    start), cache tickers, then run VWAP/per-bar logic on that list. Store prefilter output with the backtest record.
  - Paper/live: run the same prefilter daily (and optionally hourly if intraday RS refresh is needed), cache the list for the session; intraday loop consumes the cached list only.

  Helpers/contract for Claude

  - Expose helpers: getIntradayData, calculateRelativeStrength, findPivotResistance, findSupport, findResistance, distanceFromLevel, calculateATR, etc.
  - Allow scanners to fetch a universe if SCAN_TICKERS is unset (e.g., SCAN_UNIVERSE=SP500) and fetch benchmark bars for RS.
  - Document prompt pattern: “Prefilter: top N by RS vs BENCH over LOOKBACK in UNIVERSE, with filters {52w proximity, level clearance, earnings/news, RVOL}. Then apply VWAP logic.”
  - Keep SCAN_TICKERS as an override; if provided, skip prefilter.

  Schema additions (outline)

  - daily_features (ticker, date, universe, json/features): stores 52w high/low, % distances, long-term resistance/support levels, clearance (pct/ATR), anchored VWAPs, liquidity, premarket RVOL, earnings/
    news flags.
  - prefilter_runs (id, date, universe, benchmark, lookback, filters JSON, top_n, tickers JSON): optional to record what was selected per day/backtest for reproducibility.

  Performance considerations

  - Daily RS over month: fine for large universes (R2K).
  - Intraday RS over last 60–120m: reasonable if limited to recent bars and prepared statements.
  - Avoid full-month intraday RS; use daily data for long windows.
  - Cache benchmark bars once per run.

  Next steps (implementation-ready)

  1. Add daily_features table and a daily job to populate 52w metrics, long-term levels (pivot clusters), clearance, liquidity, premarket RVOL, earnings flags.
  2. Add a prefilter runner that:
      - Loads universe tickers
      - Optionally computes RS vs benchmark (daily/intraday, configurable)
      - Applies filters (52w proximity, clearance, earnings/news, RVOL, liquidity)
      - Ranks and returns top N tickers + metadata
  3. Integrate prefilter into backtest runner: run once per day, then scan per bar on the resulting list; store the prefilter output with the backtest.
  4. Expose prompt/config contract so Claude can specify prefilter parameters; keep SCAN_TICKERS as override.
