# AI Backtest Platform - Project Memory

## Key Practices

- Always update README.md before git commits when features change
- Save accomplishments and analysis documents to ai-convo-history/ with date prefixes (YYYY-MM-DD)
- Use TodoWrite tool for tracking multi-step tasks
- Remember to always kill and restart the backend server before running any learning iterations or tests
- Always refer to API-ENDPOINTS-REFERENCE.md for how to use the API, and keep it updated after any changes.
- Always refer to DATABASE-SCHEMA-REFERENCE.md before querying the database. Keep it updated after any schema changes.

## Database Location

**CRITICAL:** The primary database is located at `/Users/edwardkim/Code/ai-backtest/backtesting.db` (project root folder).

**DO NOT** use `/Users/edwardkim/Code/ai-backtest/backend/backtesting.db` - this is a test/dev database that may be empty or stale.

When querying or testing:
- Always use: `/Users/edwardkim/Code/ai-backtest/backtesting.db`
- Environment variable: `DATABASE_PATH` (if set) or defaults to `./backtesting.db` relative to project root
- Timestamps in `ohlcv_data` table are stored as **milliseconds**, use `timestamp/1000` for date conversions

## Server Startup

### Backend Server
```bash
cd /Users/edwardkim/Code/ai-backtest/backend && npm run dev
```
- Runs on port 3000 (default)
- Uses ts-node-dev for hot reloading
- Remember to kill and restart before running learning iterations or tests

### Frontend Server
```bash
cd /Users/edwardkim/Code/ai-backtest/frontend && npm run dev
```
- Runs on port 5173 (default Vite port)
- Uses Vite for hot module replacement
