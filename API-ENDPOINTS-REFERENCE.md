# API Endpoints Quick Reference

## Scanner Debug Endpoints (NEW - Fast Iteration Tools)

### Debug Scanner on Single Ticker/Date
```bash
POST /api/scanner-debug
```
**Body:**
```json
{
  "scannerCode": "TypeScript scanner code",
  "ticker": "AAPL",
  "date": "2025-01-15",
  "explain": true  // Optional: adds detailed condition logging
}
```

**Response:**
```json
{
  "ticker": "AAPL",
  "date": "2025-01-15",
  "barsScanned": 78,
  "signalsFound": 2,
  "sampleBars": [...],
  "debugLogs": ["..."],
  "signals": [...]
}
```

**Use case:** Quickly understand why a scanner isn't finding signals on a specific ticker/date

### Validate Scanner (Quick Check)
```bash
POST /api/scanner-debug/validate
```
**Body:**
```json
{
  "scannerCode": "TypeScript scanner code",
  "tickers": ["AAPL", "TSLA", "NVDA"],  // Optional, defaults to these 3
  "dates": ["2025-01-10", "2025-01-13"],  // Optional, defaults to recent dates
  "minSignals": 1  // Optional, default 1
}
```

**Response:**
```json
{
  "valid": true,
  "signalsFound": 5,
  "message": "✅ Found 5 signals in quick check",
  "details": [
    { "ticker": "AAPL", "date": "2025-01-10", "signals": 2 },
    { "ticker": "TSLA", "date": "2025-01-10", "signals": 3 }
  ]
}
```

**Use case:** Pre-flight check before running full backtest. Catches zero-signal scanners in ~10 seconds instead of wasting 60+ seconds on full backtest.

## Learning Agent Endpoints

### Agent CRUD

#### Create Agent
```bash
POST /api/learning-agents/create
```
Body: `{ "instructions": "Natural language description of strategy" }`

#### List All Agents
```bash
GET /api/learning-agents
GET /api/learning-agents?activeOnly=true
```

#### Get Agent
```bash
GET /api/learning-agents/:id
```

#### Update Agent
```bash
PUT /api/learning-agents/:id
```
Body: Agent fields to update

#### Delete Agent
```bash
DELETE /api/learning-agents/:id
```

### Learning Iterations

#### Preview Next Iteration
```bash
GET /api/learning-agents/:id/iterations/preview
```
Shows what the scanner prompt will be for the next iteration

#### Trigger a Single Iteration
```bash
POST /api/learning-agents/:id/iterations/start
```
- **No convergence checks** - runs immediately
- **No daily limits** - can be called multiple times
- Perfect for testing fixes

Body (optional): `{ "manualGuidance": "Optional instructions for this iteration" }`

Example:
```bash
curl -X POST http://localhost:3000/api/learning-agents/4eed4e6a-dec3-4115-a865-c125df39b8d1/iterations/start \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Get All Iterations
```bash
GET /api/learning-agents/:id/iterations
```

#### Get Specific Iteration
```bash
GET /api/learning-agents/:id/iterations/:iteration_id
```

#### Get Iteration Scripts and Prompts
```bash
GET /api/learning-agents/:id/iterations/:iteration_id/scripts
```
Returns: `scannerScript`, `executionScript`, `scannerPrompt`, `executionPrompt`

### Strategies

#### Get All Strategy Versions
```bash
GET /api/learning-agents/:id/strategies
```

#### Get Specific Strategy Version
```bash
GET /api/learning-agents/:id/strategies/:version
```

### Knowledge Base

#### Get Agent Knowledge
```bash
GET /api/learning-agents/:id/knowledge
GET /api/learning-agents/:id/knowledge?type=INSIGHT
GET /api/learning-agents/:id/knowledge?pattern=gap_and_go
```

### Continuous Learning

#### Start Continuous Learning
```bash
POST /api/learning-agents/:id/continuous-learning/start
```
- Runs iterations in a loop
- Checks convergence between iterations
- Checks daily iteration limits
- Auto-stops when converged

#### Stop Continuous Learning
```bash
POST /api/learning-agents/:id/continuous-learning/stop
```

#### Get Continuous Learning Status
```bash
GET /api/learning-agents/:id/continuous-learning/status
```

### Scheduled Learning

#### Enable Auto-Learning
```bash
POST /api/learning-agents/:id/auto-learn/enable
```
Body: `{ "schedule": "0 9 * * *" }` (cron expression)

#### Disable Auto-Learning
```bash
POST /api/learning-agents/:id/auto-learn/disable
```

#### Update Schedule
```bash
PUT /api/learning-agents/:id/schedule
```
Body: `{ "schedule": "0 9 * * *" }`

### Auto-Approval

#### Enable Auto-Approval
```bash
POST /api/learning-agents/:id/auto-approve/enable
```

#### Disable Auto-Approval
```bash
POST /api/learning-agents/:id/auto-approve/disable
```

#### Update Approval Thresholds
```bash
PUT /api/learning-agents/:id/approval-thresholds
```

### Alerts

#### Get Agent Alerts
```bash
GET /api/learning-agents/:id/alerts
GET /api/learning-agents/:id/alerts?includeAcknowledged=true
```

#### Get All Unacknowledged Alerts
```bash
GET /api/learning-agents/alerts/unacknowledged
```

#### Acknowledge Alert
```bash
POST /api/learning-agents/:id/alerts/:alertId/acknowledge
```

#### Delete Alert
```bash
DELETE /api/learning-agents/:id/alerts/:alertId
```

### Graduation

#### Check Graduation Eligibility
```bash
GET /api/learning-agents/:id/graduation/eligibility
```

#### Graduate Agent
```bash
POST /api/learning-agents/:id/graduate
```
Body (optional): `{ "force": true }`

#### Demote Agent
```bash
POST /api/learning-agents/:id/demote
```
Body: `{ "reason": "Reason for demotion" }`

### Activity Log

#### Get Agent Activity
```bash
GET /api/learning-agents/:id/activity
GET /api/learning-agents/:id/activity?limit=50
```

#### Get Recent Activity (All Agents)
```bash
GET /api/learning-agents/activity/recent
GET /api/learning-agents/activity/recent?limit=100
```

## Common Agent IDs

Recent active agents:
- **Gap and Go v2**: `701ea2b4-082d-4562-8e89-308f686d538c`
- **Opening Range Breakout**: `277d5564-5e93-4c52-a88b-a5b5eb1e0909`
- **High of Day Breakout Scalper**: `5304d178-0879-4d78-ac29-207112dfe951`
- **First Red Day Fader** (legacy): `4eed4e6a-dec3-4115-a865-c125df39b8d1`

## Notes

- All learning agent routes are defined in `backend/src/api/routes/agents.ts`
- Routes are mounted at `/api/learning-agents` (separate from live trading agents at `/api/agents`)
- Server runs on port 3000 by default
- Use `npm run dev:backend` to start the backend server
