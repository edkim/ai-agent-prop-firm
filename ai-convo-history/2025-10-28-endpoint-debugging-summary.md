# TradeStation API Endpoint Debugging Summary - 2025-10-28

## Current Situation

Successfully authenticated with TradeStation OAuth, but encountering 404 errors when trying to access account information endpoints.

## Investigation Findings

### 1. Authentication Status ✅
- Token valid: YES
- Expires in: ~12 minutes (from last check)
- Account ID configured: `SIM3113503M`
- API Environment: Simulation (`sim-api.tradestation.com/v3`)

### 2. API Base URL Verification ✅
Both orb (working) and our project use the same base URL:
```
https://sim-api.tradestation.com/v3
```

### 3. Case Sensitivity Issue Identified 🔍

**Key Finding**: TradeStation API error message shows account ID being lowercased:

Request sent:
```
GET /v3/accounts/SIM3113503M/balances
```

TradeStation error response:
```json
{
  "Message": "not found /accounts/sim3113503m/balances",
  "Error": "NotFound"
}
```

Notice: `SIM3113503M` (sent) → `sim3113503m` (in error message)

**Questions**:
1. Is TradeStation lowercasing the URL path internally?
2. Or is there an axios configuration lowercasing URLs?
3. Or is the endpoint path simply wrong?

### 4. Tested Endpoints (All Return 404)

1. `GET /api/agents/accounts` → 404
   - Backend calls: `GET /accounts`
   - Should list all accounts

2. `GET /api/agents/account` → 404
   - Backend calls: `GET /accounts/{accountId}/balances`
   - Should get specific account balance

### 5. Code Investigation

**No toLowerCase() calls found** in `tradestation.service.ts`

**Axios configuration** (looks correct):
```typescript
this.apiClient = axios.create({
  baseURL: getApiBaseUrl(), // https://sim-api.tradestation.com/v3
  headers: {
    'Content-Type': 'application/json'
  }
});
```

**Request interceptor** (adds Bearer token):
```typescript
this.apiClient.interceptors.request.use(
  async (config) => {
    await this.ensureValidToken();
    if (this.tokens?.access_token) {
      config.headers.Authorization = `Bearer ${this.tokens.access_token}`;
    }
    return config;
  }
);
```

## Comparison with Working orb Project

### orb Account Endpoints
```typescript
// Get all accounts
export async function getAccounts(): Promise<any> {
  return await tsRequest('GET', '/accounts');
}

// Get account balances
export async function getAccountBalances(accountId: string): Promise<any> {
  return await tsRequest('GET', `/accounts/${accountId}/balances`);
}

// Get positions
export async function getPositions(accountId: string): Promise<any> {
  return await tsRequest('GET', `/accounts/${accountId}/positions`);
}
```

These match our implementation exactly!

### orb tsRequest Function
```typescript
async function tsRequest(method: string, endpoint: string, data?: any) {
  const auth = await getAuthManager();
  const token = auth.getAccessToken();

  const config = {
    method,
    url: `${TS_BASE}${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(data && { data }),
  };

  return axios(config);
}
```

Same approach we're using!

## Next Steps to Try

### Option 1: Direct curl Test
Test the exact same request outside of our code:
```bash
curl -H "Authorization: Bearer [TOKEN]" \
  https://sim-api.tradestation.com/v3/accounts
```

This will tell us if it's our code or the API itself.

### Option 2: Check TradeStation API Documentation
- Verify the correct endpoint paths for sim environment
- Check if there are different endpoints for paper trading vs live
- Look for any known issues with case sensitivity

### Option 3: Try brokerage Endpoint Prefix
Some APIs use `/brokerage/accounts` instead of `/accounts`:
```typescript
const response = await this.apiClient.get(`/brokerage/accounts`);
```

### Option 4: Check Account Key Format
Maybe the account ID should be formatted differently:
- `SIM3113503M` (current)
- `sim3113503m` (lowercase)
- `SIM-3113503-M` (with dashes)

### Option 5: Verify Token Scopes
Check if token has required scopes:
- `ReadAccount` ✅ (in OAuth request)
- `MarketData` ✅ (in OAuth request)
- Others?

## Questions for TradeStation Support

1. What is the correct endpoint to list accounts in the simulation environment?
2. Is the API case-sensitive for account IDs?
3. Are there different endpoints for paper trading vs live trading?
4. What format should the account ID be in (uppercase, lowercase, dashes)?
5. Are there any known issues with the `/accounts` endpoint?

## Files Modified Today

1. `backend/src/services/tradestation.service.ts`
   - Added `getAccounts()` method
   - Already has `getAccount()`, `getPositions()`, `placeOrder()`, etc.

2. `backend/src/api/routes/trading-agent.ts`
   - Added `GET /api/agents/accounts` route
   - Added `GET /api/agents/account` route
   - Added `GET /api/agents/positions` route
   - Added `POST /api/agents/orders` route

## Current Server Status

Backend running on port 3000
- Tokens loaded successfully from file
- Token auto-refresh scheduled
- All routes registered
- Authentication working

## What's Working

- ✅ OAuth authentication flow
- ✅ Token storage and refresh
- ✅ Trading agent creation
- ✅ Environment variable loading
- ✅ Database initialization
- ✅ Bearer token injection in requests

## What's Not Working

- ❌ GET /accounts endpoint (404)
- ❌ GET /accounts/{id}/balances endpoint (404)
- ❌ Cannot fetch account information
- ❌ Cannot test positions or orders without account working

## Recommended Next Action

**Most important**: Get a direct curl test working with the TradeStation API to isolate whether the issue is:
1. Our code
2. Our configuration
3. The TradeStation API itself
4. Our account/token permissions

Once we can successfully curl the endpoint, we can work backwards to figure out what's different in our code.

## Token Details (for curl testing)

Token expires in: ~10 minutes (check `/api/agents/auth/status` for exact time)
Token location: `backend/.tokens.json`

To extract token for curl:
```bash
cat backend/.tokens.json | jq -r '.access_token'
```

Then test:
```bash
TOKEN=$(cat backend/.tokens.json | jq -r '.access_token')
curl -H "Authorization: Bearer $TOKEN" \
  https://sim-api.tradestation.com/v3/accounts
```

## Summary

We have successfully implemented the OAuth flow and created all the necessary endpoints and methods for trading. However, we're stuck on basic account information retrieval due to 404 errors from the TradeStation API. The endpoints match the working orb project exactly, so the issue is either:
1. Something subtle in our configuration
2. A permission issue with our token/account
3. A quirk of the TradeStation API we haven't discovered yet

The next developer should start with direct API testing using curl to isolate the problem.
