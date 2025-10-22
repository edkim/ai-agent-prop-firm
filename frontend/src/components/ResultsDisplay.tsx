/**
 * ResultsDisplay Component
 * Shows backtest results including metrics, trades, and routing decision
 */

import type { IntelligentBacktestResponse, Trade } from '../services/api';

interface ResultsDisplayProps {
  results: IntelligentBacktestResponse;
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const { routing, results: backtestResults, executionTime } = results;
  const { metrics, trades, summary } = backtestResults;

  // Format currency
  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return '$0.00';
    return `${value >= 0 ? '+' : ''}$${value.toFixed(2)}`;
  };

  // Format percentage
  const formatPercent = (value?: number) => {
    if (value === undefined || value === null) return '0.0%';
    return `${value.toFixed(1)}%`;
  };

  // Get color class based on value
  const getPnLColor = (value?: number) => {
    if (!value) return 'text-gray-600';
    return value >= 0 ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Routing Decision Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Routing Decision</h3>
        <div className="text-sm space-y-1">
          <p><span className="font-medium">Strategy:</span> {routing.strategy}</p>
          <p><span className="font-medium">Reason:</span> {routing.reason}</p>
          {routing.dates && (
            <p>
              <span className="font-medium">Dates:</span> {routing.dates.length} days
              {routing.dates.length <= 5 && ` (${routing.dates.join(', ')})`}
            </p>
          )}
          <p><span className="font-medium">Execution Time:</span> {executionTime}ms</p>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Performance Metrics</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Total Trades</p>
            <p className="text-2xl font-bold">{metrics.total_trades || 0}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Win Rate</p>
            <p className="text-2xl font-bold">{formatPercent(metrics.win_rate)}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Total P&L</p>
            <p className={`text-2xl font-bold ${getPnLColor(metrics.total_pnl)}`}>
              {formatCurrency(metrics.total_pnl)}
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Avg P&L</p>
            <p className={`text-2xl font-bold ${getPnLColor(metrics.avg_pnl)}`}>
              {formatCurrency(metrics.avg_pnl)}
            </p>
          </div>
        </div>

        {/* Additional Metrics */}
        {(metrics.avg_winner || metrics.avg_loser) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Winners</p>
              <p className="text-lg font-semibold text-green-600">{metrics.winning_trades || 0}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Losers</p>
              <p className="text-lg font-semibold text-red-600">{metrics.losing_trades || 0}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Avg Winner</p>
              <p className="text-lg font-semibold text-green-600">{formatCurrency(metrics.avg_winner)}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Avg Loser</p>
              <p className="text-lg font-semibold text-red-600">{formatCurrency(metrics.avg_loser)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Trades Table */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Trade Details</h3>

        {trades && trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trades.map((trade: Trade, index: number) => (
                  <tr key={index} className={trade.noTrade ? 'bg-gray-50' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">{trade.date || '-'}</td>
                    {trade.noTrade ? (
                      <td colSpan={5} className="px-4 py-3 text-sm text-gray-500">
                        No trade - {trade.noTradeReason}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {trade.entryTime && `${trade.entryTime} @ `}${trade.entryPrice?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {trade.exitTime && `${trade.exitTime} @ `}${trade.exitPrice?.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${getPnLColor(trade.pnl)}`}>
                          {formatCurrency(trade.pnl)}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${getPnLColor(trade.pnl)}`}>
                          {trade.pnlPercent !== undefined ? `${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{trade.exitReason || '-'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No trades executed</p>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-xl font-bold mb-4 text-gray-800">Summary</h3>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded">
            {summary}
          </pre>
        </div>
      )}
    </div>
  );
}
