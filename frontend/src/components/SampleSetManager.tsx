/**
 * Sample Set Manager Component (Phase 3)
 * Manage sample sets and their samples
 */

import { useState, useEffect } from 'react';
import { sampleSetsApi } from '../services/sampleSetsApi';
import type { SampleSet, Sample } from '../services/sampleSetsApi';

export default function SampleSetManager() {
  const [sampleSets, setSampleSets] = useState<SampleSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<SampleSet | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [newSetPatternType, setNewSetPatternType] = useState('');

  // Load sample sets on mount
  useEffect(() => {
    loadSampleSets();
  }, []);

  // Load samples when a set is selected
  useEffect(() => {
    if (selectedSet) {
      loadSamples(selectedSet.id);
    }
  }, [selectedSet]);

  const loadSampleSets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sampleSetsApi.getSampleSets();
      setSampleSets(response.sample_sets);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load sample sets');
    } finally {
      setLoading(false);
    }
  };

  const loadSamples = async (setId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sampleSetsApi.getSamples(setId);
      setSamples(response.samples);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load samples');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const newSet = await sampleSetsApi.createSampleSet({
        name: newSetName,
        description: newSetDescription || undefined,
        pattern_type: newSetPatternType || undefined,
      });
      setSampleSets([...sampleSets, newSet]);
      setShowCreateModal(false);
      setNewSetName('');
      setNewSetDescription('');
      setNewSetPatternType('');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create sample set');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSet = async (setId: string) => {
    if (!confirm('Are you sure you want to delete this sample set? This will delete all samples in the set.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await sampleSetsApi.deleteSampleSet(setId);
      setSampleSets(sampleSets.filter((s) => s.id !== setId));
      if (selectedSet?.id === setId) {
        setSelectedSet(null);
        setSamples([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete sample set');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!selectedSet || !confirm('Are you sure you want to delete this sample?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await sampleSetsApi.deleteSample(selectedSet.id, sampleId);
      setSamples(samples.filter((s) => s.id !== sampleId));
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete sample');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Sample Sets</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Create Sample Set
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sample Sets List */}
        <div className="md:col-span-1">
          <div className="bg-white shadow-md rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sets</h3>
            {loading && sampleSets.length === 0 ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : sampleSets.length === 0 ? (
              <p className="text-gray-500 text-sm">No sample sets yet. Create one to get started.</p>
            ) : (
              <div className="space-y-2">
                {sampleSets.map((set) => (
                  <div
                    key={set.id}
                    className={`p-3 rounded-md cursor-pointer transition-colors ${
                      selectedSet?.id === set.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                    onClick={() => setSelectedSet(set)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{set.name}</p>
                        {set.pattern_type && (
                          <p className="text-xs text-gray-600">{set.pattern_type}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {set.total_samples} sample{set.total_samples !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSet(set.id);
                        }}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Samples Display */}
        <div className="md:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedSet ? `Samples in "${selectedSet.name}"` : 'Select a Sample Set'}
            </h3>
            {!selectedSet ? (
              <p className="text-gray-500 text-sm">Select a sample set from the list to view its samples.</p>
            ) : loading ? (
              <p className="text-gray-500 text-sm">Loading samples...</p>
            ) : samples.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No samples in this set yet. Use the scanner to find and save patterns.
              </p>
            ) : (
              <div className="space-y-3">
                {samples.map((sample) => (
                  <div
                    key={sample.id}
                    className="p-4 border border-gray-200 rounded-md hover:border-gray-300 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-bold text-lg text-gray-900">{sample.ticker}</span>
                          <span className="text-sm text-gray-500">
                            {sample.start_date} to {sample.end_date}
                          </span>
                        </div>
                        {sample.notes && (
                          <p className="text-sm text-gray-700 mb-2">{sample.notes}</p>
                        )}
                        {sample.metadata && (
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                            {sample.metadata.max_gain_pct && (
                              <div>Max Gain: {sample.metadata.max_gain_pct.toFixed(2)}%</div>
                            )}
                            {sample.metadata.peak_date && (
                              <div>Peak: {sample.metadata.peak_date}</div>
                            )}
                            {sample.metadata.volume_spike_ratio && (
                              <div>Vol Spike: {sample.metadata.volume_spike_ratio.toFixed(2)}x</div>
                            )}
                            {sample.metadata.pattern_duration_days && (
                              <div>Duration: {sample.metadata.pattern_duration_days} days</div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteSample(sample.id)}
                        className="text-red-600 hover:text-red-800 text-sm ml-4"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Sample Set Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Create Sample Set</h3>
            <form onSubmit={handleCreateSet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Capitulation Reversals"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newSetDescription}
                  onChange={(e) => setNewSetDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pattern Type</label>
                <input
                  type="text"
                  value={newSetPatternType}
                  onChange={(e) => setNewSetPatternType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., capitulatory, breakout, reversal"
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !newSetName.trim()}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
