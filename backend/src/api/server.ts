/**
 * Express Server Setup
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST before any other imports
// Resolve to project root (one level up from backend/ where npm run dev executes)
// Use override: true to replace any existing environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: true });

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { initializeDatabase } from '../database/db';
import dataRoutes from './routes/data';
import strategyRoutes from './routes/strategies';
import backtestRoutes from './routes/backtests';
import scriptRoutes from './routes/scripts';
import scannerRoutes from './routes/scanner';
import portfolioBacktestsRoutes from './routes/portfolio-backtests';
import backtestSetsRoutes from './routes/backtest-sets';
import chartsRoutes from './routes/charts';
import claudeAnalysisRoutes from './routes/claude-analysis';
import batchBacktestRoutes from './routes/batch-backtest';
import liveTradingAgentRoutes from './routes/live-trading-agents';
import learningAgentRoutes from './routes/learning-agents'; // Learning laboratory agents
import paperTradingRoutes from './routes/paper-trading';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/data', dataRoutes);
app.use('/api/strategies', strategyRoutes);
app.use('/api/backtests', backtestRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/portfolio-backtests', portfolioBacktestsRoutes);
app.use('/api/backtest-sets', backtestSetsRoutes);
app.use('/api/charts', chartsRoutes);
app.use('/api/analysis', claudeAnalysisRoutes);
app.use('/api/batch-backtest', batchBacktestRoutes);
app.use('/api/agents', liveTradingAgentRoutes); // Live trading agents (production)
app.use('/api/learning-agents', learningAgentRoutes); // Learning laboratory agents
app.use('/api/paper-trading', paperTradingRoutes); // Paper trading

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize database
// Use absolute path to project root database (one level up from backend/)
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../../backtesting.db');
initializeDatabase(dbPath);

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${dbPath}`);
  console.log('');

  // Auto-start learning agent scheduler
  try {
    console.log('📅 Starting Learning Agent Scheduler...');
    const { SchedulerService } = await import('../services/scheduler.service');
    const scheduler = SchedulerService.getInstance();
    await scheduler.start();
    console.log('✅ Learning Agent Scheduler started');
    console.log('');
  } catch (error: any) {
    console.error('❌ Failed to start Learning Agent Scheduler:', error.message);
    console.error('   Scheduled learning will not be active.');
  }

  // Auto-start trading services if enabled
  if (process.env.AUTO_EXECUTION_ENABLED === 'true') {
    try {
      console.log('🤖 AUTO_EXECUTION_ENABLED is true, starting trading services...');
      console.log('');

      const tradingStartupService = (await import('../services/trading-startup.service')).default;
      await tradingStartupService.start();
    } catch (error: any) {
      console.error('❌ Failed to start trading services:', error.message);
      console.error('   Trading services will not be active. Check configuration and restart.');
    }
  } else {
    console.log('ℹ️  Autonomous trading disabled (AUTO_EXECUTION_ENABLED not true)');
    console.log('   Set AUTO_EXECUTION_ENABLED=true in .env to enable');
  }

  // Auto-start paper trading services if enabled
  if (process.env.PAPER_TRADING_ENABLED === 'true') {
    try {
      console.log('🎓 PAPER_TRADING_ENABLED is true, starting paper trading services...');
      console.log('');

      const paperTradingStartupService = (await import('../services/paper-trading-startup.service')).default;
      await paperTradingStartupService.start();
    } catch (error: any) {
      console.error('❌ Failed to start paper trading services:', error.message);
      console.error('   Paper trading will not be active. Check configuration and restart.');
    }
  } else {
    console.log('ℹ️  Paper trading disabled (PAPER_TRADING_ENABLED not true)');
    console.log('   Set PAPER_TRADING_ENABLED=true in .env to enable');
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log('');
  console.log(`${signal} received, shutting down gracefully...`);

  try {
    // Stop learning agent scheduler
    const { SchedulerService } = await import('../services/scheduler.service');
    const scheduler = SchedulerService.getInstance();
    scheduler.stop();
    console.log('✅ Learning Agent Scheduler stopped');

    // Stop trading services
    const tradingStartupService = (await import('../services/trading-startup.service')).default;
    await tradingStartupService.stop();

    // Stop paper trading services
    const paperTradingStartupService = (await import('../services/paper-trading-startup.service')).default;
    await paperTradingStartupService.stop();

    // Close database
    const { closeDatabase } = await import('../database/db');
    closeDatabase();

    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
