# Graduation API Reference

**Date**: 2025-11-04
**Purpose**: Document API endpoints for agent graduation with template-based exits
**Status**: ✅ Fully functional and tested

---

## Overview

The graduation system automatically copies the winning execution template from learning iterations to the agent's configuration when graduating to paper trading. **No manual configuration needed!**

---

## API Endpoints

### 1. Check Graduation Eligibility

**Endpoint**: `GET /api/learning-agents/:id/graduation/eligibility`

**Purpose**: Check if an agent meets criteria for graduation

**Response**:
```json
{
  "success": true,
  "eligibility": {
    "eligible": false,
    "reason": "Failed criteria: iterations, win_rate, sharpe, consistency",
    "criteria_met": {
      "iterations": false,      // Need 20+ iterations
      "win_rate": false,        // Need 60%+ win rate
      "sharpe": false,          // Need 2.0+ Sharpe ratio
      "return": true,           // Need 5%+ total return
      "signals": true,          // Need 50+ signals
      "consistency": false      // Need consistent performance over last 5 iterations
    },
    "stats": {
      "total_iterations": 16,
      "avg_win_rate": 0.05,
      "avg_sharpe": 0.77,
      "avg_return": 7.98,
      "total_signals": 1851,
      "recent_consistency": false
    }
  }
}
```

**Frontend Usage**:
```typescript
async function checkGraduationEligibility(agentId: string) {
  const response = await fetch(`/api/learning-agents/${agentId}/graduation/eligibility`);
  const data = await response.json();

  if (data.eligibility.eligible) {
    // Show "Graduate" button
    // Display: "Agent ready to graduate to paper trading"
  } else {
    // Show eligibility status
    // Display: data.eligibility.reason
    // Show progress: data.eligibility.criteria_met
  }
}
```

---

### 2. Graduate Agent

**Endpoint**: `POST /api/learning-agents/:id/graduate`

**Purpose**: Graduate agent to next status level (learning → paper_trading → live_trading)

**Request Body**:
```json
{
  "force": false  // Set to true to bypass eligibility checks (admin only)
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Agent graduated to paper_trading",
  "newStatus": "paper_trading"
}
```

**Response (Failure - Not Eligible)**:
```json
{
  "success": false,
  "error": "Agent not eligible for graduation: Failed criteria: iterations, win_rate"
}
```

**What Happens Automatically**:

1. ✅ Queries latest iteration's `winning_template`
2. ✅ Creates `exit_strategy_config` JSON:
   ```json
   {
     "template": "price_action",
     "stopLossPercent": null,
     "takeProfitPercent": null,
     "trailingStopPercent": 2.0,
     "exitTime": null,
     "atrMultiplier": null
   }
   ```
3. ✅ Updates agent status to `paper_trading`
4. ✅ Creates paper trading account ($100k balance)
5. ✅ Logs activity to `agent_activity_log`

**Frontend Usage**:
```typescript
async function graduateAgent(agentId: string, force: boolean = false) {
  const response = await fetch(`/api/learning-agents/${agentId}/graduate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force })
  });

  const data = await response.json();

  if (data.success) {
    // Show success message
    alert(`Agent graduated to ${data.newStatus}!`);
    // Refresh agent details
    // Navigate to paper trading view
  } else {
    // Show error
    alert(`Graduation failed: ${data.error}`);
  }
}
```

---

### 3. Demote Agent

**Endpoint**: `POST /api/learning-agents/:id/demote`

**Purpose**: Demote agent back to learning status (useful if paper trading performance degrades)

**Request Body**:
```json
{
  "reason": "Performance below target - win rate dropped to 45%"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Agent demoted to learning status"
}
```

**Frontend Usage**:
```typescript
async function demoteAgent(agentId: string, reason: string) {
  const response = await fetch(`/api/learning-agents/${agentId}/demote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });

  const data = await response.json();

  if (data.success) {
    alert('Agent demoted back to learning');
    // Refresh agent details
  }
}
```

---

## Frontend Integration Example

### Graduation UI Component

```tsx
import React, { useState, useEffect } from 'react';

interface GraduationEligibility {
  eligible: boolean;
  reason: string;
  criteria_met: {
    iterations: boolean;
    win_rate: boolean;
    sharpe: boolean;
    return: boolean;
    signals: boolean;
    consistency: boolean;
  };
  stats: {
    total_iterations: number;
    avg_win_rate: number;
    avg_sharpe: number;
    avg_return: number;
    total_signals: number;
    recent_consistency: boolean;
  };
}

export const GraduationPanel: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [eligibility, setEligibility] = useState<GraduationEligibility | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEligibility();
  }, [agentId]);

  const loadEligibility = async () => {
    const response = await fetch(`/api/learning-agents/${agentId}/graduation/eligibility`);
    const data = await response.json();
    setEligibility(data.eligibility);
  };

  const handleGraduate = async (force: boolean = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/learning-agents/${agentId}/graduate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });

      const data = await response.json();

      if (data.success) {
        alert(`🎉 Agent graduated to ${data.newStatus}!`);
        window.location.reload(); // Refresh to show new status
      } else {
        alert(`❌ Graduation failed: ${data.error}`);
      }
    } catch (error) {
      alert('Error during graduation');
    } finally {
      setLoading(false);
    }
  };

  if (!eligibility) return <div>Loading...</div>;

  return (
    <div className="graduation-panel">
      <h3>Graduation Status</h3>

      {/* Eligibility Status */}
      <div className="eligibility-status">
        {eligibility.eligible ? (
          <div className="status-eligible">
            ✅ Agent is eligible for graduation to paper trading
          </div>
        ) : (
          <div className="status-not-eligible">
            ⚠️ {eligibility.reason}
          </div>
        )}
      </div>

      {/* Criteria Checklist */}
      <div className="criteria-checklist">
        <h4>Graduation Criteria</h4>
        <ul>
          <li className={eligibility.criteria_met.iterations ? 'met' : 'not-met'}>
            {eligibility.criteria_met.iterations ? '✅' : '❌'}
            Iterations: {eligibility.stats.total_iterations}/20
          </li>
          <li className={eligibility.criteria_met.win_rate ? 'met' : 'not-met'}>
            {eligibility.criteria_met.win_rate ? '✅' : '❌'}
            Win Rate: {(eligibility.stats.avg_win_rate * 100).toFixed(1)}%/60%
          </li>
          <li className={eligibility.criteria_met.sharpe ? 'met' : 'not-met'}>
            {eligibility.criteria_met.sharpe ? '✅' : '❌'}
            Sharpe Ratio: {eligibility.stats.avg_sharpe.toFixed(2)}/2.0
          </li>
          <li className={eligibility.criteria_met.return ? 'met' : 'not-met'}>
            {eligibility.criteria_met.return ? '✅' : '❌'}
            Total Return: {eligibility.stats.avg_return.toFixed(1)}%/5%
          </li>
          <li className={eligibility.criteria_met.signals ? 'met' : 'not-met'}>
            {eligibility.criteria_met.signals ? '✅' : '❌'}
            Signals: {eligibility.stats.total_signals}/50
          </li>
          <li className={eligibility.criteria_met.consistency ? 'met' : 'not-met'}>
            {eligibility.criteria_met.consistency ? '✅' : '❌'}
            Recent Consistency
          </li>
        </ul>
      </div>

      {/* Graduation Button */}
      <div className="graduation-actions">
        <button
          onClick={() => handleGraduate(false)}
          disabled={!eligibility.eligible || loading}
          className="btn-primary"
        >
          {loading ? 'Graduating...' : 'Graduate to Paper Trading'}
        </button>

        {/* Admin force-graduate option */}
        {!eligibility.eligible && (
          <button
            onClick={() => {
              if (confirm('Force graduate? This bypasses eligibility checks.')) {
                handleGraduate(true);
              }
            }}
            disabled={loading}
            className="btn-warning"
          >
            Force Graduate (Admin)
          </button>
        )}
      </div>

      {/* Info Box */}
      <div className="info-box">
        <h5>What happens when you graduate?</h5>
        <ul>
          <li>✅ Agent moves to paper trading status</li>
          <li>✅ Creates $100,000 paper trading account</li>
          <li>✅ Automatically copies winning execution template</li>
          <li>✅ Starts using Price Action Trailing exits</li>
          <li>✅ No manual configuration needed!</li>
        </ul>
      </div>
    </div>
  );
};
```

---

## Graduation Criteria (Default)

### Learning → Paper Trading
- **Min Iterations**: 20
- **Min Win Rate**: 60%
- **Min Sharpe Ratio**: 2.0
- **Min Total Return**: 5%
- **Min Signals**: 50
- **Consistency**: Last 5 iterations must maintain 55%+ win rate

### Paper Trading → Live Trading (Stricter)
- **Min Iterations**: 50
- **Min Win Rate**: 65%
- **Min Sharpe Ratio**: 2.5
- **Min Total Return**: 10%
- **Min Signals**: 200
- **Consistency**: Last 10 iterations must maintain 60%+ win rate

---

## Template Configuration (Automatic)

When an agent graduates, the system automatically:

1. **Queries Latest Iteration**:
   ```sql
   SELECT winning_template
   FROM agent_iterations
   WHERE agent_id = ?
   ORDER BY iteration_number DESC
   LIMIT 1
   ```

2. **Creates Template Config**:
   ```typescript
   const exitConfig = {
     template: latestIteration.winning_template, // e.g., "price_action"
     stopLossPercent: null,  // Use template default
     takeProfitPercent: null,  // Use template default
     trailingStopPercent: template === 'price_action' ? 2.0 : null,
     exitTime: template === 'intraday_time' ? '15:55' : null,
     atrMultiplier: template === 'atr_adaptive' ? 2.0 : null
   };
   ```

3. **Stores in Agent**:
   ```sql
   UPDATE trading_agents
   SET exit_strategy_config = ?
   WHERE id = ?
   ```

4. **Paper Trading Uses It**:
   - Orchestrator loads `exit_strategy_config` on startup
   - Routes to `ExecutionTemplateExitsService.checkExit()`
   - Applies template-specific exit logic (e.g., Price Action Trailing)

---

## Testing the API

### Using curl (Development)

```bash
# Check eligibility
curl http://localhost:3000/api/learning-agents/YOUR_AGENT_ID/graduation/eligibility | jq

# Graduate agent
curl -X POST http://localhost:3000/api/learning-agents/YOUR_AGENT_ID/graduate \
  -H "Content-Type: application/json" \
  -d '{"force": false}' | jq

# Force graduate (admin)
curl -X POST http://localhost:3000/api/learning-agents/YOUR_AGENT_ID/graduate \
  -H "Content-Type: application/json" \
  -d '{"force": true}' | jq

# Demote agent
curl -X POST http://localhost:3000/api/learning-agents/YOUR_AGENT_ID/demote \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing"}' | jq
```

### Verify Config Was Set

```bash
# Check agent status and exit config
sqlite3 $DATABASE_PATH "
  SELECT name, status, exit_strategy_config
  FROM trading_agents
  WHERE id = 'YOUR_AGENT_ID'
"

# Check paper account was created
sqlite3 $DATABASE_PATH "
  SELECT id, initial_balance, equity, status
  FROM paper_accounts
  WHERE agent_id = 'YOUR_AGENT_ID'
"
```

---

## Error Handling

### Common Errors

**1. Agent Not Found**
```json
{
  "success": false,
  "error": "Agent not found: abc-123"
}
```

**2. Not Eligible**
```json
{
  "success": false,
  "error": "Agent not eligible for graduation: Failed criteria: iterations, win_rate"
}
```

**3. No Winning Template**
```json
{
  "success": true,
  "message": "Agent graduated to paper_trading",
  "warning": "No winning template found - will use default exit strategy"
}
```
*Note: This happens if agent has no iterations with `winning_template` set*

**4. Already at Max Level**
```json
{
  "success": false,
  "error": "Agent is already at live_trading status - cannot graduate further"
}
```

---

## Activity Logging

All graduation actions are logged to `agent_activity_log`:

```sql
SELECT * FROM agent_activity_log
WHERE agent_id = 'YOUR_AGENT_ID'
AND activity_type IN ('AGENT_GRADUATED', 'AGENT_DEMOTED')
ORDER BY created_at DESC;
```

Example log entry:
```json
{
  "agent_id": "3159d447-5cbc-41ec-828d-525c76db97b0",
  "activity_type": "AGENT_GRADUATED",
  "description": "Agent graduated from learning to paper_trading",
  "data": {
    "previous_status": "learning",
    "new_status": "paper_trading",
    "forced": false,
    "exit_template": "price_action"
  },
  "created_at": "2025-11-04T15:53:19.546Z"
}
```

---

## Summary

✅ **API endpoints are fully functional**
✅ **Template configuration happens automatically**
✅ **Frontend just needs to call the endpoints**
✅ **No manual configuration required**

The graduation system is **production-ready** and can be integrated into the frontend immediately!

---

**Last Updated**: 2025-11-04
**API Version**: v1
**Status**: ✅ Tested and operational
