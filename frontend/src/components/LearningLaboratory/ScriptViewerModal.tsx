/**
 * Script Viewer Modal Component
 * Displays scanner/execution scripts and prompts in a modal dialog
 */

import { useState } from 'react';

interface ScriptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string | null;
  language?: 'typescript' | 'markdown';
}

export default function ScriptViewerModal({
  isOpen,
  onClose,
  title,
  content,
  language = 'typescript',
}: ScriptViewerModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!content}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {content ? (
            <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm font-mono border border-gray-200">
              <code className={`language-${language}`}>{content}</code>
            </pre>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Content not available</p>
              <p className="text-sm mt-2">This script may not have been saved to the database.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
