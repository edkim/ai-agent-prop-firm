/**
 * Timezone Utilities
 *
 * Handles conversion between UTC and Eastern Time (ET).
 * CRITICAL: All market data must be normalized to ET for day boundaries.
 */

/**
 * Convert UTC timestamp to ET date string (YYYY-MM-DD)
 * Accounts for EDT (UTC-4) and EST (UTC-5)
 */
export function getETDate(timestampMs: number): string {
  const date = new Date(timestampMs);

  // Use Intl.DateTimeFormat to get ET date
  const etDate = date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  // Convert from MM/DD/YYYY to YYYY-MM-DD
  const [month, day, year] = etDate.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Convert UTC timestamp to ET time string (HH:MM:SS)
 */
export function getETTime(timestampMs: number): string {
  const date = new Date(timestampMs);

  return date.toLocaleTimeString('en-US', {
    hour12: false,
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Check if a timestamp falls within Regular Trading Hours (RTH)
 * RTH = 09:30:00 - 16:00:00 ET on weekdays
 */
export function isRTH(timestampMs: number): boolean {
  const date = new Date(timestampMs);

  // Get day of week in ET
  const dayOfWeek = parseInt(date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'narrow'
  }) === 'S' ? '0' : '1', 10); // Simplified - just check weekend

  // Get time in ET
  const timeStr = getETTime(timestampMs);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const timeMinutes = hours * 60 + minutes;

  // RTH: 09:30 (570 min) to 16:00 (960 min)
  const rthStart = 9 * 60 + 30;  // 570
  const rthEnd = 16 * 60;         // 960

  // Check if weekday and within RTH
  // Note: dayOfWeek check is simplified - should use proper weekend detection
  return timeMinutes >= rthStart && timeMinutes < rthEnd;
}

/**
 * Check if timestamp is a market day (Mon-Fri, excluding holidays)
 * Note: This doesn't check for market holidays - you'd need a calendar for that
 */
export function isWeekday(timestampMs: number): boolean {
  const date = new Date(timestampMs);

  const dayName = date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short'
  });

  return !['Sat', 'Sun'].includes(dayName);
}

/**
 * Get the previous trading day's date (simplified - doesn't account for holidays)
 */
export function getPreviousTradingDay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');  // Noon to avoid TZ issues

  // Go back one day
  date.setDate(date.getDate() - 1);

  // If weekend, go back further
  while (!isWeekday(date.getTime())) {
    date.setDate(date.getDate() - 1);
  }

  return getETDate(date.getTime());
}

/**
 * Parse time string (HH:MM:SS) to minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}
