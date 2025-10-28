/**
 * Market Hours Service
 * Detects US stock market trading hours and sessions
 */

import logger from './logger.service';

export type MarketSession = 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';

interface MarketHours {
  session: MarketSession;
  isOpen: boolean;
  nextOpen: Date | null;
  nextClose: Date | null;
}

// US Stock Market Hours (EST/EDT)
const MARKET_HOURS = {
  PRE_MARKET_START: 4, // 4:00 AM
  PRE_MARKET_END: 9.5, // 9:30 AM
  REGULAR_START: 9.5, // 9:30 AM
  REGULAR_END: 16, // 4:00 PM
  AFTER_HOURS_START: 16, // 4:00 PM
  AFTER_HOURS_END: 20 // 8:00 PM
};

// US Market holidays 2025
const MARKET_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25' // Christmas
];

class MarketHoursService {
  /**
   * Check if market is currently open for trading
   */
  isMarketOpen(): boolean {
    const hours = this.getCurrentMarketHours();
    return hours.isOpen;
  }

  /**
   * Get current market session
   */
  getCurrentSession(): MarketSession {
    const hours = this.getCurrentMarketHours();
    return hours.session;
  }

  /**
   * Get detailed market hours information
   */
  getCurrentMarketHours(): MarketHours {
    const now = new Date();

    // Check if it's a weekend
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Sunday or Saturday
      return {
        session: 'CLOSED',
        isOpen: false,
        nextOpen: this.getNextMarketOpen(now),
        nextClose: null
      };
    }

    // Check if it's a holiday
    if (this.isHoliday(now)) {
      return {
        session: 'CLOSED',
        isOpen: false,
        nextOpen: this.getNextMarketOpen(now),
        nextClose: null
      };
    }

    // Convert to EST/EDT
    const estTime = this.toEasternTime(now);
    const hours = estTime.getHours() + estTime.getMinutes() / 60;

    // Determine session
    if (hours >= MARKET_HOURS.PRE_MARKET_START && hours < MARKET_HOURS.PRE_MARKET_END) {
      return {
        session: 'PRE_MARKET',
        isOpen: true,
        nextOpen: null,
        nextClose: this.getSessionEnd(estTime, MARKET_HOURS.PRE_MARKET_END)
      };
    } else if (hours >= MARKET_HOURS.REGULAR_START && hours < MARKET_HOURS.REGULAR_END) {
      return {
        session: 'REGULAR',
        isOpen: true,
        nextOpen: null,
        nextClose: this.getSessionEnd(estTime, MARKET_HOURS.REGULAR_END)
      };
    } else if (hours >= MARKET_HOURS.AFTER_HOURS_START && hours < MARKET_HOURS.AFTER_HOURS_END) {
      return {
        session: 'AFTER_HOURS',
        isOpen: true,
        nextOpen: null,
        nextClose: this.getSessionEnd(estTime, MARKET_HOURS.AFTER_HOURS_END)
      };
    } else {
      return {
        session: 'CLOSED',
        isOpen: false,
        nextOpen: this.getNextMarketOpen(now),
        nextClose: null
      };
    }
  }

  /**
   * Check if date is a market holiday
   */
  private isHoliday(date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return MARKET_HOLIDAYS_2025.includes(dateStr);
  }

  /**
   * Convert date to Eastern Time (EST/EDT)
   */
  private toEasternTime(date: Date): Date {
    const estString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    return new Date(estString);
  }

  /**
   * Get next market open time
   */
  private getNextMarketOpen(from: Date): Date {
    let next = new Date(from);
    next.setHours(0, 0, 0, 0);

    // Keep advancing until we find a trading day
    let attempts = 0;
    while (attempts < 14) { // Check up to 2 weeks ahead
      next.setDate(next.getDate() + 1);

      // Skip weekends
      if (next.getDay() === 0 || next.getDay() === 6) {
        attempts++;
        continue;
      }

      // Skip holidays
      if (this.isHoliday(next)) {
        attempts++;
        continue;
      }

      // Found next trading day
      const estNext = this.toEasternTime(next);
      estNext.setHours(MARKET_HOURS.REGULAR_START, 0, 0, 0);
      return estNext;
    }

    // Fallback to next business day
    return next;
  }

  /**
   * Get session end time for current day
   */
  private getSessionEnd(estTime: Date, endHour: number): Date {
    const endTime = new Date(estTime);
    const hours = Math.floor(endHour);
    const minutes = (endHour - hours) * 60;
    endTime.setHours(hours, minutes, 0, 0);
    return endTime;
  }

  /**
   * Check if we're in regular trading hours (9:30 AM - 4:00 PM EST)
   */
  isRegularHours(): boolean {
    return this.getCurrentSession() === 'REGULAR';
  }

  /**
   * Check if we're in extended hours (pre-market or after-hours)
   */
  isExtendedHours(): boolean {
    const session = this.getCurrentSession();
    return session === 'PRE_MARKET' || session === 'AFTER_HOURS';
  }

  /**
   * Get time until market opens
   */
  getTimeUntilOpen(): number | null {
    const hours = this.getCurrentMarketHours();

    if (hours.isOpen || !hours.nextOpen) {
      return null;
    }

    return hours.nextOpen.getTime() - Date.now();
  }

  /**
   * Get time until market closes
   */
  getTimeUntilClose(): number | null {
    const hours = this.getCurrentMarketHours();

    if (!hours.isOpen || !hours.nextClose) {
      return null;
    }

    return hours.nextClose.getTime() - Date.now();
  }

  /**
   * Get human-readable market status
   */
  getStatusString(): string {
    const hours = this.getCurrentMarketHours();

    if (!hours.isOpen) {
      if (hours.nextOpen) {
        const hoursUntil = Math.floor((hours.nextOpen.getTime() - Date.now()) / (1000 * 60 * 60));
        return `Market Closed - Opens in ${hoursUntil}h`;
      }
      return 'Market Closed';
    }

    switch (hours.session) {
      case 'PRE_MARKET':
        return 'Pre-Market Trading';
      case 'REGULAR':
        return 'Regular Trading Hours';
      case 'AFTER_HOURS':
        return 'After-Hours Trading';
      default:
        return 'Market Closed';
    }
  }

  /**
   * Log current market status
   */
  logStatus(): void {
    const status = this.getStatusString();
    const hours = this.getCurrentMarketHours();

    logger.info(`📊 Market Status: ${status}`);

    if (hours.nextOpen) {
      logger.info(`   Next Open: ${hours.nextOpen.toLocaleString()}`);
    }

    if (hours.nextClose) {
      logger.info(`   Next Close: ${hours.nextClose.toLocaleString()}`);
    }
  }

  /**
   * Should we allow intraday trading right now?
   * (Only during regular hours)
   */
  shouldTradeIntraday(): boolean {
    return this.isRegularHours();
  }

  /**
   * Should we allow swing trading right now?
   * (Can place orders anytime, will execute at open)
   */
  shouldTradeSwing(): boolean {
    // For swing trades, we can place orders anytime
    // They'll execute when market opens
    return true;
  }
}

// Singleton instance
const marketHoursService = new MarketHoursService();

export default marketHoursService;
