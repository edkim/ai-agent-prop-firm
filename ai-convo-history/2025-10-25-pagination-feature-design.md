# Scanner Pagination Feature Design
**Date:** 2025-10-25
**Status:** Design/Proposed
**Priority:** P1 (High)

## Problem Statement

Current scanner implementation limits results to 10,000 rows to prevent memory overflow. However, some use cases require retrieving larger datasets (200K+ rows) for programmatic processing.

**Current Constraints:**
- Hard limit: 10,000 results per request
- No way to retrieve additional results
- Programmatic analysis blocked for large datasets

## Why 10,000 Row Limit?

The 10K limit was chosen based on:

### Memory Safety
- Each `DailyMetrics` row ≈ 500 bytes
- 10,000 rows × 500 bytes = ~5MB raw data
- With JavaScript object overhead + sorting + scoring = 15-20MB total
- Safe for Node.js default heap size (512MB-1GB)

### Response Time
- 10K rows processes in ~5 seconds
- Beyond 10K, API responses exceed 10+ seconds
- Frontend UX degrades with large payloads

### Industry Standards
- GitHub API: 1,000 max per request
- Twitter API: 5,000 max per request
- Stripe API: 100 default, 10,000 max
- Most APIs: 1K-10K range

### Empirical Testing
- System crashed at 400K+ rows (out of memory)
- 10K = 2.5% of crash threshold
- Comfortable safety margin

## Proposed Solution: Cursor-Based Pagination

Implement cursor-based pagination to allow retrieval of unlimited results in manageable chunks.

### Why Cursor-Based (vs Offset-Based)?

**Cursor advantages:**
- Stable: Results don't shift if data changes
- Efficient: Database uses index for cursor WHERE clause
- Resumable: Can continue from any point
- Standard: Used by Facebook, Twitter, GitHub APIs

**Offset disadvantages:**
- Unstable: Results shift if rows inserted/deleted
- Slow: `OFFSET 50000` still scans 50K rows
- Not resumable across sessions

## Design Specification

### 1. API Interface Changes

#### Request Parameters (ScanCriteria)
```typescript
export interface ScanCriteria {
  // Existing fields
  universe?: string;
  start_date?: string;
  end_date?: string;
  min_change_percent?: number;
  // ... all existing filters ...

  // New pagination fields
  page_size?: number;    // Results per page (default: 1000, max: 10000)
  cursor?: string;       // Opaque cursor for next page
}
```

#### Response Format (ScanResult)
```typescript
export interface ScanResult {
  // Existing fields
  matches: ScanMatch[];
  criteria: ScanCriteria;
  total_matches: number;
  scan_time_ms: number;
  scan_history_id?: string;

  // New pagination metadata
  has_more: boolean;           // True if more results exist
  next_cursor?: string;        // Cursor for next page (undefined if no more)
  page_size: number;           // Actual page size returned
}
```

### 2. Cursor Format

**Format:** `{date}:{ticker}`
**Example:** `2025-06-15:AAPL`

**Why this format?**
- Matches ORDER BY clause: `ORDER BY date DESC, ticker ASC`
- Simple to parse and validate
- URL-safe (no encoding needed)
- Human-readable for debugging

### 3. SQL Implementation

#### First Page (no cursor)
```sql
SELECT * FROM daily_metrics
WHERE {filter_conditions}
ORDER BY date DESC, ticker ASC
LIMIT 1000
```

#### Subsequent Pages (with cursor)
```sql
SELECT * FROM daily_metrics
WHERE {filter_conditions}
  AND (date < '2025-06-15' OR (date = '2025-06-15' AND ticker > 'AAPL'))
ORDER BY date DESC, ticker ASC
LIMIT 1000
```

**Performance:**
- Uses composite index on (date, ticker)
- Avoids full table scan
- Efficient at any page depth

### 4. Implementation Details

#### Scanner Service Changes

```typescript
async scan(criteria: ScanCriteria): Promise<ScanResult> {
  const startTime = Date.now();

  // Parse pagination params
  const pageSize = Math.min(criteria.page_size || 1000, 10000);
  const cursor = this.parseCursor(criteria.cursor);

  // Build query with cursor WHERE clause
  const { query, params } = await this.buildQuery(criteria, cursor);

  const db = getDatabase();
  const stmt = db.prepare(query);

  // Fetch one extra row to check if more results exist
  const results: DailyMetrics[] = [];
  let count = 0;
  const fetchLimit = pageSize + 1;

  for (const row of stmt.iterate(...params)) {
    results.push(row as DailyMetrics);
    count++;

    if (count >= fetchLimit) break;
  }

  // Check if more results exist
  const hasMore = results.length > pageSize;
  if (hasMore) {
    results.pop(); // Remove the extra row
  }

  // Generate next cursor from last result
  const nextCursor = hasMore && results.length > 0
    ? this.createCursor(results[results.length - 1])
    : undefined;

  // Convert to ScanMatch format
  const matches = results.map(metrics => ({
    ticker: metrics.ticker,
    date: metrics.date,
    metrics,
    score: this.calculateRelevanceScore(metrics, criteria)
  }));

  return {
    matches,
    criteria,
    total_matches: matches.length,
    scan_time_ms: Date.now() - startTime,
    has_more: hasMore,
    next_cursor: nextCursor,
    page_size: matches.length,
    scan_history_id: this.saveScanHistory(...)
  };
}

private parseCursor(cursor?: string): { date: string; ticker: string } | null {
  if (!cursor) return null;

  const parts = cursor.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid cursor format. Expected "date:ticker"');
  }

  return { date: parts[0], ticker: parts[1] };
}

private createCursor(metrics: DailyMetrics): string {
  return `${metrics.date}:${metrics.ticker}`;
}

private async buildQuery(
  criteria: ScanCriteria,
  cursor: { date: string; ticker: string } | null
): Promise<{ query: string; params: any[] }> {
  const conditions: string[] = [];
  const params: any[] = [];

  // Existing filter conditions
  // ...

  // Add cursor condition for pagination
  if (cursor) {
    conditions.push(
      '(date < ? OR (date = ? AND ticker > ?))'
    );
    params.push(cursor.date, cursor.date, cursor.ticker);
  }

  // Build query
  let query = 'SELECT * FROM daily_metrics';

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY date DESC, ticker ASC';

  // Add limit (page_size + 1 to detect if more results exist)
  const pageSize = Math.min(criteria.page_size || 1000, 10000);
  query += ' LIMIT ?';
  params.push(pageSize + 1);

  return { query, params };
}
```

#### Validation Changes

```typescript
private validateQuery(criteria: ScanCriteria): void {
  const warnings: string[] = [];

  // Validate page_size
  if (criteria.page_size !== undefined) {
    if (criteria.page_size < 1) {
      throw new Error('page_size must be at least 1');
    }
    if (criteria.page_size > 10000) {
      warnings.push('page_size exceeds 10,000 - will be capped at 10,000');
    }
    if (criteria.page_size > 5000) {
      warnings.push('Large page_size (>5000) may result in slow response times');
    }
  }

  // Validate cursor format
  if (criteria.cursor) {
    const parts = criteria.cursor.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid cursor format. Expected "date:ticker"');
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
      throw new Error('Invalid cursor date format. Expected YYYY-MM-DD');
    }
  }

  // Existing validation logic...
}
```

## Usage Examples

### Example 1: Fetch All Results (Client-Side)

```typescript
async function getAllScanResults(baseCriteria: ScanCriteria): Promise<ScanMatch[]> {
  const allMatches: ScanMatch[] = [];
  let cursor: string | undefined = undefined;
  let pageNum = 1;

  do {
    console.log(`Fetching page ${pageNum}...`);

    const response = await fetch('/api/scanner/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseCriteria,
        page_size: 5000,  // Fetch 5K at a time
        cursor
      })
    });

    const result: ScanResult = await response.json();

    allMatches.push(...result.matches);
    cursor = result.next_cursor;
    pageNum++;

    console.log(`  Got ${result.matches.length} results, total: ${allMatches.length}`);

  } while (cursor);  // Continue while has_more is true

  console.log(`Finished! Total results: ${allMatches.length}`);
  return allMatches;
}

// Usage
const criteria = {
  universe: 'russell2000',
  start_date: '2024-01-01',
  end_date: '2025-10-25',
  min_consecutive_up_days: 3
};

const allResults = await getAllScanResults(criteria);
// Process 200K+ results...
```

### Example 2: Manual Pagination

```bash
# Page 1
curl -X POST http://localhost:3000/api/scanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "universe": "russell2000",
    "start_date": "2024-01-01",
    "end_date": "2025-10-25",
    "page_size": 1000
  }'

# Response:
{
  "success": true,
  "matches": [...1000 results...],
  "has_more": true,
  "next_cursor": "2025-06-15:AAPL",
  "page_size": 1000,
  "total_matches": 1000
}

# Page 2
curl -X POST http://localhost:3000/api/scanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "universe": "russell2000",
    "start_date": "2024-01-01",
    "end_date": "2025-10-25",
    "page_size": 1000,
    "cursor": "2025-06-15:AAPL"
  }'

# Continue until has_more = false
```

### Example 3: Export to CSV

```typescript
async function exportScanToCSV(criteria: ScanCriteria, filename: string) {
  const fs = require('fs');
  const csvWriter = fs.createWriteStream(filename);

  // Write CSV header
  csvWriter.write('ticker,date,close,change_percent,volume_ratio,rsi_14\n');

  let cursor: string | undefined;
  let totalExported = 0;

  do {
    const result = await scanApi({ ...criteria, page_size: 5000, cursor });

    // Write rows to CSV
    for (const match of result.matches) {
      const row = [
        match.ticker,
        match.date,
        match.metrics.close,
        match.metrics.change_percent,
        match.metrics.volume_ratio,
        match.metrics.rsi_14
      ].join(',');

      csvWriter.write(row + '\n');
      totalExported++;
    }

    cursor = result.next_cursor;
    console.log(`Exported ${totalExported} rows...`);

  } while (cursor);

  csvWriter.end();
  console.log(`CSV export complete: ${totalExported} rows written to ${filename}`);
}
```

## Backwards Compatibility

✅ **Fully backwards compatible**

- Existing queries without `page_size` or `cursor` work unchanged
- Default behavior: Return up to 10,000 results (as before)
- New fields are optional and opt-in
- No breaking changes to existing API contracts

## Performance Analysis

### Memory Usage
- **Current:** O(n) where n ≤ 10,000
- **With pagination:** O(p) where p = page_size ≤ 10,000
- **Same worst case, but controlled**

### Query Performance
- **First page:** Same as current (~5 seconds for 10K)
- **Subsequent pages:** Slightly faster (cursor filter more selective)
- **Database load:** Same per-page, distributed over time

### Network Performance
- **Total time for 200K rows:**
  - Page size 1K: 200 requests × 1s = ~200 seconds
  - Page size 5K: 40 requests × 5s = ~200 seconds
  - Page size 10K: 20 requests × 10s = ~200 seconds
- **Optimal page size:** 5,000 (balance latency vs throughput)

## Database Indexing Requirements

**Required index:**
```sql
CREATE INDEX idx_daily_metrics_date_ticker
  ON daily_metrics(date DESC, ticker ASC);
```

**Verify existing indexes:**
```sql
-- Check if index exists
SELECT * FROM sqlite_master
WHERE type = 'index'
  AND tbl_name = 'daily_metrics'
  AND (name LIKE '%date%' OR name LIKE '%ticker%');
```

**Performance impact:**
- Without index: Full table scan (slow for 200K+ rows)
- With index: Index seek (fast at any page depth)

## Error Handling

### Invalid Cursor
```json
{
  "success": false,
  "error": "Invalid cursor format. Expected 'date:ticker'",
  "message": "Cursor must be in format YYYY-MM-DD:TICKER"
}
```

### Expired Cursor (Optional Enhancement)
```json
{
  "success": false,
  "error": "Cursor expired",
  "message": "Data has changed significantly. Please start from beginning."
}
```

### Page Size Exceeded
```json
{
  "success": false,
  "error": "page_size exceeds maximum",
  "message": "Maximum page_size is 10,000. Requested: 50,000"
}
```

## Testing Strategy

### Unit Tests
1. Parse valid/invalid cursors
2. Generate cursors from metrics
3. Build queries with/without cursors
4. Validate page_size constraints

### Integration Tests
1. Paginate through 100K rows
2. Verify cursor stability with concurrent writes
3. Check has_more accuracy
4. Validate results don't overlap/skip

### Load Tests
1. Fetch 200K rows across multiple pages
2. Measure memory usage per page
3. Verify no memory leaks
4. Check response times scale linearly

## Rollout Plan

### Phase 1: Implementation (2-3 hours)
- [ ] Update TypeScript interfaces
- [ ] Implement cursor parsing/generation
- [ ] Modify buildQuery() for cursor WHERE clause
- [ ] Update scan() method for pagination logic
- [ ] Add validation for page_size and cursor

### Phase 2: Testing (1 hour)
- [ ] Write unit tests
- [ ] Test with small dataset (1K rows)
- [ ] Test with large dataset (100K+ rows)
- [ ] Verify memory stays within bounds

### Phase 3: Documentation (30 min)
- [ ] Update API documentation
- [ ] Add usage examples
- [ ] Document cursor format
- [ ] Add troubleshooting guide

### Phase 4: Deployment (15 min)
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Monitor memory usage
- [ ] Deploy to production

## Alternative Approaches Considered

### 1. Offset-Based Pagination
```sql
SELECT * FROM daily_metrics
WHERE {filters}
ORDER BY date DESC
LIMIT 1000 OFFSET 5000
```

**Rejected because:**
- Slow: OFFSET 5000 still scans first 5000 rows
- Unstable: Results shift if data changes
- Memory: Database must load and skip OFFSET rows

### 2. Page Number Pagination
```
GET /api/scanner/scan?page=5&per_page=1000
```

**Rejected because:**
- Same issues as offset-based
- Requires tracking total count (expensive)
- Page numbers become invalid if data changes

### 3. Stream Entire Response
```
GET /api/scanner/scan/stream
```

**Rejected because:**
- HTTP streaming complex to implement
- Difficult to resume if interrupted
- Client must handle streaming parser
- Not RESTful

### 4. Export to File
```
POST /api/scanner/export
Returns: { file_id: '...' }

GET /api/scanner/export/:file_id
Returns: CSV/JSON file
```

**Not rejected - complementary!**
- Good for one-time bulk exports
- Can implement alongside pagination
- Use pagination API for export generation

## Future Enhancements

### 1. Parallel Page Fetching
Allow clients to fetch multiple pages concurrently:
```typescript
const pages = await Promise.all([
  fetch(criteria, 'page1_cursor'),
  fetch(criteria, 'page2_cursor'),
  fetch(criteria, 'page3_cursor')
]);
```

### 2. Cursor Encryption
Prevent cursor tampering:
```typescript
cursor = encrypt('2025-06-15:AAPL')
// Becomes: "eyJkYXRlIjoiMjAyNS0wNi0xNSIsInRpY2tlciI6IkFBUEwifQ=="
```

### 3. Total Count Estimation
Add approximate total:
```json
{
  "has_more": true,
  "estimated_total": 47500,  // ±10% accuracy
  "next_cursor": "..."
}
```

### 4. Resume Token
Allow resuming interrupted scans:
```json
{
  "scan_id": "abc123",
  "resume_token": "page_15_of_47",
  "expires_at": "2025-10-26T12:00:00Z"
}
```

## Metrics to Monitor

Post-deployment, track:

1. **Pagination usage:**
   - % of scans using pagination
   - Average pages per scan
   - Most common page_size values

2. **Performance:**
   - P50/P95/P99 response times per page
   - Memory usage per page
   - Database query times

3. **Errors:**
   - Invalid cursor errors
   - Page size validation failures
   - Timeout errors

4. **Business metrics:**
   - Total results fetched via pagination
   - Largest scan completed
   - Use cases driving pagination

## Conclusion

Cursor-based pagination is the right solution for retrieving 200K+ results:
- ✅ Memory safe (max 10K rows in memory)
- ✅ Scalable (unlimited total results)
- ✅ Fast (efficient cursor queries)
- ✅ Stable (results don't shift)
- ✅ Resumable (continue from any point)
- ✅ Standard (industry best practice)

**Estimated effort:** 3-4 hours total
**Risk level:** Low (isolated change, backwards compatible)
**Impact:** High (unblocks 200K+ row use cases)

**Recommendation:** Implement in next sprint
