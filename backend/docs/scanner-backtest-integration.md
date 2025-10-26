# Natural Language Scanner with Visual Analysis & Backtesting Integration

## Overview

This document outlines a complete system for discovering, analyzing, and backtesting trading patterns using natural language queries, visual chart analysis, and Claude AI.

### End-to-End Workflow

```
1. Load Market Data
   ↓ Russell 2000 stocks → Database

2. Natural Language Scan
   ↓ "Find capitulatory moves in last 3 months"
   ↓ System finds 47 matches

3. Visual Assessment
   ↓ View results with chart thumbnails
   ↓ Save 40 interesting patterns to "My Samples"

4. Claude Analysis
   ↓ Select 3 representative examples
   ↓ Generate combined charts (daily context + intraday detail)
   ↓ Send to Claude Vision API (6 images total: 3 samples × 2 views)
   ↓ Claude suggests 5 trading strategies

5. Batch Backtesting
   ↓ One-click: Test all 5 strategies on all 40 samples
   ↓ View results: Strategy #3 = 82% win rate

6. Refinement
   ↓ Ask Claude to refine based on failures
   ↓ Re-test improved strategy
```

---

## Phase 1: Data Infrastructure

### 1.1 Stock Universe Management

**Starting Point: Russell 2000**
- ~2,000 small-cap stocks
- Good for finding volatile, explosive patterns
- Manageable data volume for initial implementation

**Future Expansion: All US Stocks**
- ~8,000 stocks (NYSE, NASDAQ, AMEX)
- Requires more storage but same architecture

### 1.2 Polygon.io Data Pipeline

**Daily Data Refresh Job**

```typescript
// src/services/universe-data.service.ts

export class UniverseDataService {
  /**
   * Load Russell 2000 constituent list
   */
  async loadRussell2000Universe(): Promise<string[]> {
    // Option 1: Load from static file (updated quarterly)
    const tickers = await fs.readFile('./data/russell2000-constituents.json', 'utf8');
    return JSON.parse(tickers);

    // Option 2: Fetch from third-party API
    // const response = await fetch('https://api.example.com/russell2000');
    // return response.json();
  }

  /**
   * Backfill historical data for entire universe
   * NOTE: Only daily data is backfilled. Intraday (5-min) is fetched on-demand for chart generation.
   */
  async backfillUniverseData(
    tickers: string[],
    startDate: string,
    endDate: string,
    timeframes: string[] = ['1Day']
  ): Promise<void> {

    console.log(`📊 Backfilling data for ${tickers.length} tickers...`);
    console.log(`   Date range: ${startDate} to ${endDate}`);
    console.log(`   Timeframes: ${timeframes.join(', ')}`);

    for (const timeframe of timeframes) {
      await this.backfillTimeframe(tickers, startDate, endDate, timeframe);
    }
  }

  /**
   * Fetch intraday data on-demand (for chart generation)
   */
  async fetchIntradayDataOnDemand(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<Bar[]> {
    console.log(`📈 Fetching 5-min data for ${ticker} (${startDate} to ${endDate})...`);

    // Check if already in database (cached from previous chart generation)
    const cached = await db.query(`
      SELECT * FROM ohlcv_data
      WHERE ticker = ? AND timeframe = '5min'
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `, [ticker, new Date(startDate).getTime(), new Date(endDate).getTime()]);

    if (cached && cached.length > 0) {
      console.log(`   ✓ Using cached data (${cached.length} bars)`);
      return cached;
    }

    // Fetch from Polygon
    const bars = await polygonService.getHistoricalData({
      ticker,
      timeframe: '5Min',
      from: startDate,
      to: endDate
    });

    // Save to database for future use
    if (bars && bars.length > 0) {
      await this.saveBars(ticker, '5min', bars);
      console.log(`   ✓ Fetched and cached ${bars.length} bars`);
    }

    return bars;
  }

  /**
   * Backfill specific timeframe
   */
  private async backfillTimeframe(
    tickers: string[],
    startDate: string,
    endDate: string,
    timeframe: string
  ): Promise<void> {

    const dates = this.generateDateRange(startDate, endDate);
    let processedTickers = 0;

    for (const ticker of tickers) {
      try {
        for (const date of dates) {
          // Check if data already exists
          const exists = await this.dataExists(ticker, date, timeframe);
          if (exists) continue;

          // Fetch from Polygon
          const bars = await polygonService.getHistoricalData({
            ticker,
            timeframe,
            from: date,
            to: date
          });

          // Save to database
          if (bars && bars.length > 0) {
            await this.saveBars(ticker, timeframe, bars);
          }

          // Rate limiting
          await this.sleep(200); // 5 requests/second
        }

        processedTickers++;
        if (processedTickers % 100 === 0) {
          console.log(`   Progress: ${processedTickers}/${tickers.length} tickers`);
        }

      } catch (error: any) {
        console.error(`   Error fetching ${ticker}: ${error.message}`);
        // Continue with next ticker
      }
    }

    console.log(`✅ Backfill complete: ${timeframe}`);
  }

  /**
   * Daily refresh job (scheduled via cron)
   */
  async dailyRefresh(): Promise<void> {
    const yesterday = this.getYesterday();
    const universe = await this.loadRussell2000Universe();

    console.log(`🔄 Daily refresh for ${yesterday}...`);

    // Fetch daily bars for all tickers (bulk request)
    const dailyBars = await this.fetchDailyBarsInBulk(universe, yesterday);

    // Calculate and store derived metrics
    await this.calculateDailyMetrics(dailyBars);

    console.log(`✅ Daily refresh complete`);
  }

  /**
   * Fetch daily bars for many tickers at once
   */
  private async fetchDailyBarsInBulk(
    tickers: string[],
    date: string
  ): Promise<DailyBar[]> {

    // Polygon allows grouped daily endpoint
    // GET /v2/aggs/grouped/locale/us/market/stocks/2024-10-23
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}`;
    const response = await fetch(`${url}?adjusted=true&apiKey=${process.env.POLYGON_API_KEY}`);
    const data = await response.json();

    // Filter to only tickers in our universe
    const tickerSet = new Set(tickers);
    const filteredBars = data.results.filter((bar: any) => tickerSet.has(bar.T));

    return filteredBars.map((bar: any) => ({
      ticker: bar.T,
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  }

  /**
   * Calculate derived metrics for scanning
   */
  private async calculateDailyMetrics(bars: DailyBar[]): Promise<void> {
    for (const bar of bars) {
      // Get 30-day average volume
      const avgVolume = await this.get30DayAvgVolume(bar.ticker);

      // Calculate metrics
      const metrics = {
        ticker: bar.ticker,
        date: new Date(bar.timestamp).toISOString().split('T')[0],
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        price_change_pct: ((bar.close - bar.open) / bar.open) * 100,
        volume_vs_avg: bar.volume / avgVolume,
        range_pct: ((bar.high - bar.low) / bar.open) * 100
      };

      // Save to daily_metrics table
      await db.run(`
        INSERT OR REPLACE INTO daily_metrics
        (ticker, date, open, high, low, close, volume, price_change_pct, volume_vs_avg, range_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        metrics.ticker,
        metrics.date,
        metrics.open,
        metrics.high,
        metrics.low,
        metrics.close,
        metrics.volume,
        metrics.price_change_pct,
        metrics.volume_vs_avg,
        metrics.range_pct
      ]);
    }
  }
}
```

**Cron Job Setup**

```typescript
// src/jobs/daily-refresh.job.ts
import cron from 'node-cron';
import { UniverseDataService } from '../services/universe-data.service';

const universeDataService = new UniverseDataService();

// Run every day at 5:30 PM ET (after market close)
cron.schedule('30 17 * * 1-5', async () => {
  console.log('🕐 Starting daily data refresh...');
  try {
    await universeDataService.dailyRefresh();
  } catch (error: any) {
    console.error('❌ Daily refresh failed:', error);
  }
}, {
  timezone: "America/New_York"
});
```

### 1.3 Database Schema Extensions

```sql
-- Stock universes (Russell 2000, S&P 500, custom lists)
CREATE TABLE universes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  auto_update BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Universe membership
CREATE TABLE universe_tickers (
  universe_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (universe_id, ticker),
  FOREIGN KEY (universe_id) REFERENCES universes(id)
);

-- Stock metadata
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
  date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  price_change_pct REAL,
  volume_vs_avg REAL,
  range_pct REAL,
  PRIMARY KEY (ticker, date)
);

CREATE INDEX idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX idx_daily_metrics_ticker ON daily_metrics(ticker);
CREATE INDEX idx_daily_metrics_change ON daily_metrics(price_change_pct);
CREATE INDEX idx_daily_metrics_volume ON daily_metrics(volume_vs_avg);
```

**Initial Data Load Script**

```bash
# Load Russell 2000 constituents
npm run data:load-universe russell2000

# Backfill 5 years of daily data
npm run data:backfill --universe russell2000 --start 2019-10-01 --end 2024-10-23 --timeframe 1Day

# No intraday backfill needed - fetched on-demand when generating charts
```

---

## Phase 2: Natural Language Scanner

### 2.1 Scanner Architecture

**User Input:**
```
"Find capitulatory moves in the last 3 months: stocks that went up >100% in 3-7 days with volume >3x average"
```

**System Process:**
1. Claude interprets query and generates scanner script
2. Script queries `daily_metrics` table across Russell 2000
3. Returns matches with date ranges
4. Each match includes: ticker, start_date, end_date, max_gain, volume_stats

### 2.2 Scanner Service

```typescript
// src/services/scanner.service.ts

export class ScannerService {
  /**
   * Execute natural language scan
   */
  async executeScan(request: ScanRequest): Promise<ScanResults> {
    // 1. Generate scanner script with Claude
    const scannerScript = await claudeService.generateScannerScript({
      prompt: request.prompt,
      universe: request.universe || 'russell2000',
      dateRange: request.dateRange,
    });

    // 2. Execute scanner script
    const matches = await this.executeScanner(scannerScript);

    // 3. Enrich matches with metadata
    const enrichedMatches = await this.enrichMatches(matches);

    // 4. Save scan to history
    const scanId = await this.saveScanHistory(request, enrichedMatches);

    return {
      scanId,
      matches: enrichedMatches,
      totalMatches: enrichedMatches.length,
      executionTime: Date.now() - startTime
    };
  }

  /**
   * Enrich scan results with chart data preview
   */
  private async enrichMatches(matches: ScanMatch[]): Promise<EnrichedScanMatch[]> {
    return Promise.all(matches.map(async (match) => {
      // Generate thumbnail chart
      const thumbnail = await chartGenerator.generateThumbnail(
        match.ticker,
        match.start_date,
        match.end_date
      );

      // Get stock metadata
      const metadata = await db.get(`
        SELECT name, market_cap, sector
        FROM stock_metadata
        WHERE ticker = ?
      `, [match.ticker]);

      return {
        ...match,
        thumbnail_url: `/api/charts/thumbnails/${thumbnail.id}.png`,
        stock_name: metadata?.name,
        market_cap: metadata?.market_cap,
        sector: metadata?.sector
      };
    }));
  }
}
```

### 2.3 Claude Scanner Prompt

```typescript
const SCANNER_GENERATION_PROMPT = `
You are generating a stock scanner script based on user's natural language criteria.

User Query: "${userPrompt}"

Target Universe: ${universe} (${universeSize} stocks)
Date Range: ${startDate} to ${endDate}

Generate a TypeScript scanner that:
1. Queries the daily_metrics table
2. Finds stocks matching the user's criteria
3. Returns matches with: ticker, start_date, end_date, metrics

Available data in daily_metrics table:
- ticker, date, open, high, low, close, volume
- price_change_pct (daily % change)
- volume_vs_avg (volume / 30-day average)
- range_pct ((high-low)/open as %)

Example scanner structure:

\`\`\`typescript
import Database from 'better-sqlite3';

interface ScanMatch {
  ticker: string;
  start_date: string;
  end_date: string;
  max_gain_pct: number;
  avg_volume_expansion: number;
  pattern_strength: number;
}

async function runScan(): Promise<ScanMatch[]> {
  const db = new Database('./backtesting.db');
  const results: ScanMatch[] = [];

  // Get universe tickers
  const tickers = db.prepare(\`
    SELECT DISTINCT ticker FROM universe_tickers
    WHERE universe_id = 'russell2000'
  \`).all();

  for (const {ticker} of tickers) {
    // Query daily metrics for this ticker
    const rows = db.prepare(\`
      SELECT * FROM daily_metrics
      WHERE ticker = ? AND date >= ? AND date <= ?
      ORDER BY date ASC
    \`).all(ticker, '${startDate}', '${endDate}');

    // Scan for matching patterns
    // (implement user's criteria here)

    // If match found, add to results
    if (matchesFound) {
      results.push({
        ticker,
        start_date: matchStartDate,
        end_date: matchEndDate,
        max_gain_pct: calculatedGain,
        avg_volume_expansion: calculatedVolume,
        pattern_strength: score
      });
    }
  }

  return results.sort((a, b) => b.pattern_strength - a.pattern_strength);
}

runScan().then(results => {
  console.log(JSON.stringify(results, null, 2));
});
\`\`\`

Generate the scanner script now:
`;
```

---

## Phase 3: Scan Results & Sample Management

### 3.1 Scan Results UI

```tsx
// frontend/src/components/ScanResults.tsx

interface ScanResultsProps {
  scanId: string;
}

export function ScanResults({ scanId }: ScanResultsProps) {
  const { data: scan } = useScan(scanId);

  return (
    <div className="scan-results">
      <ScanHeader scan={scan} />

      <div className="results-grid">
        {scan.matches.map(match => (
          <ScanResultCard
            key={match.id}
            match={match}
            onSaveToBacktestSet={(backtestSetId) => saveToBacktestSet(match, backtestSetId)}
          />
        ))}
      </div>
    </div>
  );
}

function ScanResultCard({ match, onSaveToBacktestSet }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="result-card">
      {/* Thumbnail Chart */}
      <div className="thumbnail" onClick={() => setExpanded(!expanded)}>
        <img src={match.thumbnail_url} alt={`${match.ticker} chart`} />
        <div className="overlay">
          <span className="ticker">{match.ticker}</span>
          <span className="gain">+{match.max_gain_pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="metadata">
        <div className="stock-name">{match.stock_name}</div>
        <div className="dates">{match.start_date} to {match.end_date}</div>
        <div className="metrics">
          <span>Vol: {match.avg_volume_expansion.toFixed(1)}x</span>
          <span>MCap: ${(match.market_cap / 1e9).toFixed(1)}B</span>
        </div>
      </div>

      {/* Actions */}
      <div className="actions">
        <BacktestSetSelector
          onSelect={(setId) => onSaveToBacktestSet(setId)}
          placeholder="Save to..."
        />
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'View Chart'}
        </button>
      </div>

      {/* Expanded View */}
      {expanded && (
        <ExpandedChart
          ticker={match.ticker}
          startDate={match.start_date}
          endDate={match.end_date}
        />
      )}
    </div>
  );
}
```

### 3.2 Backtest Set Management

```typescript
// API endpoints for sample sets

POST /api/backtest-sets
{
  "name": "Capitulatory Moves - Q3 2024",
  "description": "40 explosive moves from July-October 2024"
}

POST /api/backtest-sets/:setId/samples
{
  "ticker": "BYND",
  "start_date": "2024-10-10",
  "end_date": "2024-10-20",
  "source_scan_id": "scan-123",
  "notes": "10x move in 8 days, volume peaked on day 5"
}

GET /api/backtest-sets/:setId/samples
Response: [
  {
    "id": "sample-1",
    "ticker": "BYND",
    "start_date": "2024-10-10",
    "end_date": "2024-10-20",
    "thumbnail_url": "/api/charts/thumbnails/bynd-oct2024.png"
  },
  // ... more samples
]
```

### 3.3 Database Schema

```sql
-- Sample sets (collections of patterns)
CREATE TABLE backtest_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual samples
CREATE TABLE samples (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  backtest_set_id TEXT,
  source_scan_id TEXT, -- Optional: which scan found this
  notes TEXT,
  metadata JSON, -- Store max_gain, peak_date, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (backtest_set_id) REFERENCES backtest_sets(id),
  FOREIGN KEY (source_scan_id) REFERENCES scan_history(id)
);

-- Scan history
CREATE TABLE scan_history (
  id TEXT PRIMARY KEY,
  user_prompt TEXT NOT NULL,
  universe_id TEXT,
  date_range_start TEXT,
  date_range_end TEXT,
  matches_found INTEGER,
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Phase 4: Chart Generation & Visual Assessment

### 4.1 Multi-Timeframe Chart Generator

```typescript
// src/services/chart-generator.service.ts

export class ChartGeneratorService {
  /**
   * Generate thumbnail for quick visual assessment
   */
  async generateThumbnail(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<{ id: string; buffer: Buffer }> {

    const bars = await this.loadBars(ticker, startDate, endDate, '1Day');

    const config = {
      type: 'line',
      data: {
        labels: bars.map(b => b.date),
        datasets: [{
          label: ticker,
          data: bars.map(b => b.close),
          borderColor: 'rgb(75, 192, 192)',
          fill: false
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: { display: false },
          title: { display: false }
        }
      }
    };

    const canvas = new ChartJSNodeCanvas({ width: 300, height: 150 });
    const buffer = await canvas.renderToBuffer(config);
    const id = `thumb-${ticker}-${startDate}-${Date.now()}`;

    // Save to file system
    await fs.writeFile(`./public/charts/thumbnails/${id}.png`, buffer);

    return { id, buffer };
  }

  /**
   * Generate combined dual-view chart for Claude analysis
   * Combines daily context + intraday detail into one image to save Claude API costs
   */
  async generateCombinedChart(
    ticker: string,
    startDate: string,
    endDate: string
  ): Promise<{
    dailyContext: Buffer;   // Daily view showing pattern in broader timeframe
    intradayDetail: Buffer; // 5-min bars with volume for detailed analysis
  }> {

    // Fetch intraday data on-demand (not pre-loaded)
    const intradayBars = await universeDataService.fetchIntradayDataOnDemand(
      ticker,
      startDate,
      endDate
    );

    // Load daily bars for context (already in database from backfill)
    const contextStart = this.subtractDays(startDate, 30); // 30 days before
    const dailyBars = await this.loadBars(ticker, contextStart, endDate, '1Day');

    // Generate Chart 1: Daily context view
    const dailyChart = await this.generateDailyChart(dailyBars, ticker, {
      patternStart: startDate,
      patternEnd: endDate,
      title: `${ticker} - Daily Context (Pattern Highlighted)`
    });

    // Generate Chart 2: Intraday detail view
    const intradayChart = await this.generateIntradayChart(intradayBars, ticker, {
      title: `${ticker} - Intraday Detail (5-min bars)`
    });

    return {
      dailyContext: dailyChart,
      intradayDetail: intradayChart
    };
  }

  /**
   * Generate intraday chart with volume
   */
  private async generateIntradayChart(
    bars: Bar[],
    ticker: string
  ): Promise<Buffer> {

    const avgVolume = bars.reduce((sum, b) => sum + b.volume, 0) / bars.length;

    const config = {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: `${ticker} Price`,
            data: bars.map(b => ({
              x: new Date(b.timestamp),
              o: b.open,
              h: b.high,
              l: b.low,
              c: b.close
            })),
            yAxisID: 'price'
          },
          {
            type: 'bar',
            label: 'Volume',
            data: bars.map(b => ({
              x: new Date(b.timestamp),
              y: b.volume,
              backgroundColor: b.close >= b.open ?
                'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            })),
            yAxisID: 'volume'
          }
        ]
      },
      options: {
        responsive: false,
        scales: {
          price: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Price ($)', color: 'white' }
          },
          volume: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Volume', color: 'white' },
            max: avgVolume * 6
          }
        },
        plugins: {
          title: {
            display: true,
            text: `${ticker} - Intraday (5-min bars)`,
            color: 'white'
          },
          annotation: {
            annotations: {
              avgVolLine: {
                type: 'line',
                yMin: avgVolume,
                yMax: avgVolume,
                yScaleID: 'volume',
                borderColor: 'rgba(255, 206, 86, 0.8)',
                borderWidth: 2,
                borderDash: [5, 5],
                label: {
                  content: 'Avg Volume',
                  enabled: true,
                  color: 'white'
                }
              }
            }
          }
        }
      }
    };

    const canvas = new ChartJSNodeCanvas({
      width: 1400,
      height: 700,
      backgroundColour: '#1a1a2e'
    });

    return await canvas.renderToBuffer(config);
  }

  /**
   * Generate daily chart with pattern highlighted
   */
  private async generateDailyChart(
    bars: Bar[],
    ticker: string,
    annotations: { patternStart: string; patternEnd: string }
  ): Promise<Buffer> {
    // Similar to intraday but with daily bars
    // Highlight the pattern period with vertical lines
    // Show broader context (30 days before, 10 days after)

    // ... implementation similar to above
  }
```

### 4.2 Chart Storage

```typescript
// Store generated charts
const chartPath = `./public/charts/${ticker}-${type}-${timestamp}.png`;
await fs.writeFile(chartPath, chartBuffer);

// Return URL
return {
  url: `/api/charts/${ticker}-${type}-${timestamp}.png`,
  buffer: chartBuffer
};
```

---

## Phase 5: Claude Chart Analysis

### 5.1 User Workflow

```tsx
// frontend/src/components/BacktestSetAnalysis.tsx

export function BacktestSetAnalysis({ backtestSetId }: Props) {
  const { data: samples } = useBacktestSet(backtestSetId);
  const [selectedSamples, setSelectedSamples] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState(null);

  const handleAnalyze = async () => {
    // User selects up to 3 samples
    if (selectedSamples.length === 0 || selectedSamples.length > 3) {
      toast.error('Select 1-3 samples for analysis');
      return;
    }

    // Generate multi-timeframe charts
    const charts = await generateChartsForAnalysis(selectedSamples);

    // Send to Claude
    const result = await analyzeChartsWithClaude({
      backtestSetId,
      selectedSamples,
      charts
    });

    setAnalysisResult(result);
  };

  return (
    <div className="backtest-set-analysis">
      <h2>Select Samples for Claude Analysis</h2>
      <p>Choose up to 3 representative examples</p>

      <div className="sample-selector">
        {samples.map(sample => (
          <SampleCard
            key={sample.id}
            sample={sample}
            selected={selectedSamples.includes(sample.id)}
            onToggle={() => toggleSample(sample.id)}
          />
        ))}
      </div>

      <button
        onClick={handleAnalyze}
        disabled={selectedSamples.length === 0 || selectedSamples.length > 3}
      >
        Analyze with Claude
      </button>

      {analysisResult && (
        <AnalysisResults result={analysisResult} />
      )}
    </div>
  );
}
```

### 5.2 Claude Analysis Service

```typescript
// src/services/claude-chart-analysis.service.ts

export class ClaudeChartAnalysisService {
  /**
   * Analyze charts and suggest strategies
   */
  async analyzeCharts(request: {
    backtestSetId: string;
    selectedSampleIds: string[];
  }): Promise<StrategyRecommendations> {

    // 1. Load selected samples
    const samples = await db.query(`
      SELECT * FROM samples
      WHERE id IN (${request.selectedSampleIds.map(() => '?').join(',')})
    `, request.selectedSampleIds);

    // 2. Generate multi-timeframe charts for each sample
    const chartSets = await Promise.all(
      samples.map(async sample => {
        const charts = await chartGenerator.generateMultiTimeframeChart(
          sample.ticker,
          sample.start_date,
          sample.end_date
        );

        return {
          sample,
          charts
        };
      })
    );

    // 3. Build prompt for Claude
    const prompt = this.buildAnalysisPrompt(samples);

    // 4. Call Claude Vision API
    const claudeResponse = await this.callClaudeVision(prompt, chartSets);

    // 5. Parse and store strategies
    const strategies = await this.parseAndStoreStrategies(
      claudeResponse,
      request.backtestSetId
    );

    return strategies;
  }

  /**
   * Build analysis prompt
   */
  private buildAnalysisPrompt(samples: Sample[]): string {
    return `
You are analyzing stock price charts to discover profitable trading strategies.

I'm showing you ${samples.length} examples of similar patterns. For each example, you'll see 2 charts:

1. **Daily Context Chart** - Shows broader price action (30 days before → pattern → present)
   - Vertical lines mark the pattern start and end
   - Shows the pattern in context of longer-term price movement
   - Daily candlesticks with volume bars

2. **Intraday Detail Chart (5-min bars)** - Shows detailed price and volume action during the pattern
   - Green/red candles = 5-minute price movement
   - Green/red bars at bottom = volume (green = up bar, red = down bar)
   - Yellow dashed line = average volume for the period
   - Fine-grained view of entry/exit opportunities

**Your Task:**

Analyze these charts and identify:

1. **LONG SIDE STRATEGIES**
   - Visual entry signals (specific candlestick patterns, volume conditions)
   - Visual exit signals (when to take profits)
   - Stop loss placement

2. **SHORT SIDE STRATEGIES**
   - Visual exhaustion signals (when the move is over)
   - Short entry conditions
   - Cover signals (avoid getting squeezed)

3. **KEY OBSERVATIONS**
   - What visual patterns predict continuation vs reversal?
   - Volume patterns that precede major moves
   - Candlestick patterns that matter (doji, engulfing, etc.)
   - Intraday vs overnight behavior

Focus on ACTIONABLE, VISUAL signals that can be coded into backtest scripts.

Return your analysis as JSON:
{
  "visual_insights": {
    "continuation_signals": [
      "Large green candles with volume >3x average = strong momentum",
      ...
    ],
    "exhaustion_signals": [
      "Doji after sustained rally = warning sign",
      ...
    ]
  },

  "strategies": {
    "long_strategies": [
      {
        "name": "...",
        "entry": {
          "visual_conditions": "...",
          "specific_signals": "..."
        },
        "exit": {
          "visual_conditions": "...",
          "stop_loss": "..."
        }
      }
    ],
    "short_strategies": [...]
  }
}
    `;
  }

  /**
   * Call Claude Vision API
   */
  private async callClaudeVision(
    prompt: string,
    chartSets: Array<{ sample: Sample; charts: MultiTimeframeCharts }>
  ): Promise<any> {

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Build content with all images
    const content: any[] = [
      {
        type: "text",
        text: prompt
      }
    ];

    // Add charts for each sample (2 charts per sample: daily context + intraday detail)
    for (const { sample, charts } of chartSets) {
      // Label
      content.push({
        type: "text",
        text: `\n\n## ${sample.ticker} (${sample.start_date} to ${sample.end_date})\n`
      });

      // Chart 1: Daily context
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: charts.dailyContext.toString('base64')
        }
      });

      // Chart 2: Intraday detail
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: charts.intradayDetail.toString('base64')
        }
      });
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: content
      }]
    });

    // Parse JSON response
    const analysisText = response.content[0].text;
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('Claude did not return valid JSON');
  }

  /**
   * Parse strategies and save to database
   */
  private async parseAndStoreStrategies(
    claudeResponse: any,
    backtestSetId: string
  ): Promise<StrategyRecommendations> {

    const analysisId = crypto.randomUUID();

    // Store analysis
    await db.run(`
      INSERT INTO claude_analyses
      (id, backtest_set_id, visual_insights, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [analysisId, backtestSetId, JSON.stringify(claudeResponse.visual_insights)]);

    // Store suggested strategies
    const allStrategies = [
      ...claudeResponse.strategies.long_strategies.map((s: any) => ({ ...s, side: 'long' })),
      ...claudeResponse.strategies.short_strategies.map((s: any) => ({ ...s, side: 'short' }))
    ];

    for (const strategy of allStrategies) {
      const strategyId = crypto.randomUUID();

      await db.run(`
        INSERT INTO suggested_strategies
        (id, analysis_id, name, side, entry_conditions, exit_conditions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        strategyId,
        analysisId,
        strategy.name,
        strategy.side,
        JSON.stringify(strategy.entry),
        JSON.stringify(strategy.exit)
      ]);
    }

    return {
      analysisId,
      insights: claudeResponse.visual_insights,
      strategies: allStrategies
    };
  }
}
```

### 5.3 Database Schema

```sql
-- Claude chart analyses
CREATE TABLE claude_analyses (
  id TEXT PRIMARY KEY,
  backtest_set_id TEXT NOT NULL,
  selected_samples JSON, -- Array of sample IDs
  visual_insights JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (backtest_set_id) REFERENCES backtest_sets(id)
);

-- Suggested strategies from Claude
CREATE TABLE suggested_strategies (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  name TEXT NOT NULL,
  side TEXT NOT NULL, -- 'long' or 'short'
  entry_conditions JSON,
  exit_conditions JSON,
  backtest_script_path TEXT, -- Generated script
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (analysis_id) REFERENCES claude_analyses(id)
);
```

---

## Phase 6: One-Click Backtesting

### 6.1 Strategy Script Generation

After Claude suggests strategies, automatically generate backtest scripts:

```typescript
export class StrategyBacktestService {
  /**
   * Generate backtest scripts for Claude-suggested strategies
   */
  async generateBacktestScripts(
    strategies: SuggestedStrategy[]
  ): Promise<void> {

    for (const strategy of strategies) {
      // Convert Claude's visual description to code
      const scriptPrompt = this.buildScriptGenerationPrompt(strategy);

      // Generate script with Claude
      const script = await claudeService.generateScript(scriptPrompt);

      // Save script
      const scriptPath = `./claude-generated-scripts/strategy-${strategy.id}.ts`;
      await fs.writeFile(scriptPath, script.code);

      // Update database
      await db.run(`
        UPDATE suggested_strategies
        SET backtest_script_path = ?
        WHERE id = ?
      `, [scriptPath, strategy.id]);
    }
  }

  /**
   * Build prompt to convert strategy to backtest script
   */
  private buildScriptGenerationPrompt(strategy: SuggestedStrategy): string {
    return `
Generate a backtest script for this trading strategy:

**Strategy Name:** ${strategy.name}
**Side:** ${strategy.side}

**Entry Conditions:**
${JSON.stringify(strategy.entry_conditions, null, 2)}

**Exit Conditions:**
${JSON.stringify(strategy.exit_conditions, null, 2)}

The script should:
1. Accept ticker and date range as parameters
2. Load 5-minute OHLC data
3. Implement the entry logic based on the visual conditions described
4. Implement the exit logic
5. Track trades and calculate P&L
6. Return results as JSON

Important: Translate visual conditions like "doji candle" or "volume >3x" into actual code checks.
    `;
  }

  /**
   * One-click batch backtest: Test all strategies on all samples
   */
  async batchBacktestStrategies(request: {
    analysisId: string;
    backtestSetId: string;
  }): Promise<BatchBacktestResults> {

    // 1. Get all strategies from this analysis
    const strategies = await db.query(`
      SELECT * FROM suggested_strategies
      WHERE analysis_id = ?
    `, [request.analysisId]);

    // 2. Get all samples from the sample set
    const samples = await db.query(`
      SELECT * FROM samples
      WHERE backtest_set_id = ?
    `, [request.backtestSetId]);

    // 3. Ensure data exists for all samples
    for (const sample of samples) {
      await ensureDataExists(
        sample.ticker,
        '5min',
        [sample.start_date, sample.end_date]
      );
    }

    // 4. Run each strategy on each sample
    const results = [];

    for (const strategy of strategies) {
      const strategyResults = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        wins: 0,
        losses: 0,
        totalPnL: 0,
        trades: []
      };

      for (const sample of samples) {
        // Execute backtest
        const tradeResult = await scriptExecutor.executeScript(
          strategy.backtest_script_path,
          {
            ticker: sample.ticker,
            startDate: sample.start_date,
            endDate: sample.end_date
          }
        );

        if (tradeResult.success && tradeResult.data) {
          strategyResults.trades.push({
            sampleId: sample.id,
            ticker: sample.ticker,
            pnl: tradeResult.data.metrics.total_pnl,
            outcome: tradeResult.data.metrics.total_pnl > 0 ? 'win' : 'loss'
          });

          if (tradeResult.data.metrics.total_pnl > 0) {
            strategyResults.wins++;
          } else {
            strategyResults.losses++;
          }

          strategyResults.totalPnL += tradeResult.data.metrics.total_pnl;
        }
      }

      // Calculate aggregate metrics
      strategyResults.winRate =
        (strategyResults.wins / (strategyResults.wins + strategyResults.losses)) * 100;
      strategyResults.avgPnL = strategyResults.totalPnL / strategyResults.trades.length;

      results.push(strategyResults);
    }

    // 5. Save batch results
    const batchId = await this.saveBatchResults(request, results);

    return {
      batchId,
      results,
      bestStrategy: this.findBestStrategy(results)
    };
  }
}
```

### 6.2 UI: One-Click Backtest

```tsx
// frontend/src/components/StrategyBacktest.tsx

export function StrategyBacktest({ analysisId, backtestSetId }: Props) {
  const { data: strategies } = useStrategies(analysisId);
  const [backtesting, setBacktesting] = useState(false);
  const [results, setResults] = useState(null);

  const handleBacktest = async () => {
    setBacktesting(true);

    try {
      const response = await api.post('/api/backtests/batch-strategies', {
        analysisId,
        backtestSetId
      });

      setResults(response.data);
    } catch (error) {
      toast.error('Backtest failed');
    } finally {
      setBacktesting(false);
    }
  };

  return (
    <div className="strategy-backtest">
      <h3>Claude's Suggested Strategies</h3>

      <div className="strategies">
        {strategies.map(strategy => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </div>

      <button
        onClick={handleBacktest}
        disabled={backtesting}
        className="backtest-button"
      >
        {backtesting ? (
          <>
            <Spinner />
            Testing {strategies.length} strategies...
          </>
        ) : (
          `Backtest All Strategies`
        )}
      </button>

      {results && (
        <BacktestResults results={results} />
      )}
    </div>
  );
}

function BacktestResults({ results }: { results: BatchBacktestResults }) {
  return (
    <div className="backtest-results">
      <h3>Results</h3>

      <div className="results-table">
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Win Rate</th>
              <th>Total Trades</th>
              <th>Avg P&L</th>
              <th>Total P&L</th>
            </tr>
          </thead>
          <tbody>
            {results.results.map(r => (
              <tr key={r.strategyId} className={r.strategyId === results.bestStrategy.id ? 'best' : ''}>
                <td>{r.strategyName}</td>
                <td>{r.winRate.toFixed(1)}%</td>
                <td>{r.wins + r.losses}</td>
                <td>${r.avgPnL.toFixed(2)}</td>
                <td className={r.totalPnL > 0 ? 'positive' : 'negative'}>
                  ${r.totalPnL.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="best-strategy">
        <h4>🏆 Best Strategy: {results.bestStrategy.name}</h4>
        <p>Win Rate: {results.bestStrategy.winRate.toFixed(1)}%</p>
        <button>View Detailed Results</button>
      </div>
    </div>
  );
}
```

---

## Complete User Workflow Example

### Scenario: Finding and Trading Capitulatory Moves

**Step 1: Scan for Patterns**
```
User: "Find stocks in Russell 2000 that went up >100% in 3-7 days during Q3 2024"
System: Generates scanner, finds 47 matches
UI: Shows grid of chart thumbnails with metrics
```

**Step 2: Curate Backtest Set**
```
User: Clicks "Save to Backtest Set" on 40 interesting matches
User: Creates new set: "Capitulatory Moves - Q3 2024"
System: Saves 40 samples with thumbnails
```

**Step 3: Claude Analysis**
```
User: Opens sample set, selects 3 representative examples:
  - BYND (strongest move, clean pattern)
  - XYZ (moderate move, messier)
  - ABC (failed move, good counter-example)

User: Clicks "Analyze with Claude"

System:
  - Generates 9 charts (3 samples × 3 timeframes each)
  - Sends to Claude Vision API

Claude: Returns analysis with 5 suggested strategies:
  1. "Volume Confirmation Entry" (long)
  2. "Exhaustion Doji Short" (short)
  3. "Pullback Entry" (long)
  4. "Gap Fade" (short)
  5. "Breakout Momentum" (long)
```

**Step 4: One-Click Backtest**
```
User: Clicks "Backtest All Strategies"

System:
  - Generates backtest script for each strategy
  - Tests each on all 40 samples (5 × 40 = 200 backtests)
  - Shows results table:

    Strategy                  | Win Rate | Total P&L
    --------------------------|----------|----------
    Volume Confirmation Entry | 82%      | $8,245
    Pullback Entry           | 75%      | $6,120
    Breakout Momentum        | 68%      | $4,890
    Exhaustion Doji Short    | 71%      | $3,450
    Gap Fade                 | 45%      | -$1,200

Best Strategy: Volume Confirmation Entry
```

**Step 5: Refinement**
```
User: "Why did Volume Confirmation Entry have 18% losses?"

Claude: Analyzes the 7 losing trades, finds:
  "All losses entered after stock was already up >150%"

Suggested refinement:
  "Add filter: Don't enter if already up >120% from pattern start"

User: Clicks "Test Refined Strategy"

System: Re-tests with new filter
Result: 91% win rate (36/40 trades)
```

**Step 6: Deploy**
```
User: Saves final strategy
System: Strategy now available for:
  - Real-time scanning (finds new opportunities)
  - Automated alerts
  - Paper trading
```

---

## API Endpoints Summary

```typescript
// Universe Management
POST   /api/universes/russell2000/load          // Load constituent list
POST   /api/universes/:id/backfill              // Backfill historical data
POST   /api/universes/:id/refresh               // Daily refresh

// Scanning
POST   /api/scans                                // Execute natural language scan
GET    /api/scans/:id                            // Get scan results
GET    /api/scans/:id/matches                    // Get matches with thumbnails

// Backtest Sets
POST   /api/backtest-sets                          // Create sample set
POST   /api/backtest-sets/:id/samples              // Add sample to set
GET    /api/backtest-sets/:id/samples              // Get all samples
DELETE /api/backtest-sets/:setId/samples/:sampleId // Remove sample

// Chart Generation
POST   /api/charts/thumbnail                     // Generate thumbnail
POST   /api/charts/multi-timeframe               // Generate 3-view chart
GET    /api/charts/:id                           // Retrieve chart image

// Claude Analysis
POST   /api/analysis/charts                      // Analyze charts, get strategies
GET    /api/analysis/:id                         // Get analysis results
GET    /api/analysis/:id/strategies              // Get suggested strategies

// Backtesting
POST   /api/backtests/batch-strategies           // Backtest all strategies
GET    /api/backtests/batch/:id                  // Get batch results
POST   /api/backtests/refine                     // Refine strategy based on failures
```

---

## Implementation Roadmap

### Week 1-2: Data Infrastructure
- [ ] Implement universe management service
- [ ] Build Polygon data pipeline
- [ ] Create daily refresh cron job
- [ ] Load Russell 2000 constituents
- [ ] Backfill 5 years of daily data
- [ ] Implement on-demand intraday data fetching

### Week 3-4: Scanner & Results
- [ ] Implement scanner service
- [ ] Build scan history tracking
- [ ] Create scan results UI with thumbnails
- [ ] Implement sample set management
- [ ] Build "Save to Backtest Set" workflow

### Week 5-6: Chart Generation
- [ ] Implement thumbnail generator
- [ ] Build combined dual-view chart generator (daily context + intraday detail)
- [ ] Add chart annotations (start/peak/end markers)
- [ ] Implement chart storage and retrieval
- [ ] Integrate on-demand intraday data fetching with chart generation

### Week 7-8: Claude Integration
- [ ] Build Claude Vision API integration
- [ ] Implement chart analysis service
- [ ] Create strategy parsing/storage
- [ ] Build analysis results UI
- [ ] Implement sample selection (3 examples)

### Week 9-10: Backtesting Integration
- [ ] Auto-generate backtest scripts from strategies
- [ ] Implement batch backtest execution
- [ ] Build results comparison UI
- [ ] Add strategy refinement workflow
- [ ] Create detailed results views

### Week 11-12: Polish & Testing
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Error handling
- [ ] Documentation
- [ ] User onboarding flow

---

## Cost Analysis

### Data Storage

**Daily Bars (Russell 2000, 5 years):**
- 2,000 tickers × 1,260 trading days × 100 bytes = ~252 MB

**Intraday Bars (On-Demand Only):**
- Fetched when generating charts for analysis
- Cached in database for reuse
- Growth depends on usage: ~10-50 MB/month

**Total Initial Storage:** ~250 MB

**Growth Rate:** ~2 MB/day (daily bars only) + occasional intraday caching

### Polygon.io API

**Backfill (one-time):**
- Daily data: 1 request (grouped endpoint) per day × 1,260 days = ~1,260 requests
- Intraday data: Fetched on-demand only when generating charts

**Daily Refresh:**
- 1 grouped request/day (all tickers at once)

**On-Demand Intraday Fetching:**
- Only when user generates charts for analysis
- Example: 3 samples for Claude = 3 tickers × ~10 days = ~30 requests
- Cached in database for reuse

**Cost:** Free tier supports this with room to spare

### Claude API

**Per Analysis Cycle:**
- 3 samples × 2 charts = 6 images
- ~6,000 tokens input (images)
- ~4,000 tokens output (strategies)
- Cost: ~$0.20 per analysis (was ~$0.35 with 3 charts per sample)

**Per Backtest Generation:**
- ~2,000 tokens per strategy
- 5 strategies = ~10,000 tokens
- Cost: ~$0.30

**Total per workflow:** ~$0.50 (43% savings from combined charts)

---

## Security & Performance

### Performance Optimizations

1. **Thumbnail caching** - Generate once, reuse
2. **Parallel backtesting** - Run multiple scripts concurrently
3. **Database indexing** - Fast scans across universe
4. **Chart generation pooling** - Reuse canvas instances

### Security Considerations

1. **Rate limiting** - Prevent API abuse
2. **Input validation** - Sanitize scan queries
3. **Script sandboxing** - Isolate backtest execution
4. **Authentication** - Secure API endpoints

---

## Future Enhancements

1. **Real-time scanning** - WebSocket updates as new patterns appear
2. **Automated alerts** - Email/SMS when new opportunities found
3. **Pattern similarity** - Find patterns similar to specific example
4. **Options data integration** - Include unusual options activity
5. **Social sentiment** - Reddit/Twitter mention tracking
6. **Portfolio backtesting** - Test entire portfolio of strategies
7. **Paper trading** - Test strategies with live data

---

## Conclusion

This integrated system provides a complete workflow for:

1. **Discovering** patterns across thousands of stocks using natural language
2. **Curating** the best examples into sample sets
3. **Analyzing** patterns visually with Claude AI
4. **Backtesting** suggested strategies with one click
5. **Refining** strategies iteratively based on results

The chart-based approach leverages Claude's vision capabilities to identify patterns that traditional metric-based analysis would miss, while keeping costs low (~$0.65 per complete analysis cycle).
