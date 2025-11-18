/**
 * Pattern System Types
 *
 * Defines the core interfaces for the real-time pattern scanning system.
 */

export interface Bar {
  timestamp: number;     // Milliseconds UTC
  time: string;          // HH:MM:SS format (ET)
  date: string;          // YYYY-MM-DD in ET timezone
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isRTH: boolean;        // true = Regular Trading Hours (9:30-16:00 ET), false = Extended Hours
}

export interface Indicators {
  vwap?: number;
  sma20?: number;
  sma50?: number;
  rsi?: number;
  avgVolume?: number;
  // Add more indicators as needed
}

export interface TickerState {
  ticker: string;
  bars: Bar[];           // Sliding window of recent bars
  indicators: Indicators;
  metadata?: {
    prevDayClose?: number;
    todayOpen?: number;
    todayHigh?: number;
    todayLow?: number;
  };
}

export interface Signal {
  ticker: string;
  pattern: string;
  timestamp: number;
  time: string;          // Readable time
  entry: number;
  stop: number;
  target: number;
  confidence: number;    // 0-100
  metadata?: Record<string, any>;  // Pattern-specific data
}

export interface Pattern {
  name: string;
  description: string;

  /**
   * Scan a ticker for this pattern
   * @returns Signal if pattern is found, null otherwise
   */
  scan(state: TickerState): Signal | null;

  /**
   * Optional pre-filter to avoid unnecessary scans
   * @returns true if this ticker should be scanned
   */
  shouldScan?(state: TickerState): boolean;

  /**
   * Optional minimum bars required for this pattern
   */
  minBars?: number;
}

export interface ScanResult {
  scanId: number;
  timestamp: number;
  tickersScanned: number;
  patternsRun: number;
  signalsFound: number;
  durationMs: number;
}
