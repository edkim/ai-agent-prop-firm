-- Fix missing time_of_day values in ohlcv_data table
-- Calculate time_of_day from timestamp (milliseconds since epoch)

-- Step 1: Check current state
SELECT
  'Before fix' as status,
  COUNT(*) as total_rows,
  COUNT(time_of_day) as rows_with_time,
  COUNT(*) - COUNT(time_of_day) as rows_with_null
FROM ohlcv_data
WHERE timeframe = '5min';

-- Step 2: Update NULL time_of_day values
-- Formula: timestamp is in milliseconds, divide by 1000 to get seconds
-- Then use strftime to extract HH:MM:SS in UTC timezone
UPDATE ohlcv_data
SET time_of_day = strftime('%H:%M:%S', timestamp/1000, 'unixepoch')
WHERE time_of_day IS NULL
  AND timeframe = '5min';

-- Step 3: Check after fix
SELECT
  'After fix' as status,
  COUNT(*) as total_rows,
  COUNT(time_of_day) as rows_with_time,
  COUNT(*) - COUNT(time_of_day) as rows_with_null
FROM ohlcv_data
WHERE timeframe = '5min';

-- Step 4: Verify a few sample records
SELECT
  ticker,
  timestamp,
  time_of_day,
  date(timestamp/1000, 'unixepoch') as date,
  open,
  close
FROM ohlcv_data
WHERE timeframe = '5min'
  AND date(timestamp/1000, 'unixepoch') = '2025-10-29'
ORDER BY timestamp
LIMIT 10;
