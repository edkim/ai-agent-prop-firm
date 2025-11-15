/**
 * Walk-Forward Analysis Service
 * 
 * Implements walk-forward analysis to prevent overfitting and validate strategies
 * on out-of-sample data. This is critical for finding real trading edge.
 * 
 * Walk-Forward Process:
 * 1. Train on period 1, test on period 2
 * 2. Train on periods 1-2, test on period 3
 * 3. Train on periods 1-3, test on period 4
 * 4. Aggregate results across all out-of-sample periods
 */

import { LearningIterationService } from './learning-iteration.service';
import { getDatabase } from '../database/db';
import { IterationResult } from '../types/agent.types';

export interface WalkForwardPeriod {
  periodNumber: number;
  trainStartDate: string;
  trainEndDate: string;
  testStartDate: string;
  testEndDate: string;
  description: string;
}

export interface WalkForwardResult {
  period: WalkForwardPeriod;
  iterationResult: IterationResult;
  outOfSampleMetrics: {
    totalTrades: number;
    winRate: number;
    totalReturn: number;
    sharpeRatio: number;
    profitFactor: number;
    maxDrawdown: number;
  };
}

export interface WalkForwardAnalysisResult {
  agentId: string;
  periods: WalkForwardResult[];
  aggregatedMetrics: {
    totalPeriods: number;
    totalTrades: number;
    avgWinRate: number;
    avgTotalReturn: number;
    avgSharpeRatio: number;
    avgProfitFactor: number;
    consistency: number; // % of periods with positive returns
    bestPeriod: WalkForwardResult;
    worstPeriod: WalkForwardResult;
  };
  statisticalSignificance: {
    pValue: number; // Probability results are due to luck
    confidenceInterval95: { lower: number; upper: number };
    isSignificant: boolean; // p < 0.05
  };
}

export class WalkForwardAnalysisService {
  private iterationService: LearningIterationService;

  constructor() {
    this.iterationService = new LearningIterationService();
  }

  /**
   * Generate walk-forward periods
   * 
   * Example: If we have data from 2024-01-01 to 2025-12-31:
   * - Period 1: Train 2024-01-01 to 2024-03-31, Test 2024-04-01 to 2024-06-30
   * - Period 2: Train 2024-01-01 to 2024-06-30, Test 2024-07-01 to 2024-09-30
   * - Period 3: Train 2024-01-01 to 2024-09-30, Test 2024-10-01 to 2024-12-31
   * - Period 4: Train 2024-01-01 to 2024-12-31, Test 2025-01-01 to 2025-03-31
   * etc.
   */
  generateWalkForwardPeriods(
    overallStartDate: string,
    overallEndDate: string,
    trainMonths: number = 3,
    testMonths: number = 3,
    overlapMonths: number = 0 // 0 = expanding window, >0 = rolling window
  ): WalkForwardPeriod[] {
    const periods: WalkForwardPeriod[] = [];
    const start = new Date(overallStartDate);
    const end = new Date(overallEndDate);
    
    let currentTrainStart = new Date(start);
    let periodNumber = 1;

    while (true) {
      // Calculate train period end
      const trainEnd = new Date(currentTrainStart);
      trainEnd.setMonth(trainEnd.getMonth() + trainMonths);
      trainEnd.setDate(trainEnd.getDate() - 1); // End of month

      // Calculate test period
      const testStart = new Date(trainEnd);
      testStart.setDate(testStart.getDate() + 1);
      const testEnd = new Date(testStart);
      testEnd.setMonth(testEnd.getMonth() + testMonths);
      testEnd.setDate(testEnd.getDate() - 1); // End of month

      // Check if we have enough data
      if (testEnd > end) {
        break; // Not enough data for another period
      }

      periods.push({
        periodNumber: periodNumber++,
        trainStartDate: this.formatDate(currentTrainStart),
        trainEndDate: this.formatDate(trainEnd),
        testStartDate: this.formatDate(testStart),
        testEndDate: this.formatDate(testEnd),
        description: `Train: ${this.formatDate(currentTrainStart)} to ${this.formatDate(trainEnd)}, Test: ${this.formatDate(testStart)} to ${this.formatDate(testEnd)}`
      });

      // Move to next period
      if (overlapMonths > 0) {
        // Rolling window: move train start forward
        currentTrainStart.setMonth(currentTrainStart.getMonth() + overlapMonths);
      } else {
        // Expanding window: keep train start, move train end forward
        currentTrainStart = new Date(start); // Keep original start
      }
    }

    return periods;
  }

  /**
   * Run out-of-sample validation for an agent
   * 
   * SIMPLIFIED APPROACH: Generate strategy ONCE on first training period,
   * then test that SAME strategy on all test periods.
   * 
   * This prevents overfitting and validates that the strategy works on unseen data.
   */
  async runWalkForwardAnalysis(
    agentId: string,
    periods: WalkForwardPeriod[],
    manualGuidance?: string,
    customTickers?: string[],
    customUniverse?: string
  ): Promise<WalkForwardAnalysisResult> {
    console.log(`\n🚀 Starting Out-of-Sample Validation for Agent ${agentId}`);
    console.log(`   Total periods: ${periods.length}`);
    console.log(`   Strategy will be generated ONCE, then tested on all periods\n`);

    if (periods.length === 0) {
      throw new Error('No periods provided for walk-forward analysis');
    }

    // STEP 1: Generate strategy ONCE using first training period (or all training data combined)
    const firstPeriod = periods[0];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎓 STEP 1: Generating Strategy on Training Data`);
    console.log(`   Training Period: ${firstPeriod.trainStartDate} to ${firstPeriod.trainEndDate}`);
    console.log(`${'='.repeat(80)}\n`);

    let baseStrategyResult: IterationResult;
    try {
      // Generate strategy on first training period
      baseStrategyResult = await this.runIterationForPeriod(
        agentId,
        {
          ...firstPeriod,
          // Use training period for both train and test (we only need the strategy generation)
          testStartDate: firstPeriod.trainEndDate,
          testEndDate: firstPeriod.trainEndDate
        },
        manualGuidance,
        customTickers,
        customUniverse
      );
      console.log(`\n✅ Strategy Generated Successfully`);
      console.log(`   Scanner Script: ${baseStrategyResult.strategy?.scanScript ? 'Generated' : 'N/A'}`);
    } catch (error: any) {
      throw new Error(`Failed to generate base strategy: ${error.message}`);
    }

    // STEP 2: Test the SAME strategy on all test periods (out-of-sample)
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 STEP 2: Testing Strategy on Out-of-Sample Data`);
    console.log(`   Testing same strategy on ${periods.length} test periods`);
    console.log(`${'='.repeat(80)}\n`);

    const results: WalkForwardResult[] = [];

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 Test Period ${period.periodNumber}/${periods.length}: ${period.testStartDate} to ${period.testEndDate}`);
      console.log(`${'='.repeat(80)}\n`);

      try {
        // Test the base strategy on this test period
        // We need to run the scanner on the test period data
        const testResult = await this.testStrategyOnPeriod(
          agentId,
          baseStrategyResult.strategy?.scanScript || '',
          period,
          customTickers,
          customUniverse
        );

        // Extract out-of-sample metrics (from test period only)
        const outOfSampleMetrics = this.extractOutOfSampleMetrics(
          testResult,
          period.testStartDate,
          period.testEndDate
        );

        results.push({
          period,
          iterationResult: testResult,
          outOfSampleMetrics
        });

        console.log(`\n✅ Test Period ${period.periodNumber} Complete:`);
        console.log(`   Trades: ${outOfSampleMetrics.totalTrades}`);
        console.log(`   Win Rate: ${(outOfSampleMetrics.winRate * 100).toFixed(1)}%`);
        console.log(`   Return: ${outOfSampleMetrics.totalReturn.toFixed(2)}%`);
        console.log(`   Sharpe: ${outOfSampleMetrics.sharpeRatio.toFixed(2)}`);

      } catch (error: any) {
        console.error(`❌ Test Period ${period.periodNumber} Failed:`, error.message);
        // Continue with next period
      }
    }

    // Aggregate results
    const aggregated = this.aggregateResults(results);
    const statisticalSignificance = this.calculateStatisticalSignificance(results);

    return {
      agentId,
      periods: results,
      aggregatedMetrics: aggregated,
      statisticalSignificance
    };
  }

  /**
   * Run a single iteration for a specific period
   * Uses custom date ranges to train on training period and test on test period
   */
  private async runIterationForPeriod(
    agentId: string,
    period: WalkForwardPeriod,
    manualGuidance?: string,
    customTickers?: string[],
    customUniverse?: string
  ): Promise<IterationResult> {
    console.log(`   🎓 Training on: ${period.trainStartDate} to ${period.trainEndDate}`);
    console.log(`   🧪 Testing on: ${period.testStartDate} to ${period.testEndDate}`);
    if (customTickers) {
      console.log(`   📊 Using ${customTickers.length} custom tickers`);
    } else if (customUniverse) {
      console.log(`   📊 Using universe: ${customUniverse}`);
    }

    // Run iteration with custom date ranges
    // Scanner will be trained on training period, backtest will use test period
    const result = await this.iterationService.runIteration(
      agentId,
      manualGuidance,
      undefined, // No override scanner prompt
      {
        trainStart: period.trainStartDate,
        trainEnd: period.trainEndDate,
        testStart: period.testStartDate,
        testEnd: period.testEndDate
      },
      customTickers,
      customUniverse
    );
    
    return result;
  }

  /**
   * Test an existing strategy on a test period (out-of-sample)
   * This runs the scanner on test period data without regenerating the strategy
   */
  private async testStrategyOnPeriod(
    agentId: string,
    scannerScript: string,
    period: WalkForwardPeriod,
    customTickers?: string[],
    customUniverse?: string
  ): Promise<IterationResult> {
    console.log(`   🧪 Testing strategy on: ${period.testStartDate} to ${period.testEndDate}`);
    if (customTickers) {
      console.log(`   📊 Using ${customTickers.length} custom tickers`);
    } else if (customUniverse) {
      console.log(`   📊 Using universe: ${customUniverse}`);
    }

    // Run scan with the existing scanner script on test period only
    // We skip strategy generation and just execute the scanner
    const result = await this.iterationService.runIteration(
      agentId,
      undefined, // No manual guidance
      scannerScript, // Use existing scanner script as override
      {
        trainStart: period.testStartDate, // Not used since we're using existing script
        trainEnd: period.testStartDate,   // Not used
        testStart: period.testStartDate,  // Test period start
        testEnd: period.testEndDate       // Test period end
      },
      customTickers,
      customUniverse
    );
    
    return result;
  }

  /**
   * Extract metrics from test period only (out-of-sample)
   */
  private extractOutOfSampleMetrics(
    iterationResult: IterationResult,
    testStartDate: string,
    testEndDate: string
  ): WalkForwardResult['outOfSampleMetrics'] {
    const backtestResults = iterationResult.backtestResults;
    if (!backtestResults || !backtestResults.trades) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalReturn: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        maxDrawdown: 0
      };
    }

    // Filter trades to test period only
    const testPeriodTrades = backtestResults.trades.filter((trade: any) => {
      const tradeDate = trade.date;
      return tradeDate >= testStartDate && tradeDate <= testEndDate;
    });

    if (testPeriodTrades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalReturn: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        maxDrawdown: 0
      };
    }

    // Calculate metrics
    const winningTrades = testPeriodTrades.filter((t: any) => t.pnl > 0);
    const losingTrades = testPeriodTrades.filter((t: any) => t.pnl <= 0);
    
    const totalReturn = testPeriodTrades.reduce((sum: number, t: any) => sum + (t.pnl_percent || 0), 0);
    const winRate = winningTrades.length / testPeriodTrades.length;
    
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum: number, t: any) => sum + Math.abs(t.pnl || 0), 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum: number, t: any) => sum + Math.abs(t.pnl || 0), 0) / losingTrades.length
      : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Calculate Sharpe ratio (simplified)
    const returns = testPeriodTrades.map((t: any) => t.pnl_percent || 0);
    const avgReturn = returns.reduce((sum: number, r: number) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Calculate max drawdown (simplified)
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const trade of testPeriodTrades) {
      cumulative += trade.pnl_percent || 0;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      totalTrades: testPeriodTrades.length,
      winRate,
      totalReturn,
      sharpeRatio,
      profitFactor,
      maxDrawdown
    };
  }

  /**
   * Aggregate results across all periods
   */
  private aggregateResults(results: WalkForwardResult[]): WalkForwardAnalysisResult['aggregatedMetrics'] {
    if (results.length === 0) {
      throw new Error('No results to aggregate');
    }

    const totalTrades = results.reduce((sum, r) => sum + r.outOfSampleMetrics.totalTrades, 0);
    const avgWinRate = results.reduce((sum, r) => sum + r.outOfSampleMetrics.winRate, 0) / results.length;
    const avgTotalReturn = results.reduce((sum, r) => sum + r.outOfSampleMetrics.totalReturn, 0) / results.length;
    const avgSharpeRatio = results.reduce((sum, r) => sum + r.outOfSampleMetrics.sharpeRatio, 0) / results.length;
    const avgProfitFactor = results.reduce((sum, r) => sum + r.outOfSampleMetrics.profitFactor, 0) / results.length;
    
    const positivePeriods = results.filter(r => r.outOfSampleMetrics.totalReturn > 0).length;
    const consistency = positivePeriods / results.length;

    const bestPeriod = results.reduce((best, current) => 
      current.outOfSampleMetrics.totalReturn > best.outOfSampleMetrics.totalReturn ? current : best
    );

    const worstPeriod = results.reduce((worst, current) => 
      current.outOfSampleMetrics.totalReturn < worst.outOfSampleMetrics.totalReturn ? current : worst
    );

    return {
      totalPeriods: results.length,
      totalTrades,
      avgWinRate,
      avgTotalReturn,
      avgSharpeRatio,
      avgProfitFactor,
      consistency,
      bestPeriod,
      worstPeriod
    };
  }

  /**
   * Calculate statistical significance
   * Uses t-test to determine if results are significantly different from zero
   */
  private calculateStatisticalSignificance(
    results: WalkForwardResult[]
  ): WalkForwardAnalysisResult['statisticalSignificance'] {
    if (results.length < 2) {
      return {
        pValue: 1.0,
        confidenceInterval95: { lower: 0, upper: 0 },
        isSignificant: false
      };
    }

    // Extract returns from all periods
    const returns = results.map(r => r.outOfSampleMetrics.totalReturn);
    const n = returns.length;
    const mean = returns.reduce((sum, r) => sum + r, 0) / n;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1);
    const stdError = Math.sqrt(variance / n);

    // T-test: H0 = mean return is 0
    const tStat = mean / stdError;
    
    // Approximate p-value using t-distribution (simplified)
    // For n >= 30, use normal distribution; for n < 30, use t-distribution
    // This is a simplified calculation
    const degreesOfFreedom = n - 1;
    const pValue = this.calculatePValue(tStat, degreesOfFreedom);

    // 95% confidence interval
    const tCritical = this.getTCritical(degreesOfFreedom, 0.05);
    const marginOfError = tCritical * stdError;
    const confidenceInterval95 = {
      lower: mean - marginOfError,
      upper: mean + marginOfError
    };

    return {
      pValue,
      confidenceInterval95,
      isSignificant: pValue < 0.05
    };
  }

  /**
   * Calculate p-value from t-statistic (simplified approximation)
   */
  private calculatePValue(tStat: number, df: number): number {
    // Simplified: for large df, use normal distribution
    // For small df, this is an approximation
    // In production, use a proper statistical library
    const absT = Math.abs(tStat);
    
    // Approximation using normal distribution for large df
    if (df >= 30) {
      // Normal distribution approximation
      return 2 * (1 - this.normalCDF(absT));
    } else {
      // Simplified t-distribution (would need proper implementation)
      // For now, use normal approximation
      return 2 * (1 - this.normalCDF(absT));
    }
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    // Abramowitz and Stegun approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Get t-critical value (simplified)
   */
  private getTCritical(df: number, alpha: number): number {
    // Simplified: for df >= 30, use 1.96 (normal distribution)
    // For smaller df, use approximate values
    if (df >= 30) {
      return 1.96; // 95% confidence, two-tailed
    } else if (df >= 20) {
      return 2.086;
    } else if (df >= 10) {
      return 2.228;
    } else {
      return 2.571; // df = 5
    }
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get available date range from database
   */
  async getAvailableDateRange(timeframe: string = '5min'): Promise<{ startDate: string; endDate: string }> {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT 
        MIN(date(timestamp/1000, 'unixepoch')) as min_date,
        MAX(date(timestamp/1000, 'unixepoch')) as max_date
      FROM ohlcv_data
      WHERE timeframe = ?
    `).get(timeframe) as { min_date: string; max_date: string };

    return {
      startDate: result.min_date || '2024-01-01',
      endDate: result.max_date || new Date().toISOString().split('T')[0]
    };
  }
}

