/**
 * Analyze VWAP Mean Reversion signals to find optimal ticker watchlist
 */

import { initializeDatabase, getDatabase } from '../src/database/db';

const VWAP_ITERATION_ID = '39b9b6e6-d001-4f32-84fd-326716aa3eeb';
const VWAP_AGENT_ID = 'd992e829-27d9-406d-b771-8e3789645a5e';

interface TickerStats {
  ticker: string;
  signalCount: number;
  avgVolume: number;
  avgPrice: number;
  priceStdDev: number;
  signalDensity: number; // signals per day
  qualityScore: number;
}

async function main() {
  console.log('🔍 Analyzing VWAP Mean Reversion Signals for Optimal Ticker Selection\n');

  // Initialize database
  const db = initializeDatabase('/Users/edwardkim/Code/ai-backtest/backtesting.db');

  // Get iteration data
  const iteration = db.prepare(`
    SELECT
      signals_found,
      win_rate,
      sharpe_ratio,
      backtest_results
    FROM agent_iterations
    WHERE id = ?
  `).get(VWAP_ITERATION_ID) as any;

  console.log(`📊 Iteration 1 Summary:`);
  console.log(`   Signals Found: ${iteration.signals_found}`);
  console.log(`   Win Rate: ${(iteration.win_rate * 100).toFixed(1)}%`);
  console.log(`   Sharpe Ratio: ${iteration.sharpe_ratio.toFixed(2)}`);
  console.log('');

  // Parse backtest results to get trade data
  let backtestData;
  try {
    backtestData = JSON.parse(iteration.backtest_results);
  } catch (e) {
    console.error('Failed to parse backtest results:', e);
    process.exit(1);
  }

  // Analyze trades by ticker
  console.log('📈 Analyzing Trade Performance by Ticker...\n');

  const trades = backtestData.trades || [];
  console.log(`Total trades in backtest: ${trades.length}`);

  if (trades.length === 0) {
    console.log('⚠️  No trades found in backtest results.');
    console.log('This might mean signals were found but not all were backtested.');
    process.exit(1);
  }

  // Group trades by ticker
  const tickerPerformance = new Map<string, any>();

  trades.forEach((trade: any) => {
    const ticker = trade.ticker;
    if (!tickerPerformance.has(ticker)) {
      tickerPerformance.set(ticker, {
        ticker,
        trades: [],
        wins: 0,
        losses: 0,
        totalPnl: 0,
        totalPnlPercent: 0
      });
    }

    const stats = tickerPerformance.get(ticker);
    stats.trades.push(trade);

    const pnl = trade.pnl || trade.profit || 0;
    const pnlPercent = trade.pnlPercent || trade.profitPercent || 0;

    stats.totalPnl += pnl;
    stats.totalPnlPercent += pnlPercent;

    if (pnl > 0) stats.wins++;
    else if (pnl < 0) stats.losses++;
  });

  // Calculate metrics for each ticker
  const tickerAnalysis: any[] = [];

  tickerPerformance.forEach((stats, ticker) => {
    const winRate = stats.trades.length > 0 ? stats.wins / stats.trades.length : 0;
    const avgPnl = stats.totalPnl / stats.trades.length;
    const avgPnlPercent = stats.totalPnlPercent / stats.trades.length;

    tickerAnalysis.push({
      ticker,
      tradeCount: stats.trades.length,
      wins: stats.wins,
      losses: stats.losses,
      winRate,
      avgPnl,
      avgPnlPercent,
      totalPnl: stats.totalPnl,
      totalPnlPercent: stats.totalPnlPercent
    });
  });

  // Sort by total P&L
  tickerAnalysis.sort((a, b) => b.totalPnl - a.totalPnl);

  console.log('');
  console.log('🏆 Top 20 Tickers by Total P&L:\n');
  console.log('Rank | Ticker | Trades | Win Rate | Avg P&L% | Total P&L% |');
  console.log('-----|--------|--------|----------|----------|------------|');

  tickerAnalysis.slice(0, 20).forEach((ticker, idx) => {
    console.log(
      `${String(idx + 1).padStart(4)} | ` +
      `${ticker.ticker.padEnd(6)} | ` +
      `${String(ticker.tradeCount).padStart(6)} | ` +
      `${(ticker.winRate * 100).toFixed(1).padStart(8)}% | ` +
      `${ticker.avgPnlPercent.toFixed(2).padStart(8)}% | ` +
      `${ticker.totalPnlPercent.toFixed(2).padStart(10)}% |`
    );
  });

  console.log('');

  // Now get stock characteristics from database for filtering
  console.log('💎 Applying Quality Filters...\n');

  // Get tickers that appear in trades
  const tradedTickers = Array.from(tickerPerformance.keys());

  // Get volume and price data for these tickers
  const tickerData = new Map<string, any>();

  for (const ticker of tradedTickers) {
    const volumeData = db.prepare(`
      SELECT
        AVG(volume) as avg_volume,
        AVG(close) as avg_price,
        COUNT(*) as bar_count
      FROM ohlcv_data
      WHERE ticker = ?
      AND timeframe = '1day'
      AND timestamp >= datetime('now', '-60 days')
    `).get(ticker) as any;

    if (volumeData && volumeData.avg_volume) {
      tickerData.set(ticker, {
        avgVolume: volumeData.avg_volume,
        avgPrice: volumeData.avg_price,
        barCount: volumeData.bar_count
      });
    }
  }

  // Apply filters
  const MIN_VOLUME = 500000; // 500K shares/day minimum
  const MIN_PRICE = 15; // Minimum $15
  const MAX_PRICE = 250; // Maximum $250
  const MIN_TRADES = 2; // At least 2 trades to be meaningful

  const filteredTickers = tickerAnalysis.filter(t => {
    const data = tickerData.get(t.ticker);
    if (!data) return false; // No volume data

    return (
      t.tradeCount >= MIN_TRADES &&
      data.avgVolume >= MIN_VOLUME &&
      data.avgPrice >= MIN_PRICE &&
      data.avgPrice <= MAX_PRICE &&
      t.winRate >= 0.5 // At least 50% win rate
    );
  });

  console.log(`Filters Applied:`);
  console.log(`  ✓ Min volume: ${(MIN_VOLUME / 1000000).toFixed(1)}M shares/day`);
  console.log(`  ✓ Price range: $${MIN_PRICE} - $${MAX_PRICE}`);
  console.log(`  ✓ Min trades: ${MIN_TRADES}`);
  console.log(`  ✓ Min win rate: 50%`);
  console.log('');
  console.log(`Tickers passing filters: ${filteredTickers.length} of ${tickerAnalysis.length}`);
  console.log('');

  // Calculate composite quality score
  // Score = (win_rate * 40) + (avg_pnl_percent * 30) + (trade_count * 10) + (volume_score * 20)
  const scoredTickers = filteredTickers.map(t => {
    const data = tickerData.get(t.ticker)!;
    const volumeScore = Math.min(data.avgVolume / 10000000, 10); // Cap at 10M shares = score of 10
    const winRateScore = t.winRate * 40;
    const pnlScore = Math.max(0, t.avgPnlPercent) * 30;
    const frequencyScore = Math.min(t.tradeCount / 5, 10) * 10; // Cap at 5 trades = score of 10

    const qualityScore = winRateScore + pnlScore + frequencyScore + volumeScore;

    return {
      ...t,
      avgVolume: data.avgVolume,
      avgPrice: data.avgPrice,
      qualityScore
    };
  });

  // Sort by quality score
  scoredTickers.sort((a, b) => b.qualityScore - a.qualityScore);

  console.log('🎯 Top 30 Tickers by Quality Score (Recommended Watchlist):\n');
  console.log('Rank | Ticker | Quality | Win Rate | Avg P&L% | Trades | Avg Vol  | Avg Price |');
  console.log('-----|--------|---------|----------|----------|--------|----------|-----------|');

  const top30 = scoredTickers.slice(0, 30);
  top30.forEach((ticker, idx) => {
    console.log(
      `${String(idx + 1).padStart(4)} | ` +
      `${ticker.ticker.padEnd(6)} | ` +
      `${ticker.qualityScore.toFixed(1).padStart(7)} | ` +
      `${(ticker.winRate * 100).toFixed(1).padStart(8)}% | ` +
      `${ticker.avgPnlPercent.toFixed(2).padStart(8)}% | ` +
      `${String(ticker.tradeCount).padStart(6)} | ` +
      `${(ticker.avgVolume / 1000000).toFixed(2).padStart(7)}M | ` +
      `$${ticker.avgPrice.toFixed(2).padStart(7)} |`
    );
  });

  console.log('');

  // Export ticker list
  const exportList = top30.map(t => t.ticker).join(',');
  console.log('📋 Exported Ticker List (copy for paper trading config):\n');
  console.log(exportList);
  console.log('');

  // Save to file
  const fs = require('fs');
  fs.writeFileSync('/tmp/vwap_optimal_watchlist.txt', exportList);
  console.log('✅ Watchlist saved to: /tmp/vwap_optimal_watchlist.txt');
  console.log('');

  // Summary statistics
  const avgWinRate = top30.reduce((sum, t) => sum + t.winRate, 0) / top30.length;
  const avgPnlPercent = top30.reduce((sum, t) => sum + t.avgPnlPercent, 0) / top30.length;
  const totalTrades = top30.reduce((sum, t) => sum + t.tradeCount, 0);
  const avgVolume = top30.reduce((sum, t) => sum + t.avgVolume, 0) / top30.length;

  console.log('📊 Watchlist Summary Statistics:\n');
  console.log(`   Tickers: ${top30.length}`);
  console.log(`   Average Win Rate: ${(avgWinRate * 100).toFixed(1)}%`);
  console.log(`   Average P&L per Trade: ${avgPnlPercent.toFixed(2)}%`);
  console.log(`   Total Trades (historical): ${totalTrades}`);
  console.log(`   Average Daily Volume: ${(avgVolume / 1000000).toFixed(2)}M shares`);
  console.log('');

  console.log('✨ Analysis Complete!\n');
  console.log('Next Steps:');
  console.log('  1. Review the top 30 tickers above');
  console.log('  2. Copy the ticker list to paper trading configuration');
  console.log('  3. Set PAPER_TRADING_ENABLED=true in .env');
  console.log('  4. Start backend to begin paper trading');
  console.log('');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
