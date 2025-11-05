# Frontend API Proxy Fix - 2025-11-04

## Problem

After deploying the frontend to production, the web UI showed network errors:

```
GET http://localhost:3000/api/backtest-sets net::ERR_CONNECTION_REFUSED
GET http://localhost:3000/api/scanner/universes net::ERR_CONNECTION_REFUSED
GET http://localhost:3000/api/learning-agents/ net::ERR_CONNECTION_REFUSED
```

The frontend was trying to connect to `http://localhost:3000/api/...` which only works during local development, not in production.

---

## Root Cause

In `frontend/src/services/api.ts` line 10:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
```

**Issue:** The default fallback was hardcoded to `localhost:3000`, which meant:
- ✅ Works in development (API runs on localhost:3000)
- ❌ Fails in production (browser tries to connect to localhost, not the server)

**What should happen:**
- Production: Use relative path `/api` → Caddy proxies to backend
- Development: Use `http://localhost:3000/api` → Direct connection

---

## Solution

### 1. Created Production Environment File

**File:** `frontend/.env.production`

```env
# Production environment variables
# API base URL - use relative path for Caddy proxy
VITE_API_BASE_URL=/api
```

**How Vite uses this:**
- During `vite build`, Vite reads `.env.production`
- Sets `import.meta.env.VITE_API_BASE_URL = "/api"`
- Frontend makes requests to `/api/...` (relative path)
- Browser sends requests to `https://104.131.34.225/api/...`
- Caddy proxies to `localhost:3000/api/...`
- Backend receives request ✅

### 2. Rebuilt Frontend

```bash
cd /Users/edwardkim/Code/ai-backtest/frontend
npx vite build
```

**Output:**
```
dist/assets/index-BfsnzRII.js   1,144.32 kB │ gzip: 289.07 kB
```

**Note:** New bundle name `index-BfsnzRII.js` confirms new build

### 3. Deployed to Production

```bash
# Package
tar czf /tmp/frontend-dist-fixed.tar.gz -C dist .

# Upload
scp /tmp/frontend-dist-fixed.tar.gz root@104.131.34.225:/tmp/

# Extract
ssh root@104.131.34.225 "rm -rf /var/www/ai-backtest/frontend/dist/* && \
  tar xzf /tmp/frontend-dist-fixed.tar.gz -C /var/www/ai-backtest/frontend/dist/"
```

---

## Verification

### API Proxy Test

```bash
curl -k https://104.131.34.225/api/agents | jq 'if has("agents") then (.agents | length) else . end'
```

**Result:** `7` (7 agents found) ✅

### Request Flow

```
Browser
  ↓
  GET https://104.131.34.225/api/agents
  ↓
Caddy (Port 443)
  ↓
  Proxy to localhost:3000/api/agents
  ↓
Backend API
  ↓
  Response: {"agents": [...]}
  ↓
Caddy
  ↓
Browser ✅
```

---

## How This Works

### Development (Local)

**Environment:** `.env` or `.env.development` (not created, uses default)
```
VITE_API_BASE_URL not set
→ Falls back to: http://localhost:3000/api
```

**Request Flow:**
```
Browser → http://localhost:5173 (Vite dev server)
Frontend → http://localhost:3000/api/agents (direct to backend)
Backend → Response
```

✅ Works because backend runs on localhost:3000

### Production

**Environment:** `.env.production`
```
VITE_API_BASE_URL=/api
```

**Request Flow:**
```
Browser → https://104.131.34.225 (Caddy)
Frontend → /api/agents (relative path)
Browser → https://104.131.34.225/api/agents (same origin)
Caddy → localhost:3000/api/agents (proxy)
Backend → Response
```

✅ Works because Caddy proxies `/api/*` to backend

---

## Key Concepts

### Relative vs Absolute URLs

**Absolute URL (broken in production):**
```typescript
baseURL: 'http://localhost:3000/api'
// Request: http://localhost:3000/api/agents
// ❌ Fails: localhost is the user's computer, not the server
```

**Relative URL (works in production):**
```typescript
baseURL: '/api'
// Request: /api/agents
// Browser sends: https://104.131.34.225/api/agents (same origin)
// ✅ Works: Caddy proxies to backend
```

### Environment Variables in Vite

**Build-time variables:**
- Set via `.env.production`, `.env.development`
- Must start with `VITE_`
- Available as `import.meta.env.VITE_*`
- **Baked into the build** (not runtime)

**Example:**
```env
# .env.production
VITE_API_BASE_URL=/api
```

**In code:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
// Production build: const API_BASE_URL = "/api";
```

---

## Files Changed

### Created
- ✅ `frontend/.env.production` - Production environment config

### Modified
- ❌ None - `api.ts` already had support for `VITE_API_BASE_URL`

### Deployed
- ✅ `frontend/dist/` - New build with correct API URL

---

## Future Improvements

### 1. Create Development Environment File

**File:** `frontend/.env.development`

```env
# Development environment variables
VITE_API_BASE_URL=http://localhost:3000/api
```

**Benefit:** Explicit configuration instead of relying on fallback

### 2. Add Environment Indicator

Show which environment the app is running in:

```typescript
// In App.tsx
const isDev = import.meta.env.DEV;
const apiUrl = import.meta.env.VITE_API_BASE_URL;

console.log(`Environment: ${isDev ? 'Development' : 'Production'}`);
console.log(`API Base URL: ${apiUrl}`);
```

### 3. Health Check on Load

Add a health check when the app loads:

```typescript
// On app initialization
const checkHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    console.log('✅ API connected:', response.data);
  } catch (error) {
    console.error('❌ API connection failed:', error);
  }
};
```

---

## Deployment Checklist

When deploying frontend updates:

- [ ] Update code
- [ ] Ensure `.env.production` exists with correct values
- [ ] Run `npx vite build` (NOT `npm run build` if it runs TypeScript)
- [ ] Check `dist/index.html` has new bundle hash
- [ ] Package: `tar czf dist.tar.gz -C dist .`
- [ ] Upload to server
- [ ] Extract to `/var/www/ai-backtest/frontend/dist/`
- [ ] Test in browser
- [ ] Check browser console for errors
- [ ] Verify API calls work

---

## Troubleshooting

### Issue: Still seeing localhost:3000 errors

**Check:**
1. Is `.env.production` in the right location?
   ```bash
   ls frontend/.env.production
   ```

2. Did you rebuild after creating the file?
   ```bash
   cd frontend && npx vite build
   ```

3. Did you deploy the new build?
   ```bash
   ssh root@104.131.34.225 "cat /var/www/ai-backtest/frontend/dist/index.html"
   # Should show new bundle hash
   ```

4. Clear browser cache
   - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Or open in incognito mode

### Issue: API returns 404

**Check Caddy config:**
```bash
ssh root@104.131.34.225 "cat /etc/caddy/Caddyfile"
```

Should have:
```caddy
handle /api/* {
    reverse_proxy localhost:3000
}
```

**Test proxy directly:**
```bash
curl -k https://104.131.34.225/api/health
```

### Issue: CORS errors

**Check backend is allowing requests:**
- Backend should have CORS middleware enabled
- Should allow requests from the production domain

---

## Summary

**Problem:** Frontend hardcoded to `localhost:3000` ❌
**Solution:** Use relative path `/api` in production ✅
**Method:** Create `.env.production` with `VITE_API_BASE_URL=/api`
**Result:** Frontend now works in production! 🎉

---

## Related Documentation

- `ai-convo-history/2025-11-04-frontend-deployment-complete.md` - Initial deployment
- `deployment/Caddyfile` - Reverse proxy configuration
- `frontend/src/services/api.ts` - API client setup

---

## Commits

```
34dbd30 - Fix frontend API base URL for production deployment
```

**Changes:**
- Created `frontend/.env.production`
- Set `VITE_API_BASE_URL=/api` for production
- Rebuilt frontend with correct configuration
- Deployed to production server

**Verification:**
- API requests now use relative paths
- Caddy successfully proxies to backend
- Web UI loads data correctly
- No more localhost:3000 errors
