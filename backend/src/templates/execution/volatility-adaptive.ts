import { ExecutionTemplate } from './template.interface';

/**
 * Volatility-Adaptive (ATR-based) Template
 *
 * Stops adjust to volatility. Tighter in calm markets, wider in volatile markets.
 * Uses Average True Range to dynamically set stops and targets.
 */
export const volatilityAdaptiveTemplate: ExecutionTemplate = {
  name: 'ATR Adaptive',
  description: 'Stops adjust to volatility. Tighter in calm markets, wider in volatile.',
  category: 'volatility_adaptive',

  parameters: {
    stopLossATRMultiplier: 2.0,   // 2× ATR for stop
    takeProfitATRMultiplier: 3.0, // 3× ATR for target
    atrPeriod: 14,
    trailingStopATRMultiplier: 1.5
  },

  metadata: {
    idealFor: [
      'Varying volatility regimes',
      'Multi-timeframe strategies',
      'Adaptive systems'
    ],
    riskLevel: 'medium',
    avgHoldTime: '1-3 hours',
    winRateTarget: 50
  },

  generateExecutionCode(): string {
    const { stopLossATRMultiplier, takeProfitATRMultiplier, atrPeriod, trailingStopATRMultiplier } = this.parameters;

    return `
    // Volatility-Adaptive Strategy
    // Use ATR for dynamic stops and targets

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

      // Calculate ATR at entry point
      const barsUpToSignal = bars.slice(0, signalBarIndex + 1);
      if (barsUpToSignal.length < ${atrPeriod} + 1) {
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'Insufficient data for ATR' });
        continue;
      }

      const atr = helpers.calculateATR(barsUpToSignal, ${atrPeriod});
      if (atr === 0) {
        results.push({ date: signal_date, ticker: sigTicker, noTrade: true, noTradeReason: 'ATR calculation failed' });
        continue;
      }

      const side = 'SHORT' as 'LONG' | 'SHORT';  // Type assertion to allow comparisons

      const entryBar = bars[signalBarIndex + 1];
      let position = {
        side,
        entry: entryBar.open,
        entryTime: entryBar.timeOfDay,
        highestPrice: entryBar.high,
        lowestPrice: entryBar.low,
        atr: atr,
        stopLoss: side === 'LONG'
          ? entryBar.open - (atr * ${stopLossATRMultiplier})
          : entryBar.open + (atr * ${stopLossATRMultiplier}),
        takeProfit: side === 'LONG'
          ? entryBar.open + (atr * ${takeProfitATRMultiplier})
          : entryBar.open - (atr * ${takeProfitATRMultiplier}),
        trailingStop: side === 'LONG'
          ? entryBar.open - (atr * ${trailingStopATRMultiplier})
          : entryBar.open + (atr * ${trailingStopATRMultiplier})
      };

      let exitTriggered = false;

      for (let i = signalBarIndex + 2; i < bars.length; i++) {
        const bar = bars[i];
        position.highestPrice = Math.max(position.highestPrice, bar.high);
        position.lowestPrice = Math.min(position.lowestPrice, bar.low);

        let exitPrice = bar.close;
        let exitReason = '';

        if (side === 'LONG') {
          // Update trailing stop
          const newTrailingStop = bar.close - (atr * ${trailingStopATRMultiplier});
          position.trailingStop = Math.max(position.trailingStop, newTrailingStop);

          if (bar.low <= position.stopLoss) {
            exitTriggered = true;
            exitPrice = position.stopLoss;
            exitReason = 'Stop loss (ATR)';
          } else if (bar.low <= position.trailingStop) {
            exitTriggered = true;
            exitPrice = position.trailingStop;
            exitReason = 'Trailing stop (ATR)';
          } else if (bar.high >= position.takeProfit) {
            exitTriggered = true;
            exitPrice = position.takeProfit;
            exitReason = 'Take profit (ATR)';
          } else if (bar.timeOfDay >= '15:55:00') {
            exitTriggered = true;
            exitPrice = bar.close;
            exitReason = 'Market close';
          }
        } else {
          // Update trailing stop
          const newTrailingStop = bar.close + (atr * ${trailingStopATRMultiplier});
          position.trailingStop = Math.min(position.trailingStop, newTrailingStop);

          if (bar.high >= position.stopLoss) {
            exitTriggered = true;
            exitPrice = position.stopLoss;
            exitReason = 'Stop loss (ATR)';
          } else if (bar.high >= position.trailingStop) {
            exitTriggered = true;
            exitPrice = position.trailingStop;
            exitReason = 'Trailing stop (ATR)';
          } else if (bar.low <= position.takeProfit) {
            exitTriggered = true;
            exitPrice = position.takeProfit;
            exitReason = 'Take profit (ATR)';
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
