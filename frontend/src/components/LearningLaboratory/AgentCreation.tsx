/**
 * Agent Creation Component
 * Modal for creating new learning agents from natural language instructions
 */

import { useState } from 'react';
import { learningAgentApi, type LearningAgent, type CreateAgentResponse } from '../../services/learningAgentApi';

interface AgentCreationProps {
  onClose: () => void;
  onAgentCreated: (agent: LearningAgent) => void;
}

export default function AgentCreation({ onClose, onAgentCreated }: AgentCreationProps) {
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAgent, setCreatedAgent] = useState<CreateAgentResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!instructions.trim()) {
      setError('Please provide instructions for the agent');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await learningAgentApi.createAgent({
        name: name.trim() || undefined,
        instructions: instructions.trim(),
      });

      setCreatedAgent(response);
    } catch (err: any) {
      console.error('Failed to create agent:', err);
      setError(err.message || 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  const handleStartLearning = () => {
    if (createdAgent) {
      onAgentCreated(createdAgent.agent);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {!createdAgent ? (
          // Creation Form
          <form onSubmit={handleSubmit} className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Create Trading Agent</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., VWAP Guardian"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to auto-generate from instructions
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instructions <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="Describe your trading agent in natural language...&#10;&#10;Example:&#10;Create a conservative VWAP scalper that trades tech stocks during market hours. Use tight stops and quick profit targets. Focus on high-volume stocks with clear VWAP bounces."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Describe the agent's trading style, risk tolerance, patterns to focus on, and market conditions
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !instructions.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </span>
                  ) : (
                    'Create Agent'
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : (
          // Success View
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Agent Created Successfully!</h2>
              <p className="text-gray-600">
                {createdAgent.agent.name} is ready to start learning
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Detected Personality:</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Risk Tolerance:</span>
                  <span className="ml-2 font-medium text-gray-900 capitalize">
                    {createdAgent.detectedPersonality.risk_tolerance}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Trading Style:</span>
                  <span className="ml-2 font-medium text-gray-900 capitalize">
                    {createdAgent.detectedPersonality.trading_style.replace('_', ' ')}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Pattern Focus:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {createdAgent.detectedPersonality.pattern_focus.join(', ')}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Market Conditions:</span>
                  <span className="ml-2 font-medium text-gray-900 capitalize">
                    {createdAgent.detectedPersonality.market_conditions.join(', ')}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleStartLearning}
                className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start First Learning Cycle →
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
