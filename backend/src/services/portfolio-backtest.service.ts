/**
 * Portfolio Backtest Service
 *
 * Integrates scanner and backtest services to enable pattern discovery + validation at scale
 */

import scannerService from './scanner.service';
import claudeService from './claude.service';
import scriptExecutionService from './script-execution.service';
import scriptGeneratorService from './script-generator.service';
import {
  PortfolioBacktestRequest,
  PortfolioBacktestResult,
  IndividualBacktestResult,
  PortfolioMetrics,
  TradeResult
} from '../types/portfolio-backtest.types';
import fs from 'fs/promises';

export class PortfolioBacktestService {
  /**
   * Main entry point: scan for patterns and backtest strategy on all matches
   */
  async scanAndBacktest(request: PortfolioBacktestRequest): Promise<PortfolioBacktestResult> {
    const startTime = Date.now();
    const sampleSize = request.sampleSize || 20;

    console.log(`\n🎯 Starting portfolio backtest:`);
    console.log(`   Scan Query: "${request.scanQuery}"`);
    console.log(`   Strategy: "${request.strategyPrompt}"`);
    console.log(`   Universe: ${request.universe}`);
    console.log(`   Sample Size: ${sampleSize}\n`);

    try {
      // Step 1: Run scanner to find pattern matches
      console.log('🔍 Step 1: Scanning for patterns...');
      const scanStartTime = Date.now();
      const scanResults = await scannerService.naturalLanguageScan(
        request.scanQuery,
        request.universe,
        request.dateRange
      );
      const scanTime = Date.now() - scanStartTime;

      console.log(`✅ Found ${scanResults.total_matches} matches in ${scanTime}ms`);

      // Limit to sample size
      const tickersToTest = scanResults.matches.slice(0, sampleSize);
      const skippedCount = scanResults.total_matches - tickersToTest.length;

      console.log(`📊 Testing ${tickersToTest.length} stocks (${skippedCount} skipped)\n`);

      // Step 2: Backtest strategy on each matched stock
      console.log('🧪 Step 2: Running backtests...');
      const individualResults: IndividualBacktestResult[] = [];

      for (let i = 0; i < tickersToTest.length; i++) {
        const match = tickersToTest[i];
        console.log(`\n[${i + 1}/${tickersToTest.length}] Testing ${match.ticker}...`);

        try {
          const result = await this.backtestSingleStock(
            match.ticker,
            match.date,
            request.strategyPrompt
          );
          individualResults.push(result);

          if (result.success) {
            console.log(`   ✓ Success: ${result.metrics?.total_trades || 0} trades`);
          } else {
            console.log(`   ✗ Failed: ${result.error}`);
          }
        } catch (error: any) {
          console.log(`   ✗ Error: ${error.message}`);
          individualResults.push({
            ticker: match.ticker,
            success: false,
            error: error.message
          });
        }
      }

      // Step 3: Aggregate results
      console.log(`\n📈 Step 3: Aggregating results...`);
      const portfolioMetrics = this.aggregateResults(individualResults);

      const executionTime = Date.now() - startTime;

      console.log(`\n✅ Portfolio backtest complete in ${executionTime}ms`);
      console.log(`   Win Rate: ${portfolioMetrics.win_rate.toFixed(1)}%`);
      console.log(`   Avg P&L: ${portfolioMetrics.avg_pnl_percent_per_trade.toFixed(2)}%`);
      console.log(`   Total Trades: ${portfolioMetrics.total_trades}`);

      return {
        success: true,
        scanResults: {
          total_matches: scanResults.total_matches,
          tested_count: tickersToTest.length,
          skipped_count: skippedCount,
          scan_time_ms: scanTime
        },
        portfolioMetrics,
        individualResults,
        executionTime,
        strategyPrompt: request.strategyPrompt,
        scanQuery: request.scanQuery,
        universe: request.universe
      };

    } catch (error: any) {
      console.error('❌ Portfolio backtest failed:', error);
      throw error;
    }
  }

  /**
   * Backtest strategy on a single stock using daily metrics
   */
  private async backtestSingleStock(
    ticker: string,
    signalDate: string,
    strategyPrompt: string
  ): Promise<IndividualBacktestResult> {
    try {
      // Generate daily backtest script using Claude
      console.log(`   📝 Generating script...`);
      const scriptResponse = await claudeService.generateDailyBacktestScript(
        ticker,
        signalDate,
        strategyPrompt
      );

      // Save script to file
      const scriptPath = scriptGeneratorService.generateFilename(`portfolio-backtest-${ticker}`);
      await fs.writeFile(scriptPath, scriptResponse.script);

      // Execute script
      console.log(`   ⚙️  Executing backtest...`);
      const executionResult = await scriptExecutionService.executeScript(scriptPath);

      // Clean up script file
      await fs.unlink(scriptPath).catch(() => {/* ignore */});

      if (!executionResult.success) {
        return {
          ticker,
          success: false,
          error: executionResult.error
        };
      }

      // Parse results from stdout
      const trades = this.parseBacktestOutput(executionResult.stdout || '');
      const metrics = this.calculateMetrics(trades);

      return {
        ticker,
        success: true,
        trades,
        metrics
      };

    } catch (error: any) {
      return {
        ticker,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse backtest output to extract trades
   */
  private parseBacktestOutput(stdout: string): TradeResult[] {
    try {
      // Look for JSON array in output
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.warn('   ⚠️ Failed to parse backtest output');
      return [];
    }
  }

  /**
   * Calculate metrics for a single stock's trades
   */
  private calculateMetrics(trades: TradeResult[]): IndividualBacktestResult['metrics'] {
    const actualTrades = trades.filter(t => !t.no_trade);
    const winning = actualTrades.filter(t => (t.pnl_percent || 0) > 0);
    const losing = actualTrades.filter(t => (t.pnl_percent || 0) <= 0);

    const totalPnl = actualTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalPnlPercent = actualTrades.reduce((sum, t) => sum + (t.pnl_percent || 0), 0);
    const avgPnl = actualTrades.length > 0 ? totalPnl / actualTrades.length : 0;
    const avgPnlPercent = actualTrades.length > 0 ? totalPnlPercent / actualTrades.length : 0;

    return {
      total_trades: actualTrades.length,
      winning_trades: winning.length,
      losing_trades: losing.length,
      win_rate: actualTrades.length > 0 ? (winning.length / actualTrades.length) * 100 : 0,
      total_pnl: totalPnl,
      total_pnl_percent: totalPnlPercent,
      avg_pnl: avgPnl,
      avg_pnl_percent: avgPnlPercent
    };
  }

  /**
   * Aggregate results from all individual backtests into portfolio-level metrics
   */
  private aggregateResults(results: IndividualBacktestResult[]): PortfolioMetrics {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    // Collect all trades across all stocks
    const allTrades: (TradeResult & { ticker: string })[] = [];
    for (const result of successful) {
      if (result.trades) {
        for (const trade of result.trades.filter(t => !t.no_trade)) {
          allTrades.push({ ...trade, ticker: result.ticker });
        }
      }
    }

    // Calculate portfolio-level metrics
    const winning = allTrades.filter(t => (t.pnl_percent || 0) > 0);
    const losing = allTrades.filter(t => (t.pnl_percent || 0) <= 0);

    const totalPnl = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalPnlPercent = allTrades.reduce((sum, t) => sum + (t.pnl_percent || 0), 0);
    const avgPnlPerTrade = allTrades.length > 0 ? totalPnl / allTrades.length : 0;
    const avgPnlPercentPerTrade = allTrades.length > 0 ? totalPnlPercent / allTrades.length : 0;

    // Calculate median P&L%
    const pnlPercents = allTrades.map(t => t.pnl_percent || 0).sort((a, b) => a - b);
    const medianPnlPercent = pnlPercents.length > 0
      ? pnlPercents[Math.floor(pnlPercents.length / 2)]
      : 0;

    // Find best and worst trades
    let bestTrade = allTrades[0];
    let worstTrade = allTrades[0];
    for (const trade of allTrades) {
      if ((trade.pnl_percent || 0) > (bestTrade?.pnl_percent || 0)) {
        bestTrade = trade;
      }
      if ((trade.pnl_percent || 0) < (worstTrade?.pnl_percent || 0)) {
        worstTrade = trade;
      }
    }

    // Find best and worst performing stocks (by avg P&L%)
    const stockStats = successful.map(r => ({
      ticker: r.ticker,
      win_rate: r.metrics?.win_rate || 0,
      avg_pnl_percent: r.metrics?.avg_pnl_percent || 0
    })).sort((a, b) => b.avg_pnl_percent - a.avg_pnl_percent);

    return {
      total_stocks_tested: results.length,
      total_trades: allTrades.length,
      successful_backtests: successful.length,
      failed_backtests: failed.length,

      winning_trades: winning.length,
      losing_trades: losing.length,
      win_rate: allTrades.length > 0 ? (winning.length / allTrades.length) * 100 : 0,

      total_pnl: totalPnl,
      total_pnl_percent: totalPnlPercent,
      avg_pnl_per_trade: avgPnlPerTrade,
      avg_pnl_percent_per_trade: avgPnlPercentPerTrade,
      median_pnl_percent: medianPnlPercent,

      best_trade: bestTrade,
      worst_trade: worstTrade,
      best_stock: stockStats[0],
      worst_stock: stockStats[stockStats.length - 1]
    };
  }
}

// Export singleton instance
export default new PortfolioBacktestService();
