import { ExecutionTemplate } from './template.interface';

/**
 * Conservative Scalping Template
 *
 * Tight stops, quick exits. Optimized for high win rate.
 * Exits quickly to lock in small profits and minimize drawdowns.
 */
export const conservativeTemplate: ExecutionTemplate = {
  name: 'Conservative Scalper',
  description: 'Tight stops, quick exits. Optimized for high win rate.',
  category: 'scalping',

  parameters: {
    stopLossPct: 1.0,
    takeProfitPct: 1.5,
    trailingStopPct: 0.5,
    maxHoldBars: 12  // Exit after 1 hour (12 × 5min bars) if no exit triggered
  },

  metadata: {
    idealFor: [
      'High-frequency patterns',
      'Volatile tickers',
      'Small account sizes (risk management)'
    ],
    riskLevel: 'low',
    avgHoldTime: '30-60 minutes',
    winRateTarget: 65
  },

  generateExecutionCode(): string {
    const { stopLossPct, takeProfitPct, trailingStopPct, maxHoldBars } = this.parameters;

    return `
    // Conservative Scalping Strategy
    // Tight stops, quick exits

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

      // Determine direction from signal metrics or default to SHORT for momentum exhaustion
      const side = 'SHORT' as 'LONG' | 'SHORT';  // Type assertion to allow comparisons

      const entryBar = bars[signalBarIndex + 1];
      let position = {
        side,
        entry: entryBar.open,
        entryTime: entryBar.timeOfDay,
        highestPrice: entryBar.high,
        lowestPrice: entryBar.low,
        trailingStop: side === 'LONG'
          ? entryBar.open * (1 - ${trailingStopPct} / 100)
          : entryBar.open * (1 + ${trailingStopPct} / 100),
        barsHeld: 0
      };

      let exitTriggered = false;

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        position.barsHeld++;
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        let exitPrice = bar.close;
        let exitReason = '';

        if (side === 'LONG') {
          const stopLoss = position.entry * (1 - ${stopLossPct} / 100);
          const takeProfit = position.entry * (1 + ${takeProfitPct} / 100);
          position.trailingStop = Math.max(position.trailingStop, bar.close * (1 - ${trailingStopPct} / 100));

          if (bar.low <= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (bar.low <= position.trailingStop) {
            exitTriggered = true;
            exitPrice = position.trailingStop;
            exitReason = 'Trailing stop';
          } else if (bar.high >= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitReason = 'Take profit';
          } else if (position.barsHeld >= ${maxHoldBars}) {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Max hold time';
          } else if (bar.timeOfDay >= '15:55:00') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Market close';
          }
        } else {
          const stopLoss = position.entry * (1 + ${stopLossPct} / 100);
          const takeProfit = position.entry * (1 - ${takeProfitPct} / 100);
          position.trailingStop = Math.min(position.trailingStop, bar.close * (1 + ${trailingStopPct} / 100));

          if (bar.high >= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (bar.high >= position.trailingStop) {
            exitTriggered = true;
            exitPrice = position.trailingStop;
            exitReason = 'Trailing stop';
          } else if (bar.low <= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitReason = 'Take profit';
          } else if (position.barsHeld >= ${maxHoldBars}) {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Max hold time';
          } else if (bar.timeOfDay >= '15:55:00') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Market close';
          }
        }

        if (exitTriggered) {
          // Position sizing: $10,000 trade size
          const TRADE_SIZE = 10000;
          const quantity = Math.floor(TRADE_SIZE / position.entry);
          const pnlPerShare = side === 'LONG' ? exitPrice - position.entry : position.entry - exitPrice;
          const pnl = pnlPerShare * quantity;
          const pnlPercent = (pnlPerShare / position.entry) * 100;

          results.push({
            date: signal_date,
            ticker: sigTicker,
            side,
            entryTime: position.entryTime,
            entryPrice: position.entry,
            exitTime: bar.timeOfDay,
            exitPrice,
            quantity,
            pnl,
            pnlPercent,
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
