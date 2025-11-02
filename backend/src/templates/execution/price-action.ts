import { ExecutionTemplate } from './template.interface';

/**
 * Price Action Trailing Template
 *
 * Uses prior bar extremes as trailing stop. Tight tracking of price action.
 * LONG: Trail stop at prior bar's low
 * SHORT: Trail stop at prior bar's high
 */
export const priceActionTemplate: ExecutionTemplate = {
  name: 'Price Action Trailing',
  description: 'Uses prior bar extremes as trailing stop. Tight tracking of price action.',
  category: 'price_action',

  parameters: {
    stopLossPct: 2.0,           // Initial hard stop
    takeProfitPct: 4.0,         // Initial target
    usePriorBarTrailing: true,  // Enable bar-by-bar trailing
    barsToActivate: 2           // Start trailing after N profitable bars
  },

  metadata: {
    idealFor: [
      'Price action-focused strategies',
      'Capturing quick moves before reversal',
      'Tight risk management without indicators'
    ],
    riskLevel: 'medium',
    avgHoldTime: '30-90 minutes',
    winRateTarget: 52
  },

  generateExecutionCode(): string {
    const { stopLossPct, takeProfitPct, usePriorBarTrailing, barsToActivate } = this.parameters;

    return `
    // Price Action Trailing Strategy
    // Trail stop at prior bar extremes

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
        priorBarTrailingStop: null as number | null,
        trailingActive: false,
        profitableBars: 0
      };

      let exitTriggered = false;
      let priorBar = entryBar;

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        // Check if current bar is profitable
        const isProfitable = side === 'LONG'
          ? bar.close > position.entry
          : bar.close < position.entry;

        if (isProfitable) {
          position.profitableBars++;
        }

        // Activate price action trailing after N profitable bars
        if (!position.trailingActive && position.profitableBars >= ${barsToActivate}) {
          position.trailingActive = true;
        }

        // Update price action trailing stop
        if (${usePriorBarTrailing} && position.trailingActive) {
          if (side === 'LONG') {
            // Use prior bar's low as trailing stop
            const priorLow = priorBar.low;
            if (position.priorBarTrailingStop === null) {
              position.priorBarTrailingStop = priorLow;
            } else {
              // Only move stop up, never down
              position.priorBarTrailingStop = Math.max(position.priorBarTrailingStop, priorLow);
            }
          } else {
            // Use prior bar's high as trailing stop
            const priorHigh = priorBar.high;
            if (position.priorBarTrailingStop === null) {
              position.priorBarTrailingStop = priorHigh;
            } else {
              // Only move stop down, never up
              position.priorBarTrailingStop = Math.min(position.priorBarTrailingStop, priorHigh);
            }
          }
        }

        let exitPrice = bar.close;
        let exitReason = '';

        if (side === 'LONG') {
          const stopLoss = position.entry * (1 - ${stopLossPct} / 100);
          const takeProfit = position.entry * (1 + ${takeProfitPct} / 100);

          if (bar.low <= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (position.priorBarTrailingStop !== null && bar.low <= position.priorBarTrailingStop) {
            exitTriggered = true;
            exitPrice = position.priorBarTrailingStop;
            exitReason = 'Price action trailing stop';
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

          if (bar.high >= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (position.priorBarTrailingStop !== null && bar.high >= position.priorBarTrailingStop) {
            exitTriggered = true;
            exitPrice = position.priorBarTrailingStop;
            exitReason = 'Price action trailing stop';
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

        // Update prior bar for next iteration
        priorBar = bar;
      }

      if (!exitTriggered) {
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'Position not closed' });
      }
    }
    `;
  }
};
