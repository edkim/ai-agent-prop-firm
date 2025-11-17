import { ExecutionTemplate } from './template.interface';

/**
 * Gap Fill VWAP Execution Template
 *
 * Optimized for gap-down VWAP reclaim patterns.
 * Strategy: Mean reversion after panic selling, targeting gap fill.
 *
 * Entry: After gap down + VWAP reclaim (bullish reversal)
 * Exit Logic:
 *  - Primary target: Previous day close (gap fill) - take 70% profit
 *  - Secondary target: 50% gap fill - take 30% profit
 *  - Stop loss: Break below VWAP + buffer (thesis invalidated)
 *  - Trailing stop: Lock in 50% of unrealized gains once > 1.5% profitable
 *  - Time exit: Market close (15:55 ET)
 */
export const gapFillVWAPTemplate: ExecutionTemplate = {
  name: 'Gap Fill VWAP Mean Reversion',
  description: 'Targets gap fill after VWAP reclaim with VWAP-based stop loss and partial profit taking.',
  category: 'price_action',

  parameters: {
    // Primary target: % of gap to fill for first exit (70% position)
    gapFillTargetPct: 90,  // Exit 70% at 90% gap fill

    // Secondary target: % of gap to fill for second exit (30% position)
    partialGapFillPct: 50, // Exit 30% at 50% gap fill

    // Stop loss: % below VWAP when price breaks below
    vwapStopBuffer: 0.3,   // Stop if price goes 0.3% below VWAP

    // Hard stop: Maximum loss before VWAP calculation
    hardStopPct: 2.5,      // Hard stop at -2.5% from entry

    // Trailing stop: Lock in X% of unrealized gains once > threshold
    trailingStopPct: 50,   // Lock in 50% of gains
    trailingActivateThreshold: 1.5, // Activate trailing at +1.5% profit

    // Time-based exit
    exitTimeET: '15:55:00', // Exit at 15:55 ET (market close)

    // Re-entry prevention: Don't re-enter if VWAP breaks after entry
    preventReentry: true
  },

  metadata: {
    idealFor: [
      'Gap-down VWAP reclaim patterns',
      'Mean reversion after panic selling',
      'Intraday gap fill trades',
      'High volume gap-down recoveries'
    ],
    riskLevel: 'medium',
    avgHoldTime: '2-4 hours',
    winRateTarget: 60
  },

  generateExecutionCode(): string {
    const {
      gapFillTargetPct,
      partialGapFillPct,
      vwapStopBuffer,
      hardStopPct,
      trailingStopPct,
      trailingActivateThreshold,
      exitTimeET,
      preventReentry
    } = this.parameters;

    return `
    // Gap Fill VWAP Mean Reversion Strategy
    // Optimized for gap-down VWAP reclaim patterns

    // Helper: Calculate VWAP for bars up to current index
    function calculateVWAP(bars: Bar[], upToIndex: number): number {
      let cumVolume = 0;
      let cumVolumePrice = 0;

      for (let i = 0; i <= upToIndex; i++) {
        const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
        cumVolumePrice += typical * bars[i].volume;
        cumVolume += bars[i].volume;
      }

      return cumVolume > 0 ? cumVolumePrice / cumVolume : 0;
    }

    for (const signal of SCANNER_SIGNALS) {
      const { ticker: sigTicker, signal_date, signal_time, gap_percent } = signal;

      // Get previous day's close for gap calculation
      const prevDate = new Date(signal_date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];

      const prevDateStart = new Date(\`\${prevDateStr}T00:00:00Z\`).getTime();
      const prevDateEnd = new Date(signal_date + 'T00:00:00Z').getTime();

      const prevDayBars = db.prepare(\`
        SELECT timestamp, open, high, low, close, volume
        FROM ohlcv_data
        WHERE ticker = ? AND timeframe = ?
          AND timestamp >= ? AND timestamp < ?
        ORDER BY timestamp DESC
        LIMIT 1
      \`).all(sigTicker, timeframe, prevDateStart, prevDateEnd) as Bar[];

      if (prevDayBars.length === 0) {
        results.push({
          date: signal_date,
          ticker: sigTicker,
          noTrade: true,
          noTradeReason: 'No previous day close data'
        });
        continue;
      }

      const prevClose = prevDayBars[0].close;

      // Get signal day bars
      const dateStart = new Date(\`\${signal_date}T00:00:00Z\`).getTime();
      const nextDate = new Date(signal_date);
      nextDate.setDate(nextDate.getDate() + 1);
      const dateEnd = nextDate.getTime();

      const bars = db.prepare(\`
        SELECT timestamp, open, high, low, close, volume, time_of_day as timeOfDay
        FROM ohlcv_data
        WHERE ticker = ? AND timeframe = ?
          AND timestamp >= ? AND timestamp < ?
        ORDER BY timestamp ASC
      \`).all(sigTicker, timeframe, dateStart, dateEnd) as Bar[];

      if (bars.length === 0) {
        results.push({
          date: signal_date,
          ticker: sigTicker,
          noTrade: true,
          noTradeReason: 'No data available'
        });
        continue;
      }

      const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signal_time);

      if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
        results.push({
          date: signal_date,
          ticker: sigTicker,
          noTrade: true,
          noTradeReason: 'Signal too late in session'
        });
        continue;
      }

      // Entry on next bar after signal
      const entryBar = bars[signalBarIndex + 1];
      const entryPrice = entryBar.open;
      const openPrice = bars[0].open;
      const gapSize = prevClose - openPrice;

      // Calculate target prices
      const fullGapFillTarget = openPrice + (gapSize * ${gapFillTargetPct} / 100);
      const partialGapFillTarget = openPrice + (gapSize * ${partialGapFillPct} / 100);
      const hardStop = entryPrice * (1 - ${hardStopPct} / 100);

      let position = {
        entry: entryPrice,
        entryTime: entryBar.timeOfDay,
        highestPrice: entryBar.high,
        lowestPrice: entryBar.low,
        remainingShares: 1.0, // Track position size (1.0 = 100%, 0.3 = 30%)
        partialExited: false,
        trailingStop: null as number | null,
        exitDetails: [] as any[]
      };

      let exitTriggered = false;

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        // Calculate current VWAP
        const vwap = calculateVWAP(bars, i);
        const vwapStop = vwap * (1 - ${vwapStopBuffer} / 100);

        // Current P&L
        const unrealizedPnl = ((bar.close - position.entry) / position.entry) * 100;

        // Activate trailing stop if profitable enough
        if (unrealizedPnl >= ${trailingActivateThreshold}) {
          const maxGain = ((position.highestPrice - position.entry) / position.entry) * 100;
          const trailingLevel = position.entry * (1 + (maxGain * (1 - ${trailingStopPct} / 100) / 100));

          if (position.trailingStop === null) {
            position.trailingStop = trailingLevel;
          } else {
            position.trailingStop = Math.max(position.trailingStop, trailingLevel);
          }
        }

        let exitPrice = bar.close;
        let exitReason = '';
        let exitSize = 0; // What % of position to exit

        // Check exit conditions (in priority order)

        // 1. Hard stop loss (immediate full exit)
        if (bar.low <= hardStop) {
          exitTriggered = true;
          exitPrice = hardStop;
          exitReason = 'Hard stop loss';
          exitSize = position.remainingShares;
        }
        // 2. VWAP breakdown stop (thesis invalidated)
        else if (bar.low <= vwapStop) {
          exitTriggered = true;
          exitPrice = vwapStop;
          exitReason = 'VWAP breakdown';
          exitSize = position.remainingShares;
        }
        // 3. Trailing stop hit
        else if (position.trailingStop !== null && bar.low <= position.trailingStop) {
          exitTriggered = true;
          exitPrice = position.trailingStop;
          exitReason = 'Trailing stop';
          exitSize = position.remainingShares;
        }
        // 4. Full gap fill target (exit 70% of position)
        else if (!position.partialExited && bar.high >= fullGapFillTarget) {
          exitPrice = fullGapFillTarget;
          exitReason = 'Primary target (90% gap fill)';
          exitSize = 0.7;
          position.remainingShares -= 0.7;
          position.partialExited = true;
          position.exitDetails.push({
            time: bar.timeOfDay,
            price: exitPrice,
            reason: exitReason,
            size: exitSize
          });
          // Continue holding remaining 30%
        }
        // 5. Partial gap fill target (exit 30% of position)
        else if (!position.partialExited && bar.high >= partialGapFillTarget) {
          exitPrice = partialGapFillTarget;
          exitReason = 'Partial target (50% gap fill)';
          exitSize = 0.3;
          position.remainingShares -= 0.3;
          position.partialExited = true;
          position.exitDetails.push({
            time: bar.timeOfDay,
            price: exitPrice,
            reason: exitReason,
            size: exitSize
          });
          // Continue holding remaining 70%
        }
        // 6. Market close (exit all remaining position)
        else if (bar.timeOfDay >= '${exitTimeET}') {
          exitTriggered = true;
          exitPrice = bar.close;
          exitReason = 'Market close';
          exitSize = position.remainingShares;
        }

        // Full exit or final partial exit
        if (exitTriggered && exitSize > 0) {
          position.exitDetails.push({
            time: bar.timeOfDay,
            price: exitPrice,
            reason: exitReason,
            size: exitSize
          });

          // Calculate weighted average exit price
          const avgExitPrice = position.exitDetails.reduce((sum, exit) =>
            sum + (exit.price * exit.size), 0
          );

          // Position sizing: $10,000 trade size
          const TRADE_SIZE = 10000;
          const quantity = Math.floor(TRADE_SIZE / position.entry);
          const pnlPerShare = avgExitPrice - position.entry;
          const pnl = pnlPerShare * quantity;
          const pnlPercent = (pnlPerShare / position.entry) * 100;

          results.push({
            date: signal_date,
            ticker: sigTicker,
            side: 'LONG',
            entryTime: position.entryTime,
            entryPrice: position.entry,
            exitTime: bar.timeOfDay,
            exitPrice: avgExitPrice,
            quantity,
            pnl,
            pnlPercent,
            exitReason: exitReason + (position.exitDetails.length > 1 ? ' (scaled exit)' : ''),
            highestPrice: position.highestPrice,
            lowestPrice: position.lowestPrice,
            gapSize: Math.abs(gap_percent || 0),
            prevClose,
            exitDetails: position.exitDetails
          });
          break;
        }
      }

      if (!exitTriggered) {
        results.push({
          date: signal_date,
          ticker: sigTicker,
          noTrade: true,
          noTradeReason: 'Position not closed'
        });
      }
    }
    `;
  }
};
