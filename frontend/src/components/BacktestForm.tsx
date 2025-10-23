/**
 * BacktestForm Component
 * Natural language input for backtest queries
 */

import { useState } from 'react';
import { executeIntelligentBacktest } from '../services/api';
import type { IntelligentBacktestRequest } from '../services/api';

interface BacktestFormProps {
  onResults: (results: any) => void;
  onError: (error: string) => void;
}

export default function BacktestForm({ onResults, onError }: BacktestFormProps) {
  const [prompt, setPrompt] = useState('');
  const [ticker, setTicker] = useState('');
  const [timeframe, setTimeframe] = useState('10sec');
  const [loading, setLoading] = useState(false);

  // Example prompts for user guidance
  const examplePrompts = [
    'Enter when VWAP is crossed. If crossing below then only enter if below 5-period SMA. Stop loss 1%. Test for the last 15 days.',
    'Short at successful retest of low of day for the past 20 trading days',
    'Enter long when price breaks above 5-period SMA. Exit at 2% take profit or 1% stop loss. Test for the last 10 days.',
    'Test mean reversion: enter when price is 2 standard deviations below VWAP, exit when it crosses back above VWAP. Past 15 days.',
    'Momentum strategy: enter when RSI crosses above 50 and price is above 20-period SMA. Exit when RSI falls below 40. Last 20 days.',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim() || !ticker.trim()) {
      onError('Please enter both a prompt and ticker symbol');
      return;
    }

    // Check if prompt contains date keywords
    const lowercasePrompt = prompt.toLowerCase();
    const hasDateKeywords = /\b(last|past|previous|for the|days?|weeks?|months?|from|to|between|on|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|\d{4}-\d{2}-\d{2})\b/.test(lowercasePrompt);

    if (!hasDateKeywords) {
      console.warn('⚠️  No date keywords detected in prompt - will default to last 10 trading days');
    }

    setLoading(true);

    try {
      const request: IntelligentBacktestRequest = {
        prompt: prompt.trim(),
        ticker: ticker.trim().toUpperCase(),
        strategyType: 'orb',
        timeframe: timeframe,
        config: {},
      };

      const response = await executeIntelligentBacktest(request);

      if (response.success) {
        onResults(response);
      } else {
        onError(response.error || 'Backtest execution failed');
      }
    } catch (error: any) {
      console.error('Backtest error:', error);
      onError(error.response?.data?.message || error.message || 'Failed to execute backtest');
    } finally {
      setLoading(false);
    }
  };

  const loadExample = (example: string) => {
    setPrompt(example);
    // Extract ticker from example if present
    const tickerMatch = example.match(/\b([A-Z]{2,5})\b/);
    if (tickerMatch) {
      setTicker(tickerMatch[1]);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">AI-Powered Backtest Query</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Ticker Input and Timeframe Selector */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-1">
              Ticker Symbol
            </label>
            <input
              type="text"
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g., HOOD, CRML, NVDA"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="timeframe" className="block text-sm font-medium text-gray-700 mb-1">
              Timeframe
            </label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              disabled={loading}
            >
              <option value="10sec">10 seconds (ultra-high granularity)</option>
              <option value="1min">1 minute</option>
              <option value="5min">5 minutes</option>
              <option value="15min">15 minutes</option>
              <option value="30min">30 minutes</option>
              <option value="1hour">1 hour</option>
              <option value="1day">1 day</option>
            </select>
          </div>
        </div>

        {/* Natural Language Prompt */}
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">
            Natural Language Query
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g., 'Enter long when price breaks above 5-period SMA for the past 10 days'"
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">
            AI-powered strategy generation • Supports: VWAP, SMA, RSI, custom indicators, date ranges, exit conditions
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Running Backtest...
            </span>
          ) : (
            'Run Backtest'
          )}
        </button>
      </form>

      {/* Example Prompts */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Example Queries:</h3>
        <div className="space-y-2">
          {examplePrompts.map((example, index) => (
            <button
              key={index}
              onClick={() => loadExample(example)}
              className="text-left w-full text-sm text-blue-600 hover:text-blue-800 hover:underline"
              disabled={loading}
            >
              → {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
