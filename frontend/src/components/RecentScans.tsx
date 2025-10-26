/**
 * Recent Scans Component
 * Displays list of recent scan history for quick access
 */

import { useState, useEffect } from 'react';
import type { ScanMatch } from '../services/scannerApi';

interface ScanHistory {
  id: string;
  user_prompt: string;
  universe_id?: string;
  date_range_start?: string;
  date_range_end?: string;
  matches_found: number;
  results: ScanMatch[];
  execution_time_ms: number;
  created_at: string;
}

interface RecentScansProps {
  onScanClick: (scanHistory: ScanHistory) => void;
}

export default function RecentScans({ onScanClick }: RecentScansProps) {
  const [history, setHistory] = useState<ScanHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/scanner/history?limit=20');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setHistory(data.history || []);
    } catch (err: any) {
      console.error('Failed to load scan history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };


  return (
    <div className="bg-white shadow-md rounded-lg p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Scans</h3>
        <button
          onClick={loadHistory}
          className="text-sm text-blue-600 hover:text-blue-800"
          title="Refresh"
        >
          &#x21bb;
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-2 text-sm">Loading...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={loadHistory}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Retry
          </button>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No recent scans</p>
          <p className="text-xs mt-1">Run a scan to see it here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((scan) => (
            <button
              key={scan.id}
              onClick={() => onScanClick(scan)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-medium text-blue-600">
                  {scan.matches_found} match{scan.matches_found !== 1 ? 'es' : ''}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDate(scan.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-900 mb-1">
                {scan.user_prompt}
              </p>
              {(scan.date_range_start || scan.date_range_end) && (
                <p className="text-xs text-gray-500">
                  {scan.date_range_start} - {scan.date_range_end}
                </p>
              )}
              <div className="mt-1 flex items-center text-xs text-gray-400">
                <span>{scan.execution_time_ms}ms</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
