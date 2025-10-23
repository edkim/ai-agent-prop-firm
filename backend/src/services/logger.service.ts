/**
 * Logger Service
 *
 * Writes detailed logs to file for debugging backtest execution
 */

import fs from 'fs/promises';
import path from 'path';

export class LoggerService {
  private logFilePath: string;
  private logDir: string;

  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logFilePath = path.join(this.logDir, 'backtest-execution.log');
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Write a log entry with timestamp
   */
  async log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any): Promise<void> {
    await this.ensureLogDir();

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}${
      data ? '\n' + JSON.stringify(data, null, 2) : ''
    }\n${'='.repeat(80)}\n`;

    try {
      await fs.appendFile(this.logFilePath, logEntry, 'utf8');

      // Also log to console for real-time visibility
      if (level === 'ERROR') {
        console.error(`[${level}] ${message}`, data || '');
      } else {
        console.log(`[${level}] ${message}`, data || '');
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Log INFO level message
   */
  async info(message: string, data?: any): Promise<void> {
    await this.log('INFO', message, data);
  }

  /**
   * Log WARN level message
   */
  async warn(message: string, data?: any): Promise<void> {
    await this.log('WARN', message, data);
  }

  /**
   * Log ERROR level message
   */
  async error(message: string, data?: any): Promise<void> {
    await this.log('ERROR', message, data);
  }

  /**
   * Clear log file
   */
  async clear(): Promise<void> {
    try {
      await fs.writeFile(this.logFilePath, '', 'utf8');
      console.log('Log file cleared');
    } catch (error) {
      console.error('Failed to clear log file:', error);
    }
  }

  /**
   * Get recent log entries (last N lines)
   */
  async getRecentLogs(lines: number = 100): Promise<string> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch (error) {
      return 'Log file not found or empty';
    }
  }
}

// Export singleton instance
export default new LoggerService();
