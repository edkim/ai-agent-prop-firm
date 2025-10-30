# Tech Sector Universe Missing from Stock Scanner Dropdown - Analysis

## Problem Summary
The `tech_sector` universe is not appearing in the Stock Scanner dropdown list, even though there is infrastructure to create it.

## Root Cause Analysis

### Issue 1: Frontend Dropdown is Hardcoded
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/components/Scanner.tsx`
**Lines:** 243-250

```typescript
<select
  value={universe}
  onChange={(e) => setUniverse(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
>
  <option value="russell2000">Russell 2000</option>
</select>
```

**Problem:** The dropdown only has one hardcoded option (`russell2000`). It does NOT fetch the available universes from the backend API, even though:
- The API endpoint exists: `/api/scanner/universes`
- The frontend service has the capability: `scannerApi.getUniverses()`
- The backend returns universes correctly

### Issue 2: The API Call Exists But Is Never Used
**File:** `/Users/edwardkim/Code/ai-backtest/frontend/src/services/scannerApi.ts`
**Lines:** 96-100

```typescript
// Get all universes
async getUniverses(): Promise<{ success: boolean; universes: Universe[] }> {
  const response = await apiClient.get('/universes');
  return response.data;
},
```

The function is defined but **never called** from the Scanner component.

### Issue 3: Backend API Endpoint is Correctly Implemented
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/api/routes/scanner.ts`
**Lines:** 514-534

```typescript
/**
 * GET /api/scanner/universes
 * Get all universes
 */
router.get('/universes', async (_req: Request, res: Response) => {
  try {
    const universes = await UniverseDataService.getUniverses();

    res.json({
      success: true,
      universes
    });
  } catch (error: any) {
    logger.error('Error fetching universes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch universes',
      message: error.message
    });
  }
});
```

The endpoint properly queries the database via `UniverseDataService.getUniverses()`.

### Issue 4: Backend Service Correctly Retrieves All Universes
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/universe-data.service.ts`
**Lines:** 94-100

```typescript
/**
 * Get all universes
 */
async getUniverses(): Promise<Universe[]> {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM universe ORDER BY name');
  return stmt.all() as Universe[];
}
```

This will return ALL universes in the database, including `tech_sector` IF it exists.

### Issue 5: The Tech Sector Universe Must Be Created
**File:** `/Users/edwardkim/Code/ai-backtest/backend/create-tech-universe.ts`

A script exists to CREATE the `tech_sector` universe:
```typescript
async function main() {
  // Creates 'tech_sector' universe from WATCHLIST_TICKERS in .env
  const result = insertUniverse.run(
    'tech_sector',
    'S&P Technology Sector stocks from WATCHLIST_TICKERS',
    techTickers.length
  );
```

**Problem:** This script is NOT automatically run. It must be manually executed.

### Issue 6: No Automatic Universe Initialization
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/api/server.ts`

The server startup only initializes the database schema. It does NOT:
- Create default universes
- Create the `tech_sector` universe

## Database Schema
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/database/schema.sql`
**Lines:** 103-110

```sql
CREATE TABLE IF NOT EXISTS universe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    total_stocks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The table exists, but needs data inserted.

## Summary of Issues

| # | Issue | Location | Severity | Fix |
|---|-------|----------|----------|-----|
| 1 | Frontend dropdown hardcoded to only `russell2000` | Scanner.tsx:243-250 | CRITICAL | Dynamically load universes from API |
| 2 | `getUniverses()` API function exists but never called | Scanner.tsx | CRITICAL | Call API on component mount and populate dropdown |
| 3 | `tech_sector` universe not in database | Database | HIGH | Run `create-tech-universe.ts` script or add initialization to server startup |
| 4 | No automatic universe creation on server startup | server.ts | MEDIUM | Add seed data or initialization logic |

## How to Verify

### 1. Check if tech_sector exists in database:
```bash
# Start backend, then:
curl http://localhost:3000/api/scanner/universes
# Should return: { "success": true, "universes": [...] }
# tech_sector should be in the list if it was created
```

### 2. Check what universes are currently in the database:
```javascript
// In database shell
SELECT name FROM universe;
// Should show: russell2000, tech_sector (if created), etc.
```

### 3. Verify the create-tech-universe script:
```bash
# From project root:
cd backend
npm run ts-node create-tech-universe.ts
# Should create/update tech_sector universe
```

## Files Involved

### Frontend
- `/Users/edwardkim/Code/ai-backtest/frontend/src/components/Scanner.tsx` - Hardcoded dropdown
- `/Users/edwardkim/Code/ai-backtest/frontend/src/services/scannerApi.ts` - API service with getUniverses()

### Backend
- `/Users/edwardkim/Code/ai-backtest/backend/src/api/routes/scanner.ts` - API endpoint
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/universe-data.service.ts` - Database query
- `/Users/edwardkim/Code/ai-backtest/backend/create-tech-universe.ts` - Script to create universe
- `/Users/edwardkim/Code/ai-backtest/backend/src/database/schema.sql` - Database schema
- `/Users/edwardkim/Code/ai-backtest/backend/src/api/server.ts` - Server initialization

### Related Population Scripts
- `/Users/edwardkim/Code/ai-backtest/backend/populate-russell2000.ts` - Creates russell2000 universe
- `/Users/edwardkim/Code/ai-backtest/backend/populate-us-stocks.ts` - Creates us-stocks universe
