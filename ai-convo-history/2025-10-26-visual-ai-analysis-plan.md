# Visual AI Analysis for Backtest Prompt Generation
**Date:** 2025-10-26
**Phase:** 5 - Claude Chart Analysis Integration

## Overview
Implement Phase 5 from scanner-backtest-integration.md: Allow users to select up to 3 samples from a Backtest Set, generate daily + intraday charts, send to Claude Vision API for analysis, and receive profitable backtest strategy recommendations.

## Requirements Summary
- **User flow**: Select 1-3 samples → Generate charts → Analyze with Claude → Display strategy recommendations
- **Daily chart**: Signal end date → 30 days after (or latest available)
- **Intraday chart**: 5 days before signal end → 5 days after signal end (5-min bars with volume)
- **Claude output**: Entry/exit strategies + pattern characteristics + backtest parameters
- **UI location**: Enhance BacktestSets.tsx component

---

## Implementation Plan

### 1. Database Schema Updates

**Add new tables to schema.sql:**

```sql
-- Claude Analyses Table
CREATE TABLE IF NOT EXISTS claude_analyses (
    id TEXT PRIMARY KEY, -- UUID
    backtest_set_id TEXT NOT NULL,
    selected_sample_ids TEXT NOT NULL, -- JSON array of sample IDs
    analysis_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'GENERATING_CHARTS', 'ANALYZING', 'COMPLETED', 'FAILED'
    visual_insights TEXT, -- JSON: continuation_signals, exhaustion_signals, etc.
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (backtest_set_id) REFERENCES backtest_sets(id) ON DELETE CASCADE
);

-- Strategy Recommendations Table
CREATE TABLE IF NOT EXISTS strategy_recommendations (
    id TEXT PRIMARY KEY, -- UUID
    analysis_id TEXT NOT NULL,
    name TEXT NOT NULL,
    side TEXT NOT NULL, -- 'long' or 'short'
    entry_conditions TEXT NOT NULL, -- JSON: visual conditions + specific signals
    exit_conditions TEXT NOT NULL, -- JSON: exit rules + stop loss
    confidence_score REAL, -- 0-100, if Claude provides it
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES claude_analyses(id) ON DELETE CASCADE
);

-- Analysis Charts Table (cache generated charts)
CREATE TABLE IF NOT EXISTS analysis_charts (
    id TEXT PRIMARY KEY, -- UUID
    analysis_id TEXT NOT NULL,
    sample_id TEXT NOT NULL,
    chart_type TEXT NOT NULL, -- 'daily_context' or 'intraday_detail'
    ticker TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    chart_data TEXT NOT NULL, -- Base64-encoded PNG
    width INTEGER,
    height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES claude_analyses(id) ON DELETE CASCADE,
    FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_claude_analyses_set ON claude_analyses(backtest_set_id);
CREATE INDEX IF NOT EXISTS idx_strategy_recommendations_analysis ON strategy_recommendations(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_charts_analysis ON analysis_charts(analysis_id);
```

### 2. Backend - Polygon Intraday Data Service

**Create: `backend/src/services/polygon-intraday.service.ts`**

```typescript
// Fetch 5-minute bars from Polygon on-demand and cache in ohlcv_data table
class PolygonIntradayService {
  async fetch5MinBars(ticker: string, startDate: string, endDate: string): Promise<Bar[]>
  private async fetchFromPolygon(...)
  private async saveToDatabase(...)
  private async getCachedBars(...)
}
```

### 3. Backend - Analysis Chart Generator

**Extend: `backend/src/services/chart-generator.service.ts`**

Add two new methods:
- `generateDailyContextChart()` - Daily bars from end_date → 30 days after (or latest)
- `generateIntradayDetailChart()` - 5-min bars from 5 days before end_date → 5 days after
- Use larger canvas (1400x700) with volume bars, annotations, candlesticks

### 4. Backend - Claude Analysis Service

**Create: `backend/src/services/claude-analysis.service.ts`**

```typescript
class ClaudeAnalysisService {
  async analyzeCharts(request: {
    backtestSetId: string;
    sampleIds: string[];
  }): Promise<AnalysisResult>

  private buildAnalysisPrompt(): string
  private callClaudeVision(prompt: string, chartSets: ChartSet[]): Promise<any>
  private parseStrategies(claudeResponse: any): Strategy[]
}
```

**Claude Prompt Focus:**
- Entry/exit strategies (visual candlestick patterns, volume conditions)
- Pattern characteristics (what predicts success vs failure)
- Backtest parameters (numeric criteria like "volume >3x", "RSI <30")

### 5. Backend - API Routes

**Create: `backend/src/api/routes/claude-analysis.ts`**

```typescript
POST /api/analysis
// Request: { backtestSetId, sampleIds: [id1, id2, id3] }
// Response: { analysisId, status: 'PENDING' }
// Triggers async: chart generation → Claude analysis → store results

GET /api/analysis/:id
// Response: { analysis, strategies[], status, charts[] }

GET /api/analysis/:id/status
// Poll for completion: { status, progress }
```

### 6. Frontend - BacktestSets UI Enhancement

**Update: `frontend/src/components/BacktestSets.tsx`**

**Add to component:**
- Checkbox selection for each sample (max 3 enforced)
- "Analyze with Claude" button (disabled if 0 or >3 selected)
- Loading state with progress indicator
- Inline results display showing:
  - Visual insights summary
  - Strategy recommendations table
  - Expandable details for each strategy
  - Generated charts for review

**UI Layout:**
```
┌─ Backtest Sets ──────────────────────┐
│ Active Set: Capitulatory Moves       │
│                                       │
│ [x] BYND  2024-10-10 - 2024-10-20   │
│ [x] XYZ   2024-09-15 - 2024-09-22   │
│ [ ] ABC   2024-08-01 - 2024-08-08   │
│ ...                                  │
│                                       │
│ [Analyze with Claude (2 selected)]   │
│                                       │
│ ┌─ Analysis Results ───────────────┐ │
│ │ Visual Insights:                 │ │
│ │ • Continuation signals: ...      │ │
│ │ • Exhaustion signals: ...        │ │
│ │                                  │ │
│ │ Strategy Recommendations:        │ │
│ │ 1. Volume Confirmation Entry     │ │
│ │ 2. Exhaustion Doji Short         │ │
│ │ ...                              │ │
│ └──────────────────────────────────┘ │
└───────────────────────────────────────┘
```

### 7. Frontend - API Client

**Create: `frontend/src/services/claudeAnalysisApi.ts`**

```typescript
export const claudeAnalysisApi = {
  analyzeCharts: (backtestSetId: string, sampleIds: string[]) => {...},
  getAnalysis: (analysisId: string) => {...},
  pollStatus: (analysisId: string) => {...}
}
```

---

## Implementation Steps

### Step 1: Database & Schema (30 min)
- Update schema.sql with 3 new tables
- Run migration

### Step 2: Polygon Intraday Service (1 hour)
- Create polygon-intraday.service.ts
- Implement fetch + cache logic for 5-min bars
- Test with sample ticker

### Step 3: Chart Generation (2 hours)
- Extend chart-generator.service.ts
- Add daily context chart method (end → 30 days after)
- Add intraday detail chart method (5 days before/after end, with volume)
- Test chart quality/readability

### Step 4: Claude Analysis Service (2 hours)
- Create claude-analysis.service.ts
- Build comprehensive prompt for all 3 analysis goals
- Implement Claude Vision API call
- Parse JSON response and store strategies

### Step 5: API Routes (1 hour)
- Create claude-analysis.ts routes
- Wire up POST /api/analysis endpoint
- Implement async workflow: charts → Claude → store
- Add GET endpoints for polling and results

### Step 6: Frontend - BacktestSets Enhancement (2 hours)
- Add checkbox selection state
- Add "Analyze with Claude" button
- Implement loading/progress UI
- Display analysis results inline
- Show strategy recommendations table

### Step 7: Frontend - API Integration (1 hour)
- Create claudeAnalysisApi.ts
- Wire up API calls from BacktestSets component
- Implement polling for async analysis
- Handle error states

### Step 8: Testing & Polish (1 hour)
- End-to-end test with 3 samples
- Verify chart quality for Claude
- Test error handling (API failures, no data, etc.)
- Polish UI/UX

---

## Technical Notes

**Polygon API Usage:**
- 5-min bars: ~78 bars/day × 10 days × 3 samples = ~2,340 bars per analysis
- Cached in ohlcv_data table for reuse
- Rate limit: 5 req/sec on free tier (should be fine)

**Claude API Cost:**
- 3 samples × 2 charts = 6 images
- ~6,000 input tokens + ~4,000 output tokens
- ~$0.20 per analysis (Sonnet 4.5 pricing)

**Chart Specifications:**
- Daily context: 1400×700px, candlesticks, volume bars
- Intraday detail: 1400×700px, 5-min candles, volume with avg line
- Both: Dark theme, annotations for signal period

**Database Growth:**
- Intraday data: ~10KB per sample analysis (cached)
- Charts: ~50KB per chart × 6 = 300KB per analysis
- Acceptable growth for typical usage

---

## Follow-up Work (Not in this PR)

- Phase 6: Batch backtesting (test strategies on all samples)
- Strategy refinement workflow (analyze failures, improve)
- Export strategies as backtest scripts
- Real-time pattern scanning with trained strategies
