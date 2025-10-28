/**
 * Trade History Component
 * Historical view of executed trades
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { ExecutedTrade } from '../../types/tradingAgent';

interface TradeHistoryProps {
  agentId: string;
}

export default function TradeHistory({ agentId }: TradeHistoryProps) {
  const [trades, setTrades] = useState<ExecutedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');

  useEffect(() => {
    loadTrades();
  }, [agentId, filter]);

  const loadTrades = async () => {
    try {
      setLoading(true);
      const params = filter !== 'ALL' ? { status: filter as any } : {};
      const data = await tradingAgentApi.getTrades(agentId, params);
      setTrades(data);
    } catch (err) {
      console.error('Failed to load trades:', err);
    } finally {
      setLoading(false);
    }
  };

  const getExitReasonBadge = (reason?: string) => {
    if (!reason) return null;
    const styles = {
      STOP_HIT: 'bg-red-100 text-red-800',
      TARGET_HIT: 'bg-green-100 text-green-800',
      TRAILING_STOP: 'bg-blue-100 text-blue-800',
      TIME_EXIT: 'bg-yellow-100 text-yellow-800',
      MANUAL_EXIT: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${styles[reason as keyof typeof styles]}`}>
        {reason.replace(/_/g, ' ')}
      </span>
    );
  };

  // Calculate summary stats
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {closedTrades.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Total Trades</p>
            <p className="text-xl font-semibold text-gray-900">{closedTrades.length}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Win Rate</p>
            <p className="text-xl font-semibold text-gray-900">{winRate.toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Total P&L</p>
            <p className={`text-xl font-semibold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Avg Win</p>
            <p className="text-xl font-semibold text-green-600">+${avgWin.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Avg Loss</p>
            <p className="text-xl font-semibold text-red-600">${avgLoss.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex items-center space-x-3">
        <span className="text-sm text-gray-600">Filter:</span>
        {['ALL', 'OPEN', 'CLOSED'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Trade Table */}
      {trades.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">No trades found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
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
                  Exit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  P&L
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Exit Reason
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {trades.map(trade => (
                <tr key={trade.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {format(new Date(trade.entryTime), 'MMM d, h:mm a')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{trade.ticker}</span>
                    <p className="text-xs text-gray-500">{trade.patternType}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      trade.side === 'LONG' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                    ${trade.entryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                    {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {trade.pnl !== undefined ? (
                      <>
                        <div className={`text-sm font-medium ${
                          trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {trade.pnl >= 0 ? '+' : ''}${Math.abs(trade.pnl).toFixed(2)}
                        </div>
                        <div className={`text-xs ${
                          (trade.pnlPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(trade.pnlPercent || 0) >= 0 ? '+' : ''}{(trade.pnlPercent || 0).toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getExitReasonBadge(trade.exitReason)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-900">
                    {trade.confidenceScore}/100
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      trade.status === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                      trade.status === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {trade.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
