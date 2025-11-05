/**
 * Paper Trading Dashboard Component
 * Displays real-time paper trading agents and their performance
 */

import { useState, useEffect } from 'react';
import { paperTradingApi, type PaperTradingAgent, type PaperTradingStatus, type PaperTradingSummary } from '../../services/paperTradingApi';

export default function PaperTradingDashboard() {
  const [agents, setAgents] = useState<PaperTradingAgent[]>([]);
  const [status, setStatus] = useState<PaperTradingStatus | null>(null);
  const [summary, setSummary] = useState<PaperTradingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
    // Auto-refresh every 15 seconds
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [agentsData, statusData, summaryData] = await Promise.all([
        paperTradingApi.getAgents(),
        paperTradingApi.getStatus(),
        paperTradingApi.getSummary(),
      ]);
      setAgents(agentsData);
      setStatus(statusData);
      setSummary(summaryData);
      if (agentsData.length > 0 && !selectedAgentId) {
        setSelectedAgentId(agentsData[0].id);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load paper trading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading paper trading data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadData}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Status */}
      {status && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Paper Trading System</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-3xl font-bold ${status.isRunning ? 'text-green-600' : 'text-red-600'}`}>
                {status.isRunning ? '✓' : '✗'}
              </div>
              <p className="text-sm text-gray-600 mt-1">Status</p>
              <p className="text-xs text-gray-500">{status.isRunning ? 'Running' : 'Stopped'}</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{status.activeAgents}</div>
              <p className="text-sm text-gray-600 mt-1">Active Agents</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{status.watchedTickers}</div>
              <p className="text-sm text-gray-600 mt-1">Tickers</p>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${status.polygonConnected ? 'text-green-600' : 'text-red-600'}`}>
                {status.polygonConnected ? '✓' : '✗'}
              </div>
              <p className="text-sm text-gray-600 mt-1">Data Feed</p>
              <p className="text-xs text-gray-500">{status.polygonConnected ? 'Connected' : 'Disconnected'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {summary && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Equity</p>
              <p className="text-2xl font-bold text-gray-900">
                ${summary.total_equity.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg P&L</p>
              <p className={`text-2xl font-bold ${summary.avg_pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.avg_pnl_percent >= 0 ? '+' : ''}{summary.avg_pnl_percent.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Trades</p>
              <p className="text-2xl font-bold text-gray-900">{summary.total_trades}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Win Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary.avg_win_rate ? `${summary.avg_win_rate.toFixed(1)}%` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Open Positions</p>
              <p className="text-2xl font-bold text-gray-900">{summary.active_positions}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trading Agents */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Trading Agents</h3>
        {agents.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No paper trading agents active</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(agent => (
              <div
                key={agent.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedAgentId === agent.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">{agent.name}</h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    agent.account_status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {agent.account_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-600">Equity</p>
                    <p className="font-semibold">${agent.equity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">P&L</p>
                    <p className={`font-semibold ${agent.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {agent.total_pnl >= 0 ? '+' : ''}${agent.total_pnl.toLocaleString()}
                      <span className="text-xs ml-1">
                        ({agent.total_pnl_percent >= 0 ? '+' : ''}{agent.total_pnl_percent.toFixed(2)}%)
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Cash</p>
                    <p className="font-semibold">${agent.current_cash.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Trades</p>
                    <p className="font-semibold">
                      {agent.total_trades}
                      {agent.total_trades > 0 && (
                        <span className="text-xs text-gray-500 ml-1">
                          ({agent.winning_trades}W/{agent.losing_trades}L)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Started: {new Date(agent.account_created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Trades */}
      {summary && summary.recent_trades.length > 0 && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Trades (24h)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Side</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {summary.recent_trades.map((trade: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {new Date(trade.executed_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{trade.agent_name}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{trade.ticker}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        trade.side === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right">{trade.quantity}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right">${trade.price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm text-right">
                      {trade.pnl !== null ? (
                        <span className={trade.pnl >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
