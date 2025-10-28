/**
 * Position Monitor Component
 * Real-time display of open positions
 */

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { ExecutedTrade } from '../../types/tradingAgent';

interface PositionMonitorProps {
  agentId: string;
}

export default function PositionMonitor({ agentId }: PositionMonitorProps) {
  const [positions, setPositions] = useState<ExecutedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadPositions();
    const interval = setInterval(loadPositions, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [agentId]);

  const loadPositions = async () => {
    try {
      const data = await tradingAgentApi.getTrades(agentId, { status: 'OPEN' });
      setPositions(data);
    } catch (err) {
      console.error('Failed to load positions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (tradeId: string) => {
    if (!confirm('Are you sure you want to manually close this position?')) return;

    try {
      setActionLoading(tradeId);
      await tradingAgentApi.closeTrade(agentId, tradeId);
      await loadPositions();
    } catch (err: any) {
      alert(`Failed to close position: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEnableTrailing = async (tradeId: string) => {
    const trailPercent = prompt('Enter trailing stop percentage (e.g., 5 for 5%):', '5');
    if (!trailPercent) return;

    const activationPercent = prompt('Enter activation threshold percentage (default: 2):', '2');

    try {
      setActionLoading(tradeId);
      await tradingAgentApi.enableTrailingStop(agentId, tradeId, {
        trailPercent: parseFloat(trailPercent),
        activationPercent: activationPercent ? parseFloat(activationPercent) : 2,
      });
      await loadPositions();
      alert('Trailing stop enabled successfully');
    } catch (err: any) {
      alert(`Failed to enable trailing stop: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Open Positions</h3>
        <p className="text-sm text-gray-600">Positions will appear here when trades are executed</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Open Positions ({positions.length})
      </h3>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ticker
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Side
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entry
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                P&L
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stop
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trail
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {positions.map(position => {
              const pnl = position.pnl || 0;
              const pnlPercent = position.pnlPercent || 0;
              const isActionLoading = actionLoading === position.id;

              return (
                <tr key={position.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{position.ticker}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      position.side === 'LONG'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {position.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                    ${position.entryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                    {position.positionSize}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className={`text-sm font-medium ${
                      pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                    </div>
                    <div className={`text-xs ${
                      pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                    ${position.stopLoss.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                    ${position.takeProfit.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {position.trailingStop ? (
                      <span className="text-green-600 font-medium text-sm">
                        ${position.trailingStop.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatDistanceToNow(new Date(position.entryTime), { addSuffix: false })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleClose(position.id)}
                        disabled={isActionLoading}
                        className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                      >
                        Close
                      </button>
                      {!position.trailingStop && (
                        <button
                          onClick={() => handleEnableTrailing(position.id)}
                          disabled={isActionLoading}
                          className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                        >
                          Trail
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
