/**
 * Chart Modal Component
 * Full-size chart viewer with modal overlay
 */

import type { ChartData } from '../services/claudeAnalysisApi';

interface ChartModalProps {
  chart: ChartData;
  onClose: () => void;
}

export default function ChartModal({ chart, onClose }: ChartModalProps) {
  const chartTypeLabel = chart.chartType === 'daily_context'
    ? 'Daily Context'
    : 'Intraday Detail (5-min)';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-7xl max-h-[95vh] overflow-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="font-semibold text-lg text-gray-900">
              {chart.ticker} - {chartTypeLabel}
            </h3>
            <p className="text-sm text-gray-600">
              {chart.startDate} to {chart.endDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl leading-none px-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Chart Image */}
        <div className="p-6 bg-gray-50">
          <img
            src={`data:image/png;base64,${chart.chartData}`}
            alt={`${chart.ticker} ${chartTypeLabel}`}
            className="w-full rounded-lg shadow-md"
            style={{ maxHeight: '80vh' }}
          />
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <span>Chart ID: {chart.id}</span>
            <span>{chart.width}×{chart.height}px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
