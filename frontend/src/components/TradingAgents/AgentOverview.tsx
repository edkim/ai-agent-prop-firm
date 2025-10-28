/**
 * Agent Overview Component
 * Summary view of agent status, portfolio, and performance
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { TradingAgent, PortfolioState, RiskMetrics, AgentActivity } from '../../types/tradingAgent';

interface AgentOverviewProps {
  agent: TradingAgent;
  portfolio: PortfolioState | null;
  onRefresh: () => void;
}

export default function AgentOverview({ agent, portfolio, onRefresh }: AgentOverviewProps) {
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [agent.id]);

  const loadData = async () => {
    try {
      const [metricsData, activityData] = await Promise.all([
        tradingAgentApi.getLatestMetrics(agent.id),
        tradingAgentApi.getActivity(agent.id, { limit: 10 }).catch((err) => {
          console.log('No activity available yet:', err.message);
          return [];
        }),
      ]);
      setMetrics(metricsData);
      // Ensure activityData is always an array
      setActivity(Array.isArray(activityData) ? activityData : []);
    } catch (err) {
      console.error('Failed to load agent data:', err);
      setActivity([]); // Ensure activity is always an array
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      setActionLoading(true);
      if (agent.active) {
        await tradingAgentApi.deactivateAgent(agent.id);
        await tradingAgentApi.stopMonitoring(agent.id);
      } else {
        await tradingAgentApi.activateAgent(agent.id);
        await tradingAgentApi.startMonitoring(agent.id);
      }
      onRefresh();
    } catch (err: any) {
      alert(`Failed to ${agent.active ? 'deactivate' : 'activate'} agent: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Agent Overview</h3>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleActive}
            disabled={actionLoading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              agent.active
                ? 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                : 'bg-green-600 text-white hover:bg-green-700'
            } disabled:opacity-50`}
          >
            {actionLoading ? 'Processing...' : (agent.active ? 'Deactivate' : 'Activate')}
          </button>
        </div>
      </div>

      {/* Status & Portfolio Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Status</p>
          <div className="flex items-center space-x-2">
            <span className={`w-3 h-3 rounded-full ${agent.active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span className="font-semibold text-gray-900">
              {agent.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {agent.timeframe.charAt(0).toUpperCase() + agent.timeframe.slice(1)} Trading
          </p>
        </div>

        {/* Equity Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Total Equity</p>
          <p className="text-2xl font-semibold text-gray-900">
            ${(portfolio?.totalEquity || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Cash: ${(portfolio?.cash || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Daily P&L Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Today's P&L</p>
          <p className={`text-2xl font-semibold ${
            (portfolio?.dailyPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {(portfolio?.dailyPnL || 0) >= 0 ? '+' : ''}
            ${(portfolio?.dailyPnL || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className={`text-xs ${
            (portfolio?.dailyPnLPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
          } mt-2`}>
            {(portfolio?.dailyPnLPercent || 0) >= 0 ? '+' : ''}
            {(portfolio?.dailyPnLPercent || 0).toFixed(2)}%
          </p>
        </div>

        {/* Positions Card */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Open Positions</p>
          <p className="text-2xl font-semibold text-gray-900">
            {portfolio?.openTradeCount || 0}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Exposure: ${(portfolio?.totalExposure || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Performance Metrics */}
      {metrics && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Performance Metrics</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Win Rate</p>
              <p className="text-lg font-semibold text-gray-900">
                {(metrics.winRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Profit Factor</p>
              <p className="text-lg font-semibold text-gray-900">
                {metrics.profitFactor.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Sharpe Ratio</p>
              <p className="text-lg font-semibold text-gray-900">
                {metrics.sharpeRatio.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Max Drawdown</p>
              <p className="text-lg font-semibold text-red-600">
                -{metrics.maxDrawdown.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Strategies */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Active Strategies</h4>
        <div className="flex flex-wrap gap-2">
          {agent.strategies.map(strategy => (
            <span
              key={strategy}
              className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full"
            >
              {strategy}
            </span>
          ))}
        </div>
      </div>

      {/* Risk Limits Summary */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Risk Limits</h4>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Max Position Size</p>
              <p className="font-medium text-gray-900">
                ${agent.riskLimits.maxPositionSize.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Max Portfolio Exposure</p>
              <p className="font-medium text-gray-900">
                {agent.riskLimits.maxPortfolioExposure}%
              </p>
            </div>
            <div>
              <p className="text-gray-500">Max Daily Loss</p>
              <p className="font-medium text-gray-900">
                ${agent.riskLimits.maxDailyLoss.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Max Concurrent Positions</p>
              <p className="font-medium text-gray-900">
                {agent.riskLimits.maxConcurrentPositions}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Min Confidence Score</p>
              <p className="font-medium text-gray-900">
                {agent.riskLimits.minConfidenceScore}/100
              </p>
            </div>
            <div>
              <p className="text-gray-500">Max Correlation</p>
              <p className="font-medium text-gray-900">
                {agent.riskLimits.maxCorrelation.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h4>
        <div className="bg-gray-50 rounded-lg p-4">
          {activity.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {activity.map(item => (
                <div key={item.id} className="flex items-start space-x-3 text-sm">
                  <div className="flex-shrink-0 w-20 text-gray-500">
                    {format(new Date(item.timestamp), 'HH:mm:ss')}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">
                      {item.activityType.replace(/_/g, ' ')}
                    </span>
                    {item.ticker && (
                      <span className="text-blue-600 ml-2">{item.ticker}</span>
                    )}
                    <p className="text-gray-600 mt-1">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
