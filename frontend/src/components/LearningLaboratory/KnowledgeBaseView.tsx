/**
 * Knowledge Base View Component
 * Displays accumulated knowledge and insights learned by the agent
 */

import { useState, useEffect } from 'react';
import { learningAgentApi, type AgentKnowledge } from '../../services/learningAgentApi';

interface KnowledgeBaseViewProps {
  agentId: string;
}

export default function KnowledgeBaseView({ agentId }: KnowledgeBaseViewProps) {
  const [knowledge, setKnowledge] = useState<AgentKnowledge[]>([]);
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKnowledge();
  }, [agentId, filterType]);

  const loadKnowledge = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      if (filterType) filters.type = filterType;

      const data = await learningAgentApi.getKnowledge(agentId, filters);
      setKnowledge(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load knowledge:', err);
      setError(err.message || 'Failed to load knowledge');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading knowledge base...</p>
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex space-x-3">
        <select
          value={filterType || ''}
          onChange={(e) => setFilterType(e.target.value || undefined)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="INSIGHT">Insights</option>
          <option value="PARAMETER_PREF">Parameter Preferences</option>
          <option value="PATTERN_RULE">Pattern Rules</option>
        </select>
      </div>

      {/* Knowledge Items */}
      {knowledge.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🧠</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Knowledge Yet</h3>
          <p className="text-gray-600">
            The agent will accumulate insights as it learns through iterations
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {knowledge.map(item => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.knowledge_type === 'INSIGHT' ? 'bg-blue-100 text-blue-800' :
                    item.knowledge_type === 'PARAMETER_PREF' ? 'bg-green-100 text-green-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {item.knowledge_type.replace('_', ' ')}
                  </span>
                  {item.pattern_type && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                      {item.pattern_type}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-xs text-gray-600">
                  <span>Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                  <span>Validated: {item.times_validated}x</span>
                </div>
              </div>

              <p className="text-sm text-gray-900 mb-2">{item.insight}</p>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>From iteration #{item.learned_from_iteration}</span>
                <span>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>

              {item.supporting_data && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      Supporting Data
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                      {JSON.stringify(item.supporting_data, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
