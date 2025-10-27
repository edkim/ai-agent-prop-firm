/**
 * Chart Gallery Component
 * Displays analysis charts in a grid with expand/collapse functionality
 */

import { useState, useEffect } from 'react';
import { claudeAnalysisApi } from '../services/claudeAnalysisApi';
import type { ChartData } from '../services/claudeAnalysisApi';
import ChartModal from './ChartModal';

interface ChartGalleryProps {
  analysisId: string | null;
  loading?: boolean;
}

export default function ChartGallery({ analysisId, loading }: ChartGalleryProps) {
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Fetch charts when analysisId changes or when analysis completes
  useEffect(() => {
    if (!analysisId) {
      setCharts([]);
      return;
    }

    const fetchCharts = async () => {
      setIsFetching(true);
      setFetchError(null);
      try {
        const data = await claudeAnalysisApi.getCharts(analysisId);
        setCharts(data.charts);

        // If no charts yet and still loading, poll periodically
        if (data.charts.length === 0 && loading) {
          setTimeout(fetchCharts, 2000); // Retry in 2 seconds
        }
      } catch (err: any) {
        console.error('Failed to load charts:', err);
        setFetchError(err.response?.data?.error || err.message || 'Failed to load charts');
      } finally {
        setIsFetching(false);
      }
    };

    fetchCharts();
  }, [analysisId, loading]); // Refetch when analysisId or loading changes

  // Group charts by sample (each sample has 2 charts: daily + intraday)
  const chartsBySample: Record<string, ChartData[]> = {};
  charts.forEach(chart => {
    if (!chartsBySample[chart.sampleId]) {
      chartsBySample[chart.sampleId] = [];
    }
    chartsBySample[chart.sampleId].push(chart);
  });

  if (!analysisId) {
    return null;
  }

  return (
    <div className="border border-blue-200 rounded bg-blue-50 p-3 mb-4">
      {/* Header with expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-medium text-gray-900 mb-2 hover:text-blue-700"
      >
        <span>
          Analysis Charts
          {charts.length > 0 && ` (${charts.length} chart${charts.length !== 1 ? 's' : ''})`}
        </span>
        <span className="text-blue-600">{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Content */}
      {expanded && (
        <>
          {/* Loading State */}
          {(loading || isFetching) && charts.length === 0 && (
            <div className="text-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading charts...</p>
            </div>
          )}

          {/* Error State */}
          {fetchError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {fetchError}
            </div>
          )}

          {/* Charts Grid */}
          {charts.length > 0 && (
            <div className="space-y-4">
              {Object.entries(chartsBySample).map(([sampleId, sampleCharts]) => {
                // Sort charts: daily_context first, then intraday_detail
                const sortedCharts = [...sampleCharts].sort((a, b) => {
                  if (a.chartType === 'daily_context' && b.chartType === 'intraday_detail') return -1;
                  if (a.chartType === 'intraday_detail' && b.chartType === 'daily_context') return 1;
                  return 0;
                });

                return (
                  <div key={sampleId} className="bg-white rounded-lg p-3 shadow-sm">
                    {/* Sample Header */}
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      {sortedCharts[0].ticker}
                      <span className="ml-2 text-xs font-normal text-gray-600">
                        {sortedCharts[0].startDate} - {sortedCharts[0].endDate}
                      </span>
                    </h4>

                    {/* Charts Grid (2 columns) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sortedCharts.map(chart => (
                        <div
                          key={chart.id}
                          className="cursor-pointer hover:opacity-90 transition group"
                          onClick={() => setSelectedChart(chart)}
                        >
                          <div className="relative">
                            <img
                              src={`data:image/png;base64,${chart.chartData}`}
                              alt={`${chart.ticker} ${chart.chartType}`}
                              className="w-full rounded-lg border border-gray-300 group-hover:border-blue-500 shadow-sm"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black bg-opacity-20 rounded-lg">
                              <span className="bg-white text-gray-900 px-3 py-1 rounded-full text-xs font-medium shadow">
                                Click to enlarge
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2 text-center font-medium">
                            {chart.chartType === 'daily_context'
                              ? 'Daily Context (30 days)'
                              : 'Intraday Detail (5-min bars)'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!loading && !isFetching && charts.length === 0 && !fetchError && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No charts generated yet</p>
              <p className="text-xs mt-1">Charts will appear after analysis starts</p>
            </div>
          )}
        </>
      )}

      {/* Full-size Chart Modal */}
      {selectedChart && (
        <ChartModal
          chart={selectedChart}
          onClose={() => setSelectedChart(null)}
        />
      )}
    </div>
  );
}
