import {
  Bar,
  calculateVWAP,
  calculateSMA,
  calculateEMA,
  calculateATR,
  calculateRSI,
  calculateBollingerBands,
  calculateMACD,
  isHigherHighs,
  isLowerLows,
  findSupport,
  findResistance,
  calculateAverageVolume,
  distanceFromLevel,
  hasVolumeSpike
} from '../backtest-helpers';

describe('backtest-helpers', () => {
  // Sample test data
  const sampleBars: Bar[] = [
    { timestamp: 1, open: 100, high: 105, low: 99, close: 103, volume: 1000 },
    { timestamp: 2, open: 103, high: 108, low: 102, close: 107, volume: 1200 },
    { timestamp: 3, open: 107, high: 110, low: 105, close: 106, volume: 1100 },
    { timestamp: 4, open: 106, high: 109, low: 104, close: 105, volume: 900 },
    { timestamp: 5, open: 105, high: 107, low: 103, close: 104, volume: 1000 },
  ];

  describe('calculateVWAP', () => {
    it('should calculate VWAP correctly with valid data', () => {
      const vwap = calculateVWAP(sampleBars);
      expect(vwap).toBeGreaterThan(0);
      expect(vwap).toBeCloseTo(105.17, 1);
    });

    it('should return 0 for empty array', () => {
      expect(calculateVWAP([])).toBe(0);
    });

    it('should handle single bar', () => {
      const singleBar: Bar[] = [
        { timestamp: 1, open: 100, high: 105, low: 99, close: 103, volume: 1000 }
      ];
      const vwap = calculateVWAP(singleBar);
      expect(vwap).toBeCloseTo(102.33, 1); // (105+99+103)/3 = 102.33
    });

    it('should return 0 when total volume is 0', () => {
      const zeroBars: Bar[] = [
        { timestamp: 1, open: 100, high: 105, low: 99, close: 103, volume: 0 }
      ];
      expect(calculateVWAP(zeroBars)).toBe(0);
    });
  });

  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const sma = calculateSMA(sampleBars, 3);
      expect(sma).toBeCloseTo(105, 0); // (106+105+104)/3 = 105
    });

    it('should return 0 when insufficient bars', () => {
      expect(calculateSMA(sampleBars, 10)).toBe(0);
    });

    it('should handle period of 1', () => {
      const sma = calculateSMA(sampleBars, 1);
      expect(sma).toBe(104); // last close value
    });

    it('should return 0 for empty array', () => {
      expect(calculateSMA([], 5)).toBe(0);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate EMA correctly', () => {
      const ema = calculateEMA(sampleBars, 3);
      expect(ema).toBeGreaterThan(0);
      expect(ema).toBeCloseTo(105, 0);
    });

    it('should return 0 when insufficient bars', () => {
      expect(calculateEMA(sampleBars, 10)).toBe(0);
    });

    it('should give more weight to recent prices than SMA', () => {
      const risingBars: Bar[] = [
        { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 3, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 4, open: 100, high: 111, low: 99, close: 110, volume: 1000 },
      ];
      const sma = calculateSMA(risingBars, 3);
      const ema = calculateEMA(risingBars, 3);
      expect(ema).toBeGreaterThan(sma); // EMA should be higher due to recent spike
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR correctly', () => {
      const atr = calculateATR(sampleBars, 3);
      expect(atr).toBeGreaterThan(0);
      expect(atr).toBeLessThan(10);
    });

    it('should return 0 when insufficient bars', () => {
      expect(calculateATR(sampleBars, 10)).toBe(0);
    });

    it('should use default period of 14', () => {
      const longBars = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 103 + i,
        volume: 1000
      }));
      const atr = calculateATR(longBars);
      expect(atr).toBeGreaterThan(0);
    });

    it('should measure volatility correctly', () => {
      const volatileBars: Bar[] = [
        { timestamp: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 115, low: 95, close: 100, volume: 1000 },
        { timestamp: 3, open: 100, high: 120, low: 80, close: 110, volume: 1000 },
      ];
      const highATR = calculateATR(volatileBars, 2);

      const calmBars: Bar[] = [
        { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 3, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];
      const lowATR = calculateATR(calmBars, 2);

      expect(highATR).toBeGreaterThan(lowATR);
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI correctly', () => {
      const rsi = calculateRSI(sampleBars, 3);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should return 50 when insufficient bars', () => {
      expect(calculateRSI(sampleBars, 10)).toBe(50);
    });

    it('should return 100 for all gains', () => {
      const allGains: Bar[] = [
        { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2, open: 100, high: 102, low: 100, close: 101, volume: 1000 },
        { timestamp: 3, open: 101, high: 103, low: 101, close: 102, volume: 1000 },
        { timestamp: 4, open: 102, high: 104, low: 102, close: 103, volume: 1000 },
      ];
      const rsi = calculateRSI(allGains, 3);
      expect(rsi).toBe(100);
    });

    it('should return 0 for all losses', () => {
      const allLosses: Bar[] = [
        { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2, open: 100, high: 100, low: 98, close: 99, volume: 1000 },
        { timestamp: 3, open: 99, high: 99, low: 97, close: 98, volume: 1000 },
        { timestamp: 4, open: 98, high: 98, low: 96, close: 97, volume: 1000 },
      ];
      const rsi = calculateRSI(allLosses, 3);
      expect(rsi).toBe(0);
    });
  });

  describe('calculateBollingerBands', () => {
    it('should calculate Bollinger Bands correctly', () => {
      const bands = calculateBollingerBands(sampleBars, 3);
      expect(bands.middle).toBeGreaterThan(0);
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.lower).toBeLessThan(bands.middle);
    });

    it('should use default parameters', () => {
      const longBars = Array.from({ length: 25 }, (_, i) => ({
        timestamp: i,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 103 + i,
        volume: 1000
      }));
      const bands = calculateBollingerBands(longBars);
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.lower).toBeLessThan(bands.middle);
    });

    it('should have symmetric bands with custom stdDev', () => {
      const bands = calculateBollingerBands(sampleBars, 3, 1);
      const upperDistance = bands.upper - bands.middle;
      const lowerDistance = bands.middle - bands.lower;
      expect(upperDistance).toBeCloseTo(lowerDistance, 5);
    });
  });

  describe('calculateMACD', () => {
    it('should calculate MACD components', () => {
      const macd = calculateMACD(sampleBars, 2, 3, 2);
      expect(macd).toHaveProperty('macd');
      expect(macd).toHaveProperty('signal');
      expect(macd).toHaveProperty('histogram');
    });

    it('should calculate histogram as macd - signal', () => {
      const macd = calculateMACD(sampleBars, 2, 3, 2);
      expect(macd.histogram).toBe(macd.macd - macd.signal);
    });

    it('should use default parameters', () => {
      const longBars = Array.from({ length: 30 }, (_, i) => ({
        timestamp: i,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 103 + i,
        volume: 1000
      }));
      const macd = calculateMACD(longBars);
      expect(typeof macd.macd).toBe('number');
      expect(typeof macd.signal).toBe('number');
      expect(typeof macd.histogram).toBe('number');
    });
  });

  describe('isHigherHighs', () => {
    it('should detect higher highs pattern', () => {
      const higherHighs: Bar[] = [
        { timestamp: 1, open: 100, high: 105, low: 99, close: 103, volume: 1000 },
        { timestamp: 2, open: 103, high: 107, low: 102, close: 106, volume: 1000 },
        { timestamp: 3, open: 106, high: 110, low: 105, close: 109, volume: 1000 },
      ];
      expect(isHigherHighs(higherHighs, 2)).toBe(true);
    });

    it('should return false for lower highs', () => {
      const lowerHighs: Bar[] = [
        { timestamp: 1, open: 100, high: 110, low: 99, close: 103, volume: 1000 },
        { timestamp: 2, open: 103, high: 107, low: 102, close: 106, volume: 1000 },
        { timestamp: 3, open: 106, high: 105, low: 104, close: 104, volume: 1000 },
      ];
      expect(isHigherHighs(lowerHighs, 2)).toBe(false);
    });

    it('should return false for insufficient bars', () => {
      expect(isHigherHighs(sampleBars, 10)).toBe(false);
    });
  });

  describe('isLowerLows', () => {
    it('should detect lower lows pattern', () => {
      const lowerLows: Bar[] = [
        { timestamp: 1, open: 100, high: 105, low: 99, close: 103, volume: 1000 },
        { timestamp: 2, open: 103, high: 107, low: 97, close: 106, volume: 1000 },
        { timestamp: 3, open: 106, high: 110, low: 95, close: 109, volume: 1000 },
      ];
      expect(isLowerLows(lowerLows, 2)).toBe(true);
    });

    it('should return false for higher lows', () => {
      const higherLows: Bar[] = [
        { timestamp: 1, open: 100, high: 105, low: 95, close: 103, volume: 1000 },
        { timestamp: 2, open: 103, high: 107, low: 97, close: 106, volume: 1000 },
        { timestamp: 3, open: 106, high: 110, low: 100, close: 109, volume: 1000 },
      ];
      expect(isLowerLows(higherLows, 2)).toBe(false);
    });

    it('should return false for insufficient bars', () => {
      expect(isLowerLows(sampleBars, 10)).toBe(false);
    });
  });

  describe('findSupport', () => {
    it('should find lowest low in lookback period', () => {
      const support = findSupport(sampleBars, 3);
      expect(support).toBe(103); // lowest low in last 3 bars
    });

    it('should return 0 for insufficient bars', () => {
      expect(findSupport(sampleBars, 10)).toBe(0);
    });

    it('should use default lookback of 20', () => {
      const longBars = Array.from({ length: 25 }, (_, i) => ({
        timestamp: i,
        open: 100,
        high: 105,
        low: 95 + i * 0.1, // gradually rising lows
        close: 100,
        volume: 1000
      }));
      const support = findSupport(longBars);
      expect(support).toBeGreaterThan(95);
    });
  });

  describe('findResistance', () => {
    it('should find highest high in lookback period', () => {
      const resistance = findResistance(sampleBars, 3);
      expect(resistance).toBe(110); // highest high in last 3 bars
    });

    it('should return 0 for insufficient bars', () => {
      expect(findResistance(sampleBars, 10)).toBe(0);
    });

    it('should use default lookback of 20', () => {
      const longBars = Array.from({ length: 25 }, (_, i) => ({
        timestamp: i,
        open: 100,
        high: 105 - i * 0.1, // gradually falling highs
        low: 95,
        close: 100,
        volume: 1000
      }));
      const resistance = findResistance(longBars);
      expect(resistance).toBeLessThan(105);
    });
  });

  describe('calculateAverageVolume', () => {
    it('should calculate average volume correctly', () => {
      const avgVol = calculateAverageVolume(sampleBars, 3);
      expect(avgVol).toBeCloseTo(1000, 0); // (1100+900+1000)/3
    });

    it('should return 0 for insufficient bars', () => {
      expect(calculateAverageVolume(sampleBars, 10)).toBe(0);
    });

    it('should handle varying volumes', () => {
      const varyingVolume: Bar[] = [
        { timestamp: 1, open: 100, high: 105, low: 99, close: 103, volume: 500 },
        { timestamp: 2, open: 103, high: 108, low: 102, close: 107, volume: 1500 },
        { timestamp: 3, open: 107, high: 110, low: 105, close: 106, volume: 1000 },
      ];
      const avgVol = calculateAverageVolume(varyingVolume, 3);
      expect(avgVol).toBe(1000); // (500+1500+1000)/3
    });
  });

  describe('distanceFromLevel', () => {
    it('should calculate positive distance when above level', () => {
      const distance = distanceFromLevel(110, 100);
      expect(distance).toBe(10);
    });

    it('should calculate negative distance when below level', () => {
      const distance = distanceFromLevel(90, 100);
      expect(distance).toBe(-10);
    });

    it('should return 0 when at level', () => {
      const distance = distanceFromLevel(100, 100);
      expect(distance).toBe(0);
    });

    it('should return percentage correctly', () => {
      const distance = distanceFromLevel(105, 100);
      expect(distance).toBeCloseTo(5, 1);
    });
  });

  describe('hasVolumeSpike', () => {
    it('should detect volume spike with default multiplier', () => {
      expect(hasVolumeSpike(1500, 1000)).toBe(true);
    });

    it('should not detect spike below threshold', () => {
      expect(hasVolumeSpike(1400, 1000)).toBe(false);
    });

    it('should use custom multiplier', () => {
      expect(hasVolumeSpike(2000, 1000, 2)).toBe(true);
      expect(hasVolumeSpike(1900, 1000, 2)).toBe(false);
    });

    it('should return false when average volume is 0', () => {
      expect(hasVolumeSpike(1000, 0)).toBe(false);
    });
  });
});
