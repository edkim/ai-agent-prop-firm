/**
 * Claude Analysis Service
 * Orchestrates visual AI analysis of stock patterns using Claude Vision API
 */

import { getDatabase } from '../database/db';
import { chartGeneratorService } from './chart-generator.service';
import universeDataService from './universe-data.service';
import polygonIntradayService from './polygon-intraday.service';
import logger from './logger.service';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

interface Sample {
  id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  backtest_set_id: string;
}

interface AnalysisRequest {
  backtestSetId: string;
  sampleIds: string[]; // 1-3 samples
}

interface StrategyRecommendation {
  name: string;
  side: 'long' | 'short';
  entry_conditions: any; // JSON object
  exit_conditions: any; // JSON object
  confidence_score?: number;
}

interface AnalysisResult {
  analysisId: string;
  status: 'PENDING' | 'GENERATING_CHARTS' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  visual_insights?: any;
  strategies: StrategyRecommendation[];
  error?: string;
}

class ClaudeAnalysisService {
  /**
   * Analyze charts and suggest trading strategies
   * Main entry point for visual AI analysis
   */
  async analyzeCharts(request: AnalysisRequest): Promise<AnalysisResult> {
    logger.info(`🔍 Starting Claude analysis for backtest set ${request.backtestSetId}`);

    // Validate request
    if (request.sampleIds.length === 0 || request.sampleIds.length > 3) {
      throw new Error('Must select 1-3 samples for analysis');
    }

    // Create analysis record
    const analysisId = randomUUID();
    const db = getDatabase();

    db.prepare(`
      INSERT INTO claude_analyses (
        id, backtest_set_id, selected_sample_ids, analysis_status
      ) VALUES (?, ?, ?, 'PENDING')
    `).run(
      analysisId,
      request.backtestSetId,
      JSON.stringify(request.sampleIds)
    );

    // Run analysis asynchronously
    this.performAnalysis(analysisId, request).catch(error => {
      logger.error('Analysis failed:', error);
      this.updateAnalysisStatus(analysisId, 'FAILED', error.message);
    });

    return {
      analysisId,
      status: 'PENDING',
      strategies: []
    };
  }

  /**
   * Perform the analysis workflow
   */
  private async performAnalysis(analysisId: string, request: AnalysisRequest): Promise<void> {
    const db = getDatabase();

    try {
      // 1. Load selected samples
      logger.info(`📋 Loading ${request.sampleIds.length} selected samples...`);
      this.updateAnalysisStatus(analysisId, 'GENERATING_CHARTS');

      const samples = this.loadSamples(request.sampleIds);

      if (samples.length === 0) {
        throw new Error('No samples found with provided IDs');
      }

      // 2. Generate charts for each sample
      logger.info('🎨 Generating analysis charts...');
      const chartSets = await this.generateAllCharts(analysisId, samples);

      // 3. Build prompt and call Claude
      logger.info('🤖 Calling Claude Vision API...');
      this.updateAnalysisStatus(analysisId, 'ANALYZING');

      const prompt = this.buildAnalysisPrompt(samples);
      const claudeResponse = await this.callClaudeVision(prompt, chartSets);

      // 4. Parse and store strategies
      logger.info('💾 Storing analysis results...');
      await this.storeAnalysisResults(analysisId, claudeResponse);

      this.updateAnalysisStatus(analysisId, 'COMPLETED');
      logger.info(`✅ Analysis ${analysisId} completed successfully`);

    } catch (error: any) {
      logger.error(`❌ Analysis ${analysisId} failed:`, error);
      this.updateAnalysisStatus(analysisId, 'FAILED', error.message);
      throw error;
    }
  }

  /**
   * Load samples from database
   */
  private loadSamples(sampleIds: string[]): Sample[] {
    const db = getDatabase();
    const placeholders = sampleIds.map(() => '?').join(',');

    const samples = db.prepare(`
      SELECT id, ticker, start_date, end_date, backtest_set_id
      FROM scan_results
      WHERE id IN (${placeholders})
    `).all(...sampleIds) as Sample[];

    return samples;
  }

  /**
   * Generate both daily context and intraday detail charts for all samples
   */
  private async generateAllCharts(
    analysisId: string,
    samples: Sample[]
  ): Promise<Array<{ sample: Sample; dailyChart: Buffer; intradayChart: Buffer }>> {
    const chartSets: Array<{ sample: Sample; dailyChart: Buffer; intradayChart: Buffer }> = [];

    for (const sample of samples) {
      logger.info(`📊 Generating charts for ${sample.ticker}...`);

      // Generate daily context chart (end → 30 days after)
      const dailyChart = await this.generateDailyChart(sample);

      // Generate intraday detail chart (5 days before/after end)
      const intradayChart = await this.generateIntradayChart(sample);

      // Save charts to database
      await this.saveChart(analysisId, sample.id, 'daily_context', sample.ticker, dailyChart, sample.start_date, sample.end_date);
      await this.saveChart(analysisId, sample.id, 'intraday_detail', sample.ticker, intradayChart, sample.start_date, sample.end_date);

      chartSets.push({
        sample,
        dailyChart,
        intradayChart
      });
    }

    return chartSets;
  }

  /**
   * Generate daily context chart for a sample
   */
  private async generateDailyChart(sample: Sample): Promise<Buffer> {
    // Get daily bars from end date → 30 days after (or latest available)
    const endDate = new Date(sample.end_date);
    const afterEndDate = new Date(endDate);
    afterEndDate.setDate(afterEndDate.getDate() + 30);

    const bars = await universeDataService.getDailyBarsForChart(
      sample.ticker,
      sample.end_date,
      afterEndDate.toISOString().split('T')[0]
    );

    if (bars.length === 0) {
      throw new Error(`No daily data found for ${sample.ticker}`);
    }

    return await chartGeneratorService.generateDailyContextChart(
      sample.ticker,
      sample.start_date,
      sample.end_date,
      bars
    );
  }

  /**
   * Generate intraday detail chart for a sample
   */
  private async generateIntradayChart(sample: Sample): Promise<Buffer> {
    // Get 5-minute bars from 5 days before end → 5 days after end
    const dateRange = polygonIntradayService.getIntradayDateRange(sample.end_date);

    const bars = await polygonIntradayService.fetch5MinBars(
      sample.ticker,
      dateRange.startDate,
      dateRange.endDate
    );

    if (bars.length === 0) {
      throw new Error(`No intraday data found for ${sample.ticker}`);
    }

    return await chartGeneratorService.generateIntradayDetailChart(
      sample.ticker,
      sample.end_date,
      bars
    );
  }

  /**
   * Save chart to database
   */
  private async saveChart(
    analysisId: string,
    sampleId: string,
    chartType: 'daily_context' | 'intraday_detail',
    ticker: string,
    chartBuffer: Buffer,
    startDate: string,
    endDate: string
  ): Promise<void> {
    const db = getDatabase();
    const chartId = randomUUID();

    db.prepare(`
      INSERT INTO analysis_charts (
        id, analysis_id, sample_id, chart_type, ticker, start_date, end_date,
        chart_data, width, height
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chartId,
      analysisId,
      sampleId,
      chartType,
      ticker,
      startDate,
      endDate,
      chartBuffer.toString('base64'),
      1400,
      700
    );
  }

  /**
   * Build comprehensive analysis prompt
   */
  private buildAnalysisPrompt(samples: Sample[]): string {
    return `You are analyzing stock price charts to discover profitable trading strategies.

I'm showing you ${samples.length} example${samples.length > 1 ? 's' : ''} of similar patterns. For each example, you'll see 2 charts:

1. **Daily Context Chart** - Shows broader price action from signal end date → 30 days after
   - Vertical lines mark the pattern start and end dates
   - Shows the pattern aftermath in daily timeframe
   - Daily candlesticks with volume bars

2. **Intraday Detail Chart (5-min bars)** - Shows detailed price and volume action around the signal
   - Green/red candles = 5-minute price movement
   - Green/red bars at bottom = volume (green = up bar, red = down bar)
   - Yellow dashed line = average volume for the period
   - Fine-grained view of entry/exit opportunities

**Your Task:**

Analyze these charts and identify actionable trading strategies. Focus on:

1. **ENTRY/EXIT STRATEGIES**
   - Visual entry signals (specific candlestick patterns, volume conditions)
   - Visual exit signals (when to take profits)
   - Stop loss placement based on chart levels
   - Timing: intraday vs overnight

2. **PATTERN CHARACTERISTICS**
   - What visual features define successful vs failed patterns?
   - Volume patterns that precede major moves
   - Candlestick patterns that matter (doji, engulfing, etc.)
   - Price action clues (support/resistance, trend strength)

3. **BACKTEST PARAMETERS**
   - Specific numeric criteria that can be coded
   - Example: "volume >3x average", "RSI <30", "close below previous day low"
   - Entry triggers, exit rules, risk management parameters

**Response Format:**

Return your analysis as a JSON object with this structure:

\`\`\`json
{
  "visual_insights": {
    "continuation_signals": [
      "Large green candles with volume >3x average indicate strong momentum likely to continue",
      "..."
    ],
    "exhaustion_signals": [
      "Doji after sustained rally with declining volume = warning sign",
      "..."
    ],
    "key_observations": [
      "Observation 1",
      "Observation 2"
    ]
  },
  "strategies": {
    "long_strategies": [
      {
        "name": "Strategy Name",
        "entry": {
          "visual_conditions": "Description of what to look for visually",
          "specific_signals": "Exact numeric/coded conditions",
          "timing": "When to enter (e.g., 'on close', 'next open', 'intraday break')"
        },
        "exit": {
          "visual_conditions": "Description of exit signals",
          "take_profit": "Profit target (e.g., '40%', 'resistance level')",
          "stop_loss": "Stop loss placement (e.g., 'previous day low', '20% below entry')",
          "max_hold": "Maximum holding period (e.g., '15 days')"
        },
        "confidence_score": 85
      }
    ],
    "short_strategies": [
      {
        "name": "Strategy Name",
        "entry": {
          "visual_conditions": "...",
          "specific_signals": "...",
          "timing": "..."
        },
        "exit": {
          "visual_conditions": "...",
          "take_profit": "...",
          "stop_loss": "...",
          "max_hold": "..."
        },
        "confidence_score": 75
      }
    ]
  }
}
\`\`\`

Focus on ACTIONABLE, VISUAL signals that can be coded into backtest scripts. Be specific about numeric thresholds and timing.`;
  }

  /**
   * Call Claude Vision API with charts
   */
  private async callClaudeVision(
    prompt: string,
    chartSets: Array<{ sample: Sample; dailyChart: Buffer; intradayChart: Buffer }>
  ): Promise<any> {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY
    });

    // Build content array with prompt + all charts
    const content: any[] = [
      {
        type: 'text',
        text: prompt
      }
    ];

    // Add charts for each sample
    for (const { sample, dailyChart, intradayChart } of chartSets) {
      // Sample header
      content.push({
        type: 'text',
        text: `\n\n## ${sample.ticker} (${sample.start_date} to ${sample.end_date})\n`
      });

      // Daily context chart
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: dailyChart.toString('base64')
        }
      });

      // Intraday detail chart
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: intradayChart.toString('base64')
        }
      });
    }

    logger.info(`📤 Sending ${chartSets.length * 2} images to Claude Vision API...`);

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content
      }]
    });

    // Extract and parse JSON response
    const analysisText = response.content.find(c => c.type === 'text')?.text || '';
    logger.info(`📝 Received response from Claude (${analysisText.length} chars)`);

    // Try to extract JSON from response
    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/) || analysisText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  }

  /**
   * Store analysis results in database
   */
  private async storeAnalysisResults(analysisId: string, claudeResponse: any): Promise<void> {
    const db = getDatabase();

    // Store visual insights
    db.prepare(`
      UPDATE claude_analyses
      SET visual_insights = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(claudeResponse.visual_insights),
      analysisId
    );

    // Store strategies
    const allStrategies = [
      ...(claudeResponse.strategies.long_strategies || []).map((s: any) => ({ ...s, side: 'long' })),
      ...(claudeResponse.strategies.short_strategies || []).map((s: any) => ({ ...s, side: 'short' }))
    ];

    for (const strategy of allStrategies) {
      const strategyId = randomUUID();

      db.prepare(`
        INSERT INTO strategy_recommendations (
          id, analysis_id, name, side, entry_conditions, exit_conditions, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        strategyId,
        analysisId,
        strategy.name,
        strategy.side,
        JSON.stringify(strategy.entry),
        JSON.stringify(strategy.exit),
        strategy.confidence_score || null
      );
    }

    logger.info(`✅ Stored ${allStrategies.length} strategy recommendations`);
  }

  /**
   * Update analysis status
   */
  private updateAnalysisStatus(
    analysisId: string,
    status: 'PENDING' | 'GENERATING_CHARTS' | 'ANALYZING' | 'COMPLETED' | 'FAILED',
    errorMessage?: string
  ): void {
    const db = getDatabase();

    if (status === 'FAILED' && errorMessage) {
      db.prepare(`
        UPDATE claude_analyses
        SET analysis_status = ?, error_message = ?
        WHERE id = ?
      `).run(status, errorMessage, analysisId);
    } else {
      db.prepare(`
        UPDATE claude_analyses
        SET analysis_status = ?
        WHERE id = ?
      `).run(status, analysisId);
    }
  }

  /**
   * Get analysis results
   */
  async getAnalysis(analysisId: string): Promise<AnalysisResult | null> {
    const db = getDatabase();

    const analysis = db.prepare(`
      SELECT * FROM claude_analyses WHERE id = ?
    `).get(analysisId) as any;

    if (!analysis) {
      return null;
    }

    // Get strategies
    const strategies = db.prepare(`
      SELECT * FROM strategy_recommendations WHERE analysis_id = ?
    `).all(analysisId) as any[];

    return {
      analysisId: analysis.id,
      status: analysis.analysis_status,
      visual_insights: analysis.visual_insights ? JSON.parse(analysis.visual_insights) : undefined,
      strategies: strategies.map(s => ({
        name: s.name,
        side: s.side,
        entry_conditions: JSON.parse(s.entry_conditions),
        exit_conditions: JSON.parse(s.exit_conditions),
        confidence_score: s.confidence_score
      })),
      error: analysis.error_message
    };
  }

  /**
   * Get all charts for an analysis
   */
  async getAnalysisCharts(analysisId: string): Promise<any[] | null> {
    const db = getDatabase();

    // Check if analysis exists
    const analysis = db.prepare(`
      SELECT id FROM claude_analyses WHERE id = ?
    `).get(analysisId);

    if (!analysis) {
      return null;
    }

    // Get all charts for this analysis
    const charts = db.prepare(`
      SELECT
        id, sample_id, chart_type, ticker, start_date, end_date,
        chart_data, width, height, created_at
      FROM analysis_charts
      WHERE analysis_id = ?
      ORDER BY sample_id, chart_type
    `).all(analysisId) as any[];

    return charts.map(c => ({
      id: c.id,
      sampleId: c.sample_id,
      chartType: c.chart_type,
      ticker: c.ticker,
      startDate: c.start_date,
      endDate: c.end_date,
      chartData: c.chart_data,
      width: c.width,
      height: c.height,
      createdAt: c.created_at
    }));
  }
}

export default new ClaudeAnalysisService();
