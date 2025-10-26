/**
 * Scanner Component
 * Natural language stock pattern scanner
 */

import { useState, useEffect } from 'react';
import { scannerApi } from '../services/scannerApi';
import { chartsApi } from '../services/chartsApi';
import { sampleSetsApi } from '../services/sampleSetsApi';
import RecentScans from './RecentScans';
import type { ScanResult, ScanMatch } from '../services/scannerApi';
import type { ChartThumbnailResponse } from '../services/chartsApi';
import type { SampleSet } from '../services/sampleSetsApi';

export default function Scanner() {
  const [query, setQuery] = useState('');
  const [universe, setUniverse] = useState('russell2000');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  // Chart state
  const [charts, setCharts] = useState<Record<string, ChartThumbnailResponse>>({});
  const [loadingCharts, setLoadingCharts] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Sample sets state
  const [sampleSets, setSampleSets] = useState<SampleSet[]>([]);
  const [savingToSet, setSavingToSet] = useState<Record<string, boolean>>({});

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

  // Load sample sets on mount
  useEffect(() => {
    const loadSampleSets = async () => {
      try {
        const response = await sampleSetsApi.getSampleSets();
        setSampleSets(response.sample_sets);
      } catch (err) {
        console.error('Failed to load sample sets:', err);
      }
    };
    loadSampleSets();
  }, []);

  // View chart for a result
  const handleViewChart = async (match: ScanMatch) => {
    const key = `${match.ticker}-${match.date}`;

    // If already loaded and expanded, just collapse
    if (expandedRows[key] && charts[key]) {
      setExpandedRows(prev => ({ ...prev, [key]: false }));
      return;
    }

    // If already loaded but collapsed, just expand
    if (charts[key]) {
      setExpandedRows(prev => ({ ...prev, [key]: true }));
      return;
    }

    // Generate date range (30 days before match date)
    const endDate = match.date;
    const startDate = new Date(new Date(match.date).getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    setLoadingCharts(prev => ({ ...prev, [key]: true }));

    try {
      const chart = await chartsApi.generateThumbnail({
        ticker: match.ticker,
        startDate,
        endDate,
      });
      setCharts(prev => ({ ...prev, [key]: chart }));
      setExpandedRows(prev => ({ ...prev, [key]: true }));
    } catch (err: any) {
      console.error('Failed to load chart:', err);
      alert(`Failed to load chart: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoadingCharts(prev => ({ ...prev, [key]: false }));
    }
  };

  // Save result to sample set
  const handleSaveToSampleSet = async (match: ScanMatch, sampleSetId: string) => {
    const key = `${match.ticker}-${match.date}`;

    setSavingToSet(prev => ({ ...prev, [key]: true }));

    try {
      // Calculate date range (use 30 days before match date as start)
      const endDate = match.date;
      const startDate = new Date(new Date(match.date).getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      await sampleSetsApi.addSample(sampleSetId, {
        ticker: match.ticker,
        start_date: startDate,
        end_date: endDate,
        peak_date: match.date,
        notes: `Scanner match: ${match.metrics.change_percent?.toFixed(2)}% change, ${match.metrics.volume_ratio?.toFixed(2)}x volume`,
      });

      alert(`Successfully added ${match.ticker} to sample set`);
    } catch (err: any) {
      console.error('Failed to save to sample set:', err);
      alert(`Failed to save: ${err.response?.data?.error || err.message}`);
    } finally {
      setSavingToSet(prev => ({ ...prev, [key]: false }));
    }
  };

  // Load cached results from scan history (Phase 4)
  const handleRecentScanClick = (scanHistory: any) => {
    // Load cached results without calling Claude API
    setResults({
      matches: scanHistory.results,
      criteria: { universe: scanHistory.universe_id || 'russell2000' },
      total_matches: scanHistory.matches_found,
      scan_time_ms: scanHistory.execution_time_ms,
      scan_history_id: scanHistory.id,
    });

    // Update query to show what scan was run
    setQuery(scanHistory.user_prompt);
    setError(null);
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Recent Scans Sidebar */}
      <div className="w-80 flex-shrink-0">
        <RecentScans onScanClick={handleRecentScanClick} />
      </div>

      {/* Main Scanner Content */}
      <div className="flex-1 space-y-6">
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.matches.map((match, idx) => {
                    const key = `${match.ticker}-${match.date}`;
                    const isExpanded = expandedRows[key];
                    const chart = charts[key];
                    const isLoadingChart = loadingCharts[key];
                    const isSaving = savingToSet[key];

                    return (
                      <>
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
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                onClick={() => handleViewChart(match)}
                                disabled={isLoadingChart}
                                className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 text-sm font-medium"
                                title="View chart"
                              >
                                {isLoadingChart ? '...' : isExpanded ? 'Hide' : 'Chart'}
                              </button>
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleSaveToSampleSet(match, e.target.value);
                                    e.target.value = ''; // Reset selection
                                  }
                                }}
                                disabled={isSaving}
                                className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                              >
                                <option value="">Save to...</option>
                                {sampleSets.map(set => (
                                  <option key={set.id} value={set.id}>
                                    {set.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                        {/* Chart row */}
                        {isExpanded && chart && (
                          <tr key={`${idx}-chart`}>
                            <td colSpan={7} className="px-4 py-3 bg-gray-50">
                              <div className="flex justify-center">
                                <img
                                  src={`data:image/png;base64,${chart.chartData}`}
                                  alt={`${chart.ticker} chart`}
                                  className="border border-gray-300 rounded shadow-sm"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
