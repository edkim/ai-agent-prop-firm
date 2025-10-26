/**
 * Express Server Setup
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initializeDatabase } from '../database/db';
import dataRoutes from './routes/data';
import strategyRoutes from './routes/strategies';
import backtestRoutes from './routes/backtests';
import scriptRoutes from './routes/scripts';
import scannerRoutes from './routes/scanner';
import portfolioBacktestsRoutes from './routes/portfolio-backtests';
import backtestSetsRoutes from './routes/backtest-sets';
import chartsRoutes from './routes/charts';

// Load environment variables
// Resolve to project root (one level up from backend/)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

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
const dbPath = process.env.DATABASE_PATH || './backtesting.db';
initializeDatabase(dbPath);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${dbPath}`);
});

export default app;
