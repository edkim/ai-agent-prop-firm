/**
 * Multi-Day Opening Range Breakout Template
 *
 * Supports:
 * - Multiple dates (contiguous or non-contiguous)
 * - Configurable exit time
 * - Aggregated results
 *
 * Template variables:
 * - TICKER: Stock symbol
 * - TIMEFRAME: Bar size (5min, 15min, etc.)
 * - TRADING_DAYS: JSON array of dates ["2025-10-08", "2025-10-09", ...]
 * - EXIT_TIME: Exit time in HH:MM format (e.g., "12:00", "16:00")
 */

import { initializeDatabase, getDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
// Generated scripts are placed in backend/ directory, so __dirname is backend/
// We need to go up one level to reach project root where .env is located
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeOfDay: string;
}

interface TradeResult {
  date: string;
  ticker: string;
  side?: 'LONG' | 'SHORT';
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  highestPrice?: number;
  lowestPrice?: number;
  noTrade?: boolean;
  noTradeReason?: string;
}

async function runMultiDayBacktest() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);

  const db = getDatabase();

  // Configuration (replaced by template generator)
  const ticker = 'TEMPLATE_TICKER';
  const timeframe = 'TEMPLATE_TIMEFRAME';
  const exitTime = 'TEMPLATE_EXIT_TIME';
  const tradingDays: string[] = TEMPLATE_TRADING_DAYS;
  const allowLong = TEMPLATE_ALLOW_LONG;
  const allowShort = TEMPLATE_ALLOW_SHORT;
  const takeProfitPct = TEMPLATE_TAKE_PROFIT_PCT; // e.g., 2 for +2%
  const stopLossPct = TEMPLATE_STOP_LOSS_PCT; // e.g., 1 for -1%
  const openingRangeMinutes = TEMPLATE_OPENING_RANGE_MINUTES; // e.g., 5 for first 5 minutes (9:30-9:35)

  const positionTypes = [];
  if (allowLong) positionTypes.push('LONG');
  if (allowShort) positionTypes.push('SHORT');

  console.log('='.repeat(70));
  console.log(`${ticker} OPENING RANGE BREAKOUT - MULTI-DAY BACKTEST`);
  console.log('='.repeat(70));
  console.log(`Ticker: ${ticker}`);
  console.log(`Strategy: ${timeframe} opening range breakout`);
  console.log(`Positions: ${positionTypes.join(' + ')}`);
  console.log(`Exit: ${exitTime}`);
  console.log(`Trading Days: ${tradingDays.length}`);
  console.log('='.repeat(70));
  console.log('');

  const results: TradeResult[] = [];

  // Run backtest for each day
  for (const date of tradingDays) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Testing ${date}...`);
    console.log('─'.repeat(70));

    const dateStart = new Date(`${date}T00:00:00Z`).getTime();
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dateEnd = nextDate.getTime();

    // Fetch data for this day
    const query = `
      SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
      FROM ohlcv_data
      WHERE ticker = ? AND timeframe = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp ASC
    `;
    const bars = db.prepare(query).all(ticker, timeframe, dateStart, dateEnd) as Bar[];

    if (bars.length === 0) {
      console.log(`⚠️  No data for ${date}`);
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: 'No data available'
      });
      continue;
    }

    console.log(`📊 Loaded ${bars.length} bars`);

    // Find opening range start (9:30 AM)
    const openingRangeStartIndex = bars.findIndex(bar =>
      bar.timeOfDay.startsWith('09:30') || bar.timeOfDay.startsWith('13:30')
    );

    if (openingRangeStartIndex === -1) {
      console.log(`⚠️  No opening bar found for ${date}`);
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: 'No opening bar (9:30 AM)'
      });
      continue;
    }

    // Calculate opening range: get high/low across opening range period
    // Parse timeframe to get bar duration in minutes or seconds
    let barDurationMinutes: number;
    if (timeframe.includes('sec')) {
      // e.g., "10sec" -> 10/60 = 0.1667 minutes
      const seconds = parseInt(timeframe);
      barDurationMinutes = seconds / 60;
    } else {
      // e.g., "5min" -> 5, "1min" -> 1
      barDurationMinutes = parseInt(timeframe) || 5;
    }
    const barsInOpeningRange = Math.ceil(openingRangeMinutes / barDurationMinutes);
    const openingRangeEndIndex = openingRangeStartIndex + barsInOpeningRange - 1;

    // Calculate high and low across all bars in opening range
    let openingRangeHigh = -Infinity;
    let openingRangeLow = Infinity;
    for (let i = openingRangeStartIndex; i <= openingRangeEndIndex && i < bars.length; i++) {
      openingRangeHigh = Math.max(openingRangeHigh, bars[i].high);
      openingRangeLow = Math.min(openingRangeLow, bars[i].low);
    }

    const openingRangeEndTime = bars[Math.min(openingRangeEndIndex, bars.length - 1)].timeOfDay;
    console.log(`📈 Opening Range (${openingRangeMinutes}min, ${bars[openingRangeStartIndex].timeOfDay}-${openingRangeEndTime}): H=$${openingRangeHigh.toFixed(2)} L=$${openingRangeLow.toFixed(2)}`);

    // Find exit bar based on configured exit time
    const exitBarIndex = bars.findIndex(bar => {
      // Convert exit time to match format (handle both local "12:00" and UTC "16:00")
      // Use startsWith to handle both HH:MM and HH:MM:SS formats
      return bar.timeOfDay.startsWith(exitTime) ||
             bar.timeOfDay.startsWith('16:00') || // Default market close
             bar.timeOfDay.startsWith('20:00');   // UTC market close
    });
    const endIndex = exitBarIndex !== -1 ? exitBarIndex : bars.length - 1;

    // Track positions (can have both long and short)
    let longPosition: { entry: number; entryTime: string; entryBar: Bar; highestPrice: number } | null = null;
    let shortPosition: { entry: number; entryTime: string; entryBar: Bar; lowestPrice: number } | null = null;
    let longExitBar: Bar | null = null;
    let shortExitBar: Bar | null = null;
    let longExitPrice: number | null = null; // Actual exit price (TP/SL price or bar close)
    let shortExitPrice: number | null = null;
    let longExitReason = '';
    let shortExitReason = '';

    // Signal tracking for next-bar entry (more realistic execution)
    let longSignalDetected = false;
    let shortSignalDetected = false;

    // Look for breakout/breakdown AFTER opening range period
    for (let i = openingRangeEndIndex + 1; i <= endIndex; i++) {
      const bar = bars[i];

      // Execute pending LONG entry from previous bar's signal
      if (allowLong && !longPosition && longSignalDetected) {
        longPosition = {
          entry: bar.open,  // Enter at OPEN of this bar
          entryTime: bar.timeOfDay,
          entryBar: bar,
          highestPrice: bar.high
        };
        console.log(`🚀 LONG entry executed at ${bar.timeOfDay}: $${longPosition.entry.toFixed(2)}`);
        longSignalDetected = false; // Clear signal
      }

      // Execute pending SHORT entry from previous bar's signal
      if (allowShort && !shortPosition && shortSignalDetected) {
        shortPosition = {
          entry: bar.open,  // Enter at OPEN of this bar
          entryTime: bar.timeOfDay,
          entryBar: bar,
          lowestPrice: bar.low
        };
        console.log(`🚀 SHORT entry executed at ${bar.timeOfDay}: $${shortPosition.entry.toFixed(2)}`);
        shortSignalDetected = false; // Clear signal
      }

      // Detect LONG signal (breakout above opening range high)
      if (allowLong && !longPosition && !longSignalDetected && bar.high > openingRangeHigh) {
        longSignalDetected = true;
        console.log(`🔔 LONG signal detected at ${bar.timeOfDay} (high: $${bar.high.toFixed(2)} > $${openingRangeHigh.toFixed(2)})`);
      }

      // Detect SHORT signal (breakdown below opening range low)
      if (allowShort && !shortPosition && !shortSignalDetected && bar.low < openingRangeLow) {
        shortSignalDetected = true;
        console.log(`🔔 SHORT signal detected at ${bar.timeOfDay} (low: $${bar.low.toFixed(2)} < $${openingRangeLow.toFixed(2)})`);
      }

      // Track highest/lowest prices for analysis
      if (longPosition && bar.high > longPosition.highestPrice) {
        longPosition.highestPrice = bar.high;
      }
      if (shortPosition && bar.low < shortPosition.lowestPrice) {
        shortPosition.lowestPrice = bar.low;
      }

      // LONG Take Profit / Stop Loss checks
      if (longPosition && !longExitBar) {
        const takeProfitPrice = longPosition.entry * (1 + takeProfitPct / 100);
        const stopLossPrice = longPosition.entry * (1 - stopLossPct / 100);

        // Check take profit (use high since we hit it during the bar)
        if (takeProfitPct > 0 && bar.high >= takeProfitPrice) {
          longExitBar = bar;
          longExitPrice = takeProfitPrice; // Use actual TP price
          longExitReason = `Take Profit (+${takeProfitPct}%)`;
          console.log(`✅ LONG Take Profit hit at ${bar.timeOfDay}: $${takeProfitPrice.toFixed(2)}`);
        }
        // Check stop loss (use low since we hit it during the bar)
        else if (stopLossPct > 0 && bar.low <= stopLossPrice) {
          longExitBar = bar;
          longExitPrice = stopLossPrice; // Use actual SL price
          longExitReason = `Stop Loss (-${stopLossPct}%)`;
          console.log(`🛑 LONG Stop Loss hit at ${bar.timeOfDay}: $${stopLossPrice.toFixed(2)}`);
        }
      }

      // SHORT Take Profit / Stop Loss checks
      if (shortPosition && !shortExitBar) {
        const takeProfitPrice = shortPosition.entry * (1 - takeProfitPct / 100);
        const stopLossPrice = shortPosition.entry * (1 + stopLossPct / 100);

        // Check take profit (use low since we're short)
        if (takeProfitPct > 0 && bar.low <= takeProfitPrice) {
          shortExitBar = bar;
          shortExitPrice = takeProfitPrice; // Use actual TP price
          shortExitReason = `Take Profit (+${takeProfitPct}%)`;
          console.log(`✅ SHORT Take Profit hit at ${bar.timeOfDay}: $${takeProfitPrice.toFixed(2)}`);
        }
        // Check stop loss (use high since we're short)
        else if (stopLossPct > 0 && bar.high >= stopLossPrice) {
          shortExitBar = bar;
          shortExitPrice = stopLossPrice; // Use actual SL price
          shortExitReason = `Stop Loss (-${stopLossPct}%)`;
          console.log(`🛑 SHORT Stop Loss hit at ${bar.timeOfDay}: $${stopLossPrice.toFixed(2)}`);
        }
      }

      // Exit at configured time if positions still open
      if (longPosition && !longExitBar && bar.timeOfDay.startsWith(exitTime)) {
        longExitBar = bar;
        longExitReason = `Exit at ${exitTime}`;
      }
      if (shortPosition && !shortExitBar && bar.timeOfDay.startsWith(exitTime)) {
        shortExitBar = bar;
        shortExitReason = `Exit at ${exitTime}`;
      }

      // Early exit if both positions are closed
      if (longPosition && longExitBar && shortPosition && shortExitBar) {
        break;
      }
      if (longPosition && longExitBar && !allowShort) {
        break;
      }
      if (shortPosition && shortExitBar && !allowLong) {
        break;
      }
    }

    // If positions still open, exit at last available bar
    if (longPosition && !longExitBar) {
      longExitBar = bars[endIndex];
      longExitReason = 'End of data';
    }
    if (shortPosition && !shortExitBar) {
      shortExitBar = bars[endIndex];
      shortExitReason = 'End of data';
    }

    // Calculate results for LONG position
    if (longPosition && longExitBar) {
      // Use actual TP/SL price if set, otherwise use bar close
      const exitPrice = longExitPrice !== null ? longExitPrice : longExitBar.close;
      const pnl = exitPrice - longPosition.entry;
      const pnlPercent = (pnl / longPosition.entry) * 100;

      console.log(`📤 LONG EXIT at ${longExitBar.timeOfDay}: $${exitPrice.toFixed(2)}`);
      console.log(`💰 LONG P&L: $${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) - ${pnl > 0 ? '✅ WIN' : pnl < 0 ? '❌ LOSS' : '⚪ BREAK-EVEN'}`);

      results.push({
        date,
        ticker,
        side: 'LONG',
        entryTime: longPosition.entryTime,
        entryPrice: longPosition.entry,
        exitTime: longExitBar.timeOfDay,
        exitPrice,
        pnl,
        pnlPercent,
        exitReason: longExitReason,
        highestPrice: longPosition.highestPrice
      });
    }

    // Calculate results for SHORT position
    if (shortPosition && shortExitBar) {
      // Use actual TP/SL price if set, otherwise use bar close
      const exitPrice = shortExitPrice !== null ? shortExitPrice : shortExitBar.close;
      // For shorts, profit = entry - exit (opposite of longs)
      const pnl = shortPosition.entry - exitPrice;
      const pnlPercent = (pnl / shortPosition.entry) * 100;

      console.log(`📤 SHORT EXIT at ${shortExitBar.timeOfDay}: $${exitPrice.toFixed(2)}`);
      console.log(`💰 SHORT P&L: $${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) - ${pnl > 0 ? '✅ WIN' : pnl < 0 ? '❌ LOSS' : '⚪ BREAK-EVEN'}`);

      results.push({
        date,
        ticker,
        side: 'SHORT',
        entryTime: shortPosition.entryTime,
        entryPrice: shortPosition.entry,
        exitTime: shortExitBar.timeOfDay,
        exitPrice,
        pnl,
        pnlPercent,
        exitReason: shortExitReason,
        lowestPrice: shortPosition.lowestPrice
      });
    }

    // No trades taken
    if (!longPosition && !shortPosition) {
      const reasons = [];
      if (allowLong) reasons.push(`no breakout above $${openingRangeHigh.toFixed(2)}`);
      if (allowShort) reasons.push(`no breakdown below $${openingRangeLow.toFixed(2)}`);
      console.log(`❌ NO TRADE - ${reasons.join(' and ')}`);
      results.push({
        date,
        ticker,
        noTrade: true,
        noTradeReason: reasons.join(' and ')
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`SUMMARY - ${ticker} ORB BACKTEST RESULTS`);
  console.log('='.repeat(70));

  const trades = results.filter(r => !r.noTrade);
  const longTrades = trades.filter(r => r.side === 'LONG');
  const shortTrades = trades.filter(r => r.side === 'SHORT');

  const winners = trades.filter(r => r.pnl! > 0);
  const losers = trades.filter(r => r.pnl! < 0);
  const totalPnL = trades.reduce((sum, r) => sum + (r.pnl || 0), 0);
  const avgPnL = trades.length > 0 ? totalPnL / trades.length : 0;
  const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;

  console.log(`\nTotal Days Tested: ${tradingDays.length}`);
  console.log(`Total Trades: ${trades.length} (Long: ${longTrades.length}, Short: ${shortTrades.length})`);
  console.log(`No Trade Days: ${results.filter(r => r.noTrade).length}`);
  console.log('');

  // Overall stats
  console.log(`Overall Winners: ${winners.length}`);
  console.log(`Overall Losers: ${losers.length}`);
  console.log(`Overall Win Rate: ${winRate.toFixed(1)}%`);
  console.log(`Overall Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`Overall Average P&L per trade: $${avgPnL.toFixed(2)}`);
  console.log('');

  // Long stats
  if (longTrades.length > 0) {
    const longWinners = longTrades.filter(r => r.pnl! > 0);
    const longLosers = longTrades.filter(r => r.pnl! < 0);
    const longPnL = longTrades.reduce((sum, r) => sum + (r.pnl || 0), 0);
    const longWinRate = (longWinners.length / longTrades.length) * 100;
    const longAvgPnL = longPnL / longTrades.length;

    console.log(`LONG Trades: ${longTrades.length}`);
    console.log(`LONG Winners: ${longWinners.length}`);
    console.log(`LONG Losers: ${longLosers.length}`);
    console.log(`LONG Win Rate: ${longWinRate.toFixed(1)}%`);
    console.log(`LONG Total P&L: $${longPnL.toFixed(2)}`);
    console.log(`LONG Average P&L: $${longAvgPnL.toFixed(2)}`);
    console.log('');
  }

  // Short stats
  if (shortTrades.length > 0) {
    const shortWinners = shortTrades.filter(r => r.pnl! > 0);
    const shortLosers = shortTrades.filter(r => r.pnl! < 0);
    const shortPnL = shortTrades.reduce((sum, r) => sum + (r.pnl || 0), 0);
    const shortWinRate = (shortWinners.length / shortTrades.length) * 100;
    const shortAvgPnL = shortPnL / shortTrades.length;

    console.log(`SHORT Trades: ${shortTrades.length}`);
    console.log(`SHORT Winners: ${shortWinners.length}`);
    console.log(`SHORT Losers: ${shortLosers.length}`);
    console.log(`SHORT Win Rate: ${shortWinRate.toFixed(1)}%`);
    console.log(`SHORT Total P&L: $${shortPnL.toFixed(2)}`);
    console.log(`SHORT Average P&L: $${shortAvgPnL.toFixed(2)}`);
    console.log('');
  }

  // Trade-by-trade breakdown
  console.log('TRADE-BY-TRADE BREAKDOWN:');
  console.log('─'.repeat(70));

  // Group by date to show multiple trades per day together
  const tradesByDate = new Map<string, TradeResult[]>();
  results.forEach(result => {
    if (!tradesByDate.has(result.date)) {
      tradesByDate.set(result.date, []);
    }
    tradesByDate.get(result.date)!.push(result);
  });

  let index = 1;
  tradingDays.forEach(date => {
    const dayResults = tradesByDate.get(date) || [];
    if (dayResults.length === 0 || dayResults.every(r => r.noTrade)) {
      const noTradeResult = dayResults.find(r => r.noTrade);
      console.log(`${index}. ${date}: NO TRADE (${noTradeResult?.noTradeReason || 'unknown'})`);
    } else {
      dayResults.forEach((result, i) => {
        if (!result.noTrade) {
          const outcome = result.pnl! > 0 ? '✅ WIN' : result.pnl! < 0 ? '❌ LOSS' : '⚪ EVEN';
          const prefix = dayResults.length > 1 ? `${index}.${i + 1}` : `${index}`;
          console.log(`${prefix}. ${result.date} [${result.side}]: ${outcome} - Entry: $${result.entryPrice!.toFixed(2)} (${result.entryTime}) → Exit: $${result.exitPrice!.toFixed(2)} (${result.exitTime}) = $${result.pnl!.toFixed(2)} (${result.pnlPercent!.toFixed(2)}%)`);
        }
      });
    }
    index++;
  });

  console.log('='.repeat(70));

  // Output JSON for parsing
  const jsonOutput = {
    backtest: {
      ticker,
      strategy: 'Opening Range Breakout (Multi-Day)',
      exitTime,
      config: {
        timeframe,
        exitTime,
        daysTest: tradingDays.length,
        allowLong,
        allowShort
      }
    },
    trades: trades.map(t => ({
      date: t.date,
      side: t.side,
      entry_time: t.entryTime,
      entry_price: t.entryPrice,
      exit_time: t.exitTime,
      exit_price: t.exitPrice,
      pnl: t.pnl,
      pnl_percent: t.pnlPercent,
      exit_reason: t.exitReason,
      highest_price: t.highestPrice,
      lowest_price: t.lowestPrice
    })),
    metrics: {
      total_days: tradingDays.length,
      total_trades: trades.length,
      long_trades: longTrades.length,
      short_trades: shortTrades.length,
      no_trade_days: results.filter(r => r.noTrade).length,
      winning_trades: winners.length,
      losing_trades: losers.length,
      win_rate: winRate,
      total_pnl: totalPnL,
      total_pnl_percent: trades.length > 0 ? (totalPnL / trades.reduce((sum, t) => sum + t.entryPrice!, 0)) * 100 : 0,
      average_pnl: avgPnL,
      ...(longTrades.length > 0 && {
        long_metrics: {
          trades: longTrades.length,
          winners: longTrades.filter(r => r.pnl! > 0).length,
          losers: longTrades.filter(r => r.pnl! < 0).length,
          win_rate: (longTrades.filter(r => r.pnl! > 0).length / longTrades.length) * 100,
          total_pnl: longTrades.reduce((sum, r) => sum + (r.pnl || 0), 0),
          average_pnl: longTrades.reduce((sum, r) => sum + (r.pnl || 0), 0) / longTrades.length
        }
      }),
      ...(shortTrades.length > 0 && {
        short_metrics: {
          trades: shortTrades.length,
          winners: shortTrades.filter(r => r.pnl! > 0).length,
          losers: shortTrades.filter(r => r.pnl! < 0).length,
          win_rate: (shortTrades.filter(r => r.pnl! > 0).length / shortTrades.length) * 100,
          total_pnl: shortTrades.reduce((sum, r) => sum + (r.pnl || 0), 0),
          average_pnl: shortTrades.reduce((sum, r) => sum + (r.pnl || 0), 0) / shortTrades.length
        }
      })
    },
    summary: `Tested ${tradingDays.length} days, took ${trades.length} trades (${longTrades.length} long, ${shortTrades.length} short) with ${winRate.toFixed(1)}% win rate. Total P&L: $${totalPnL.toFixed(2)}`
  };

  console.log('\nJSON_OUTPUT:');
  console.log(JSON.stringify(jsonOutput, null, 2));
}

runMultiDayBacktest().catch(console.error);
