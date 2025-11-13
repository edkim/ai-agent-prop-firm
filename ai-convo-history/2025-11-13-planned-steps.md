# 2025-11-13 Investigation Plan - Signal Time Null Issue

## Objective
Investigate why signal_time is often null in learning iterations, causing low trade execution rates (2% instead of expected 35-70%).

## High-Level Steps

### 1. Understand the Problem ✅
- Review latest documentation: `2025-11-13-discovery-mode-and-template-execution.md`
- Confirm issue: Only 3 trades out of 500 signals (~2% execution rate)
- Root cause mentioned: scanner outputs `signal_time: null`

### 2. Trace Signal Flow ✅
- Check scanner generation prompts (`claude.service.ts`)
- Examine generated scanner scripts (`agent-scan-*.ts`)
- Review execution templates (`conservative.ts`)
- Understand template rejection logic

### 3. Identify Root Cause ✅
- Check database schema and data quality
- Query `ohlcv_data` table for `time_of_day` field
- **FOUND**: 94% of records (2.36M/2.51M) have NULL time_of_day
- Scanner correctly reads from database but gets null values

### 4. Implement Fixes ✅
- **Fix 1**: Populate missing time_of_day values in database
  - Created SQL script: `backend/fix-time-of-day.sql`
  - Updated all 2.5M records using strftime calculation
- **Fix 2**: Correct field name bug in signal diversification
  - Changed `signal.date` → `signal.signal_date` in learning-iteration.service.ts

### 5. Document Findings ✅
- Created detailed investigation report: `2025-11-13-signal-time-null-investigation.md`
- Included root cause analysis, fixes, and expected impact
- Ready for git commit and testing

## Outcome

**Issue Resolved**: All 5-minute bars now have valid time_of_day values. Future scanner iterations should see 35-70% execution rates instead of 2%.

**Branch**: `investigate-signal-time-null`

**Next Steps**: Test with new iteration to confirm improved execution rates.
