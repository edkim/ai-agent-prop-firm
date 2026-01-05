/**
 * Main App Component
 * AI-Powered Algorithmic Trading Backtest Platform
 */

import { useState } from 'react';
import AgentLaboratory from './components/LearningLaboratory/AgentLaboratory';
import PaperTradingDashboard from './components/PaperTrading/PaperTradingDashboard';
import type { IntelligentBacktestResponse } from './services/api';

type Tab = 'laboratory' | 'paper-trading';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('laboratory');
  const [results, setResults] = useState<IntelligentBacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResults = (backtestResults: IntelligentBacktestResponse) => {
    setResults(backtestResults);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setResults(null);
  };

  const clearResults = () => {
    setResults(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                AI Trading Pattern Discovery
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Natural language pattern scanning and strategy backtesting
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                Backend Connected
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-6 border-b border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => {
                  setActiveTab('laboratory');
                  clearResults();
                }}
                className={`${
                  activeTab === 'laboratory'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200 flex items-center`}
              >
                <span className="mr-2">🧠</span> Learning Laboratory
              </button>
              <button
                onClick={() => {
                  setActiveTab('paper-trading');
                  clearResults();
                }}
                className={`${
                  activeTab === 'paper-trading'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200 flex items-center`}
              >
                 <span className="mr-2">💰</span> Paper Trading
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'paper-trading' ? (
          <PaperTradingDashboard />
        ) : (
          <AgentLaboratory />
        )}
      </main>

      {/* Footer */}
       <footer className="mt-12 bg-gray-800 border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-400">
            Powered by AI-driven strategy generation • Real market data • Intelligent execution
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
