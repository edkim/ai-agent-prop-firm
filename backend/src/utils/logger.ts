/**
 * Logging Utility
 *
 * Provides structured logging with iteration-specific log files
 * and console output for development.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, '../../logs');
const ITERATIONS_DIR = path.join(LOGS_DIR, 'iterations');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

if (!fs.existsSync(ITERATIONS_DIR)) {
  fs.mkdirSync(ITERATIONS_DIR, { recursive: true });
}

// Custom format for console (colorized, simplified)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} ${level}: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Custom format for files (JSON for parsing, includes all metadata)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Main application logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // Console output (development)
    new winston.transports.Console({
      format: consoleFormat
    }),

    // Error log (persistent)
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'error.log'),
      level: 'error',
      format: fileFormat
    }),

    // Combined log with rotation
    new DailyRotateFile({
      filename: path.join(LOGS_DIR, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat
    })
  ]
});

/**
 * Create an iteration-specific logger
 *
 * Logs to both console and a dedicated file for this iteration
 */
export function createIterationLogger(agentId: string, iterationNumber: number) {
  const iterationDir = path.join(ITERATIONS_DIR, agentId);

  // Ensure agent directory exists
  if (!fs.existsSync(iterationDir)) {
    fs.mkdirSync(iterationDir, { recursive: true });
  }

  const logFilePath = path.join(iterationDir, `iteration-${iterationNumber}.log`);

  // Create iteration-specific logger
  const iterationLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
      agentId,
      iterationNumber
    },
    transports: [
      // Console output (same as main logger)
      new winston.transports.Console({
        format: consoleFormat
      }),

      // Iteration-specific file (detailed, includes metadata)
      new winston.transports.File({
        filename: logFilePath,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, agentId, iterationNumber, ...meta }) => {
            let msg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
            if (Object.keys(meta).length > 0) {
              msg += `\n  ${JSON.stringify(meta, null, 2)}`;
            }
            return msg;
          })
        )
      })
    ]
  });

  iterationLogger.info('Iteration logger initialized', {
    logFile: logFilePath
  });

  return iterationLogger;
}

/**
 * Clean up old iteration logs (older than N days)
 */
export function cleanupOldLogs(daysToKeep: number = 14) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  logger.info('Cleaning up old iteration logs', { daysToKeep, cutoffDate });

  // Cleanup iteration logs
  if (fs.existsSync(ITERATIONS_DIR)) {
    const agentDirs = fs.readdirSync(ITERATIONS_DIR);

    for (const agentDir of agentDirs) {
      const agentPath = path.join(ITERATIONS_DIR, agentDir);
      if (!fs.statSync(agentPath).isDirectory()) continue;

      const logFiles = fs.readdirSync(agentPath);

      for (const logFile of logFiles) {
        const logPath = path.join(agentPath, logFile);
        const stats = fs.statSync(logPath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(logPath);
          logger.info('Deleted old log file', { file: logPath });
        }
      }
    }
  }
}

// Export logger instance as default
export default logger;
