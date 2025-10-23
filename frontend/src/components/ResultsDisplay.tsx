/**
 * ResultsDisplay Component
 * Shows backtest results including metrics, trades, and routing decision
 */

import type { IntelligentBacktestResponse, Trade } from '../services/api';

interface ResultsDisplayProps {
  results: IntelligentBacktestResponse;
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const { metadata, results: backtestResults, executionTime } = results;
  const { metrics, trades, summary } = backtestResults;

  // Fallback to old routing format if metadata doesn't exist
  const routing = metadata?.routing || (results as any).routing;
  const dates = metadata?.dates || routing?.dates || [];
  const parameters = metadata?.parameters || {};
  const claude = metadata?.claude;

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
      {/* Execution Details Panel */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-4 text-lg">Execution Details</h3>

        {/* Blue info badge if Claude suggested dates */}
        {routing?.reason && routing.reason.includes('Claude suggested') && (
          <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-blue-800">AI-Suggested Date Range</p>
                <p className="text-sm text-blue-700 mt-1">
                  {routing.reason.match(/Claude suggested.*?\)/)?.[0] || 'Claude analyzed your prompt and suggested appropriate testing dates based on strategy complexity.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Amber warning if dates were auto-populated (fallback) */}
        {routing?.reason && routing.reason.includes('defaulting to last 10 trading days') && !routing.reason.includes('Claude suggested') && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-800">No dates specified in prompt</p>
                <p className="text-sm text-amber-700 mt-1">
                  Automatically defaulted to the last 10 trading days. For better results, specify a date range in your prompt
                  (e.g., "for the last 20 days", "from Oct 1 to Oct 22").
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Routing Information */}
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Routing Strategy</h4>
            <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Strategy:</span>
                <span className="font-semibold text-blue-700">{routing?.strategy || 'template-api'}</span>
              </div>
              <div className="border-t pt-2">
                <span className="text-gray-600">Reason:</span>
                <p className="text-gray-800 mt-1">{routing?.reason || 'Default routing'}</p>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="text-gray-600">Execution Time:</span>
                <span className="font-semibold">{executionTime}ms</span>
              </div>
            </div>
          </div>

          {/* Parameters */}
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Parameters</h4>
            <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Ticker:</span>
                <span className="font-semibold">{parameters.ticker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Timeframe:</span>
                <span className="font-semibold">{parameters.timeframe}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Positions:</span>
                <span className="font-semibold">
                  {parameters.allowLong && parameters.allowShort ? 'Long & Short' :
                   parameters.allowShort ? 'Short Only' : 'Long Only'}
                </span>
              </div>
              {parameters.openingRangeMinutes && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Opening Range:</span>
                  <span className="font-semibold">{parameters.openingRangeMinutes} min</span>
                </div>
              )}
              {parameters.stopLossPct && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Stop Loss:</span>
                  <span className="font-semibold text-red-600">{parameters.stopLossPct}%</span>
                </div>
              )}
              {parameters.takeProfitPct && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Take Profit:</span>
                  <span className="font-semibold text-green-600">{parameters.takeProfitPct}%</span>
                </div>
              )}
              {parameters.exitTime && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Exit Time:</span>
                  <span className="font-semibold">{parameters.exitTime}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dates Tested */}
        {dates.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-gray-700 mb-2">Dates Tested ({dates.length} days)</h4>
            <div className="bg-white rounded-lg p-3">
              <p className="text-sm text-gray-700">
                {dates.length <= 10
                  ? dates.join(', ')
                  : `${dates[0]} ... ${dates[dates.length - 1]} (${dates.length} days)`}
              </p>
            </div>
          </div>
        )}

        {/* Claude AI Assumptions (if applicable) */}
        {claude && claude.assumptions && claude.assumptions.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium text-amber-700 mb-2 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Claude AI Assumptions (Confidence: {(claude.confidence * 100).toFixed(0)}%)
            </h4>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <ul className="text-sm space-y-2">
                {claude.assumptions.map((assumption: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <span className="text-amber-600 mr-2">•</span>
                    <span className="text-gray-700">{assumption}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Side</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exit Reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trades.map((trade: Trade, index: number) => (
                  <tr key={index} className={trade.noTrade ? 'bg-gray-50' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{trade.date || '-'}</td>
                    {trade.noTrade ? (
                      <td colSpan={6} className="px-4 py-3 text-sm text-gray-500">
                        No trade - {trade.noTradeReason}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                            trade.side === 'LONG'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {trade.side || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="text-gray-900 font-medium">${trade.entryPrice?.toFixed(2) || '-'}</div>
                          {trade.entryTime && <div className="text-gray-500 text-xs">{trade.entryTime}</div>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="text-gray-900 font-medium">${trade.exitPrice?.toFixed(2) || '-'}</div>
                          {trade.exitTime && <div className="text-gray-500 text-xs">{trade.exitTime}</div>}
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
