# File Logging Integration - 2025-10-23

## Status: ✅ COMPLETE

Backend execution logs are now saved to file for comprehensive debugging and diagnosis.

## Problem

User wanted to diagnose whether custom-generated scripts were being executed:
- Backend logs only visible in terminal
- No persistent record of execution flow
- Difficult to debug Claude-generated script execution
- Unable to review execution history after terminal clears

## Solution Implemented

### 1. Logger Service Created (`backend/src/services/logger.service.ts`)

**Complete logging service** with the following features:

```typescript
export class LoggerService {
  private logFilePath: string = 'backend/logs/backtest-execution.log'

  // Methods
  async log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any)
  async info(message: string, data?: any)
  async warn(message: string, data?: any)
  async error(message: string, data?: any)
  async clear()
  async getRecentLogs(lines: number = 100): Promise<string>
}
```

**Features**:
- Writes to `backend/logs/backtest-execution.log`
- Includes timestamp and log level in every entry
- Also logs to console for real-time visibility
- Automatically creates log directory if it doesn't exist
- Supports structured JSON data in log entries
- 80-character separator lines for readability

### 2. Script Execution Service Integration (`backend/src/services/script-execution.service.ts:17,33-113`)

Added comprehensive logging at all stages of script execution:

**Before execution**:
```typescript
await logger.info('Starting script execution', {
  scriptPath: absolutePath,
  command: `npx ts-node "${absolutePath}"`,
  timeout: timeout || this.defaultTimeout,
});
```

**After successful execution**:
```typescript
await logger.info('Script execution completed successfully', {
  executionTime: `${executionTime}ms`,
  stdout: stdout.substring(0, 500), // First 500 chars
  resultSummary: {
    trades: result.trades?.length || 0,
    totalPnL: result.metrics?.total_pnl,
    ticker: result.backtest?.ticker,
    date: result.backtest?.date,
  }
});
```

**After failed execution**:
```typescript
await logger.error('Script execution failed', {
  error: error.message,
  executionTime: `${executionTime}ms`,
  stdout: error.stdout || '',
  stderr: error.stderr || '',
  scriptPath: absolutePath,
});
```

**Stderr warnings**:
```typescript
if (stderr && stderr.trim().length > 0) {
  await logger.warn('Script execution stderr output', { stderr });
}
```

### 3. API Route Integration (`backend/src/api/routes/backtests.ts:16,330-355,494-553,566-569`)

Added logging at all key points in the intelligent backtest endpoint:

**1. Request received**:
```typescript
await logger.info('Intelligent backtest request received', {
  prompt,
  ticker,
  timeframe,
  strategyType,
});
```

**2. Routing decision made**:
```typescript
await logger.info('Routing decision made', {
  strategy: decision.strategy,
  reason: decision.reason,
  dates: decision.dates,
  assumptions: decision.assumptions,
  confidence: decision.confidence,
});
```

**3. Script generated**:
```typescript
await logger.info('Script generated successfully', {
  filepath,
  strategy: decision.strategy,
  scriptLength: script.length,
});
```

**4. Backtest completed**:
```typescript
await logger.info('Backtest completed successfully', {
  ticker,
  executionTime: `${executionTime}ms`,
  totalTrades: result.data?.metrics?.total_trades || 0,
  totalPnL: result.data?.metrics?.total_pnl || 0,
  strategy: decision.strategy,
  dates: decision.dates?.length || 0,
});
```

**5. Exception handling**:
```typescript
await logger.error('Intelligent backtest execution failed with exception', {
  error: error.message,
  stack: error.stack,
});
```

## Example Log Output

```
[2025-10-23T02:55:00.000Z] [INFO] Intelligent backtest request received
{
  "prompt": "Short at successful retest of low of day. By successful I mean a new low of day was made.",
  "ticker": "OKLO",
  "timeframe": "5min",
  "strategyType": "orb"
}
================================================================================
[2025-10-23T02:55:01.000Z] [INFO] Routing decision made
{
  "strategy": "claude-generated",
  "reason": "Custom strategy detected (retest, low of day, short)",
  "dates": ["2025-10-13", "2025-10-14", ..., "2025-10-22"],
  "assumptions": [
    "Assumed 'retest' means price revisits previous low within the same day",
    "Assumed 'successful retest' means a new low of day was made after the retest",
    ...
  ],
  "confidence": 0.85
}
================================================================================
[2025-10-23T02:55:02.000Z] [INFO] Script generated successfully
{
  "filepath": "/Users/.../backend/backtest-1761188102847-abc123.ts",
  "strategy": "claude-generated",
  "scriptLength": 4523
}
================================================================================
[2025-10-23T02:55:02.100Z] [INFO] Starting script execution
{
  "scriptPath": "/Users/.../backend/backtest-1761188102847-abc123.ts",
  "command": "npx ts-node \"/Users/.../backend/backtest-1761188102847-abc123.ts\"",
  "timeout": 30000
}
================================================================================
[2025-10-23T02:55:04.000Z] [INFO] Script execution completed successfully
{
  "executionTime": "1847ms",
  "stdout": "...",
  "resultSummary": {
    "trades": 0,
    "totalPnL": 0,
    "ticker": "OKLO",
    "date": "2025-10-13"
  }
}
================================================================================
[2025-10-23T02:55:04.100Z] [INFO] Backtest completed successfully
{
  "ticker": "OKLO",
  "executionTime": "2134ms",
  "totalTrades": 0,
  "totalPnL": 0,
  "strategy": "claude-generated",
  "dates": 10
}
================================================================================
```

## Benefits

1. **Persistent Execution History** - All backtests logged to file for later review
2. **Script Execution Diagnosis** - See exactly when scripts are executed and their output
3. **Claude Decision Tracking** - Full visibility into routing decisions and assumptions
4. **Error Debugging** - Comprehensive error logs with stack traces
5. **Performance Monitoring** - Execution times logged for all operations
6. **Trade Result Tracking** - See number of trades and P&L for each run

## Debugging Workflow

When troubleshooting a backtest (like the OKLO "retest" query):

1. **Run the backtest** via the frontend or API
2. **Open the log file**: `backend/logs/backtest-execution.log`
3. **Search for the prompt** to find the execution session
4. **Review the flow**:
   - Was the routing decision correct?
   - Was a script generated?
   - Did the script execute successfully?
   - What was the stdout/stderr output?
   - How many trades were generated?
   - What were Claude's assumptions?

## Files Modified

1. **Logger Service Created**
   - `backend/src/services/logger.service.ts` - Complete implementation

2. **Script Execution Service**
   - `backend/src/services/script-execution.service.ts:17` - Import logger
   - `backend/src/services/script-execution.service.ts:33-113` - Add logging to executeScript()

3. **API Routes**
   - `backend/src/api/routes/backtests.ts:16` - Import logger
   - `backend/src/api/routes/backtests.ts:330-355` - Log request and routing decision
   - `backend/src/api/routes/backtests.ts:494-553` - Log script generation and execution
   - `backend/src/api/routes/backtests.ts:566-569` - Log exceptions

4. **Infrastructure**
   - `.gitignore:30` - Already includes `logs/` directory
   - `backend/logs/` - Directory created for log files

## Testing

The logging system is now active. Next time you run a backtest:

1. The log file will be automatically created at `backend/logs/backtest-execution.log`
2. All execution details will be written to the file
3. You can tail the log file in real-time: `tail -f backend/logs/backtest-execution.log`
4. Or review it after execution: `cat backend/logs/backtest-execution.log`

## Next Steps (Optional Future Enhancements)

1. **Log Rotation** - Implement daily log file rotation to prevent files from growing too large
2. **Log Levels** - Add DEBUG level for even more detailed logging
3. **API Endpoint** - Create `/api/logs` endpoint to view logs from the UI
4. **Log Search** - Add search/filter functionality to find specific executions
5. **Log Metrics** - Track and display execution statistics over time

---

**Status**: ✅ Ready for use! Run a backtest and check `backend/logs/backtest-execution.log`.
