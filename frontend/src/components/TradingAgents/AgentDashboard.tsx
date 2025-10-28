/**
 * Agent Dashboard Component
 * Main dashboard for managing and monitoring autonomous trading agents
 */

import { useState, useEffect } from 'react';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { TradingAgent, PortfolioState } from '../../types/tradingAgent';
import AgentOverview from './AgentOverview';
import PositionMonitor from './PositionMonitor';
import SignalFeed from './SignalFeed';
import TradeHistory from './TradeHistory';
import PerformanceCharts from './PerformanceCharts';
import AgentSettings from './AgentSettings';

type TabType = 'overview' | 'positions' | 'signals' | 'trades' | 'performance' | 'settings';

export default function AgentDashboard() {
  const [agents, setAgents] = useState<TradingAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolios, setPortfolios] = useState<Record<string, PortfolioState>>({});

  // Load agents on mount
  useEffect(() => {
    loadAgents();
  }, []);

  // Auto-refresh portfolio data every 5 seconds
  useEffect(() => {
    if (agents.length === 0) return;

    const refreshPortfolios = async () => {
      try {
        const portfolioData: Record<string, PortfolioState> = {};
        for (const agent of agents) {
          try {
            const portfolio = await tradingAgentApi.getPortfolio(agent.id);
            portfolioData[agent.id] = portfolio;
          } catch (err) {
            // Ignore individual portfolio errors
            console.error(`Failed to load portfolio for agent ${agent.id}:`, err);
          }
        }
        setPortfolios(portfolioData);
      } catch (err) {
        console.error('Failed to refresh portfolios:', err);
      }
    };

    refreshPortfolios();
    const interval = setInterval(refreshPortfolios, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [agents]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await tradingAgentApi.getAllAgents();
      // Ensure data is an array
      if (Array.isArray(data)) {
        setAgents(data);
        if (data.length > 0 && !selectedAgentId) {
          setSelectedAgentId(data[0].id);
        }
      } else {
        console.error('API returned non-array data:', data);
        setAgents([]);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load agents:', err);
      setError(err.message || 'Failed to load agents');
      setAgents([]); // Ensure agents is always an array
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = Array.isArray(agents) ? agents.find(a => a.id === selectedAgentId) : null;
  const selectedPortfolio = selectedAgentId ? portfolios[selectedAgentId] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading agents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadAgents}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="bg-white shadow-md rounded-lg p-12 text-center">
        <svg
          className="mx-auto h-16 w-16 text-gray-400 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No Trading Agents
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Create your first autonomous trading agent to get started
        </p>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          onClick={() => {
            // TODO: Open create agent modal
            alert('Create agent modal - to be implemented');
          }}
        >
          Create Agent
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Agent Selector */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Trading Agents</h2>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            onClick={() => {
              // TODO: Open create agent modal
              alert('Create agent modal - to be implemented');
            }}
          >
            + New Agent
          </button>
        </div>

        {/* Agent Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map(agent => {
            const portfolio = portfolios[agent.id];
            const dailyPnL = portfolio?.dailyPnL || 0;
            const dailyPnLPercent = portfolio?.dailyPnLPercent || 0;

            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  selectedAgentId === agent.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {agent.timeframe.toUpperCase()} • {agent.strategies.length} strategies
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {agent.active ? (
                      <span className="flex items-center text-xs text-green-700">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center text-xs text-gray-500">
                        <span className="w-2 h-2 bg-gray-400 rounded-full mr-1"></span>
                        Paused
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <div className={`text-lg font-semibold ${
                    dailyPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}
                    <span className="text-sm ml-1">
                      ({dailyPnLPercent >= 0 ? '+' : ''}{dailyPnLPercent.toFixed(2)}%)
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Today's P&L</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Navigation */}
      {selectedAgent && (
        <div className="bg-white shadow-md rounded-lg">
          <div className="border-b border-gray-200">
            <div className="px-6">
              <p className="text-sm text-gray-600 py-3">
                Selected: <span className="font-semibold">{selectedAgent.name}</span>
              </p>
            </div>
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'positions', label: 'Positions' },
                { id: 'signals', label: 'Signals' },
                { id: 'trades', label: 'Trades' },
                { id: 'performance', label: 'Performance' },
                { id: 'settings', label: 'Settings' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <AgentOverview
                agent={selectedAgent}
                portfolio={selectedPortfolio}
                onRefresh={loadAgents}
              />
            )}
            {activeTab === 'positions' && (
              <PositionMonitor agentId={selectedAgent.id} />
            )}
            {activeTab === 'signals' && (
              <SignalFeed agentId={selectedAgent.id} />
            )}
            {activeTab === 'trades' && (
              <TradeHistory agentId={selectedAgent.id} />
            )}
            {activeTab === 'performance' && (
              <PerformanceCharts agentId={selectedAgent.id} />
            )}
            {activeTab === 'settings' && (
              <AgentSettings
                agent={selectedAgent}
                onUpdate={loadAgents}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
