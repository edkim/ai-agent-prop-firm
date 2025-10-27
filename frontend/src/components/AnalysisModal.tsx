/**
 * Analysis Modal Component
 * Progressive workflow: Generate Charts → Preview → Analyze with Claude → View Results
 * Split-view layout: Charts (left) | Preview/Results (right)
 */

import { useState, useEffect } from 'react';
import { claudeAnalysisApi } from '../services/claudeAnalysisApi';
import type { ChartData, AnalysisResult, AnalysisStatus } from '../services/claudeAnalysisApi';
import { batchBacktestApi } from '../services/batchBacktestApi';
import type { BatchBacktestStatus, StrategyPerformance } from '../services/batchBacktestApi';
import ChartModal from './ChartModal';

interface AnalysisModalProps {
  backtestSetId: string;
  sampleIds: string[];
  onClose: () => void;
}

type ModalState = 'GENERATING' | 'PREVIEW' | 'ANALYZING' | 'RESULTS' | 'ERROR';

export default function AnalysisModal({ backtestSetId, sampleIds, onClose }: AnalysisModalProps) {
  const [state, setState] = useState<ModalState>('GENERATING');
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);

  // Batch backtest state
  const [batchBacktesting, setBatchBacktesting] = useState(false);
  const [batchBacktestStatus, setBatchBacktestStatus] = useState<BatchBacktestStatus | null>(null);

  // Generate charts on mount
  useEffect(() => {
    generateCharts();
  }, []);

  const generateCharts = async () => {
    setState('GENERATING');
    setError(null);

    try {
      const response = await claudeAnalysisApi.generatePreview({
        backtestSetId,
        sampleIds
      });

      setPreviewId(response.previewId);
      setCharts(response.charts);
      setState('PREVIEW');
    } catch (err: any) {
      console.error('Failed to generate charts:', err);
      setError(err.response?.data?.error || err.message || 'Failed to generate charts');
      setState('ERROR');
    }
  };

  const handleAnalyzeWithClaude = async () => {
    if (!previewId) return;

    setState('ANALYZING');
    setAnalysisStatus('PENDING');
    setError(null);

    try {
      // Start analysis
      await claudeAnalysisApi.analyzePreview(previewId);

      // Poll for results
      await pollAnalysisStatus(previewId);
    } catch (err: any) {
      console.error('Failed to analyze:', err);
      setError(err.response?.data?.error || err.message || 'Analysis failed');
      setState('ERROR');
    }
  };

  const pollAnalysisStatus = async (analysisId: string) => {
    const maxAttempts = 120; // 2 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await claudeAnalysisApi.pollStatus(analysisId);
        setAnalysisStatus(status.status);

        if (status.status === 'COMPLETED') {
          // Fetch full results
          const result = await claudeAnalysisApi.getAnalysis(analysisId);
          setAnalysisResult(result);
          setState('RESULTS');
          return;
        }

        if (status.status === 'FAILED') {
          setError(status.error || 'Analysis failed');
          setState('ERROR');
          return;
        }

        // Continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        } else {
          setError('Analysis timeout - please try again');
          setState('ERROR');
        }
      } catch (err: any) {
        console.error('Failed to poll:', err);
        setError(err.message);
        setState('ERROR');
      }
    };

    poll();
  };

  const handleBatchBacktest = async () => {
    if (!analysisResult) return;

    setBatchBacktesting(true);
    setError(null);

    try {
      // Start batch backtest
      const result = await batchBacktestApi.startBatchBacktest({
        analysisId: analysisResult.analysisId,
        backtestSetId
      });

      // Poll for progress
      await pollBatchBacktestStatus(result.batchRunId);
    } catch (err: any) {
      console.error('Failed to start batch backtest:', err);
      setError(err.response?.data?.error || err.message || 'Batch backtest failed');
      setBatchBacktesting(false);
    }
  };

  const pollBatchBacktestStatus = async (batchRunId: string) => {
    const maxAttempts = 600; // 10 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await batchBacktestApi.getBatchBacktestStatus(batchRunId);
        setBatchBacktestStatus(status);

        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          setBatchBacktesting(false);
          return;
        }

        // Continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        } else {
          setError('Batch backtest timeout - please refresh');
          setBatchBacktesting(false);
        }
      } catch (err: any) {
        console.error('Failed to poll batch backtest:', err);
        setError(err.message);
        setBatchBacktesting(false);
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
        return 'Claude is analyzing charts...';
      case 'COMPLETED':
        return 'Analysis complete';
      case 'FAILED':
        return 'Analysis failed';
      default:
        return 'Processing...';
    }
  };

  // Group charts by sample
  const chartsBySample: Record<string, ChartData[]> = {};
  charts.forEach(chart => {
    if (!chartsBySample[chart.sampleId]) {
      chartsBySample[chart.sampleId] = [];
    }
    chartsBySample[chart.sampleId].push(chart);
  });

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg w-full h-full max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Visual Analysis</h2>
              <p className="text-sm text-gray-600">{sampleIds.length} sample{sampleIds.length !== 1 ? 's' : ''} selected</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-3xl leading-none px-2"
              title="Close"
            >
              ×
            </button>
          </div>

          {/* Split View Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Charts */}
            <div className="w-1/2 border-r border-gray-200 overflow-y-auto bg-gray-50 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Charts</h3>

              {state === 'GENERATING' && (
                <div className="text-center py-12">
                  <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-700 font-medium">Generating charts...</p>
                  <p className="text-sm text-gray-600 mt-2">Fetching data and creating visualizations</p>
                </div>
              )}

              {(state === 'PREVIEW' || state === 'ANALYZING' || state === 'RESULTS') && charts.length > 0 && (
                <div className="space-y-6">
                  {charts.map(chart => (
                    <div key={chart.id} className="bg-white rounded-lg p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        {chart.ticker}
                        <span className="ml-2 text-xs font-normal text-gray-600">
                          {chart.startDate} - {chart.endDate}
                        </span>
                      </h4>

                      <div
                        className="cursor-pointer hover:opacity-90 transition"
                        onClick={() => setSelectedChart(chart)}
                      >
                        <img
                          src={`data:image/png;base64,${chart.chartData}`}
                          alt={`${chart.ticker} intraday chart`}
                          className="w-full rounded border border-gray-300 hover:border-blue-500"
                        />
                        <p className="text-xs text-gray-600 mt-2 text-center font-medium">
                          Intraday Detail (5-min bars, ±7 days)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {state === 'ERROR' && charts.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-red-700 font-medium">Failed to generate charts</p>
                  <p className="text-sm text-gray-600 mt-2">{error}</p>
                </div>
              )}
            </div>

            {/* Right: Preview/Analysis/Results */}
            <div className="w-1/2 overflow-y-auto bg-white p-6">
              {/* PREVIEW STATE */}
              {state === 'PREVIEW' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 Ready to Analyze</h3>
                  <p className="text-gray-700 mb-6">
                    Review the charts on the left. When you're ready, click the button below to analyze them with Claude AI.
                  </p>

                  <button
                    onClick={handleAnalyzeWithClaude}
                    className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium text-lg shadow-md hover:shadow-lg transition"
                  >
                    Analyze with Claude AI
                  </button>

                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <strong>What Claude will analyze:</strong>
                    </p>
                    <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
                      <li>Visual patterns and price action</li>
                      <li>Volume characteristics and anomalies</li>
                      <li>Entry and exit opportunities</li>
                      <li>Trading strategy recommendations</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* ANALYZING STATE */}
              {state === 'ANALYZING' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">🤖 Analyzing...</h3>
                  <div className="text-center py-12">
                    <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-700 font-medium">{getStatusDisplay(analysisStatus || 'PENDING')}</p>
                    <p className="text-sm text-gray-600 mt-2">This may take 30-60 seconds</p>
                  </div>
                </div>
              )}

              {/* RESULTS STATE */}
              {state === 'RESULTS' && analysisResult && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 Analysis Results</h3>

                  {/* Visual Insights */}
                  {analysisResult.visual_insights && (
                    <div className="mb-6">
                      <h4 className="text-md font-semibold text-gray-800 mb-3">Visual Insights</h4>

                      {analysisResult.visual_insights.continuation_signals && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-green-700 mb-2">Continuation Signals:</div>
                          <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 bg-green-50 p-3 rounded border border-green-200">
                            {analysisResult.visual_insights.continuation_signals.map((signal: string, i: number) => (
                              <li key={i}>{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysisResult.visual_insights.exhaustion_signals && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-red-700 mb-2">Exhaustion Signals:</div>
                          <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 bg-red-50 p-3 rounded border border-red-200">
                            {analysisResult.visual_insights.exhaustion_signals.map((signal: string, i: number) => (
                              <li key={i}>{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysisResult.visual_insights.key_observations && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-gray-700 mb-2">Key Observations:</div>
                          <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 bg-gray-50 p-3 rounded border border-gray-200">
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
                      <h4 className="text-md font-semibold text-gray-800 mb-3">
                        Strategy Recommendations ({analysisResult.strategies.length})
                      </h4>
                      <div className="space-y-3">
                        {analysisResult.strategies.map((strategy, idx) => (
                          <details key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
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
                                  {strategy.confidence_score}% confidence
                                </span>
                              )}
                            </summary>
                            <div className="mt-3 space-y-3 text-xs">
                              {/* Entry */}
                              <div>
                                <div className="font-semibold text-gray-700 mb-1">Entry:</div>
                                {strategy.entry_conditions.visual_conditions && (
                                  <div className="text-gray-600 mb-1">
                                    <span className="font-medium">Visual: </span>
                                    {strategy.entry_conditions.visual_conditions}
                                  </div>
                                )}
                                {strategy.entry_conditions.specific_signals && (
                                  <div className="text-gray-600 mb-1">
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

                              {/* Exit */}
                              <div>
                                <div className="font-semibold text-gray-700 mb-1">Exit:</div>
                                {strategy.exit_conditions.visual_conditions && (
                                  <div className="text-gray-600 mb-1">
                                    <span className="font-medium">Visual: </span>
                                    {strategy.exit_conditions.visual_conditions}
                                  </div>
                                )}
                                {strategy.exit_conditions.take_profit && (
                                  <div className="text-gray-600 mb-1">
                                    <span className="font-medium">Take Profit: </span>
                                    {strategy.exit_conditions.take_profit}
                                  </div>
                                )}
                                {strategy.exit_conditions.stop_loss && (
                                  <div className="text-gray-600 mb-1">
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

                  {/* Batch Backtest Section */}
                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-md font-semibold text-gray-800 mb-3">💡 Batch Backtest</h4>
                    <p className="text-sm text-gray-700 mb-4">
                      Test all {analysisResult.strategies.length} strategies across all samples in your backtest set
                    </p>

                    {!batchBacktesting && !batchBacktestStatus && (
                      <button
                        onClick={handleBatchBacktest}
                        className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium text-lg shadow-md hover:shadow-lg transition"
                      >
                        Backtest All Strategies
                      </button>
                    )}

                    {batchBacktesting && (
                      <div className="text-center py-6">
                        <div className="animate-spin h-12 w-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-gray-700 font-medium">Running batch backtest...</p>
                        {batchBacktestStatus && (
                          <p className="text-sm text-gray-600 mt-2">
                            Progress: {batchBacktestStatus.completedTests} / {batchBacktestStatus.totalTests} tests
                          </p>
                        )}
                      </div>
                    )}

                    {batchBacktestStatus && !batchBacktesting && (
                      <div className="mt-4">
                        <h5 className="text-sm font-semibold text-gray-800 mb-3">Results</h5>
                        <div className="space-y-2">
                          {batchBacktestStatus.strategies
                            .sort((a, b) => b.winRate - a.winRate)
                            .map((strategy, idx) => (
                              <div
                                key={strategy.strategyId}
                                className={`p-3 rounded border ${
                                  idx === 0
                                    ? 'bg-green-50 border-green-300'
                                    : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {idx === 0 && <span className="text-lg">🏆</span>}
                                    <span className="font-medium text-sm">{strategy.strategyName}</span>
                                  </div>
                                  <span
                                    className={`text-sm font-bold ${
                                      strategy.winRate >= 60 ? 'text-green-600' : 'text-gray-600'
                                    }`}
                                  >
                                    {strategy.winRate.toFixed(1)}% Win Rate
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                                  <div>
                                    Tests: {strategy.successfulTests}/{strategy.totalTests}
                                  </div>
                                  <div>
                                    Trades: {strategy.winningTrades}W / {strategy.losingTrades}L
                                  </div>
                                  <div>
                                    Avg: {strategy.avgPnlPercent.toFixed(2)}%
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>

                        {batchBacktestStatus.strategies.length > 0 && (
                          <div className="mt-4 p-3 bg-gray-100 rounded">
                            <p className="text-xs text-gray-700">
                              <strong>Best Strategy:</strong>{' '}
                              {batchBacktestStatus.strategies[0].strategyName} with{' '}
                              {batchBacktestStatus.strategies[0].winRate.toFixed(1)}% win rate
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ERROR STATE */}
              {state === 'ERROR' && (
                <div>
                  <h3 className="text-lg font-semibold text-red-700 mb-4">Error</h3>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                  <button
                    onClick={generateCharts}
                    className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-size chart modal */}
      {selectedChart && (
        <ChartModal
          chart={selectedChart}
          onClose={() => setSelectedChart(null)}
        />
      )}
    </>
  );
}
