/**
 * Scanner Component
 * Natural language stock pattern scanner
 */

import { useState, useEffect } from 'react';
import { scannerApi } from '../services/scannerApi';
import { chartsApi } from '../services/chartsApi';
import { backtestSetsApi } from '../services/backtestSetsApi';
import RecentScans from './RecentScans';
import BacktestSets from './BacktestSets';
import type { ScanResult, ScanMatch } from '../services/scannerApi';
import type { ChartThumbnailResponse } from '../services/chartsApi';
import type { BacktestSet, Sample } from '../services/backtestSetsApi';

export default function Scanner() {
  const [query, setQuery] = useState('');
  const [universe, setUniverse] = useState('russell2000');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chart state
  const [charts, setCharts] = useState<Record<string, ChartThumbnailResponse>>({});
  const [loadingCharts, setLoadingCharts] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Active sample set state
  const [activeBacktestSet, setActiveBacktestSet] = useState<BacktestSet | null>(null);
  const [activeSamples, setActiveSamples] = useState<Sample[]>([]);
  const [addingToSet, setAddingToSet] = useState<Record<string, boolean>>({});
  const [samplesRefreshKey, setSamplesRefreshKey] = useState(0); // For triggering refreshes

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

    // Generate date range (30 days before + signal day + 30 days after)
    const signalDate = match.date;
    const startDate = new Date(new Date(signalDate).getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const endDateCalculated = new Date(Math.min(
      new Date(signalDate).getTime() + 30 * 24 * 60 * 60 * 1000,
      Date.now()
    ));
    const endDate = endDateCalculated.toISOString().split('T')[0];

    setLoadingCharts(prev => ({ ...prev, [key]: true }));

    try {
      const chart = await chartsApi.generateThumbnail({
        ticker: match.ticker,
        startDate,
        endDate,
        signalDate,
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

  // Check if ticker is in active sample set
  const isInActiveBacktestSet = (ticker: string, date: string): boolean => {
    if (!activeBacktestSet || activeSamples.length === 0) return false;

    return activeSamples.some(sample =>
      sample.ticker === ticker && sample.end_date === date
    );
  };

  // Add ticker to active sample set
  const handleAddToBacktestSet = async (match: ScanMatch) => {
    if (!activeBacktestSet) return;

    const key = `${match.ticker}-${match.date}`;
    setAddingToSet(prev => ({ ...prev, [key]: true }));

    try {
      // Calculate date range (30 days before match date)
      const endDate = match.date;
      const startDate = new Date(new Date(match.date).getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      await backtestSetsApi.addSample(activeBacktestSet.id, {
        ticker: match.ticker,
        start_date: startDate,
        end_date: endDate,
        peak_date: match.date,
        notes: `Scanner match: ${match.metrics.change_percent?.toFixed(2)}% change, ${match.metrics.volume_ratio?.toFixed(2)}x volume`,
      });

      // Refresh samples to show in Backtest Sets component
      setSamplesRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.error('Failed to add to sample set:', err);
      alert(`Failed to add: ${err.response?.data?.error || err.message}`);
    } finally {
      setAddingToSet(prev => ({ ...prev, [key]: false }));
    }
  };

  // Remove ticker from active sample set
  const handleRemoveFromBacktestSet = async (match: ScanMatch) => {
    if (!activeBacktestSet) return;

    const key = `${match.ticker}-${match.date}`;

    // Find the sample to remove
    const sampleToRemove = activeSamples.find(s =>
      s.ticker === match.ticker && s.end_date === match.date
    );

    if (!sampleToRemove) return;

    setAddingToSet(prev => ({ ...prev, [key]: true }));

    try {
      await backtestSetsApi.deleteSample(activeBacktestSet.id, sampleToRemove.id);

      // Refresh samples
      setSamplesRefreshKey(prev => prev + 1);
    } catch (err: any) {
      console.error('Failed to remove from sample set:', err);
      alert(`Failed to remove: ${err.response?.data?.error || err.message}`);
    } finally {
      setAddingToSet(prev => ({ ...prev, [key]: false }));
    }
  };

  // Save all results to new sample set
  const handleSaveAllToNewSet = async () => {
    if (!results || results.matches.length === 0) return;

    const name = prompt('Enter name for new sample set:');
    if (!name) return;

    const description = prompt('Enter description (optional):');

    try {
      // Create new sample set
      const newSet = await backtestSetsApi.createBacktestSet({
        name: name.trim(),
        description: description?.trim() || undefined,
      });

      // Add all results
      for (const match of results.matches) {
        const endDate = match.date;
        const startDate = new Date(new Date(match.date).getTime() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        await backtestSetsApi.addSample(newSet.id, {
          ticker: match.ticker,
          start_date: startDate,
          end_date: endDate,
          peak_date: match.date,
          notes: `Scanner match: ${match.metrics.change_percent?.toFixed(2)}% change`,
        });
      }

      // Set as active
      setActiveBacktestSet(newSet);

      alert(`Created sample set "${name}" with ${results.matches.length} samples`);
    } catch (err: any) {
      console.error('Failed to create sample set:', err);
      alert(`Failed to create sample set: ${err.response?.data?.error || err.message}`);
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
    <div className="flex gap-4 h-full">
      {/* Recent Scans Sidebar - Left */}
      <div className="w-72 flex-shrink-0">
        <RecentScans onScanClick={handleRecentScanClick} />
      </div>

      {/* Main Scanner Content - Middle */}
      <div className="flex-1 space-y-6 min-w-0">
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
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Scanning...' : 'Scan'}
            </button>
          </div>
        </form>

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
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveAllToNewSet}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Save All to New Set
              </button>
              <span className="text-sm text-gray-600">
                {results.scan_time_ms}ms
              </span>
            </div>
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
                    const isAdding = addingToSet[key];
                    const isInSet = isInActiveBacktestSet(match.ticker, match.date);

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
                              {activeBacktestSet ? (
                                isInSet ? (
                                  <button
                                    onClick={() => handleRemoveFromBacktestSet(match)}
                                    disabled={isAdding}
                                    className="text-red-600 hover:text-red-800 disabled:text-gray-400 text-sm font-medium px-2"
                                    title={`Remove from ${activeBacktestSet.name}`}
                                  >
                                    {isAdding ? '...' : '−'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAddToBacktestSet(match)}
                                    disabled={isAdding}
                                    className="text-green-600 hover:text-green-800 disabled:text-gray-400 text-sm font-medium px-2"
                                    title={`Add to ${activeBacktestSet.name}`}
                                  >
                                    {isAdding ? '...' : '+'}
                                  </button>
                                )
                              ) : (
                                <button
                                  disabled
                                  className="text-gray-400 text-sm font-medium px-2"
                                  title="Select a sample set first"
                                >
                                  +
                                </button>
                              )}
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

      {/* Backtest Sets Sidebar - Right */}
      <div className="w-80 flex-shrink-0">
        <BacktestSets
          activeBacktestSet={activeBacktestSet}
          setActiveBacktestSet={setActiveBacktestSet}
          activeSamples={activeSamples}
          setActiveSamples={setActiveSamples}
          onSamplesChanged={() => setSamplesRefreshKey(prev => prev + 1)}
        />
      </div>
    </div>
  );
}
