/**
 * Agent Settings Component
 * Configure agent parameters
 */

import { useState } from 'react';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { TradingAgent, UpdateAgentRequest } from '../../types/tradingAgent';

interface AgentSettingsProps {
  agent: TradingAgent;
  onUpdate: () => void;
}

const AVAILABLE_STRATEGIES = [
  'breakout-volume-surge',
  'gap-and-go',
  'cup-and-handle',
  'bull-flag',
  'vwap-bounce',
  'momentum-surge',
];

export default function AgentSettings({ agent, onUpdate }: AgentSettingsProps) {
  const [name, setName] = useState(agent.name);
  const [strategies, setStrategies] = useState(agent.strategies);
  const [riskLimits, setRiskLimits] = useState(agent.riskLimits);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const updateData: UpdateAgentRequest = {
        name,
        strategies,
        riskLimits,
      };

      await tradingAgentApi.updateAgent(agent.id, updateData);
      setSuccess(true);
      onUpdate();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update agent settings');
    } finally {
      setSaving(false);
    }
  };

  const handleStrategyToggle = (strategy: string) => {
    if (strategies.includes(strategy)) {
      setStrategies(strategies.filter(s => s !== strategy));
    } else {
      setStrategies([...strategies, strategy]);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${agent.name}"? This action cannot be undone.`)) {
      return;
    }

    if (!confirm('This will permanently delete all agent data, trades, and history. Continue?')) {
      return;
    }

    try {
      setSaving(true);
      await tradingAgentApi.deleteAgent(agent.id);
      alert('Agent deleted successfully');
      onUpdate();
    } catch (err: any) {
      alert(`Failed to delete agent: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Agent Settings</h3>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">Settings saved successfully!</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h4 className="font-semibold text-gray-900">Basic Information</h4>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Agent Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timeframe
          </label>
          <input
            type="text"
            value={agent.timeframe.toUpperCase()}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
          />
          <p className="text-xs text-gray-500 mt-1">Timeframe cannot be changed after creation</p>
        </div>
      </div>

      {/* Active Strategies */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="font-semibold text-gray-900 mb-4">Active Strategies</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AVAILABLE_STRATEGIES.map(strategy => (
            <label
              key={strategy}
              className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={strategies.includes(strategy)}
                onChange={() => handleStrategyToggle(strategy)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900">
                {strategy.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
            </label>
          ))}
        </div>
        {strategies.length === 0 && (
          <p className="text-sm text-red-600 mt-2">At least one strategy must be selected</p>
        )}
      </div>

      {/* Risk Limits */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h4 className="font-semibold text-gray-900">Risk Limits</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Position Size ($)
            </label>
            <input
              type="number"
              value={riskLimits.maxPositionSize}
              onChange={(e) => setRiskLimits({
                ...riskLimits,
                maxPositionSize: parseFloat(e.target.value),
              })}
              min="0"
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Portfolio Exposure (%)
            </label>
            <input
              type="number"
              value={riskLimits.maxPortfolioExposure}
              onChange={(e) => setRiskLimits({
                ...riskLimits,
                maxPortfolioExposure: parseFloat(e.target.value),
              })}
              min="0"
              max="100"
              step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Daily Loss ($)
            </label>
            <input
              type="number"
              value={riskLimits.maxDailyLoss}
              onChange={(e) => setRiskLimits({
                ...riskLimits,
                maxDailyLoss: parseFloat(e.target.value),
              })}
              min="0"
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Concurrent Positions
            </label>
            <input
              type="number"
              value={riskLimits.maxConcurrentPositions}
              onChange={(e) => setRiskLimits({
                ...riskLimits,
                maxConcurrentPositions: parseInt(e.target.value),
              })}
              min="1"
              max="20"
              step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Confidence Score (0-100)
            </label>
            <input
              type="number"
              value={riskLimits.minConfidenceScore}
              onChange={(e) => setRiskLimits({
                ...riskLimits,
                minConfidenceScore: parseFloat(e.target.value),
              })}
              min="0"
              max="100"
              step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Correlation (0-1)
            </label>
            <input
              type="number"
              value={riskLimits.maxCorrelation}
              onChange={(e) => setRiskLimits({
                ...riskLimits,
                maxCorrelation: parseFloat(e.target.value),
              })}
              min="0"
              max="1"
              step="0.05"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          Delete Agent
        </button>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => {
              setName(agent.name);
              setStrategies(agent.strategies);
              setRiskLimits(agent.riskLimits);
              setError(null);
            }}
            disabled={saving}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Reset
          </button>

          <button
            type="submit"
            disabled={saving || strategies.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
