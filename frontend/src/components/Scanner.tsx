/**
 * Scanner Component
 * Natural language stock pattern scanner
 */

import { useState } from 'react';
import { scannerApi, ScanResult, Universe } from '../services/scannerApi';

export default function Scanner() {
  const [query, setQuery] = useState('');
  const [universe, setUniverse] = useState('russell2000');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const scanResults = await scannerApi.naturalLanguageScan(query, universe);
      setResults(scanResults);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Scan failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBackfill = async () => {
    setBackfillStatus('Starting backfill...');
    try {
      // Backfill last 30 days of data
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const response = await scannerApi.backfillUniverse(universe, startDate, endDate);
      setBackfillStatus(response.message);
    } catch (err: any) {
      setBackfillStatus(`Error: ${err.response?.data?.message || err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scanner Form */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Stock Scanner</h2>

        <form onSubmit={handleScan} className="space-y-4">
          {/* Universe Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Universe
            </label>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="russell2000">Russell 2000</option>
            </select>
          </div>

          {/* Natural Language Query */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scan Query
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., find capitulatory moves with high volume"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Scanning...' : 'Scan'}
            </button>
            <button
              type="button"
              onClick={handleBackfill}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Backfill Data
            </button>
          </div>
        </form>

        {/* Backfill Status */}
        {backfillStatus && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
            {backfillStatus}
          </div>
        )}

        {/* Example Queries */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">Example Queries</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setQuery('find capitulatory moves with high volume')}
            >
              • find capitulatory moves with high volume
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setQuery('stocks that are oversold')}
            >
              • stocks that are oversold
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setQuery('breakout patterns above SMA 20')}
            >
              • breakout patterns above SMA 20
            </li>
            <li
              className="cursor-pointer hover:text-blue-600"
              onClick={() => setQuery('5 consecutive up days')}
            >
              • 5 consecutive up days
            </li>
          </ul>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800">Error</h3>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results Display */}
      {results && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">
              Scan Results ({results.total_matches} matches)
            </h3>
            <span className="text-sm text-gray-600">
              {results.scan_time_ms}ms
            </span>
          </div>

          {results.matches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No matches found. Try adjusting your query or backfilling more data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Change %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Volume Ratio
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      RSI
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.matches.map((match, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {match.ticker}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {match.date}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-medium ${
                        (match.metrics.change_percent || 0) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}>
                        {match.metrics.change_percent?.toFixed(2) || 'N/A'}%
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">
                        {match.metrics.volume_ratio?.toFixed(2) || 'N/A'}x
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">
                        {match.metrics.rsi_14?.toFixed(1) || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                        {match.score || 50}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
