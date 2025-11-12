/**
 * Agent Iteration View Component
 * Displays learning iteration history and results for an agent
 */

import { useState, useEffect } from 'react';
import { learningAgentApi, type AgentIteration } from '../../services/learningAgentApi';
import ScriptViewerModal from './ScriptViewerModal';
import ScannerPromptModal from './ScannerPromptModal';

interface AgentIterationViewProps {
  agentId: string;
}

type IterationTab = 'summary' | 'analysis' | 'trades';

interface ScriptModal {
  isOpen: boolean;
  title: string;
  content: string | null;
  language?: 'typescript' | 'markdown';
}

export default function AgentIterationView({ agentId }: AgentIterationViewProps) {
  const [iterations, setIterations] = useState<AgentIteration[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<AgentIteration | null>(null);
  const [activeTab, setActiveTab] = useState<IterationTab>('summary');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('custom');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualGuidance, setManualGuidance] = useState('');
  const [showGuidanceInput, setShowGuidanceInput] = useState(false);
  const [startingIteration, setStartingIteration] = useState(false);
  const [scriptModal, setScriptModal] = useState<ScriptModal>({ isOpen: false, title: '', content: null });
  const [showPromptModal, setShowPromptModal] = useState(false);

  useEffect(() => {
    loadIterations();
  }, [agentId]);

  useEffect(() => {
    // Auto-select best performing strategy when iteration changes
    if (selectedIteration?.backtest_results?.templateResults && selectedIteration.backtest_results.templateResults.length > 0) {
      const sortedTemplates = [...selectedIteration.backtest_results.templateResults].sort(
        (a: any, b: any) => (b.profitFactor || 0) - (a.profitFactor || 0)
      );
      setSelectedStrategy(sortedTemplates[0].template);
    }
  }, [selectedIteration]);

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

  const handleStartIteration = () => {
    // Show preview modal instead of directly starting
    setShowPromptModal(true);
  };

  const handlePromptConfirm = async (overridePrompt: string | null) => {
    try {
      setStartingIteration(true);
      setShowPromptModal(false);
      setError(null);
      const guidance = manualGuidance.trim() || undefined;
      await learningAgentApi.startIteration(agentId, guidance, overridePrompt || undefined);

      // Clear manual guidance and hide input
      setManualGuidance('');
      setShowGuidanceInput(false);

      // Reload iterations
      await loadIterations();
    } catch (err: any) {
      console.error('Failed to start iteration:', err);
      setError(err.message || 'Failed to start iteration');
    } finally {
      setStartingIteration(false);
    }
  };

  const handlePromptCancel = () => {
    setShowPromptModal(false);
  };

  const viewScript = async (
    iterationId: string,
    type: 'scanner-code' | 'execution-code' | 'scanner-prompt' | 'execution-prompt'
  ) => {
    try {
      const scripts = await learningAgentApi.getIterationScripts(agentId, iterationId);

      const modalConfig = {
        'scanner-code': {
          title: 'Scanner Script Code',
          content: scripts.scannerScript,
          language: 'typescript' as const,
        },
        'execution-code': {
          title: 'Execution Script Code',
          content: scripts.executionScript,
          language: 'typescript' as const,
        },
        'scanner-prompt': {
          title: 'Scanner Generation Prompt',
          content: scripts.scannerPrompt,
          language: 'markdown' as const,
        },
        'execution-prompt': {
          title: 'Execution Generation Prompt',
          content: scripts.executionPrompt,
          language: 'markdown' as const,
        },
      };

      setScriptModal({ isOpen: true, ...modalConfig[type] });
    } catch (err: any) {
      console.error('Failed to load scripts:', err);
      setScriptModal({
        isOpen: true,
        title: 'Error Loading Script',
        content: `Failed to load script: ${err.message}`,
        language: 'typescript',
      });
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
    <div className="space-y-4">
      {/* Start New Iteration Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <button
          onClick={() => setShowGuidanceInput(!showGuidanceInput)}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-2"
        >
          {showGuidanceInput ? '− Hide' : '+ Add'} Manual Guidance
        </button>

        {showGuidanceInput && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Manual Guidance for Next Iteration
            </label>
            <textarea
              value={manualGuidance}
              onChange={(e) => setManualGuidance(e.target.value)}
              placeholder="e.g., 'Scan last 2 years of data, include stocks with 100%+ gain in 5 or fewer days, relax RSI filters'"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
              rows={3}
            />
            <p className="mt-1 text-xs text-gray-500">
              Provide specific guidance to steer the next iteration's strategy generation. This takes priority over automated refinements.
            </p>
          </div>
        )}

        <button
          onClick={handleStartIteration}
          disabled={startingIteration}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {startingIteration ? (
            <span className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Starting Iteration...
            </span>
          ) : (
            'Start New Iteration'
          )}
        </button>
      </div>

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

            {/* Script Viewer Buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => viewScript(selectedIteration.id, 'scanner-prompt')}
                className="text-sm px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors flex items-center gap-1"
              >
                <span>💬</span>
                Scanner Prompt
              </button>
              <button
                onClick={() => viewScript(selectedIteration.id, 'scanner-code')}
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors flex items-center gap-1"
              >
                <span>📄</span>
                Scanner Code
              </button>
              <button
                onClick={() => viewScript(selectedIteration.id, 'execution-prompt')}
                className="text-sm px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors flex items-center gap-1"
              >
                <span>💬</span>
                Execution Prompt
              </button>
              <button
                onClick={() => viewScript(selectedIteration.id, 'execution-code')}
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors flex items-center gap-1"
              >
                <span>📄</span>
                Execution Code
              </button>
            </div>

            {/* Tabs */}
            <div className="flex space-x-4 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === 'summary'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === 'analysis'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Analysis
              </button>
              <button
                onClick={() => setActiveTab('trades')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === 'trades'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Trades
                {selectedIteration.backtest_results?.templateResults && selectedIteration.backtest_results.templateResults.length > 0
                  ? ` (${selectedIteration.backtest_results.templateResults.length} strategies)`
                  : ` (${selectedIteration.backtest_results?.trades?.filter((t: any) => !t.noTrade).length || 0})`
                }
              </button>
            </div>

            {/* Tab Content */}
            <div className="mt-4">
              {/* Summary Tab */}
              {activeTab === 'summary' && (
                <div className="space-y-4">
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
                          {selectedIteration.total_return >= 0 ? '+' : ''}$
                          {selectedIteration.total_return.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Manual Guidance */}
                  {selectedIteration.manual_guidance && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">🎯 Manual Guidance</h4>
                      <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedIteration.manual_guidance}</p>
                    </div>
                  )}

                  {/* Template Comparison */}
                  {selectedIteration.backtest_results?.templateResults && selectedIteration.backtest_results.templateResults.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">🎯 Execution Strategy Comparison</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Strategy
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Trades
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Win Rate
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Total Return
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Profit Factor
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Sharpe Ratio
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {selectedIteration.backtest_results.templateResults
                              .sort((a: any, b: any) => (b.profitFactor || 0) - (a.profitFactor || 0))
                              .map((template: any, idx: number) => {
                                const isCustom = template.template === 'custom';
                                const isBest = idx === 0;
                                return (
                                  <tr
                                    key={template.template}
                                    className={`${isBest ? 'bg-green-50' : ''} hover:bg-gray-50 cursor-pointer`}
                                    onClick={() => {
                                      setSelectedStrategy(template.template);
                                      setActiveTab('trades');
                                    }}
                                  >
                                    <td className="px-4 py-3 text-sm">
                                      <div className="flex items-center gap-2">
                                        {isBest && <span className="text-green-600">🏆</span>}
                                        <span className={`font-medium ${isCustom ? 'text-blue-600' : 'text-gray-900'}`}>
                                          {template.templateDisplayName || template.template}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                      {template.totalTrades}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      <span className={`font-medium ${
                                        (template.winRate * 100) >= 50 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {(template.winRate * 100).toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      <span className={`font-medium ${
                                        template.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {template.totalReturn >= 0 ? '+' : ''}${template.totalReturn.toFixed(2)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      <span className={`font-medium ${
                                        template.profitFactor >= 1 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {template.profitFactor?.toFixed(2) || '-'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                      {template.sharpeRatio?.toFixed(2) || '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Click on a strategy to view its trades. 🏆 indicates the best performing strategy by profit factor.
                      </p>
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
              )}

              {/* Analysis Tab */}
              {activeTab === 'analysis' && (
                <div className="space-y-4">
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
                </div>
              )}

              {/* Trades Tab */}
              {activeTab === 'trades' && (
                <div className="space-y-4">
                  {/* Strategy Selector */}
                  {selectedIteration.backtest_results?.templateResults && selectedIteration.backtest_results.templateResults.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Execution Strategy:
                      </label>
                      <select
                        value={selectedStrategy}
                        onChange={(e) => setSelectedStrategy(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        {selectedIteration.backtest_results.templateResults
                          .sort((a: any, b: any) => (b.profitFactor || 0) - (a.profitFactor || 0))
                          .map((template: any, idx: number) => (
                            <option key={template.template} value={template.template}>
                              {idx === 0 ? '🏆 ' : ''}{template.templateDisplayName || template.template}
                              {' '}
                              (WR: {(template.winRate * 100).toFixed(1)}%, PF: {template.profitFactor?.toFixed(2) || '-'})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {(() => {
                    // Get trades for selected strategy
                    let trades: any[] = [];
                    let strategyName = 'Custom Execution';

                    if (selectedIteration.backtest_results?.templateResults) {
                      const selectedTemplate = selectedIteration.backtest_results.templateResults.find(
                        (t: any) => t.template === selectedStrategy
                      );

                      if (selectedTemplate) {
                        trades = selectedTemplate.trades || [];
                        strategyName = selectedTemplate.templateDisplayName || selectedTemplate.template;
                      }
                    }

                    // Fallback to default trades if no template selected or found
                    if (trades.length === 0 && selectedIteration.backtest_results?.trades) {
                      trades = selectedIteration.backtest_results.trades;
                    }

                    if (trades && trades.length > 0) {
                      // Filter out noTrade entries
                      const executedTrades = trades.filter((trade: any) => !trade.noTrade);
                      const skippedTrades = trades.filter((trade: any) => trade.noTrade);

                      return (
                        <>
                          {executedTrades.length > 0 && (
                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm font-medium text-gray-900">
                                  {strategyName} - {executedTrades.length} Trades
                                </h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Ticker
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Side
                                      </th>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Entry
                                      </th>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Exit
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Qty
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        P&L
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        P&L %
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Exit Reason
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {executedTrades.map((trade: any, idx: number) => {
                              // Handle both camelCase and snake_case field names
                              const entryPrice = trade.entryPrice || trade.entry_price;
                              const exitPrice = trade.exitPrice || trade.exit_price;
                              const pnl = trade.pnl;
                              const pnlPercent = trade.pnlPercent !== undefined ? trade.pnlPercent : trade.pnl_percent;
                              const exitReason = trade.exitReason || trade.exit_reason;
                              const side = trade.side || trade.direction;

                              // Calculate quantity from PnL and price difference if not provided
                              let quantity = trade.quantity || trade.shares;
                              if (!quantity && pnl !== undefined && entryPrice && exitPrice) {
                                const priceDiff = Math.abs(exitPrice - entryPrice);
                                if (priceDiff > 0) {
                                  quantity = Math.round(Math.abs(pnl) / priceDiff);
                                } else {
                                  quantity = 1; // Fallback if price didn't change
                                }
                              } else if (!quantity) {
                                quantity = 1; // Final fallback
                              }

                              const bars = trade.bars;

                              // Construct timestamps from date + time fields if needed
                              const tradeDate = trade.date || trade.signal_date;
                              const entryTime = trade.entry_time;
                              const exitTime = trade.exit_time;
                              const entryTimestamp = trade.entryTimestamp || (tradeDate && entryTime)
                                ? `${tradeDate}T${entryTime || '00:00'}:00Z`
                                : null;
                              const exitTimestamp = trade.exitTimestamp || (tradeDate && exitTime)
                                ? `${tradeDate}T${exitTime || '00:00'}:00Z`
                                : null;

                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                    {trade.ticker}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    <span className={`px-2 py-1 text-xs rounded ${
                                      side === 'LONG' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                      {side}
                                    </span>
                                  </td>
                                  <td className="px-6 py-3 text-sm text-gray-900">
                                    <div>${entryPrice?.toFixed(2)}</div>
                                    {tradeDate && entryTime && (
                                      <div className="text-xs text-gray-500">
                                        {tradeDate} {entryTime}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-3 text-sm text-gray-900">
                                    {exitPrice ? (
                                      <>
                                        <div>${exitPrice.toFixed(2)}</div>
                                        {tradeDate && exitTime && (
                                          <div className="text-xs text-gray-500">
                                            {tradeDate} {exitTime}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-gray-400">Open</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    {quantity}
                                  </td>
                                  <td className={`px-4 py-3 text-sm font-medium ${
                                    pnl >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {pnl >= 0 ? '+' : ''}${pnl?.toFixed(2)}
                                  </td>
                                  <td className={`px-4 py-3 text-sm font-medium ${
                                    pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {pnlPercent >= 0 ? '+' : ''}{pnlPercent?.toFixed(2)}%
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600">
                                    {exitReason?.replace(/_/g, ' ') || '-'}
                                  </td>
                                </tr>
                              );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {skippedTrades.length > 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                              <h4 className="text-sm font-medium text-yellow-900 mb-2">
                                ⚠️ Skipped Signals ({skippedTrades.length})
                              </h4>
                              <p className="text-xs text-yellow-800 mb-2">
                                These signals were found but couldn't be executed due to insufficient data:
                              </p>
                              <div className="space-y-1">
                                {skippedTrades.slice(0, 10).map((trade: any, idx: number) => (
                                  <div key={idx} className="text-xs text-yellow-700">
                                    <span className="font-medium">{trade.ticker}</span> on {trade.date}: {trade.noTradeReason}
                                  </div>
                                ))}
                                {skippedTrades.length > 10 && (
                                  <div className="text-xs text-yellow-700 italic">
                                    ... and {skippedTrades.length - 10} more
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {executedTrades.length === 0 && (
                            <div className="text-center py-12">
                              <div className="text-4xl mb-3">📊</div>
                              <h3 className="text-lg font-medium text-gray-900 mb-2">No Executed Trades</h3>
                              <p className="text-gray-600">
                                This iteration found {selectedIteration.signals_found} signals but {skippedTrades.length > 0 ? 'none could be executed due to insufficient data' : 'no trades were executed'}
                              </p>
                            </div>
                          )}
                        </>
                      );
                    } else {
                      return (
                        <div className="text-center py-12">
                          <div className="text-4xl mb-3">📊</div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No Trades</h3>
                          <p className="text-gray-600">
                            This iteration found {selectedIteration.signals_found} signals but no trades were executed for {strategyName}
                          </p>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-600">
            Select an iteration to view details
          </div>
        )}
      </div>
      </div>

      {/* Script Viewer Modal */}
      <ScriptViewerModal
        isOpen={scriptModal.isOpen}
        onClose={() => setScriptModal({ isOpen: false, title: '', content: null })}
        title={scriptModal.title}
        content={scriptModal.content}
        language={scriptModal.language}
      />

      {/* Scanner Prompt Preview/Edit Modal */}
      {showPromptModal && (
        <ScannerPromptModal
          agentId={agentId}
          manualGuidance={manualGuidance || undefined}
          onConfirm={handlePromptConfirm}
          onCancel={handlePromptCancel}
        />
      )}
    </div>
  );
}
