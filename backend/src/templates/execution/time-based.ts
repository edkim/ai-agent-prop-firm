import { ExecutionTemplate } from './template.interface';

/**
 * Time-Based Intraday Template
 *
 * Exit by specific time regardless of P&L. No overnight holds.
 * Ideal for intraday mean reversion and avoiding overnight risk.
 */
export const timeBasedTemplate: ExecutionTemplate = {
  name: 'Intraday Time Exit',
  description: 'Exit by specific time regardless of P&L. No overnight holds.',
  category: 'time_based',

  parameters: {
    stopLossPct: 2.0,
    takeProfitPct: 3.0,
    exitTime: '15:30:00',  // Exit 30 min before close
    maxHoldMinutes: 120    // Exit after 2 hours max
  },

  metadata: {
    idealFor: [
      'Gap fade strategies',
      'Intraday exhaustion plays',
      'News-driven volatility'
    ],
    riskLevel: 'medium',
    avgHoldTime: '1-2 hours',
    winRateTarget: 55
  },

  generateExecutionCode(): string {
    const { stopLossPct, takeProfitPct, exitTime, maxHoldMinutes } = this.parameters;

    return `
    // Time-Based Intraday Strategy
    // Exit by specific time or max hold duration

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

      // Check if signal is too close to exit time
      if (signal_time >= '${exitTime}') {
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'Signal after exit time' });
        continue;
      }

      // Determine side from signal direction, or derive from price action if not specified
      const side = signal.direction || (bars[signalBarIndex + 1].close > bars[signalBarIndex].close ? 'LONG' : 'SHORT');

      const entryBar = bars[signalBarIndex + 1];
      let position = {
        side,
        entry: entryBar.open,
        entryTime: entryBar.timeOfDay,
        highestPrice: entryBar.high,
        lowestPrice: entryBar.low,
        minutesHeld: 0
      };

      let exitTriggered = false;

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        position.minutesHeld += 5;  // Each bar is 5 minutes
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        let exitPrice = bar.close;
        let exitReason = '';

        if (side === 'LONG') {
          const stopLoss = position.entry * (1 - ${stopLossPct} / 100);
          const takeProfit = position.entry * (1 + ${takeProfitPct} / 100);

          if (bar.low <= stopLoss) {
            exitTriggered = true;
            exitPrice = stopLoss;
            exitReason = 'Stop loss';
          } else if (bar.high >= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitReason = 'Take profit';
          } else if (bar.timeOfDay >= '${exitTime}') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Time-based exit';
          } else if (position.minutesHeld >= ${maxHoldMinutes}) {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Max hold duration';
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
          } else if (bar.low <= takeProfit) {
            exitTriggered = true;
            exitPrice = takeProfit;
            exitReason = 'Take profit';
          } else if (bar.timeOfDay >= '${exitTime}') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Time-based exit';
          } else if (position.minutesHeld >= ${maxHoldMinutes}) {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Max hold duration';
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
