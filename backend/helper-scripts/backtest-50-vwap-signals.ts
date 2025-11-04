/**
 * Backtest 50 VWAP Mean Reversion Signals
 *
 * Purpose: Run execution backtests on 50 of the 500 signals from iteration 1
 * to validate ticker selection and get more data on which stocks work best.
 */

import { initializeDatabase, getDatabase } from '../src/database/db';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { ScriptExecutionService } from '../src/services/script-execution.service';
import { TemplateRendererService } from '../src/services/template-renderer.service';
import { executionTemplates, DEFAULT_TEMPLATES } from '../src/templates/execution';

const VWAP_ITERATION_ID = '39b9b6e6-d001-4f32-84fd-326716aa3eeb';

async function main() {
  console.log('🧪 Backtesting 50 VWAP Signals from Iteration 1\n');

  const db = initializeDatabase('/Users/edwardkim/Code/ai-backtest/backtesting.db');

  // Step 1: Get the scan script from iteration 1
  const iteration = db.prepare(`
    SELECT scan_script
    FROM agent_iterations
    WHERE id = ?
  `).get(VWAP_ITERATION_ID) as any;

  if (!iteration) {
    throw new Error('Iteration not found');
  }

  console.log('📊 Step 1: Running scan script to get all 500 signals...\n');

  // Write scan script to temp file
  const scanScriptPath = path.join(__dirname, `../temp-scan-${uuidv4()}.ts`);
  fs.writeFileSync(scanScriptPath, iteration.scan_script);

  // Execute scan
  const scriptExecution = new ScriptExecutionService();
  const scanResult = await scriptExecution.executeScript(scanScriptPath, 300000); // 5 min timeout

  // Clean up scan script
  if (fs.existsSync(scanScriptPath)) {
    fs.unlinkSync(scanScriptPath);
  }

  if (!scanResult.success || !scanResult.data) {
    throw new Error(`Scan failed: ${scanResult.error}`);
  }

  // Parse scan results - can be array directly or {matches: []}
  let allSignals: any[] = [];
  if (Array.isArray(scanResult.data)) {
    allSignals = scanResult.data;
  } else {
    allSignals = (scanResult.data as any)?.matches || (scanResult.data as any)?.trades || [];
  }

  console.log(`✅ Found ${allSignals.length} total signals\n`);

  // Step 2: Select 50 signals with good ticker distribution
  console.log('📋 Step 2: Selecting 50 signals with diverse ticker distribution...\n');

  // Group by ticker
  const signalsByTicker: { [ticker: string]: any[] } = {};
  for (const signal of allSignals) {
    if (!signalsByTicker[signal.ticker]) {
      signalsByTicker[signal.ticker] = [];
    }
    signalsByTicker[signal.ticker].push(signal);
  }

  const tickers = Object.keys(signalsByTicker);
  console.log(`   Tickers with signals: ${tickers.length}`);
  console.log(`   Top 10 tickers by signal count:`);

  const tickerCounts = Object.entries(signalsByTicker)
    .map(([ticker, signals]) => ({ ticker, count: signals.length }))
    .sort((a, b) => b.count - a.count);

  tickerCounts.slice(0, 10).forEach((tc, idx) => {
    console.log(`   ${idx + 1}. ${tc.ticker}: ${tc.count} signals`);
  });
  console.log('');

  // Select 50 signals: take 1-2 signals from each ticker (round-robin style)
  const selectedSignals: any[] = [];
  const maxSignalsPerTicker = 2;

  for (const ticker of tickers) {
    const tickerSignals = signalsByTicker[ticker];
    const numToTake = Math.min(maxSignalsPerTicker, tickerSignals.length);

    // Take signals with highest pattern_strength
    const sorted = tickerSignals.sort((a, b) => b.pattern_strength - a.pattern_strength);
    selectedSignals.push(...sorted.slice(0, numToTake));

    if (selectedSignals.length >= 50) break;
  }

  // Take exactly 50
  const finalSignals = selectedSignals.slice(0, 50);

  console.log(`✅ Selected ${finalSignals.length} signals from ${new Set(finalSignals.map(s => s.ticker)).size} tickers\n`);

  // Step 3: Run backtests using execution templates
  console.log('🚀 Step 3: Running backtests with execution templates...\n');

  // Group selected signals by ticker
  const selectedByTicker: { [ticker: string]: any[] } = {};
  for (const signal of finalSignals) {
    if (!selectedByTicker[signal.ticker]) {
      selectedByTicker[signal.ticker] = [];
    }
    selectedByTicker[signal.ticker].push(signal);
  }

  const templateRenderer = new TemplateRendererService();
  const allResults: any[] = [];

  // Test each template
  for (const templateName of DEFAULT_TEMPLATES) {
    const template = executionTemplates[templateName];
    console.log(`\n📊 Testing template: ${template.name}`);

    const templateTrades: any[] = [];

    // Execute backtests for each ticker
    for (const [ticker, signals] of Object.entries(selectedByTicker)) {
      const scriptId = uuidv4();
      const dateStr = new Date().toISOString().split('T')[0];
      const scriptPath = path.join(__dirname, '../generated-scripts/success', dateStr, `${scriptId}-${templateName}-${ticker}.ts`);

      // Ensure directory exists
      const dir = path.dirname(scriptPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      try {
        // Render script using template
        const script = templateRenderer.renderScript(template, signals, ticker);
        fs.writeFileSync(scriptPath, script);

        // Execute with 120 second timeout
        const result = await scriptExecution.executeScript(scriptPath, 120000);

        // Note: Keep generated scripts for debugging (same as agent learning service)

        if (result.success && result.data) {
          let trades: any[] = [];
          if (Array.isArray(result.data)) {
            trades = result.data;
          } else if (result.data.trades) {
            trades = result.data.trades;
          }

          if (trades.length > 0) {
            console.log(`   ✓ ${ticker}: ${trades.length} trades`);
            templateTrades.push(...trades);
          }
        } else {
          console.log(`   ✗ ${ticker}: Failed - ${result.error || 'Unknown error'}`);
        }
      } catch (error: any) {
        console.error(`   ✗ ${ticker}: Error - ${error.message}`);
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }
      }
    }

    // Calculate template metrics
    const wins = templateTrades.filter(t => (t.pnl || t.profit || 0) > 0).length;
    const losses = templateTrades.filter(t => (t.pnl || t.profit || 0) <= 0).length;
    const winRate = templateTrades.length > 0 ? wins / templateTrades.length : 0;

    const totalPnl = templateTrades.reduce((sum, t) => sum + (t.pnl || t.profit || 0), 0);
    const totalPnlPct = templateTrades.reduce((sum, t) => sum + (t.pnlPercent || t.profitPercent || 0), 0);
    const avgPnlPct = templateTrades.length > 0 ? totalPnlPct / templateTrades.length : 0;

    console.log(`\n   Results: ${templateTrades.length} trades, ${(winRate * 100).toFixed(1)}% win rate, ${avgPnlPct.toFixed(2)}% avg P&L`);

    allResults.push({
      template: templateName,
      templateDisplayName: template.name,
      trades: templateTrades,
      totalTrades: templateTrades.length,
      winRate,
      avgPnlPct,
      totalPnl,
      totalPnlPct
    });
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('📈 BACKTEST RESULTS SUMMARY');
  console.log('='.repeat(80) + '\n');

  // Sort by total P&L
  allResults.sort((a, b) => b.totalPnlPct - a.totalPnlPct);

  console.log('Template Performance:\n');
  allResults.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.templateDisplayName}`);
    console.log(`   Trades: ${r.totalTrades}`);
    console.log(`   Win Rate: ${(r.winRate * 100).toFixed(1)}%`);
    console.log(`   Avg P&L: ${r.avgPnlPct.toFixed(2)}%`);
    console.log(`   Total P&L: ${r.totalPnlPct.toFixed(2)}%`);
    console.log('');
  });

  // Analyze by ticker
  console.log('\n' + '-'.repeat(80));
  console.log('📊 TICKER PERFORMANCE ANALYSIS');
  console.log('-'.repeat(80) + '\n');

  const tickerStats: { [ticker: string]: any } = {};

  // Combine all trades from all templates
  const allTrades = allResults.flatMap(r => r.trades);

  for (const trade of allTrades) {
    const ticker = trade.ticker;
    if (!tickerStats[ticker]) {
      tickerStats[ticker] = {
        ticker,
        trades: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        totalPnlPct: 0
      };
    }

    const stats = tickerStats[ticker];
    stats.trades++;

    const pnl = trade.pnl || trade.profit || 0;
    const pnlPct = trade.pnlPercent || trade.profitPercent || 0;

    stats.totalPnl += pnl;
    stats.totalPnlPct += pnlPct;

    if (pnl > 0) stats.wins++;
    else stats.losses++;
  }

  // Calculate final metrics
  const tickerAnalysis = Object.values(tickerStats).map((stats: any) => ({
    ...stats,
    winRate: stats.trades > 0 ? stats.wins / stats.trades : 0,
    avgPnlPct: stats.trades > 0 ? stats.totalPnlPct / stats.trades : 0
  }));

  // Sort by total P&L
  tickerAnalysis.sort((a, b) => b.totalPnlPct - a.totalPnlPct);

  console.log('Top 20 Tickers by Total P&L:\n');
  console.log('Rank | Ticker | Trades | Win Rate | Avg P&L% | Total P&L% |');
  console.log('-----|--------|--------|----------|----------|------------|');

  tickerAnalysis.slice(0, 20).forEach((t, idx) => {
    console.log(
      `${String(idx + 1).padStart(4)} | ` +
      `${t.ticker.padEnd(6)} | ` +
      `${String(t.trades).padStart(6)} | ` +
      `${(t.winRate * 100).toFixed(1).padStart(8)}% | ` +
      `${t.avgPnlPct.toFixed(2).padStart(8)}% | ` +
      `${t.totalPnlPct.toFixed(2).padStart(10)}% |`
    );
  });

  console.log('\n\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('='.repeat(80) + '\n');

  // Find tickers with win rate >= 60% and avg P&L >= 1%
  const goodTickers = tickerAnalysis.filter(t =>
    t.winRate >= 0.6 &&
    t.avgPnlPct >= 1.0 &&
    t.trades >= 2 // At least 2 trades
  );

  console.log(`Found ${goodTickers.length} tickers with:`)
  console.log(`  - Win rate >= 60%`);
  console.log(`  - Avg P&L >= 1.0%`);
  console.log(`  - At least 2 trades`);
  console.log('');

  if (goodTickers.length > 0) {
    console.log('Recommended watchlist tickers:');
    console.log(goodTickers.map(t => t.ticker).join(', '));
    console.log('');
  }

  // Save detailed results
  const resultsFile = '/tmp/vwap-50-signal-backtest-results.json';
  fs.writeFileSync(resultsFile, JSON.stringify({
    summary: {
      totalSignals: allSignals.length,
      signalsBacktested: finalSignals.length,
      tickersBacktested: Object.keys(selectedByTicker).length,
      totalTrades: allTrades.length,
      templates: allResults.map(r => ({
        name: r.templateDisplayName,
        trades: r.totalTrades,
        winRate: r.winRate,
        avgPnlPct: r.avgPnlPct
      }))
    },
    tickerAnalysis: tickerAnalysis,
    allTrades: allTrades
  }, null, 2));

  console.log(`✅ Detailed results saved to: ${resultsFile}\n`);
  console.log('🎉 Analysis complete!\n');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
