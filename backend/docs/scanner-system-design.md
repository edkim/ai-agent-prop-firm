# Stock Scanner System with Historical Pattern Recognition

## Overview

This document outlines the design for a natural language stock screening system that can identify stocks matching specific criteria (like capitulatory moves) across both current market conditions and historical occurrences. The goal is to find and study past patterns to improve future trading decisions.

## Use Cases

### Primary Use Case: Capitulatory Move Detection
**Definition:** Rapid, parabolic price moves (often 2x-10x) over short periods, typically driven by:
- Meme stock attention (Reddit, social media)
- Heavy call option buying
- Short squeeze dynamics
- Speculative retail interest

**Examples to Study:**
- **BYND (Recent):** ~10x move in a few days
- **OPEN (July 2024):** Capitulatory move with rapid expansion
- **GME (January 2021):** Famous short squeeze from ~$20 to $480
- **AMC (June 2021):** Similar meme stock dynamics
- **DWAC (October 2021):** SPAC announcement spike

### Secondary Use Cases
- Earnings gap moves (>20% in single day)
- Breakout patterns with unusual volume
- Reversal patterns after extended declines
- Volatility expansion events
- Sector rotation opportunities

## Current State Analysis

**Database:**
- Only 9 tickers: BE, BETR, CRML, HOOD, LAC, OKLO, QQQ, SNDK, USAR
- Intraday data: 1min, 5min, 10sec bars
- Historical depth: 15-30 days per ticker
- Schema: `ohlcv_data` table with ticker, timestamp, timeframe indexing

**Data Source:**
- Polygon.io API for aggregates/bars
- Current usage: Fetching specific ticker/date combinations for backtests
- Need to expand: Bulk universe fetching and daily metric calculations

**Key Limitation:**
- **Cannot find historical patterns** with only 9 tickers and 30 days of data
- Need multi-year data across broad universe (500-2000+ stocks)

---

## Architecture: Scanner vs Backtest

### Backtest System (Current)
```
User Prompt → Claude generates script → Fetch data for ONE ticker → Execute → Return trades
```
- Single ticker focus
- Tests trading strategy over time
- Returns individual trade entries/exits
- Evaluates strategy performance

### Scanner System (New)
```
User Prompt → Claude generates scanner script → Fetch data for MANY tickers → Execute → Return matching stocks
```
- Multi-ticker focus
- Identifies stocks matching criteria
- Returns list of matches with metadata
- Evaluates stock characteristics, not strategy

### Hybrid: Historical Pattern Matching
```
User Prompt → Claude generates pattern detector → Scan historical data → Return occurrences with dates
```
- Scans across tickers AND time periods
- Returns: `{ ticker, date, pattern_strength, metrics }`
- Example: "Find all 5+ day periods where price went up >100% with >3x volume"

---

## Phase 1: Stock Universe Management

### Universe Types

**1. Index-Based Universes**
```typescript
interface Universe {
  id: string;
  name: string;
  type: 'index' | 'custom' | 'watchlist';
  tickers: string[];
  lastUpdated: Date;
  autoUpdate: boolean; // Refresh constituents monthly
}

// Examples:
// - S&P 500 (~500 stocks)
// - Russell 2000 (2000 small caps)
// - Nasdaq 100
// - Custom: High IV stocks, Meme stocks, etc.
```

**2. Dynamic Universes**
- Filter by market cap (>$100M, <$10B)
- Filter by average volume (>1M shares/day)
- Filter by sector/industry
- Filter by optionable status

### Database Schema

```sql
-- Stock universe definitions
CREATE TABLE universes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'index', 'custom', 'watchlist'
  description TEXT,
  auto_update BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Universe constituents (many-to-many)
CREATE TABLE universe_tickers (
  universe_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (universe_id, ticker),
  FOREIGN KEY (universe_id) REFERENCES universes(id)
);

-- Stock metadata (for filtering)
CREATE TABLE stock_metadata (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  market_cap REAL,
  sector TEXT,
  industry TEXT,
  avg_volume_30d REAL,
  is_optionable BOOLEAN,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily aggregated metrics (for fast scanning)
CREATE TABLE daily_metrics (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  price_change_pct REAL,
  volume_vs_avg REAL,
  range_pct REAL, -- (high - low) / open
  PRIMARY KEY (ticker, date)
);

CREATE INDEX idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX idx_daily_metrics_ticker ON daily_metrics(ticker);
CREATE INDEX idx_daily_metrics_change ON daily_metrics(price_change_pct);
CREATE INDEX idx_daily_metrics_volume ON daily_metrics(volume_vs_avg);

-- Historical pattern occurrences (cached scan results)
CREATE TABLE pattern_occurrences (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  pattern_type TEXT, -- 'capitulatory', 'gap', 'breakout', etc.
  strength_score REAL, -- 0-100
  metrics JSON, -- Pattern-specific metrics
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scan_id) REFERENCES scan_history(id)
);

CREATE INDEX idx_pattern_occurrences_ticker ON pattern_occurrences(ticker);
CREATE INDEX idx_pattern_occurrences_date ON pattern_occurrences(start_date);
CREATE INDEX idx_pattern_occurrences_type ON pattern_occurrences(pattern_type);

-- Scan history
CREATE TABLE scan_history (
  id TEXT PRIMARY KEY,
  user_prompt TEXT NOT NULL,
  universe_id TEXT,
  date_range_start TEXT,
  date_range_end TEXT,
  scan_type TEXT, -- 'current', 'historical'
  matches_found INTEGER,
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (universe_id) REFERENCES universes(id)
);
```

### Data Pipeline

**Daily Data Refresh (Scheduled Job)**
```typescript
async function refreshDailyMetrics(universe: Universe) {
  // 1. Fetch yesterday's daily bars for all tickers
  const bars = await polygonService.getDailyBars(universe.tickers, yesterday);

  // 2. Calculate derived metrics
  for (const bar of bars) {
    const metrics = {
      ticker: bar.ticker,
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      price_change_pct: ((bar.close - bar.open) / bar.open) * 100,
      volume_vs_avg: bar.volume / ticker.avg_volume_30d,
      range_pct: ((bar.high - bar.low) / bar.open) * 100,
    };

    await db.insertDailyMetrics(metrics);
  }

  // 3. Update 30-day averages
  await updateStockMetadata(universe.tickers);
}
```

**Historical Data Backfill**
```typescript
async function backfillHistoricalData(
  tickers: string[],
  startDate: string, // '2021-01-01'
  endDate: string     // '2024-10-23'
) {
  // Polygon allows bulk requests
  // Group by date to minimize API calls
  const dateRange = generateDateRange(startDate, endDate);

  for (const date of dateRange) {
    const bars = await polygonService.getDailyBars(tickers, date);
    await saveDailyMetrics(bars);
    await sleep(100); // Rate limiting
  }
}
```

---

## Phase 2: Scanner Script Generation

### Claude System Prompt Enhancement

Add scanner capabilities to Claude:

```typescript
const SCANNER_SYSTEM_PROMPT = `
You are a stock scanner script generator. The user will describe criteria for finding stocks,
and you will generate a TypeScript scanner that:

1. Queries the daily_metrics and ohlcv_data tables
2. Filters stocks matching the user's criteria
3. Returns results sorted by relevance

IMPORTANT DIFFERENCES FROM BACKTESTS:
- Scanners loop through MULTIPLE tickers, not just one
- Focus on FINDING stocks, not trading them
- Return format: array of matching tickers with metadata

AVAILABLE DATA:
- daily_metrics: Pre-calculated daily OHLCV + derived metrics
- ohlcv_data: Intraday bars (1min, 5min, 10sec)
- stock_metadata: Market cap, sector, volume averages

EXAMPLE CRITERIA:
- "Find stocks up >50% in last 5 days with volume >3x average"
- "Find stocks that gapped up >10% today on earnings"
- "Find capitulatory moves: >100% gain over 3-7 days with increasing volume"

OUTPUT FORMAT:
Return JSON array:
[
  {
    ticker: "BYND",
    match_date: "2024-10-15",
    metrics: {
      price_change_pct: 145.3,
      volume_vs_avg: 4.2,
      pattern_strength: 85
    }
  },
  ...
]

For HISTORICAL SCANS:
- Include start_date and end_date in criteria
- Scan across date range, not just current
- Example: "Find all occurrences of 100%+ moves in 5 days from 2020 to 2024"
`;
```

### Scanner Script Structure

```typescript
// Claude-generated scanner script
import Database from 'better-sqlite3';

interface ScanResult {
  ticker: string;
  match_date: string;
  start_date?: string;
  end_date?: string;
  metrics: {
    price_change_pct: number;
    volume_vs_avg: number;
    pattern_strength: number;
    [key: string]: any;
  };
}

async function runScan(
  universe: string[],
  startDate: string,
  endDate: string
): Promise<ScanResult[]> {
  const db = new Database('./backtesting.db');
  const results: ScanResult[] = [];

  // Example: Capitulatory move detection
  for (const ticker of universe) {
    // Query daily metrics for this ticker
    const rows = db.prepare(`
      SELECT * FROM daily_metrics
      WHERE ticker = ?
        AND date BETWEEN ? AND ?
      ORDER BY date ASC
    `).all(ticker, startDate, endDate);

    // Scan for 5-day windows with >100% gain
    for (let i = 0; i < rows.length - 5; i++) {
      const window = rows.slice(i, i + 5);
      const startPrice = window[0].open;
      const endPrice = window[4].close;
      const priceChange = ((endPrice - startPrice) / startPrice) * 100;

      // Check volume expansion
      const avgVolRatio = window.reduce((sum, day) =>
        sum + day.volume_vs_avg, 0) / window.length;

      if (priceChange > 100 && avgVolRatio > 2.0) {
        results.push({
          ticker,
          match_date: window[0].date,
          start_date: window[0].date,
          end_date: window[4].date,
          metrics: {
            price_change_pct: priceChange,
            volume_vs_avg: avgVolRatio,
            pattern_strength: calculateStrength(priceChange, avgVolRatio),
          },
        });
      }
    }
  }

  return results.sort((a, b) =>
    b.metrics.pattern_strength - a.metrics.pattern_strength
  );
}

// Execute scan
const universe = ['BYND', 'GME', 'AMC', 'OPEN', ...]; // From database
const results = await runScan(universe, '2020-01-01', '2024-10-23');
console.log(JSON.stringify(results, null, 2));
```

---

## Phase 3: Scanner API & Frontend

### API Endpoints

```typescript
// POST /api/scans
interface ScanRequest {
  prompt: string; // Natural language criteria
  scanType: 'current' | 'historical';
  universe?: string; // Universe ID or 'all'
  tickers?: string[]; // Custom ticker list
  dateRange?: {
    start: string;
    end: string;
  };
  limit?: number; // Max results (default 50)
}

interface ScanResponse {
  scanId: string;
  matches: ScanResult[];
  totalMatches: number;
  executionTime: number;
  claudePrompt: string;
  claudeConfidence: number;
}

// GET /api/scans/:id
// Retrieve previous scan results

// GET /api/scans
// List scan history

// POST /api/scans/:id/backtest
// Backtest a strategy on scan results
interface BacktestScanRequest {
  scanId: string;
  strategyPrompt: string;
  top_n?: number; // Only backtest top N matches
}
```

### Scanner Service

```typescript
export class ScannerService {
  /**
   * Execute a stock scan
   */
  async runScan(request: ScanRequest): Promise<ScanResponse> {
    const startTime = Date.now();
    const scanId = crypto.randomUUID();

    // 1. Get universe of tickers
    const tickers = await this.getUniverse(request.universe, request.tickers);

    // 2. Generate scanner script with Claude
    const scriptResult = await claudeService.generateScannerScript(
      request.prompt,
      {
        scanType: request.scanType,
        dateRange: request.dateRange,
      }
    );

    // 3. Execute scanner
    const matches = await this.executeScannerScript(
      scriptResult.script,
      tickers,
      request.dateRange
    );

    // 4. Save to database
    await this.saveScanResults(scanId, request, matches);

    return {
      scanId,
      matches: matches.slice(0, request.limit || 50),
      totalMatches: matches.length,
      executionTime: Date.now() - startTime,
      claudePrompt: request.prompt,
      claudeConfidence: scriptResult.confidence,
    };
  }

  /**
   * Get universe tickers
   */
  private async getUniverse(
    universeId?: string,
    customTickers?: string[]
  ): Promise<string[]> {
    if (customTickers && customTickers.length > 0) {
      return customTickers;
    }

    if (universeId) {
      const rows = await db.query(`
        SELECT ticker FROM universe_tickers
        WHERE universe_id = ?
      `, [universeId]);
      return rows.map(r => r.ticker);
    }

    // Default: All stocks with sufficient data
    const rows = await db.query(`
      SELECT DISTINCT ticker FROM daily_metrics
      WHERE date >= date('now', '-30 days')
      GROUP BY ticker
      HAVING COUNT(*) >= 20
    `);
    return rows.map(r => r.ticker);
  }
}
```

### Frontend Components

**1. Scanner Panel** (`src/components/ScannerPanel.tsx`)

Features:
- Natural language input for scan criteria
- Universe selector (S&P 500, Russell 2000, Custom, etc.)
- Scan type toggle (Current vs Historical)
- Date range picker for historical scans
- Example prompts:
  - "Find stocks up >50% in last week"
  - "Find capitulatory moves from 2020-2024"
  - "Find stocks gapping up >10% on earnings"

**2. Scan Results Dashboard** (`src/components/ScanResults.tsx`)

Features:
- **Sortable table** with columns:
  - Ticker
  - Match Date
  - Price Change %
  - Volume vs Avg
  - Pattern Strength
  - Market Cap
  - Actions (View Chart, Backtest)

- **Charts for each match:**
  - Price chart showing the pattern period
  - Volume comparison overlay
  - Highlight start/end dates

- **Pattern Study Mode:**
  - Click any match to see detailed view
  - Compare similar patterns side-by-side
  - Add notes and tags
  - Export for further analysis

- **Backtest Integration:**
  - "Backtest this pattern" button
  - Auto-generate strategy based on pattern
  - Compare strategy performance across all matches

**3. Historical Pattern Library** (`src/components/PatternLibrary.tsx`)

Features:
- Save interesting patterns with names
- Example: "GME Short Squeeze Jan 2021"
- Categorize by type (capitulatory, breakout, gap, etc.)
- Re-run scan to find similar current opportunities
- Study section with notes and lessons learned

---

## Data Requirements & Costs

### Storage Estimates

**Daily Metrics (Efficient)**
- S&P 500: 500 tickers × 252 trading days/year × 5 years = 630,000 rows
- Each row: ~100 bytes
- Total: ~60 MB for 5 years

**Intraday Bars (Expensive)**
- 500 tickers × 252 days × 390 minutes (1min bars) = 49M rows/year
- Only store for specific dates when needed for detailed analysis
- Alternative: Store daily bars, fetch intraday on-demand

**Recommendation:**
- Store daily bars for 5 years for entire universe (~60-100 MB)
- Store intraday bars only for:
  - Recent 30 days (all universe)
  - Historical matches (specific dates)
  - Backtested periods

### Polygon.io API Costs

**Daily Data Refresh:**
- 500 tickers × 1 daily bar = 500 API calls/day
- Polygon allows bulk requests (up to 1000 tickers per call)
- Actual: 1 API call/day for daily updates

**Historical Backfill:**
- 500 tickers × 1260 days (5 years) = 630,000 bars
- Grouped API calls: ~630 calls (1000 bars per call)
- One-time cost

**Intraday Data (On-Demand):**
- Fetch when pattern is found and user wants details
- Example: BYND capitulatory move → fetch 1min bars for Oct 10-20
- Minimal cost since it's event-driven

**Estimated Monthly Cost:**
- Daily updates: Free (included in basic plan)
- Historical backfill: One-time, minimal
- Intraday on-demand: ~$0-50/month depending on usage

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Design and implement database schema
- [ ] Create universe management tables
- [ ] Implement stock_metadata and daily_metrics tables
- [ ] Build data pipeline for daily refresh
- [ ] Backfill historical data for initial universe (S&P 500)

### Phase 2: Scanner Generation (Week 3-4)
- [ ] Enhance Claude system prompt for scanner scripts
- [ ] Implement scanner script generation service
- [ ] Create scanner execution engine
- [ ] Build scanner API endpoints
- [ ] Test with example criteria (capitulatory moves, gaps, etc.)

### Phase 3: Historical Pattern Matching (Week 5-6)
- [ ] Implement multi-period scanning logic
- [ ] Create pattern occurrence caching system
- [ ] Build pattern strength scoring algorithms
- [ ] Add pattern similarity detection
- [ ] Test finding historical examples (GME, BYND, OPEN)

### Phase 4: Frontend & Visualization (Week 7-8)
- [ ] Build scanner panel UI
- [ ] Create scan results dashboard
- [ ] Implement pattern study mode
- [ ] Add charting for pattern visualization
- [ ] Build pattern library feature
- [ ] Integration with backtest system

### Phase 5: Advanced Features (Future)
- [ ] Pattern similarity ML models
- [ ] Real-time alerting for new matches
- [ ] Social sentiment integration (Reddit, Twitter)
- [ ] Options flow data for capitulatory moves
- [ ] Walk-forward pattern validation

---

## Example Usage Scenarios

### Scenario 1: Find Current Capitulatory Moves

**User Input:**
```json
{
  "prompt": "Find stocks up more than 100% in the last 5 days with volume at least 3x average",
  "scanType": "current",
  "universe": "sp500",
  "dateRange": {
    "start": "2024-10-14",
    "end": "2024-10-23"
  }
}
```

**System Actions:**
1. Claude generates scanner script
2. Script queries daily_metrics for S&P 500 constituents
3. Finds 5-day windows meeting criteria
4. Returns matches sorted by pattern strength

**Result:**
```json
{
  "matches": [
    {
      "ticker": "EXAMPLE",
      "match_date": "2024-10-18",
      "metrics": {
        "price_change_pct": 145.2,
        "volume_vs_avg": 4.3,
        "pattern_strength": 92
      }
    }
  ]
}
```

### Scenario 2: Find Historical Capitulatory Moves (Study Mode)

**User Input:**
```json
{
  "prompt": "Find all capitulatory moves (100%+ gain in 3-7 days) from January 2020 to present. Include meme stocks and small caps.",
  "scanType": "historical",
  "universe": "russell2000",
  "dateRange": {
    "start": "2020-01-01",
    "end": "2024-10-23"
  }
}
```

**System Actions:**
1. Claude generates historical scanner
2. Scans 2000 tickers across 4+ years
3. Identifies all 3-7 day windows with 100%+ gains
4. Calculates pattern strength based on volume, consistency, etc.

**Result:**
```json
{
  "matches": [
    {
      "ticker": "GME",
      "start_date": "2021-01-12",
      "end_date": "2021-01-27",
      "metrics": {
        "price_change_pct": 2400,
        "volume_vs_avg": 15.7,
        "pattern_strength": 98
      }
    },
    {
      "ticker": "BYND",
      "start_date": "2024-10-10",
      "end_date": "2024-10-17",
      "metrics": {
        "price_change_pct": 1043,
        "volume_vs_avg": 6.2,
        "pattern_strength": 95
      }
    },
    {
      "ticker": "OPEN",
      "start_date": "2024-07-15",
      "end_date": "2024-07-22",
      "metrics": {
        "price_change_pct": 187,
        "volume_vs_avg": 4.8,
        "pattern_strength": 88
      }
    }
  ],
  "totalMatches": 47
}
```

**User Action:**
- Click on GME match to see detailed chart
- Add to "Short Squeeze Patterns" library
- Click "Find Similar" to see recent matches
- Click "Backtest" to test entry/exit strategy on all historical occurrences

### Scenario 3: Pattern-Based Backtest

After finding historical patterns, test a strategy:

**User Input:**
```json
{
  "scanId": "abc-123",
  "strategyPrompt": "Enter when stock is up 50% in 3 days with volume 2x average. Exit when volume drops below 1.5x average or price drops 20% from entry.",
  "top_n": 10
}
```

**System Actions:**
1. Load top 10 matches from scan
2. Generate backtest script for each occurrence
3. Run strategy on each historical pattern
4. Aggregate results

**Result:**
- 10 occurrences tested
- Win rate: 60%
- Average hold time: 3.2 days
- Average gain on winners: +42%
- Average loss on losers: -18%
- Learn: "Exit on volume drop" catches most of the move

---

## Integration with Existing System

### Shared Components

**Database:**
- Same `backtesting.db` SQLite database
- Add new tables for scanner data
- Reuse `ohlcv_data` table for intraday bars

**Claude Service:**
- Extend with `generateScannerScript()` method
- Similar to `generateScript()` but different prompt
- Return same structure (script, confidence, assumptions)

**Polygon Service:**
- Add `getDailyBarsForUniverse(tickers[], date)` method
- Reuse existing `getHistoricalData()` for intraday

**Script Execution:**
- Reuse `ScriptExecutionService`
- Same `ts-node` execution approach
- Different output format (array of matches vs trades)

### New Components

**Scanner Service:**
- New `src/services/scanner.service.ts`
- Handles universe management
- Executes scanner scripts
- Caches results

**Universe Service:**
- New `src/services/universe.service.ts`
- CRUD for universes
- Constituent management
- Daily refresh jobs

**Pattern Library Service:**
- New `src/services/pattern-library.service.ts`
- Save interesting patterns
- Find similar patterns
- Pattern tagging and notes

---

## Security & Performance Considerations

### Performance

**Query Optimization:**
- Index on `daily_metrics.date`, `daily_metrics.ticker`, `daily_metrics.price_change_pct`
- Use prepared statements for repeated queries
- Cache universe lists in memory

**Parallel Execution:**
- Scan multiple tickers in parallel (worker threads)
- Batch database queries
- Stream results as they're found

**Data Freshness:**
- Daily metrics updated via cron job (after market close)
- Cache scanner results for 24 hours
- Invalidate cache when new data arrives

### Security

**Input Validation:**
- Sanitize SQL in Claude-generated scripts
- Limit universe size (max 2000 tickers)
- Timeout for long-running scans (5 minutes)
- Rate limit scan API (10 requests/hour)

**Resource Limits:**
- Max date range for historical scans (5 years)
- Max results returned (1000)
- Max concurrent scans (3 per user)

---

## Advanced Features (Future)

### 1. Pattern Similarity Detection

Use ML to find similar patterns:
```typescript
interface SimilarityRequest {
  referencePattern: {
    ticker: string;
    startDate: string;
    endDate: string;
  };
  universe: string;
  similarityThreshold: number; // 0-100
}

// Find patterns similar to GME Jan 2021
// Returns: Other short squeezes with similar characteristics
```

**Algorithm:**
- Extract features (price momentum, volume profile, volatility)
- Compute similarity score (cosine similarity, DTW)
- Rank matches by similarity

### 2. Real-Time Alerting

Monitor for new pattern matches:
```typescript
interface Alert {
  scanId: string;
  name: string;
  criteria: string; // Saved scan prompt
  notificationMethod: 'email' | 'sms' | 'webhook';
  frequency: 'realtime' | 'daily' | 'weekly';
}

// Run saved scans on daily data refresh
// Send alert if new matches found
```

### 3. Social Sentiment Integration

Enhance capitulatory move detection:
- Reddit mention volume (wallstreetbets)
- Twitter/X sentiment and activity
- StockTwits bullish/bearish ratio
- Correlation with price moves

### 4. Options Flow Integration

Add options data to pattern detection:
- Unusual options activity (UOA)
- Call/put ratio
- Implied volatility expansion
- Open interest changes
- Gamma squeeze indicators

---

## Conclusion

This scanner system provides a powerful framework for:
- **Discovering** stocks matching specific criteria using natural language
- **Studying** historical pattern occurrences to learn trading insights
- **Backtesting** strategies on real patterns from the past
- **Monitoring** for new opportunities matching known successful patterns

The modular design integrates seamlessly with the existing backtest infrastructure while adding new capabilities for systematic market analysis and pattern recognition.

**Key Benefits:**
- Natural language queries for complex screening logic
- Historical pattern library for education and strategy development
- Cost-effective data storage (daily metrics vs full intraday)
- Tight integration with backtest system for strategy validation
- Scalable architecture supporting large stock universes
