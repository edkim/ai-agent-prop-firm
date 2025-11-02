import { ExecutionTemplate } from './template.interface';

/**
 * Aggressive Swing Template
 *
 * Wide stops, trailing profit capture. Optimized for profit factor.
 * Lets winners run while protecting with trailing stops once profitable.
 */
export const aggressiveTemplate: ExecutionTemplate = {
  name: 'Aggressive Swing',
  description: 'Wide stops, trailing profit capture. Optimized for profit factor.',
  category: 'swing',

  parameters: {
    stopLossPct: 2.5,
    takeProfitPct: 5.0,
    trailingStopPct: 1.5,
    activateTrailingAt: 2.0  // Start trailing after +2% profit
  },

  metadata: {
    idealFor: [
      'Strong directional patterns',
      'High conviction setups',
      'Larger account sizes'
    ],
    riskLevel: 'high',
    avgHoldTime: '2-4 hours',
    winRateTarget: 45
  },

  generateExecutionCode(): string {
    const { stopLossPct, takeProfitPct, trailingStopPct, activateTrailingAt } = this.parameters;

    return `
    // Aggressive Swing Strategy
    // Wide stops, let winners run

    for (const signal of SCANNER_SIGNALS) {
      const { ticker: sigTicker, signal_date, signal_time } = signal;

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
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'No data available' });
        continue;
      }

      const signalBarIndex = bars.findIndex((b: Bar) => b.timeOfDay >= signal_time);

      if (signalBarIndex === -1 || signalBarIndex >= bars.length - 1) {
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'Signal too late in session' });
        continue;
      }

      const side: 'LONG' | 'SHORT' = 'SHORT';

      const entryBar = bars[signalBarIndex + 1];
      let position = {
        side,
        entry: entryBar.open,
        entryTime: entryBar.timeOfDay,
        highestPrice: entryBar.high,
        lowestPrice: entryBar.low,
        trailingStop: null as number | null,
        trailingActive: false
      };

      let exitTriggered = false;

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        let exitPrice = bar.close;
        let exitReason = '';

        if (side === 'LONG') {
          const stopLoss = position.entry * (1 - ${stopLossPct} / 100);
          const takeProfit = position.entry * (1 + ${takeProfitPct} / 100);
          const profitPct = ((bar.close - position.entry) / position.entry) * 100;

          // Activate trailing stop once we hit activation threshold
          if (!position.trailingActive && profitPct >= ${activateTrailingAt}) {
            position.trailingActive = true;
            position.trailingStop = bar.close * (1 - ${trailingStopPct} / 100);
          }

          // Update trailing stop if active
          if (position.trailingActive && position.trailingStop !== null) {
            position.trailingStop = Math.max(position.trailingStop, bar.close * (1 - ${trailingStopPct} / 100));
          }

          if (bar.low <= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (position.trailingActive && position.trailingStop !== null && bar.low <= position.trailingStop) {
            exitTriggered = true;
            exitPrice = position.trailingStop;
            exitReason = 'Trailing stop';
          } else if (bar.high >= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitReason = 'Take profit';
          } else if (bar.timeOfDay >= '15:55:00') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Market close';
          }
        } else {
          const stopLoss = position.entry * (1 + ${stopLossPct} / 100);
          const takeProfit = position.entry * (1 - ${takeProfitPct} / 100);
          const profitPct = ((position.entry - bar.close) / position.entry) * 100;

          // Activate trailing stop once we hit activation threshold
          if (!position.trailingActive && profitPct >= ${activateTrailingAt}) {
            position.trailingActive = true;
            position.trailingStop = bar.close * (1 + ${trailingStopPct} / 100);
          }

          // Update trailing stop if active
          if (position.trailingActive && position.trailingStop !== null) {
            position.trailingStop = Math.min(position.trailingStop, bar.close * (1 + ${trailingStopPct} / 100));
          }

          if (bar.high >= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (position.trailingActive && position.trailingStop !== null && bar.high >= position.trailingStop) {
            exitTriggered = true;
            exitPrice = position.trailingStop;
            exitReason = 'Trailing stop';
          } else if (bar.low <= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitReason = 'Take profit';
          } else if (bar.timeOfDay >= '15:55:00') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Market close';
          }
        }

        if (exitTriggered) {
          const pnl = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
          results.push({
            date: signal_date,
            ticker: sigTicker,
            side,
            entryTime: position.entryTime,
            entryPrice: position.entry,
            exitTime: bar.timeOfDay,
            exitPrice,
            pnl,
            pnlPercent: (pnl / position.entry) * 100,
            exitReason,
            highestPrice: position.highestPrice,
            lowestPrice: position.lowestPrice
          });
          break;
        }
      }

      if (!exitTriggered) {
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'Position not closed' });
      }
    }
    `;
  }
};
