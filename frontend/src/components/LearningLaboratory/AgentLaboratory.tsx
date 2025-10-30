/**
 * Agent Laboratory Component
 * Main interface for the multi-agent learning laboratory
 * Shows agent list, allows creation, and manages learning iterations
 */

import { useState, useEffect } from 'react';
import { learningAgentApi, type LearningAgent } from '../../services/learningAgentApi';
import AgentCreation from './AgentCreation';
import AgentIterationView from './AgentIterationView';
import KnowledgeBaseView from './KnowledgeBaseView';
import StrategyVersions from './StrategyVersions';

type ViewMode = 'list' | 'iterations' | 'knowledge' | 'strategies';

export default function AgentLaboratory() {
  const [agents, setAgents] = useState<LearningAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iterationInProgress, setIterationInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await learningAgentApi.getAllAgents();
      setAgents(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load agents:', err);
      setError(err.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleAgentCreated = async (agent: LearningAgent) => {
    setShowCreateModal(false);
    await loadAgents();
    setSelectedAgentId(agent.id);
  };

  const handleStartIteration = async (agentId: string) => {
    try {
      setIterationInProgress(agentId);
      await learningAgentApi.startIteration(agentId);
      await loadAgents(); // Refresh agent list
      setSelectedAgentId(agentId);
      setViewMode('iterations');
    } catch (err: any) {
      console.error('Failed to start iteration:', err);
      alert(`Failed to start iteration: ${err.message}`);
    } finally {
      setIterationInProgress(null);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent? This cannot be undone.')) {
      return;
    }

    try {
      await learningAgentApi.deleteAgent(agentId);
      await loadAgents();
      if (selectedAgentId === agentId) {
        setSelectedAgentId(null);
        setViewMode('list');
      }
    } catch (err: any) {
      console.error('Failed to delete agent:', err);
      alert(`Failed to delete agent: ${err.message}`);
    }
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading learning laboratory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🧠 Multi-Agent Learning Laboratory</h1>
            <p className="text-sm text-gray-600 mt-1">
              Create autonomous trading agents that learn and evolve through backtesting iterations
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Create New Agent
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
          <button
            onClick={loadAgents}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Selected Agent View */}
      {selectedAgent && viewMode !== 'list' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedAgent.name}</h2>
              <p className="text-sm text-gray-600 mt-1">{selectedAgent.instructions}</p>
            </div>
            <button
              onClick={() => setViewMode('list')}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to List
            </button>
          </div>

          {/* View Tabs */}
          <div className="flex space-x-4 border-b border-gray-200 mb-4">
            <button
              onClick={() => setViewMode('iterations')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                viewMode === 'iterations'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Iterations
            </button>
            <button
              onClick={() => setViewMode('knowledge')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                viewMode === 'knowledge'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Knowledge Base
            </button>
            <button
              onClick={() => setViewMode('strategies')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                viewMode === 'strategies'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Strategy Versions
            </button>
          </div>

          {/* View Content */}
          <div className="mt-4">
            {viewMode === 'iterations' && <AgentIterationView agentId={selectedAgent.id} />}
            {viewMode === 'knowledge' && <KnowledgeBaseView agentId={selectedAgent.id} />}
            {viewMode === 'strategies' && <StrategyVersions agentId={selectedAgent.id} />}
          </div>
        </div>
      )}

      {/* Agent List View */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {agents.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">🤖</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Learning Agents Yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first autonomous trading agent that learns from backtests
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Your First Agent
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {agents.map(agent => (
                <div
                  key={agent.id}
                  className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-bold text-gray-900">{agent.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          agent.status === 'learning' ? 'bg-blue-100 text-blue-800' :
                          agent.status === 'paper_trading' ? 'bg-green-100 text-green-800' :
                          agent.status === 'live_trading' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {agent.status}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                        {agent.instructions}
                      </p>

                      <div className="flex items-center space-x-6 mt-4 text-sm">
                        <div>
                          <span className="text-gray-600">Risk:</span>
                          <span className="ml-1 font-medium text-gray-900">{agent.risk_tolerance}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Style:</span>
                          <span className="ml-1 font-medium text-gray-900">{agent.trading_style}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Focus:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {agent.pattern_focus.join(', ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => handleStartIteration(agent.id)}
                        disabled={iterationInProgress === agent.id}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {iterationInProgress === agent.id ? (
                          <span className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Learning...
                          </span>
                        ) : (
                          'Start Iteration'
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSelectedAgentId(agent.id);
                          setViewMode('iterations');
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        View Details
                      </button>

                      <button
                        onClick={() => handleDeleteAgent(agent.id)}
                        className="px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Agent Modal */}
      {showCreateModal && (
        <AgentCreation
          onClose={() => setShowCreateModal(false)}
          onAgentCreated={handleAgentCreated}
        />
      )}
    </div>
  );
}
