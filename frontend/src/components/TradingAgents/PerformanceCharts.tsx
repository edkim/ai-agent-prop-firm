/**
 * Performance Charts Component
 * Visual analytics of agent performance
 */

import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { tradingAgentApi } from '../../services/tradingAgentApi';
import type { EquityCurveDataPoint, RiskMetrics } from '../../types/tradingAgent';

interface PerformanceChartsProps {
  agentId: string;
}

export default function PerformanceCharts({ agentId }: PerformanceChartsProps) {
  const [equityCurve, setEquityCurve] = useState<EquityCurveDataPoint[]>([]);
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [agentId]);

  const loadData = async () => {
    try {
      const [curveData, metricsData] = await Promise.all([
        tradingAgentApi.getEquityCurve(agentId).catch((err) => {
          console.log('No equity curve data yet:', err.message);
          return [];
        }),
        tradingAgentApi.getLatestMetrics(agentId).catch((err) => {
          console.log('No metrics available yet:', err.message);
          return null;
        }),
      ]);
      setEquityCurve(curveData);
      setMetrics(metricsData);
    } catch (err) {
      console.error('Failed to load performance data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!metrics || equityCurve.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No Performance Data
        </h3>
        <p className="text-sm text-gray-600">
          Performance charts will appear after the agent executes trades
        </p>
      </div>
    );
  }

  // Prepare data for charts
  const equityChartData = equityCurve.map(point => ({
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    equity: point.equity,
  }));

  const winLossData = [
    { name: 'Wins', value: metrics.winningTrades, color: '#10B981' },
    { name: 'Losses', value: metrics.losingTrades, color: '#EF4444' },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Performance Analytics</h3>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Total Trades</p>
          <p className="text-2xl font-semibold text-gray-900">{metrics.totalTrades}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Win Rate</p>
          <p className="text-2xl font-semibold text-gray-900">{(metrics.winRate * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Profit Factor</p>
          <p className="text-2xl font-semibold text-gray-900">{metrics.profitFactor.toFixed(2)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Sharpe Ratio</p>
          <p className="text-2xl font-semibold text-gray-900">{metrics.sharpeRatio.toFixed(2)}</p>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Equity Curve</h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={equityChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '6px' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="equity"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              name="Equity ($)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Win/Loss Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Win/Loss Distribution</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={winLossData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {winLossData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Winning Trades</p>
              <p className="text-lg font-semibold text-green-600">{metrics.winningTrades}</p>
            </div>
            <div>
              <p className="text-gray-500">Losing Trades</p>
              <p className="text-lg font-semibold text-red-600">{metrics.losingTrades}</p>
            </div>
          </div>
        </div>

        {/* Average Win/Loss */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Average Win vs Loss</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                { name: 'Avg Win', value: metrics.avgWin, color: '#10B981' },
                { name: 'Avg Loss', value: Math.abs(metrics.avgLoss), color: '#EF4444' },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '6px' }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {[
                  { name: 'Avg Win', value: metrics.avgWin, color: '#10B981' },
                  { name: 'Avg Loss', value: Math.abs(metrics.avgLoss), color: '#EF4444' },
                ].map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Average Win</p>
              <p className="text-lg font-semibold text-green-600">+${metrics.avgWin.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-500">Average Loss</p>
              <p className="text-lg font-semibold text-red-600">${metrics.avgLoss.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Metrics */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Risk Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Max Drawdown</p>
            <p className="text-lg font-semibold text-red-600">-{metrics.maxDrawdown.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Drawdown</p>
            <p className="text-lg font-semibold text-red-600">-{metrics.currentDrawdown.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Sharpe Ratio</p>
            <p className="text-lg font-semibold text-gray-900">{metrics.sharpeRatio.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Sortino Ratio</p>
            <p className="text-lg font-semibold text-gray-900">{metrics.sortinoRatio.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Trade Size Stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Position Sizing</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Largest Win</p>
            <p className="text-lg font-semibold text-green-600">+${metrics.largestWin.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Largest Loss</p>
            <p className="text-lg font-semibold text-red-600">${metrics.largestLoss.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Avg Position Size</p>
            <p className="text-lg font-semibold text-gray-900">${metrics.avgPositionSize.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
