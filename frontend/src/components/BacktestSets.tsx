/**
 * Backtest Sets Component
 * Manage sample sets for batch backtesting
 */

import { useState, useEffect } from 'react';
import { backtestSetsApi } from '../services/backtestSetsApi';
import type { BacktestSet, Sample } from '../services/backtestSetsApi';

interface BacktestSetsProps {
  activeBacktestSet: BacktestSet | null;
  setActiveBacktestSet: (set: BacktestSet | null) => void;
  activeSamples: Sample[];
  setActiveSamples: (samples: Sample[]) => void;
  onSamplesChanged: () => void; // Callback to refresh when samples change
}

export default function BacktestSets({
  activeBacktestSet,
  setActiveBacktestSet,
  activeSamples,
  setActiveSamples,
  onSamplesChanged,
}: BacktestSetsProps) {
  const [backtestSets, setBacktestSets] = useState<BacktestSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingSample, setRemovingSample] = useState<Record<string, boolean>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Load all sample sets on mount
  useEffect(() => {
    loadBacktestSets();
  }, []);

  // Load samples when active set changes
  useEffect(() => {
    if (activeBacktestSet) {
      loadSamples(activeBacktestSet.id);
    } else {
      setActiveSamples([]);
    }
  }, [activeBacktestSet]);

  const loadBacktestSets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await backtestSetsApi.getBacktestSets();
      setBacktestSets(response.backtest_sets);
    } catch (err: any) {
      console.error('Failed to load sample sets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSamples = async (setId: string) => {
    try {
      const response = await backtestSetsApi.getSamples(setId);
      setActiveSamples(response.samples);
    } catch (err: any) {
      console.error('Failed to load samples:', err);
      setError(err.message);
    }
  };

  const handleSelectSet = (setId: string) => {
    if (setId === '') {
      setActiveBacktestSet(null);
      return;
    }

    const selected = backtestSets.find(s => s.id === setId);
    if (selected) {
      setActiveBacktestSet(selected);
    }
  };

  const handleRemoveSample = async (sample: Sample) => {
    if (!activeBacktestSet) return;

    const key = sample.id;
    setRemovingSample(prev => ({ ...prev, [key]: true }));

    try {
      await backtestSetsApi.deleteSample(activeBacktestSet.id, sample.id);

      // Update local state
      setActiveSamples(prev => prev.filter(s => s.id !== sample.id));

      // Notify parent to refresh +/- buttons
      onSamplesChanged();

      // Reload sample sets to update count
      await loadBacktestSets();
    } catch (err: any) {
      console.error('Failed to remove sample:', err);
      alert(`Failed to remove sample: ${err.response?.data?.error || err.message}`);
    } finally {
      setRemovingSample(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;

    setCreating(true);
    try {
      const newSet = await backtestSetsApi.createBacktestSet({
        name: newSetName.trim(),
        description: newSetDescription.trim() || undefined,
      });

      // Reload sample sets
      await loadBacktestSets();

      // Set as active
      setActiveBacktestSet(newSet);

      // Reset form
      setNewSetName('');
      setNewSetDescription('');
      setShowCreateForm(false);
    } catch (err: any) {
      console.error('Failed to create sample set:', err);
      alert(`Failed to create sample set: ${err.response?.data?.error || err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-4 h-full overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Backtest Sets</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="text-sm text-blue-600 hover:text-blue-800"
          title="Create new sample set"
        >
          {showCreateForm ? '✕' : '+'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateSet} className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <div className="mb-2">
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="Sample set name"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              disabled={creating}
            />
          </div>
          <div className="mb-2">
            <textarea
              value={newSetDescription}
              onChange={(e) => setNewSetDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              disabled={creating}
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newSetName.trim()}
            className="w-full bg-blue-600 text-white px-3 py-1 text-sm rounded hover:bg-blue-700 disabled:bg-gray-300"
          >
            {creating ? 'Creating...' : 'Create Backtest Set'}
          </button>
        </form>
      )}

      {/* Backtest Set Dropdown */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Active Backtest Set
        </label>
        <select
          value={activeBacktestSet?.id || ''}
          onChange={(e) => handleSelectSet(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
        >
          <option value="">-- Select a set --</option>
          {backtestSets.map(set => (
            <option key={set.id} value={set.id}>
              {set.name} ({set.total_samples || 0})
            </option>
          ))}
        </select>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Samples List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-2 text-sm">Loading...</p>
        </div>
      ) : activeBacktestSet && activeSamples.length > 0 ? (
        <div className="flex-1 overflow-y-auto">
          <div className="text-xs font-medium text-gray-700 mb-2">
            {activeSamples.length} sample{activeSamples.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {activeSamples.map((sample) => (
              <div
                key={sample.id}
                className="flex items-center justify-between p-2 border border-gray-200 rounded hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {sample.ticker}
                  </div>
                  <div className="text-xs text-gray-500">
                    {sample.start_date} - {sample.end_date}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveSample(sample)}
                  disabled={removingSample[sample.id]}
                  className="ml-2 text-red-600 hover:text-red-800 disabled:text-gray-400 text-sm font-medium"
                  title="Remove from set"
                >
                  {removingSample[sample.id] ? '...' : '−'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : activeBacktestSet ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No samples in this set</p>
          <p className="text-xs mt-1">Use + buttons in scan results to add</p>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">Select a backtest set</p>
          <p className="text-xs mt-1">or create a new one</p>
        </div>
      )}
    </div>
  );
}
