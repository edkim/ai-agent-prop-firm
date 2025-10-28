# TradeStation Environment Variables Fix - 2025-10-28

## Problem

The TradeStation API integration was failing to load environment variables, resulting in:
```
Error: TRADESTATION_API_KEY not configured
```

Even though the variables were correctly set in `.env` file.

## Root Cause

The issue was a **module loading order problem**:

1. In `server.ts`, the `dotenv.config()` was called AFTER route imports
2. When routes were imported, they imported the TradeStation service
3. The TradeStation service defined module-level constants like:
   ```typescript
   const TRADESTATION_API_KEY = process.env.TRADESTATION_API_KEY;
   ```
4. These constants were set when the module loaded, BEFORE `dotenv.config()` was called
5. Result: constants captured `undefined` values

## Solution

### Part 1: Fix Import Order in server.ts

Move `dotenv.config()` to the very top of `server.ts`, before all other imports:

```typescript
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST before any other imports
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Now import everything else
import express from 'express';
import routes from './routes/...';
```

### Part 2: Fix TradeStation Service

Convert module-level constants to runtime function calls:

**Before:**
```typescript
const TRADESTATION_API_KEY = process.env.TRADESTATION_API_KEY;
const TRADESTATION_API_SECRET = process.env.TRADESTATION_API_SECRET;
// ... used directly in methods
```

**After:**
```typescript
// Helper functions to get environment variables at runtime
const getApiKey = () => process.env.TRADESTATION_API_KEY;
const getApiSecret = () => process.env.TRADESTATION_API_SECRET;
// ... call functions instead of using constants
```

This ensures environment variables are read at **runtime** (when methods are called) instead of at **module load time**.

## Files Modified

1. `backend/src/api/server.ts`
   - Moved dotenv.config() before all imports
   - Removed debug logging

2. `backend/src/services/tradestation.service.ts`
   - Converted 6 module-level constants to runtime functions
   - Updated 15+ method calls to use the new functions
   - Fixed in: constructor, getAuthorizationUrl, authenticate, refreshAccessToken, getAccount, getPositions, placeOrder, getAuthStatus

## Testing

After fixes, all endpoints work correctly:

### Auth URL Endpoint
```bash
$ curl http://localhost:3000/api/agents/auth/url
{
  "authUrl": "https://sim-signin.tradestation.com/authorize?...",
  "state": "random_state"
}
```

### Auth Status Endpoint
```bash
$ curl http://localhost:3000/api/agents/auth/status
{
  "authenticated": false,
  "accountId": "SIM3113503M",
  "expiresIn": null
}
```

## Next Steps: Complete OAuth Flow

To authenticate with TradeStation:

1. **Get Authorization URL:**
   ```bash
   curl http://localhost:3000/api/agents/auth/url
   ```

2. **Visit the URL in your browser:**
   - Log in to your TradeStation paper trading account
   - Authorize the application
   - You'll be redirected to: `http://localhost:3000/auth/callback?code=AUTHORIZATION_CODE`

3. **Extract the authorization code from the URL**

4. **Complete authentication:**
   ```bash
   curl -X POST http://localhost:3000/api/agents/auth/callback \
     -H "Content-Type: application/json" \
     -d '{"code": "YOUR_AUTHORIZATION_CODE"}'
   ```

5. **Verify authentication:**
   ```bash
   curl http://localhost:3000/api/agents/auth/status
   # Should now show: "authenticated": true
   ```

## Key Lessons

1. **Always load dotenv before any imports** that might use environment variables
2. **Avoid module-level constants** for environment variables in services
3. **Use runtime functions** to ensure variables are read after dotenv.config()
4. **Module caching** can cause subtle timing issues with initialization code

## Environment Variables Required

```env
TRADESTATION_API_KEY=your_api_key
TRADESTATION_API_SECRET=your_api_secret
TRADESTATION_ACCOUNT_ID=your_paper_account_id
TRADESTATION_REDIRECT_URI=http://localhost:3000/auth/callback
TRADESTATION_ENV=sim  # 'sim' for paper trading, 'live' for real money
```
