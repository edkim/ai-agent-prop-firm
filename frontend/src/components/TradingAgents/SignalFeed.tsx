/**
 * Signal Feed Component
 * Display live pattern detections in real-time
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { LiveSignal, TradeRecommendation } from '../../types/tradingAgent';

interface SignalFeedProps {
  agentId: string;
}

export default function SignalFeed({ agentId }: SignalFeedProps) {
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [recommendations, setRecommendations] = useState<TradeRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [agentId]);

  const loadData = async () => {
    try {
      const [signalsData, recsData] = await Promise.all([
        tradingAgentApi.getSignals(agentId, { limit: 20 }),
        tradingAgentApi.getRecommendations(agentId, { status: 'PENDING', limit: 10 }),
      ]);
      setSignals(signalsData);
      setRecommendations(recsData);
    } catch (err) {
      console.error('Failed to load signals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (recommendationId: string) => {
    if (!confirm('Execute this trade?')) return;

    try {
      setActionLoading(recommendationId);
      await tradingAgentApi.approveRecommendation(agentId, recommendationId);
      await loadData();
      alert('Trade executed successfully!');
    } catch (err: any) {
      alert(`Failed to execute trade: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (recommendationId: string) => {
    try {
      setActionLoading(recommendationId);
      await tradingAgentApi.rejectRecommendation(agentId, recommendationId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to reject recommendation: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      DETECTED: 'bg-yellow-100 text-yellow-800',
      ANALYZING: 'bg-blue-100 text-blue-800',
      EXECUTED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      EXPIRED: 'bg-gray-100 text-gray-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Pending Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Pending Recommendations ({recommendations.length})
          </h3>
          <div className="space-y-4">
            {recommendations.map(rec => {
              const isLoading = actionLoading === rec.id;
              const allChecksPassed = Object.values(rec.riskChecks).every(check => check.passed);

              return (
                <div key={rec.id} className="bg-white border border-gray-200 rounded-lg p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <h4 className="text-lg font-semibold text-gray-900">{rec.ticker}</h4>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          rec.side === 'LONG' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {rec.side}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {format(new Date(rec.createdAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Confidence</p>
                      <p className="text-2xl font-bold text-blue-600">{rec.confidenceScore}/100</p>
                    </div>
                  </div>

                  {/* Trade Details */}
                  <div className="grid grid-cols-4 gap-4 mb-4 bg-gray-50 rounded-lg p-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Entry</p>
                      <p className="text-sm font-semibold text-gray-900">${rec.entryPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Stop Loss</p>
                      <p className="text-sm font-semibold text-red-600">${rec.stopLoss.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Take Profit</p>
                      <p className="text-sm font-semibold text-green-600">${rec.takeProfit.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Position Size</p>
                      <p className="text-sm font-semibold text-gray-900">{rec.positionSize} shares</p>
                    </div>
                  </div>

                  {/* AI Reasoning */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">AI Analysis:</p>
                    <p className="text-sm text-gray-600 bg-blue-50 rounded p-3">{rec.reasoning}</p>
                  </div>

                  {/* Risk Checks */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Risk Checks:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(rec.riskChecks).map(([key, check]) => (
                        <div key={key} className="flex items-center space-x-2 text-sm">
                          {check.passed ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-red-600">✗</span>
                          )}
                          <span className={check.passed ? 'text-gray-600' : 'text-red-600'}>
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                        </div>
                      ))}
                    </div>
                    {!allChecksPassed && (
                      <p className="text-xs text-red-600 mt-2">Some risk checks failed</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end space-x-3">
                    <button
                      onClick={() => handleReject(rec.id)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(rec.id)}
                      disabled={isLoading || !allChecksPassed}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {isLoading ? 'Executing...' : 'Execute Trade'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Signals */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Signals
        </h3>
        {signals.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">No signals detected yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map(signal => (
              <div key={signal.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="font-semibold text-gray-900">{signal.ticker}</h4>
                      <span className="text-sm text-gray-600">
                        {signal.patternType.replace(/-/g, ' ').toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusBadge(signal.status)}`}>
                        {signal.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Price: </span>
                        <span className="font-medium text-gray-900">
                          ${signal.signalData.currentPrice.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Quality: </span>
                        <span className="font-medium text-gray-900">
                          {signal.signalData.patternQuality}/100
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Multi-TF: </span>
                        <span className={`font-medium ${
                          signal.signalData.multiTimeframeConfirmed ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          {signal.signalData.multiTimeframeConfirmed ? '✓ Confirmed' : '✗ Not confirmed'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Time: </span>
                        <span className="font-medium text-gray-900">
                          {format(new Date(signal.detectionTime), 'h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
