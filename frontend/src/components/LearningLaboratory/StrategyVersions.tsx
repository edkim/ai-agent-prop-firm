/**
 * Strategy Versions Component
 * Displays strategy evolution and version history for an agent
 */

import { useState, useEffect } from 'react';
import { learningAgentApi, type AgentStrategy } from '../../services/learningAgentApi';

interface StrategyVersionsProps {
  agentId: string;
}

export default function StrategyVersions({ agentId }: StrategyVersionsProps) {
  const [strategies, setStrategies] = useState<AgentStrategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<AgentStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStrategies();
  }, [agentId]);

  const loadStrategies = async () => {
    try {
      setLoading(true);
      const data = await learningAgentApi.getStrategies(agentId);
      setStrategies(data);
      if (data.length > 0 && !selectedStrategy) {
        setSelectedStrategy(data.find(s => s.is_current_version) || data[0]);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load strategies:', err);
      setError(err.message || 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading strategies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Strategy Versions Yet</h3>
        <p className="text-gray-600">
          Strategy versions are created when refinements are applied
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Version List */}
      <div className="col-span-1 space-y-2">
        <h3 className="text-sm font-medium text-gray-900 mb-2">
          Version History ({strategies.length})
        </h3>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {strategies.map(strategy => (
            <button
              key={strategy.id}
              onClick={() => setSelectedStrategy(strategy)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedStrategy?.id === strategy.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">{strategy.version}</span>
                {strategy.is_current_version && (
                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                    Current
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Win Rate: {(strategy.backtest_win_rate * 100).toFixed(1)}%</div>
                <div>Sharpe: {strategy.backtest_sharpe.toFixed(2)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Strategy Details */}
      <div className="col-span-2">
        {selectedStrategy ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {selectedStrategy.version}
                  {selectedStrategy.is_current_version && (
                    <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      Active
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {new Date(selectedStrategy.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Performance */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">📊 Performance</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-600">Win Rate</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {(selectedStrategy.backtest_win_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Sharpe Ratio</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {selectedStrategy.backtest_sharpe.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Total Return</div>
                  <div className={`text-2xl font-bold ${
                    selectedStrategy.backtest_total_return >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {selectedStrategy.backtest_total_return >= 0 ? '+' : ''}
                    {(selectedStrategy.backtest_total_return * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Changes from Parent */}
            {selectedStrategy.parent_version && selectedStrategy.changes_from_parent && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  📝 Changes from {selectedStrategy.parent_version}
                </h4>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {selectedStrategy.changes_from_parent}
                </p>
              </div>
            )}

            {/* Scripts */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">📡 Scan Script</h4>
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs text-green-400 font-mono">
                    {selectedStrategy.scan_script}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">⚡ Execution Script</h4>
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs text-green-400 font-mono">
                    {selectedStrategy.execution_script}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-600">
            Select a version to view details
          </div>
        )}
      </div>
    </div>
  );
}
