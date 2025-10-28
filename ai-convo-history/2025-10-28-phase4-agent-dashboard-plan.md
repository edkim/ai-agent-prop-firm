# Phase 4: Agent Dashboard - Implementation Plan
## Date: 2025-10-28

## Overview

Phase 4 builds a comprehensive live trading dashboard for monitoring and controlling autonomous trading agents in real-time. The goal is to provide complete visibility into agent activity, positions, signals, and performance with interactive controls.

## Phase 3 Completion Status ✅

### Services Complete
- **PositionMonitorService**: Real-time monitoring, 4 exit types
- **TrailingStopService**: Dynamic stop management
- **RiskMetricsService**: Full performance analytics

### Infrastructure Ready
- Database: 9 tables with real-time data
- API: 21 endpoints for complete agent management
- TradeStation: Paper trading operational
- Monitoring: 5-second update intervals

## Phase 4 Components

### 1. Agent Dashboard Layout
**Purpose**: Main dashboard for managing multiple trading agents

**Implementation**: `frontend/src/components/TradingAgents/AgentDashboard.tsx`

**Layout Structure**:
```
┌─────────────────────────────────────────────────────┐
│  Agent Dashboard                     [+ New Agent]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐      │
│  │  Agent 1  │  │  Agent 2  │  │  Agent 3  │      │
│  │  ■ Active │  │  □ Paused │  │  ■ Active │      │
│  │  +$1,234  │  │  -$156    │  │  +$890    │      │
│  └───────────┘  └───────────┘  └───────────┘      │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Selected Agent: Breakout Hunter                   │
├─────────────────────────────────────────────────────┤
│  Tabs: Overview | Positions | Signals | Trades |   │
│        Performance | Settings                      │
└─────────────────────────────────────────────────────┘
```

**Features**:
- Agent selector cards (overview, status, P&L)
- Tab navigation for different views
- Real-time status indicators
- Quick action buttons (activate, pause, settings)

### 2. Agent Overview Card
**Purpose**: Summary view of agent status and performance

**Implementation**: `frontend/src/components/TradingAgents/AgentOverview.tsx`

**Display Sections**:

**Status Section**:
- Agent name and timeframe
- Active/Paused indicator
- Monitoring status
- Last activity timestamp

**Portfolio Section**:
- Total equity
- Cash available
- Total exposure
- Open positions count
- Daily P&L ($ and %)

**Performance Section**:
- Win rate
- Profit factor
- Sharpe ratio
- Max drawdown

**Strategy Section**:
- Active patterns list
- Risk limits summary
- Recent activity log (last 10 events)

**Quick Actions**:
- Activate / Deactivate button
- Start / Stop monitoring
- Emergency close all positions
- Edit settings

### 3. Position Monitoring Widget
**Purpose**: Real-time display of open positions

**Implementation**: `frontend/src/components/TradingAgents/PositionMonitor.tsx`

**Table Columns**:
```
Ticker | Side | Entry | Current | P&L | P&L% | Stop | Target | Trail | Duration | Actions
-------|------|-------|---------|-----|------|------|--------|-------|----------|--------
SPY    | LONG | 450   | 455     | +$500| +1.1%| 445  | 460    | ✓ 5% | 2h 15m  | [Close] [Trail]
QQQ    | LONG | 380   | 382     | +$200| +0.5%| 375  | 390    | -     | 45m     | [Close] [Trail]
```

**Features**:
- Real-time price updates (every 5 seconds)
- Color-coded P&L (green/red)
- Duration counter (time in position)
- Trailing stop indicator
- Quick close button
- Enable trailing stop button
- Exit reason badges (when closed)

**Sorting & Filtering**:
- Sort by: P&L, Duration, Ticker
- Filter by: Side (LONG/SHORT), Status (OPEN/CLOSED)

### 4. Signal Feed Component
**Purpose**: Display live pattern detections in real-time

**Implementation**: `frontend/src/components/TradingAgents/SignalFeed.tsx`

**Signal Card Design**:
```
┌─────────────────────────────────────────────┐
│ 🎯 Breakout Volume Surge - AAPL            │
│ ⏰ 2:45 PM  │  Quality: 85/100  │  Status: ANALYZING  │
├─────────────────────────────────────────────┤
│ Price: $180.50  │  Volume: 2.5x avg        │
│ RSI: 65  │  VWAP: $179.80                  │
│ Multi-timeframe: ✓ Confirmed               │
├─────────────────────────────────────────────┤
│ AI Recommendation: PENDING...               │
└─────────────────────────────────────────────┘
```

**When analyzed**:
```
┌─────────────────────────────────────────────┐
│ 🤖 AI Analysis Complete                     │
├─────────────────────────────────────────────┤
│ Confidence: 82/100                          │
│ Entry: $180.75  │  Stop: $178.50  │  Target: $185.00 │
│ Position Size: 50 shares ($9,037)          │
│                                             │
│ Reasoning: Strong breakout with volume...  │
│                                             │
│ Risk Checks: ✓ All Passed                  │
│                                             │
│ [Execute Trade] [Reject]                   │
└─────────────────────────────────────────────┘
```

**Features**:
- Auto-refresh signal list (every 5 seconds)
- Status badges (DETECTED, ANALYZING, EXECUTED, REJECTED)
- Pattern quality score
- Multi-timeframe confirmation indicator
- AI analysis details (when available)
- Manual approve/reject buttons
- Chart thumbnail (optional)

### 5. Trade History Table
**Purpose**: Historical view of executed trades

**Implementation**: `frontend/src/components/TradingAgents/TradeHistory.tsx`

**Table Columns**:
```
Date      | Ticker | Side | Entry | Exit  | P&L   | P&L%  | Exit Reason  | Confidence
----------|--------|------|-------|-------|-------|-------|--------------|------------
10/28 2PM | SPY    | LONG | 450   | 455   | +$500 | +1.1% | TARGET_HIT   | 85
10/28 1PM | QQQ    | LONG | 380   | 375   | -$500 | -1.3% | STOP_HIT     | 72
10/28 12PM| TSLA   | LONG | 250   | 260   | +$1000| +4.0% | TRAILING_STOP| 90
```

**Features**:
- Pagination (50 trades per page)
- Date range filter
- Export to CSV
- Trade detail modal (click row for full details)
- P&L summary footer (total, avg, win rate)

**Trade Detail Modal**:
- Entry/exit prices and times
- Pattern type and confidence
- Stop loss and take profit levels
- Actual exit reason
- Risk checks that passed/failed
- Chart at entry time

### 6. Performance Charts
**Purpose**: Visual analytics of agent performance

**Implementation**: `frontend/src/components/TradingAgents/PerformanceCharts.tsx`

**Chart 1: Equity Curve**
```typescript
// Line chart showing equity over time
{
  type: 'line',
  data: {
    labels: ['10/20', '10/21', '10/22', '10/23', '10/24', ...],
    datasets: [{
      label: 'Equity',
      data: [100000, 101200, 100800, 102500, 103200, ...],
      borderColor: 'blue',
      fill: false
    }]
  }
}
```

**Chart 2: Daily P&L Bar Chart**
```typescript
// Bar chart showing daily wins/losses
{
  type: 'bar',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [{
      label: 'Daily P&L',
      data: [+500, -200, +800, +1200, -300],
      backgroundColor: (context) => context.raw > 0 ? 'green' : 'red'
    }]
  }
}
```

**Chart 3: Win/Loss Distribution**
```typescript
// Pie chart showing win rate
{
  type: 'pie',
  data: {
    labels: ['Wins', 'Losses'],
    datasets: [{
      data: [65, 35],
      backgroundColor: ['green', 'red']
    }]
  }
}
```

**Chart 4: Drawdown Chart**
```typescript
// Area chart showing drawdown over time
{
  type: 'line',
  data: {
    labels: ['10/20', '10/21', '10/22', ...],
    datasets: [{
      label: 'Drawdown %',
      data: [0, -1.2, -2.5, -1.8, -0.5, ...],
      fill: true,
      backgroundColor: 'rgba(255, 0, 0, 0.2)'
    }]
  }
}
```

### 7. Agent Settings Panel
**Purpose**: Configure agent parameters

**Implementation**: `frontend/src/components/TradingAgents/AgentSettings.tsx`

**Settings Sections**:

**Basic Info**:
- Agent name
- Timeframe (intraday/swing/position)
- Active strategies (checkboxes)

**Risk Limits**:
- Max position size ($ input)
- Max portfolio exposure (% slider)
- Max daily loss ($ input)
- Max concurrent positions (number input)
- Min confidence score (slider 0-100)
- Max correlation (slider 0-1)

**Exit Settings**:
- Default trailing stop % (number input)
- Trailing activation % (number input)
- Time exit enabled (checkbox)

**Actions**:
- Save settings button
- Reset to defaults
- Delete agent (with confirmation)

### 8. Real-Time Updates
**Purpose**: Keep dashboard synchronized with live data

**Implementation**: Polling every 5 seconds (WebSocket optional)

**Update Strategy**:
```typescript
// Poll for updates
useEffect(() => {
  const interval = setInterval(async () => {
    // Fetch latest data
    const portfolio = await fetch(`/api/agents/${agentId}/portfolio`).then(r => r.json());
    const signals = await fetch(`/api/agents/${agentId}/signals?status=DETECTED`).then(r => r.json());
    const trades = await fetch(`/api/agents/${agentId}/trades?status=OPEN`).then(r => r.json());

    // Update state
    setPortfolio(portfolio);
    setSignals(signals);
    setTrades(trades);
  }, 5000);

  return () => clearInterval(interval);
}, [agentId]);
```

**Optimistic Updates**:
- Immediately reflect user actions (activate/deactivate)
- Show loading states during API calls
- Revert on error

## User Flows

### Create New Agent Flow
1. Click "+ New Agent" button
2. Modal opens with form
3. Enter agent details:
   - Name
   - Select TradeStation account
   - Choose timeframe
   - Select strategies (checkboxes)
   - Configure risk limits
4. Click "Create Agent"
5. Agent card appears in dashboard
6. Redirect to agent overview tab

### Activate Agent Flow
1. Select agent card
2. Click "Activate" button
3. Confirmation modal: "Start trading with current settings?"
4. Click "Confirm"
5. API call: `POST /api/agents/:id/activate`
6. API call: `POST /api/agents/:id/monitor/start`
7. Status changes to "Active"
8. Monitoring indicator shows "Monitoring..."

### Manual Trade Execution Flow
1. Agent detects signal → appears in Signal Feed
2. AI analyzes → shows recommendation
3. User reviews:
   - Pattern details
   - AI confidence score
   - Entry/stop/target prices
   - Risk checks status
4. User clicks "Execute Trade" or "Reject"
5. If Execute:
   - API call: `POST /api/agents/:id/recommendations/:id/approve`
   - Trade appears in Positions tab
   - Signal status → "EXECUTED"
6. If Reject:
   - API call: `POST /api/agents/:id/recommendations/:id/reject`
   - Signal status → "REJECTED"

### Close Position Flow
1. User views open position in Positions tab
2. Click "Close" button
3. Confirmation modal shows:
   - Current price
   - Estimated P&L
   - Exit reason: "MANUAL_EXIT"
4. Click "Confirm Close"
5. API call: `POST /api/agents/:id/trades/:tradeId/close`
6. Position removed from open positions
7. Trade appears in Trade History
8. Portfolio metrics update

### Enable Trailing Stop Flow
1. User views open position
2. Click "Enable Trailing" button
3. Modal opens:
   - Trail percent input (default 5%)
   - Activation percent input (default 2%)
4. Click "Enable"
5. API call: `POST /api/agents/:id/trades/:tradeId/trailing-stop`
6. Position shows trailing stop indicator
7. Trailing stop column shows current level

## Component Hierarchy

```
AgentDashboard
├── AgentSelector (list of agent cards)
│   └── AgentCard (status, P&L, quick actions)
├── AgentTabs
│   ├── OverviewTab
│   │   ├── AgentOverview (status, portfolio, performance)
│   │   └── ActivityLog (recent events)
│   ├── PositionsTab
│   │   └── PositionMonitor (open positions table)
│   ├── SignalsTab
│   │   └── SignalFeed (live pattern detections)
│   ├── TradesTab
│   │   └── TradeHistory (executed trades table)
│   ├── PerformanceTab
│   │   └── PerformanceCharts (equity, P&L, drawdown)
│   └── SettingsTab
│       └── AgentSettings (configuration form)
└── Modals
    ├── NewAgentModal
    ├── ConfirmActionModal
    ├── TradeDetailModal
    └── TrailingStopModal
```

## State Management

**Global State** (React Context or Zustand):
```typescript
interface AgentDashboardState {
  // Selected agent
  selectedAgentId: string | null;

  // Agent data
  agents: TradingAgent[];
  portfolio: PortfolioState | null;
  signals: LiveSignal[];
  recommendations: TradeRecommendation[];
  trades: ExecutedTrade[];
  metrics: RiskMetrics | null;

  // UI state
  activeTab: 'overview' | 'positions' | 'signals' | 'trades' | 'performance' | 'settings';
  loading: boolean;
  error: string | null;

  // Actions
  selectAgent: (agentId: string) => void;
  refreshData: () => Promise<void>;
  activateAgent: (agentId: string) => Promise<void>;
  deactivateAgent: (agentId: string) => Promise<void>;
}
```

## Styling

**Design System**:
- Colors:
  - Primary: Blue (#3B82F6)
  - Success/Profit: Green (#10B981)
  - Danger/Loss: Red (#EF4444)
  - Warning: Yellow (#F59E0B)
  - Background: Gray (#F9FAFB)

- Status Indicators:
  - Active: Green dot
  - Paused: Gray dot
  - Error: Red dot

- Typography:
  - Headings: Inter font, bold
  - Body: Inter font, regular
  - Monospace (prices): SF Mono

**Responsive Design**:
- Desktop: Full dashboard with all tabs
- Tablet: Stacked layout, collapsible sidebar
- Mobile: Single column, bottom navigation

## Implementation Order

### Day 1: Core Dashboard (4-5 hours)
1. Create AgentDashboard layout
2. Implement AgentSelector with cards
3. Build tab navigation
4. Set up state management
5. Connect to API endpoints

**Deliverable**: Basic dashboard with agent selection and tabs

### Day 2: Overview & Positions (4-5 hours)
1. Build AgentOverview component
2. Build PositionMonitor table
3. Add real-time polling
4. Implement close position action
5. Add loading states

**Deliverable**: View agent status and manage positions

### Day 3: Signals & Trades (4-5 hours)
1. Build SignalFeed component
2. Build TradeHistory table
3. Implement approve/reject actions
4. Add trade detail modal
5. Test signal-to-trade flow

**Deliverable**: Monitor signals and review trade history

### Day 4: Performance & Charts (4-5 hours)
1. Build PerformanceCharts component
2. Implement equity curve chart
3. Add P&L bar chart
4. Add win/loss pie chart
5. Add drawdown chart
6. Connect to metrics API

**Deliverable**: Full performance analytics dashboard

### Day 5: Settings & Polish (3-4 hours)
1. Build AgentSettings form
2. Implement save/update logic
3. Add new agent modal
4. Polish UI/UX
5. Add error handling
6. Write tests

**Deliverable**: Complete dashboard ready for production

## API Integration

**Endpoints Used**:
```typescript
// Agent management
GET /api/agents
GET /api/agents/:id
POST /api/agents
PATCH /api/agents/:id
DELETE /api/agents/:id
POST /api/agents/:id/activate
POST /api/agents/:id/deactivate

// Monitoring
POST /api/agents/:id/monitor/start
POST /api/agents/:id/monitor/stop

// Portfolio
GET /api/agents/:id/portfolio
GET /api/agents/:id/positions

// Signals
GET /api/agents/:id/signals
GET /api/agents/:id/signals?status=DETECTED

// Recommendations
GET /api/agents/:id/recommendations
POST /api/agents/:id/recommendations/:recommendationId/approve
POST /api/agents/:id/recommendations/:recommendationId/reject

// Trades
GET /api/agents/:id/trades
POST /api/agents/:id/trades/:tradeId/close
POST /api/agents/:id/trades/:tradeId/trailing-stop

// Metrics
GET /api/agents/:id/metrics
GET /api/agents/:id/metrics/latest
GET /api/agents/:id/equity-curve

// Activity
GET /api/agents/:id/activity
```

## Error Handling

**Error States**:
- Network error: Show retry button
- API error: Display error message
- No data: Show empty state with call-to-action
- Stale data: Show warning if last update > 30s ago

**Loading States**:
- Initial load: Full-page spinner
- Refresh: Subtle progress bar
- Action in progress: Disable button with spinner

## Security

**Authorization**:
- Require user authentication
- Check user owns agent before showing data
- Validate all actions server-side

**Sensitive Data**:
- Don't display full account numbers
- Mask API keys in settings
- Confirm before destructive actions

## Testing

**Unit Tests**:
- Component rendering
- State management logic
- API mocking

**Integration Tests**:
- Full user flows (create agent, execute trade, close position)
- Real-time updates
- Error scenarios

**E2E Tests**:
- Dashboard navigation
- Agent activation/deactivation
- Trade execution flow

## Dependencies

**New Packages**:
```json
{
  "chart.js": "^4.4.0",
  "react-chartjs-2": "^5.2.0",
  "recharts": "^2.10.0",
  "date-fns": "^2.30.0",
  "@heroicons/react": "^2.0.18"
}
```

## Files to Create

1. `frontend/src/components/TradingAgents/AgentDashboard.tsx`
2. `frontend/src/components/TradingAgents/AgentSelector.tsx`
3. `frontend/src/components/TradingAgents/AgentOverview.tsx`
4. `frontend/src/components/TradingAgents/PositionMonitor.tsx`
5. `frontend/src/components/TradingAgents/SignalFeed.tsx`
6. `frontend/src/components/TradingAgents/TradeHistory.tsx`
7. `frontend/src/components/TradingAgents/PerformanceCharts.tsx`
8. `frontend/src/components/TradingAgents/AgentSettings.tsx`
9. `frontend/src/hooks/useAgentData.ts`
10. `frontend/src/context/AgentDashboardContext.tsx`

## Success Metrics

### Phase 4 Completion Criteria
- ✅ Dashboard displays all agents
- ✅ Real-time position monitoring working
- ✅ Signal feed updates automatically
- ✅ Performance charts render correctly
- ✅ Manual trade controls functional
- ✅ Settings can be updated
- ✅ All API integrations working
- ✅ Responsive design on mobile/desktop

### Performance Targets
- Dashboard load time: <2 seconds
- Real-time update latency: <500ms
- Chart rendering: <100ms
- Smooth scrolling and interactions

## Next Steps After Phase 4

**Phase 5: Intelligence Layer** (Week 9-10)
- Strategy performance tracking
- Market regime detection
- Continuous learning from trade history
- Pattern quality feedback loop

## Status

**Phase 3**: ✅ Complete (Portfolio management)
**Phase 4**: 🔄 Ready to start (Agent dashboard)

**Next Action**: Create `AgentDashboard.tsx` layout component
