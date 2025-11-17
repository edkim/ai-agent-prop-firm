/**
 * CLI Script for Intraday Data Backfill
 * Usage:
 *   npm run backfill:intraday
 *   npm run backfill:intraday -- --universe russell2000 --months 6
 *   npm run backfill:intraday -- --status
 *   npm run backfill:intraday -- --tickers AAPL,MSFT,GOOGL --months 3
 */

import intradayBackfillService from '../services/intraday-backfill.service';
import logger from '../services/logger.service';
import { initializeDatabase } from '../database/db';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options: any = {
    universe: 'russell2000',
    months: 3,
    status: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--universe':
        if (nextArg) {
          options.universe = nextArg;
          i++;
        }
        break;
      case '--months':
        if (nextArg) {
          options.months = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--tickers':
        if (nextArg) {
          options.tickers = nextArg.split(',').map((t: string) => t.trim());
          i++;
        }
        break;
      case '--delay':
        if (nextArg) {
          options.delayMs = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--batch-size':
        if (nextArg) {
          options.batchSize = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--startDate':
        if (nextArg) {
          options.startDate = nextArg;
          i++;
        }
        break;
      case '--endDate':
        if (nextArg) {
          options.endDate = nextArg;
          i++;
        }
        break;
      case '--status':
        options.status = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        logger.warn(`Unknown argument: ${arg}`);
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Intraday Data Backfill Tool
============================

Fetches historical 5-minute bar data for specified tickers.

USAGE:
  npm run backfill:intraday [OPTIONS]

OPTIONS:
  --universe <name>      Universe to backfill (default: russell2000)
                         Options: russell2000, sp500, nasdaq100, etc.

  --months <number>      Number of months to backfill (default: 3)
                         Range: 1-12 months

  --tickers <list>       Comma-separated list of custom tickers
                         Example: --tickers AAPL,MSFT,GOOGL
                         Note: Overrides --universe

  --delay <ms>           Delay between API calls in milliseconds (default: 1000)
                         Adjust based on your Polygon API tier

  --batch-size <number>  Number of tickers per batch (default: 50)

  --startDate <date>     Custom start date (YYYY-MM-DD format)
                         Overrides --months calculation

  --endDate <date>       Custom end date (YYYY-MM-DD format)
                         Use with --startDate for specific date ranges

  --status               Show current backfill progress and exit

  --help, -h             Show this help message

EXAMPLES:
  # Backfill Russell 2000 with 3 months of data (default)
  npm run backfill:intraday

  # Backfill S&P 500 with 6 months of data
  npm run backfill:intraday -- --universe sp500 --months 6

  # Backfill custom ticker list
  npm run backfill:intraday -- --tickers AAPL,MSFT,GOOGL --months 12

  # Check backfill progress
  npm run backfill:intraday -- --status

  # Adjust for free tier API (slower)
  npm run backfill:intraday -- --delay 12000 --batch-size 20

NOTES:
  - The script automatically resumes from where it left off if interrupted
  - Progress is saved to backfill-progress-intraday.json
  - Failed tickers are logged for manual review
  - Existing data is skipped automatically (smart caching)

POLYGON API TIERS:
  - Free tier: 5 calls/min → Use --delay 12000
  - Basic tier: Higher limits → Use --delay 2000
  - Advanced tier: Much higher → Use --delay 1000 (default)

ESTIMATED TIME:
  - Russell 2000 (~1900 tickers) with 3 months data
  - Paid tier (1s delay): ~35-45 minutes
  - Free tier (12s delay): ~7-8 hours

For more information, see:
  ai-convo-history/2025-10-28-high-tight-flag-implementation-plan.md
`);
}

async function main() {
  // Initialize database first
  initializeDatabase();

  const options = parseArgs();

  // Handle --status flag
  if (options.status) {
    logger.info('📊 Checking backfill status...\n');

    const status = intradayBackfillService.getStatus();

    if (!status) {
      logger.info('No active backfill in progress.');
      logger.info('Run without --status to start a new backfill.');
      return;
    }

    // Display status
    const completed = status.completedTickers.length;
    const failed = status.failedTickers.length;
    const total = status.totalTickers;
    const percentComplete = ((completed + failed) / total * 100).toFixed(1);

    logger.info('='.repeat(60));
    logger.info(`Universe: ${status.universe}`);
    logger.info(`Date Range: ${status.startDate} to ${status.endDate}`);
    logger.info(`Last Updated: ${new Date(status.lastUpdated).toLocaleString()}`);
    logger.info('');
    logger.info(`Progress: ${completed + failed}/${total} (${percentComplete}%)`);
    logger.info(`  ✅ Completed: ${completed} tickers`);
    logger.info(`  ❌ Failed: ${failed} tickers`);
    logger.info(`  ⏳ Remaining: ${total - completed - failed} tickers`);
    logger.info('='.repeat(60));

    if (failed > 0) {
      logger.info('\nFailed tickers:');
      status.failedTickers.slice(0, 10).forEach(({ ticker, error }) => {
        logger.info(`  - ${ticker}: ${error}`);
      });
      if (failed > 10) {
        logger.info(`  ... and ${failed - 10} more`);
      }
    }

    logger.info('\nRun without --status to resume backfill.');
    return;
  }

  // Validate options
  if (options.months < 1 || options.months > 12) {
    logger.error('Error: --months must be between 1 and 12');
    process.exit(1);
  }

  if (options.delayMs && options.delayMs < 0) {
    logger.error('Error: --delay must be positive');
    process.exit(1);
  }

  if (options.batchSize && (options.batchSize < 1 || options.batchSize > 100)) {
    logger.error('Error: --batch-size must be between 1 and 100');
    process.exit(1);
  }

  // Display banner
  console.log('');
  console.log('═'.repeat(60));
  console.log('  INTRADAY DATA BACKFILL');
  console.log('═'.repeat(60));
  console.log('');

  if (options.tickers) {
    logger.info(`Target: ${options.tickers.length} custom tickers`);
  } else {
    logger.info(`Universe: ${options.universe}`);
  }

  logger.info(`Timeframe: ${options.months} months`);
  logger.info(`Delay: ${options.delayMs || 1000}ms per ticker`);
  logger.info(`Batch size: ${options.batchSize || 50} tickers`);
  console.log('');

  // Start backfill
  try {
    await intradayBackfillService.backfillUniverse(options);
    logger.info('\n🎉 Backfill completed successfully!');
    process.exit(0);
  } catch (error: any) {
    logger.error('\n❌ Backfill failed:', error.message);
    logger.error('Progress has been saved. Run again to resume.');
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  logger.info('\n\n⚠️  Interrupted by user');
  logger.info('💾 Progress has been saved');
  logger.info('🔄 Run the command again to resume from where you left off');
  process.exit(0);
});

// Run main function
main().catch((error) => {
  logger.error('Unexpected error:', error);
  process.exit(1);
});
