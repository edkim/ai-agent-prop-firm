/**
 * Agent Iteration View Component
 * Displays learning iteration history and results for an agent
 */

import { useState, useEffect } from 'react';
import { learningAgentApi, type AgentIteration } from '../../services/learningAgentApi';

interface AgentIterationViewProps {
  agentId: string;
}

export default function AgentIterationView({ agentId }: AgentIterationViewProps) {
  const [iterations, setIterations] = useState<AgentIteration[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<AgentIteration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIterations();
  }, [agentId]);

  const loadIterations = async () => {
    try {
      setLoading(true);
      const data = await learningAgentApi.getIterations(agentId);
      setIterations(data);
      if (data.length > 0 && !selectedIteration) {
        setSelectedIteration(data[0]); // Select most recent
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load iterations:', err);
      setError(err.message || 'Failed to load iterations');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading iterations...</p>
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

  if (iterations.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Iterations Yet</h3>
        <p className="text-gray-600">
          Start a learning iteration to begin training this agent
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Iterations List */}
      <div className="col-span-1 space-y-2">
        <h3 className="text-sm font-medium text-gray-900 mb-2">
          Learning History ({iterations.length} iterations)
        </h3>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {iterations.map(iteration => (
            <button
              key={iteration.id}
              onClick={() => setSelectedIteration(iteration)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedIteration?.id === iteration.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">
                  Iteration #{iteration.iteration_number}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  iteration.iteration_status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  iteration.iteration_status === 'approved' ? 'bg-green-100 text-green-800' :
                  iteration.iteration_status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {iteration.iteration_status}
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Win Rate: {(iteration.win_rate * 100).toFixed(1)}%</div>
                <div>Sharpe: {iteration.sharpe_ratio.toFixed(2)}</div>
                <div>{iteration.signals_found} signals</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Iteration Details */}
      <div className="col-span-2">
        {selectedIteration ? (
          <div className="space-y-4">
            {/* Header */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Iteration #{selectedIteration.iteration_number}
              </h3>
              <p className="text-sm text-gray-600">
                {new Date(selectedIteration.created_at).toLocaleString()}
              </p>
            </div>

            {/* Performance Metrics */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">📊 Performance Metrics</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600">Signals Found</div>
                  <div className="text-2xl font-bold text-gray-900">{selectedIteration.signals_found}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Win Rate</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {(selectedIteration.win_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Sharpe Ratio</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {selectedIteration.sharpe_ratio.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Total Return</div>
                  <div className={`text-2xl font-bold ${
                    selectedIteration.total_return >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {selectedIteration.total_return >= 0 ? '+' : ''}
                    {(selectedIteration.total_return * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Agent's Analysis */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">🧠 Agent's Analysis</h4>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {selectedIteration.expert_analysis}
              </div>
            </div>

            {/* Refinements */}
            {selectedIteration.refinements_suggested && selectedIteration.refinements_suggested.length > 0 && (
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">💡 Suggested Refinements</h4>
                <div className="space-y-2">
                  {selectedIteration.refinements_suggested.map((refinement: any, idx: number) => (
                    <div key={idx} className="bg-white rounded p-3 border border-green-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-green-800 uppercase">
                          {refinement.type?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 font-medium mb-1">
                        {refinement.description}
                      </p>
                      <p className="text-xs text-gray-600">
                        {refinement.reasoning}
                      </p>
                      {refinement.projected_improvement && (
                        <p className="text-xs text-green-600 mt-1">
                          Expected: {refinement.projected_improvement}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Version Notes */}
            {selectedIteration.version_notes && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">📝 Version Notes</h4>
                <p className="text-sm text-gray-700">{selectedIteration.version_notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-600">
            Select an iteration to view details
          </div>
        )}
      </div>
    </div>
  );
}
