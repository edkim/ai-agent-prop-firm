# Multi-Agent Learning Laboratory - Phase 2: Autonomy Features
**Date**: October 30, 2025
**Branch**: multi-agent-laboratory
**Status**: 🚧 In Progress

## Overview

Phase 2 builds autonomous capabilities on top of the Phase 1 foundation, enabling agents to:
- Learn continuously without manual intervention
- Automatically evaluate and apply refinements
- Monitor their own performance
- Graduate to paper/live trading when ready
- Alert users to important events

## Prerequisites

✅ **Phase 1 Complete** (Backend + Frontend):
- Database schema (9 agent tables)
- Agent Management & Learning Services
- 14 API endpoints
- Complete React UI with 5 components

## Phase 2 Features

### 1. Scheduled Iterations
**Goal**: Enable automatic learning cycles on a schedule

**Components**:
- `SchedulerService` - Manages cron-based iteration scheduling
- Agent configuration fields: `auto_learn_enabled`, `learning_schedule`
- Background worker that triggers iterations

**Database Changes**:
```sql
ALTER TABLE trading_agents ADD COLUMN auto_learn_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN learning_schedule TEXT; -- cron format
ALTER TABLE trading_agents ADD COLUMN next_scheduled_iteration TEXT; -- ISO timestamp
```

**Implementation**:
1. Add scheduler service with node-cron
2. Load agents with auto_learn_enabled=1
3. Parse cron schedules and trigger iterations
4. Update next_scheduled_iteration timestamp
5. Handle concurrent iteration limits

**API Endpoints**:
- `POST /api/learning-agents/:id/auto-learn/enable` - Enable scheduled learning
- `POST /api/learning-agents/:id/auto-learn/disable` - Disable scheduled learning
- `PUT /api/learning-agents/:id/schedule` - Update cron schedule

### 2. Auto-Refinement Approval
**Goal**: Automatically approve refinements when performance thresholds are met

**Components**:
- `RefinementApprovalService` - Evaluates refinements against criteria
- Agent configuration: `auto_approve_enabled`, `approval_thresholds`
- Automatic application of approved refinements

**Database Changes**:
```sql
ALTER TABLE trading_agents ADD COLUMN auto_approve_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN approval_thresholds TEXT; -- JSON config
```

**Approval Criteria**:
```typescript
interface ApprovalThresholds {
  min_win_rate: number;        // e.g., 0.55 (55%)
  min_sharpe_ratio: number;     // e.g., 1.5
  min_signals: number;          // e.g., 10
  min_total_return: number;     // e.g., 0.02 (2%)
  require_improvement: boolean; // Must beat current version
}
```

**Implementation**:
1. After each iteration, check if auto_approve_enabled
2. Compare metrics against thresholds
3. If all criteria met, automatically call applyRefinements
4. Log approval decision to agent_activity_log
5. Update strategy version automatically

**API Endpoints**:
- `POST /api/learning-agents/:id/auto-approve/enable` - Enable auto-approval
- `POST /api/learning-agents/:id/auto-approve/disable` - Disable auto-approval
- `PUT /api/learning-agents/:id/approval-thresholds` - Update thresholds

### 3. Continuous Learning Loop
**Goal**: Run learning cycles continuously (with rate limiting)

**Components**:
- `ContinuousLearningService` - Manages continuous learning loop
- Rate limiting to prevent API overuse
- Cooldown periods between iterations
- Stop conditions (max iterations, convergence detection)

**Database Changes**:
```sql
ALTER TABLE trading_agents ADD COLUMN continuous_learning_enabled INTEGER DEFAULT 0;
ALTER TABLE trading_agents ADD COLUMN max_iterations_per_day INTEGER DEFAULT 10;
ALTER TABLE trading_agents ADD COLUMN min_iteration_gap_minutes INTEGER DEFAULT 60;
ALTER TABLE trading_agents ADD COLUMN convergence_threshold REAL DEFAULT 0.01; -- 1% improvement
```

**Implementation**:
1. When enabled, trigger iterations automatically after cooldown
2. Track iterations per day counter (resets at midnight)
3. Detect convergence (performance improvement < threshold)
4. Stop when max iterations reached or converged
5. Resume next day if max hit

**Convergence Detection**:
- Compare last 3 iterations
- If avg improvement < convergence_threshold, mark as converged
- Log convergence event to activity log

**API Endpoints**:
- `POST /api/learning-agents/:id/continuous-learning/start` - Start continuous learning
- `POST /api/learning-agents/:id/continuous-learning/stop` - Stop continuous learning
- `GET /api/learning-agents/:id/continuous-learning/status` - Get current status

### 4. Performance Monitoring & Alerts
**Goal**: Track agent performance and alert on significant events

**Components**:
- `PerformanceMonitorService` - Tracks metrics over time
- Alert system for important events
- Performance degradation detection
- Notification delivery (console, webhook, email future)

**Database Changes**:
```sql
CREATE TABLE IF NOT EXISTS agent_alerts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'PERFORMANCE_DEGRADATION', 'CONVERGENCE', 'GRADUATION_READY', 'ERROR'
  severity TEXT NOT NULL, -- 'INFO', 'WARNING', 'CRITICAL'
  message TEXT NOT NULL,
  details TEXT, -- JSON
  acknowledged INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES trading_agents(id)
);

CREATE INDEX idx_agent_alerts_agent_id ON agent_alerts(agent_id);
CREATE INDEX idx_agent_alerts_acknowledged ON agent_alerts(acknowledged);
```

**Alert Types**:
- **PERFORMANCE_DEGRADATION**: Win rate drops >10% over last 3 iterations
- **CONVERGENCE**: Agent has converged (no significant improvement)
- **GRADUATION_READY**: Agent meets criteria for paper trading
- **ERROR**: Iteration failed or service error
- **MILESTONE**: Significant achievement (100 iterations, 70% win rate, etc.)

**Implementation**:
1. After each iteration, analyze performance trends
2. Compare metrics to historical averages
3. Generate alerts based on conditions
4. Store alerts in database
5. Send notifications (console log for now)

**API Endpoints**:
- `GET /api/learning-agents/:id/alerts` - Get agent alerts
- `GET /api/learning-agents/alerts` - Get all unacknowledged alerts
- `POST /api/learning-agents/:id/alerts/:alertId/acknowledge` - Acknowledge alert
- `DELETE /api/learning-agents/:id/alerts/:alertId` - Delete alert

### 5. Agent Graduation
**Goal**: Promote agents from learning to paper trading, and eventually live trading

**Components**:
- `GraduationService` - Evaluates readiness and manages transitions
- Graduation criteria configuration
- Status transition management
- Integration with paper trading system (future)

**Graduation Criteria** (Learning → Paper Trading):
```typescript
interface GraduationCriteria {
  min_iterations: number;           // e.g., 20
  min_win_rate: number;             // e.g., 0.60 (60%)
  min_sharpe_ratio: number;         // e.g., 2.0
  min_total_return: number;         // e.g., 0.05 (5%)
  min_signals: number;              // e.g., 50 total signals
  consistency_window: number;       // e.g., last 5 iterations
  max_drawdown: number;             // e.g., 0.15 (15%)
}
```

**Status Transitions**:
- `learning` → `paper_trading` (automatic or manual)
- `paper_trading` → `live_trading` (manual only, requires explicit approval)
- Can demote back to `learning` if performance degrades

**Implementation**:
1. Add graduation evaluation to performance monitor
2. Check criteria after each iteration
3. Generate GRADUATION_READY alert when eligible
4. Provide API to graduate agent (change status)
5. Log graduation events to activity log

**API Endpoints**:
- `GET /api/learning-agents/:id/graduation/eligibility` - Check if ready
- `POST /api/learning-agents/:id/graduate` - Graduate to next status
- `POST /api/learning-agents/:id/demote` - Demote to learning status

## Implementation Order

### Stage 1: Core Autonomy (Backend)
1. Database migrations for new columns and alerts table
2. SchedulerService implementation
3. RefinementApprovalService implementation
4. Update AgentLearningService to call approval after iterations

### Stage 2: Continuous Learning (Backend)
1. ContinuousLearningService implementation
2. Rate limiting and convergence detection
3. Integration with scheduler

### Stage 3: Monitoring & Graduation (Backend)
1. agent_alerts table creation
2. PerformanceMonitorService implementation
3. Alert generation logic
4. GraduationService implementation

### Stage 4: API Routes (Backend)
1. Add all new endpoints to routes/agents.ts
2. Request/response validation
3. Error handling

### Stage 5: Frontend Integration
1. Add autonomy controls to AgentLaboratory
2. Settings panel for schedules and thresholds
3. Alerts display component
4. Graduation UI

### Stage 6: Testing & Documentation
1. Test each service independently
2. Integration testing
3. Update documentation
4. Commit and push

## Technical Considerations

### Dependencies
- **node-cron**: Cron-based job scheduling
- **node-schedule**: Alternative scheduler (evaluate)

### Rate Limiting
- Prevent API abuse with iteration limits
- Cooldown periods between iterations
- Daily/hourly quotas

### Error Handling
- Service failures shouldn't stop other agents
- Retry logic for transient errors
- Alert on persistent failures

### Performance
- Background services shouldn't block API
- Efficient database queries with indexes
- Batch operations where possible

### Testing Strategy
- Unit tests for each service
- Mock external dependencies (Claude API)
- Integration tests for full learning cycles

## Success Criteria

- [ ] Agents can learn on a schedule without manual intervention
- [ ] Refinements automatically applied when thresholds met
- [ ] Continuous learning runs with proper rate limiting
- [ ] Alerts generated for important events
- [ ] Agents can graduate to paper trading
- [ ] All features configurable via API
- [ ] Frontend UI for autonomy controls
- [ ] Clean shutdown of background services
- [ ] No performance degradation on main API
- [ ] Comprehensive logging and observability

## Future Enhancements (Phase 3+)

- **Multi-Agent Tournaments**: Agents compete against each other
- **Strategy Sharing**: Agents learn from each other's knowledge
- **Advanced Monitoring**: Grafana dashboards, metrics export
- **Notification Channels**: Email, Slack, SMS alerts
- **A/B Testing**: Run multiple strategy versions in parallel
- **Ensemble Methods**: Combine multiple agents' signals
- **Resource Management**: CPU/memory limits per agent
- **Distributed Learning**: Scale across multiple machines

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Runaway iterations consuming API quota | Rate limiting, daily caps, monitoring |
| Performance degradation from background jobs | Separate worker process, resource limits |
| Data corruption from concurrent iterations | Proper locking, transaction management |
| Alert fatigue from too many notifications | Severity levels, aggregation, rate limiting |
| Premature graduation of underperforming agents | Strict criteria, manual override option |

---

**Next Steps**: Begin Stage 1 implementation with database migrations and SchedulerService.
