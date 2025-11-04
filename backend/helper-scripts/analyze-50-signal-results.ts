/**
 * Analyze 50-signal backtest results
 * Re-analyzes the JSON output with correct field handling
 */

import * as fs from 'fs';

const resultsFile = '/tmp/vwap-50-signal-backtest-results.json';
const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

console.log('\n' + '='.repeat(80));
console.log('📊 TICKER PERFORMANCE ANALYSIS (Re-analyzed)');
console.log('='.repeat(80) + '\n');

const tickerStats: { [ticker: string]: any } = {};

// Analyze trades by ticker with correct field names
for (const trade of results.allTrades) {
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

  // Handle both naming conventions
  const pnl = trade.pnl || 0;
  const pnlPct = trade.pnl_percent || trade.pnlPercent || 0;

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

// Sort by total P&L %
tickerAnalysis.sort((a, b) => b.totalPnlPct - a.totalPnlPct);

console.log('Top 30 Tickers by Total P&L%:\n');
console.log('Rank | Ticker | Trades | Win Rate | Avg P&L% | Total P&L% |');
console.log('-----|--------|--------|----------|----------|------------|');

tickerAnalysis.slice(0, 30).forEach((t, idx) => {
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
console.log('💡 WATCHLIST RECOMMENDATIONS');
console.log('='.repeat(80) + '\n');

// Filter for good performers
const goodTickers = tickerAnalysis.filter(t =>
  t.winRate >= 0.7 &&       // 70%+ win rate
  t.avgPnlPct >= 0.5 &&     // 0.5%+ avg P&L
  t.trades >= 5             // At least 5 trades
);

console.log(`Found ${goodTickers.length} high-quality tickers with:`);
console.log(`  - Win rate >= 70%`);
console.log(`  - Avg P&L >= 0.5%`);
console.log(`  - At least 5 trades`);
console.log('');

if (goodTickers.length > 0) {
  console.log('🎯 Recommended Watchlist (High Quality):');
  console.log(goodTickers.map(t => t.ticker).join(', '));
  console.log('');
}

// Also find moderate performers
const moderateTickers = tickerAnalysis.filter(t =>
  t.winRate >= 0.6 &&       // 60%+ win rate
  t.avgPnlPct >= 0.3 &&     // 0.3%+ avg P&L
  t.trades >= 3 &&          // At least 3 trades
  !goodTickers.includes(t)  // Not already in good tickers
);

console.log(`\nFound ${moderateTickers.length} moderate performers with:`);
console.log(`  - Win rate >= 60%`);
console.log(`  - Avg P&L >= 0.3%`);
console.log(`  - At least 3 trades`);
console.log('');

if (moderateTickers.length > 0) {
  console.log('📊 Additional Candidates (Moderate Quality):');
  console.log(moderateTickers.map(t => t.ticker).join(', '));
  console.log('');
}

// Compare with original watchlist
console.log('\n' + '='.repeat(80));
console.log('🔍 COMPARISON WITH ORIGINAL WATCHLIST');
console.log('='.repeat(80) + '\n');

const originalWatchlist = [
  "PPTA","AEHR","SMLR","RGTI","ORKA","JANX","BKSY","QBTS","APLD","PDEX",
  "BEAM","AAOI","CLPT","STOK","QUBT","BTDR","BBNX","OUST","CLSK","LTBR",
  "SION","SRRK","TWST","SMR","NGNE","RAPP","MAZE","NTLA","SNWV","FUN",
  "SYRE","UUUU","RIOT","LQDA","SOUN","LENZ","MARA","HUT","BYRN","TVTX",
  "BTU","SEI","FWRD","TNXP","VOYG","OSCR","TSSI","CIFR","SEPN","PGY"
];

const backtestedTickers = tickerAnalysis.map(t => t.ticker);
const inOriginal = backtestedTickers.filter(t => originalWatchlist.includes(t));
const notInOriginal = backtestedTickers.filter(t => !originalWatchlist.includes(t));

console.log(`Tickers backtested that ARE in original watchlist (${inOriginal.length}):`);
if (inOriginal.length > 0) {
  const inOriginalWithStats = inOriginal.map(ticker => {
    const stats = tickerAnalysis.find(t => t.ticker === ticker);
    return `${ticker} (${(stats.winRate*100).toFixed(0)}% WR, ${stats.avgPnlPct.toFixed(2)}% avg)`;
  });
  console.log(inOriginalWithStats.join(', '));
}
console.log('');

console.log(`Tickers backtested that are NOT in original watchlist (${notInOriginal.length}):`);
if (notInOriginal.length > 0) {
  const notInOriginalWithStats = notInOriginal.slice(0, 10).map(ticker => {
    const stats = tickerAnalysis.find(t => t.ticker === ticker);
    return `${ticker} (${(stats.winRate*100).toFixed(0)}% WR, ${stats.avgPnlPct.toFixed(2)}% avg)`;
  });
  console.log(notInOriginalWithStats.join(', '));
  if (notInOriginal.length > 10) {
    console.log(`... and ${notInOriginal.length - 10} more`);
  }
}
console.log('');

// Summary statistics
console.log('\n' + '='.repeat(80));
console.log('📈 OVERALL STATISTICS');
console.log('='.repeat(80) + '\n');

const allWinRate = tickerAnalysis.reduce((sum, t) => sum + (t.winRate * t.trades), 0) /
                   tickerAnalysis.reduce((sum, t) => sum + t.trades, 0);
const allAvgPnl = tickerAnalysis.reduce((sum, t) => sum + (t.avgPnlPct * t.trades), 0) /
                  tickerAnalysis.reduce((sum, t) => sum + t.trades, 0);

console.log(`Total tickers tested: ${tickerAnalysis.length}`);
console.log(`Total trades: ${results.allTrades.length}`);
console.log(`Overall win rate: ${(allWinRate * 100).toFixed(1)}%`);
console.log(`Overall avg P&L: ${allAvgPnl.toFixed(2)}%`);
console.log('');

console.log('✨ Analysis complete!\n');
