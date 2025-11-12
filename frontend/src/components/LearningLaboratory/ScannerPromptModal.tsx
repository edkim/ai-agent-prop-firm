/**
 * Scanner Prompt Modal Component
 * Allows users to preview and edit scanner prompts before starting iterations
 */

import { useState, useEffect } from 'react';
import { learningAgentApi, type IterationPreview } from '../../services/learningAgentApi';

interface ScannerPromptModalProps {
  agentId: string;
  manualGuidance?: string;
  onConfirm: (overridePrompt: string | null) => void;
  onCancel: () => void;
}

export default function ScannerPromptModal({
  agentId,
  manualGuidance,
  onConfirm,
  onCancel
}: ScannerPromptModalProps) {
  const [preview, setPreview] = useState<IterationPreview | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load preview on mount
  useEffect(() => {
    loadPreview();
  }, [agentId]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const previewData = await learningAgentApi.previewIteration(agentId);
      setPreview(previewData);
      setEditedPrompt(previewData.scannerPrompt);
    } catch (err: any) {
      console.error('Failed to load preview:', err);
      setError(err.message || 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEdit = () => {
    if (isEditing && preview) {
      // Reset to original when canceling edit
      setEditedPrompt(preview.scannerPrompt);
    }
    setIsEditing(!isEditing);
  };

  const handleConfirm = () => {
    const hasChanges = preview && editedPrompt !== preview.scannerPrompt;
    onConfirm(hasChanges ? editedPrompt : null);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Preview Next Iteration</h2>
            <p className="text-sm text-gray-600">Review and optionally edit the scanner prompt before starting</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 text-3xl leading-none px-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-700 font-medium">Loading iteration preview...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-700 font-medium">Failed to load preview</p>
              <p className="text-sm text-gray-600 mt-2">{error}</p>
              <button
                onClick={loadPreview}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          )}

          {preview && !loading && !error && (
            <div className="space-y-6">
              {/* Manual Guidance Section */}
              {manualGuidance && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-amber-900 mb-2">Manual Guidance Applied</h3>
                  <p className="text-sm text-amber-800">{manualGuidance}</p>
                </div>
              )}

              {/* Learnings Applied Section */}
              {preview.learningsApplied.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3">
                    Learnings Applied ({preview.learningsApplied.length})
                  </h3>
                  <div className="space-y-2">
                    {preview.learningsApplied.map((learning, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                          Iter #{learning.iteration}
                        </span>
                        <p className="text-sm text-blue-800 flex-1">{learning.insight}</p>
                        <span className="text-xs text-blue-600">
                          {(learning.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Guidance Section */}
              {preview.executionGuidance && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-green-900 mb-2">Execution Guidance</h3>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{preview.executionGuidance}</p>
                </div>
              )}

              {/* Scanner Prompt Section */}
              <div className="border border-gray-300 rounded-lg">
                <div className="bg-gray-50 border-b border-gray-300 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Scanner Prompt</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      preview.estimatedComplexity === 'simple' ? 'bg-green-100 text-green-800' :
                      preview.estimatedComplexity === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {preview.estimatedComplexity}
                    </span>
                  </div>
                  <button
                    onClick={handleToggleEdit}
                    className={`text-sm px-3 py-1 rounded transition-colors ${
                      isEditing
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isEditing ? 'Cancel Edit' : 'Edit Prompt'}
                  </button>
                </div>

                <div className="p-4">
                  {isEditing ? (
                    <textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-vertical"
                      rows={20}
                      placeholder="Enter scanner prompt..."
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 p-4 rounded border border-gray-200 max-h-96 overflow-y-auto">
                      {preview.scannerPrompt}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {isEditing && (
              <span className="text-sm text-amber-700 font-medium">
                Custom prompt will be saved
              </span>
            )}
            <button
              onClick={handleConfirm}
              disabled={loading || !!error}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              Start Iteration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
