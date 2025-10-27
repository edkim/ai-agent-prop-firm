/**
 * Backtest Sets Component
 * Manage sample sets for batch backtesting with Claude AI analysis
 */

import { useState, useEffect } from 'react';
import { backtestSetsApi } from '../services/backtestSetsApi';
import type { BacktestSet, Sample } from '../services/backtestSetsApi';
import { claudeAnalysisApi } from '../services/claudeAnalysisApi';
import type { AnalysisResult, AnalysisStatus } from '../services/claudeAnalysisApi';
import ChartGallery from './ChartGallery';

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

  // Claude Analysis state
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);

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

  // Claude Analysis handlers
  const handleToggleSampleSelection = (sampleId: string) => {
    setSelectedSampleIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sampleId)) {
        newSet.delete(sampleId);
      } else {
        if (newSet.size >= 3) {
          return prev; // Max 3 samples
        }
        newSet.add(sampleId);
      }
      return newSet;
    });
  };

  const handleAnalyzeWithClaude = async () => {
    if (!activeBacktestSet || selectedSampleIds.size === 0) return;

    setAnalyzing(true);
    setAnalysisStatus('PENDING');
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      // Start analysis
      const response = await claudeAnalysisApi.analyzeCharts({
        backtestSetId: activeBacktestSet.id,
        sampleIds: Array.from(selectedSampleIds)
      });

      const analysisId = response.analysisId;
      setCurrentAnalysisId(analysisId); // Store analysisId for chart fetching

      // Poll for completion
      await pollAnalysisStatus(analysisId);
    } catch (err: any) {
      console.error('Failed to analyze with Claude:', err);
      setAnalysisError(err.response?.data?.error || err.message);
      setAnalyzing(false);
    }
  };

  const pollAnalysisStatus = async (analysisId: string) => {
    const maxAttempts = 120; // 2 minutes max (120 * 1000ms)
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await claudeAnalysisApi.pollStatus(analysisId);
        setAnalysisStatus(status.status);

        if (status.status === 'COMPLETED') {
          // Fetch full results
          const result = await claudeAnalysisApi.getAnalysis(analysisId);
          setAnalysisResult(result);
          setAnalyzing(false);
          return;
        }

        if (status.status === 'FAILED') {
          setAnalysisError(status.error || 'Analysis failed');
          setAnalyzing(false);
          return;
        }

        // Continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000); // Poll every second
        } else {
          setAnalysisError('Analysis timeout - please try again');
          setAnalyzing(false);
        }
      } catch (err: any) {
        console.error('Failed to poll analysis status:', err);
        setAnalysisError(err.message);
        setAnalyzing(false);
      }
    };

    poll();
  };

  const getStatusDisplay = (status: AnalysisStatus): string => {
    switch (status) {
      case 'PENDING':
        return 'Starting analysis...';
      case 'GENERATING_CHARTS':
        return 'Generating charts...';
      case 'ANALYZING':
        return 'Claude is analyzing...';
      case 'COMPLETED':
        return 'Analysis complete';
      case 'FAILED':
        return 'Analysis failed';
      default:
        return 'Processing...';
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

      {/* Claude Analysis Section */}
      {activeBacktestSet && activeSamples.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="text-xs font-medium text-gray-700 mb-2">
            Claude AI Analysis
          </div>
          <div className="text-xs text-gray-600 mb-2">
            Select 1-3 samples for visual pattern analysis
          </div>
          <button
            onClick={handleAnalyzeWithClaude}
            disabled={analyzing || selectedSampleIds.size === 0 || selectedSampleIds.size > 3}
            className="w-full bg-blue-600 text-white px-3 py-2 text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {analyzing
              ? `${getStatusDisplay(analysisStatus || 'PENDING')}`
              : `Analyze ${selectedSampleIds.size} Sample${selectedSampleIds.size !== 1 ? 's' : ''}`
            }
          </button>
          {analyzing && (
            <div className="mt-2 flex items-center justify-center">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
          {analysisError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {analysisError}
            </div>
          )}
        </div>
      )}

      {/* Chart Gallery */}
      {currentAnalysisId && (
        <ChartGallery
          analysisId={currentAnalysisId}
          loading={analyzing}
        />
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
                className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedSampleIds.has(sample.id)}
                  onChange={() => handleToggleSampleSelection(sample.id)}
                  disabled={analyzing || (!selectedSampleIds.has(sample.id) && selectedSampleIds.size >= 3)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  title={selectedSampleIds.size >= 3 && !selectedSampleIds.has(sample.id) ? 'Max 3 samples' : 'Select for analysis'}
                />
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

      {/* Analysis Results */}
      {analysisResult && analysisResult.status === 'COMPLETED' && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Analysis Results</h4>

          {/* Visual Insights */}
          {analysisResult.visual_insights && (
            <div className="mb-4">
              <h5 className="text-xs font-medium text-gray-700 mb-2">Visual Insights</h5>

              {analysisResult.visual_insights.continuation_signals && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-green-700">Continuation Signals:</div>
                  <ul className="text-xs text-gray-700 list-disc list-inside space-y-1">
                    {analysisResult.visual_insights.continuation_signals.map((signal: string, i: number) => (
                      <li key={i}>{signal}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysisResult.visual_insights.exhaustion_signals && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-red-700">Exhaustion Signals:</div>
                  <ul className="text-xs text-gray-700 list-disc list-inside space-y-1">
                    {analysisResult.visual_insights.exhaustion_signals.map((signal: string, i: number) => (
                      <li key={i}>{signal}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysisResult.visual_insights.key_observations && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-gray-700">Key Observations:</div>
                  <ul className="text-xs text-gray-700 list-disc list-inside space-y-1">
                    {analysisResult.visual_insights.key_observations.map((obs: string, i: number) => (
                      <li key={i}>{obs}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Strategy Recommendations */}
          {analysisResult.strategies.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-700 mb-2">
                Strategy Recommendations ({analysisResult.strategies.length})
              </h5>
              <div className="space-y-3">
                {analysisResult.strategies.map((strategy, idx) => (
                  <details key={idx} className="bg-white p-3 rounded border border-gray-200">
                    <summary className="cursor-pointer font-medium text-sm text-gray-900">
                      {strategy.name}
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                        strategy.side === 'long'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {strategy.side.toUpperCase()}
                      </span>
                      {strategy.confidence_score && (
                        <span className="ml-2 text-xs text-gray-600">
                          Confidence: {strategy.confidence_score}%
                        </span>
                      )}
                    </summary>
                    <div className="mt-3 space-y-2 text-xs">
                      {/* Entry Conditions */}
                      <div>
                        <div className="font-medium text-gray-700">Entry:</div>
                        {strategy.entry_conditions.visual_conditions && (
                          <div className="text-gray-600">
                            <span className="font-medium">Visual: </span>
                            {strategy.entry_conditions.visual_conditions}
                          </div>
                        )}
                        {strategy.entry_conditions.specific_signals && (
                          <div className="text-gray-600">
                            <span className="font-medium">Signals: </span>
                            {strategy.entry_conditions.specific_signals}
                          </div>
                        )}
                        {strategy.entry_conditions.timing && (
                          <div className="text-gray-600">
                            <span className="font-medium">Timing: </span>
                            {strategy.entry_conditions.timing}
                          </div>
                        )}
                      </div>

                      {/* Exit Conditions */}
                      <div>
                        <div className="font-medium text-gray-700">Exit:</div>
                        {strategy.exit_conditions.visual_conditions && (
                          <div className="text-gray-600">
                            <span className="font-medium">Visual: </span>
                            {strategy.exit_conditions.visual_conditions}
                          </div>
                        )}
                        {strategy.exit_conditions.take_profit && (
                          <div className="text-gray-600">
                            <span className="font-medium">Take Profit: </span>
                            {strategy.exit_conditions.take_profit}
                          </div>
                        )}
                        {strategy.exit_conditions.stop_loss && (
                          <div className="text-gray-600">
                            <span className="font-medium">Stop Loss: </span>
                            {strategy.exit_conditions.stop_loss}
                          </div>
                        )}
                        {strategy.exit_conditions.max_hold && (
                          <div className="text-gray-600">
                            <span className="font-medium">Max Hold: </span>
                            {strategy.exit_conditions.max_hold}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
