# Plan: Add Script & Prompt Links to Learning Laboratory Frontend

**Date:** 2025-11-11
**Goal:** Add links in the Learning Laboratory frontend to view:
1. Scanner generation prompt
2. Scanner script code
3. Execution generation prompt
4. Execution script code

## Current State

The Learning Laboratory displays iterations with their results, but doesn't provide easy access to the generated scripts or the prompts used to create them.

## Implementation Plan

### Step 1: Extend Backend API

**File:** `backend/src/api/routes/agents.ts`

Add new endpoint to retrieve script files and prompts:

```typescript
// GET /api/learning-agents/:agentId/iterations/:iterationId/scripts
router.get('/:agentId/iterations/:iterationId/scripts', async (req, res) => {
  const { agentId, iterationId } = req.params;

  // Get iteration details to find script paths
  const iteration = await getIteration(agentId, iterationId);

  // Construct file paths based on iteration date and IDs
  const date = new Date(iteration.created_at).toISOString().split('T')[0];

  const scannerScriptPath = `backend/generated-scripts/success/${date}/${iteration.scanner_script_id}-scanner.ts`;
  const executionScriptPath = `backend/generated-scripts/success/${date}/${iteration.execution_script_id}-custom-execution.ts`;

  // Read files
  const scannerScript = fs.existsSync(scannerScriptPath) ? fs.readFileSync(scannerScriptPath, 'utf-8') : null;
  const executionScript = fs.existsSync(executionScriptPath) ? fs.readFileSync(executionScriptPath, 'utf-8') : null;

  res.json({
    scannerScript,
    executionScript,
    scannerPrompt: generateScannerPrompt(iteration), // Function to reconstruct prompt
    executionPrompt: generateExecutionPrompt(iteration) // Function to reconstruct prompt
  });
});
```

### Step 2: Store Script IDs in Database

**Problem:** Currently, we don't know which UUID corresponds to which iteration's scanner/execution script.

**Solution:** Modify `agent-learning.service.ts` to store script file IDs:

```typescript
// In agent-learning.service.ts, after generating scripts:

const scannerScriptId = uuidv4();
const executionScriptId = uuidv4();

// Save these IDs to the iteration record
await db.prepare(`
  UPDATE learning_agent_iterations
  SET scanner_script_id = ?, execution_script_id = ?
  WHERE iteration_id = ?
`).run(scannerScriptId, executionScriptId, iterationId);
```

**Alternative:** Parse the generated-scripts directory to find scripts by timestamp/iteration number correlation.

### Step 3: Update Frontend API Service

**File:** `frontend/src/services/learningAgentApi.ts`

Add new method:

```typescript
export const learningAgentApi = {
  // ... existing methods

  getIterationScripts: async (agentId: string, iterationId: string) => {
    const response = await fetch(`/api/learning-agents/${agentId}/iterations/${iterationId}/scripts`);
    if (!response.ok) {
      throw new Error('Failed to fetch iteration scripts');
    }
    return await response.json();
  }
};
```

### Step 4: Create Script Viewer Modal Component

**File:** `frontend/src/components/LearningLaboratory/ScriptViewerModal.tsx`

```typescript
interface ScriptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  language: 'typescript' | 'markdown';
}

export function ScriptViewerModal({ isOpen, onClose, title, content, language }: ScriptViewerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
          <code className={`language-${language}`}>{content}</code>
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(content)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Copy to Clipboard
        </button>
      </div>
    </div>
  );
}
```

### Step 5: Update AgentIterationView Component

**File:** `frontend/src/components/LearningLaboratory/AgentIterationView.tsx`

Add buttons/links in the iteration details section:

```typescript
// Add state for modal
const [scriptModal, setScriptModal] = useState<{
  isOpen: boolean;
  title: string;
  content: string;
  language: 'typescript' | 'markdown';
} | null>(null);

// Add function to load scripts
const viewScript = async (type: 'scanner-prompt' | 'scanner-code' | 'execution-prompt' | 'execution-code') => {
  const scripts = await learningAgentApi.getIterationScripts(agentId, selectedIteration.iteration_id);

  const modalConfig = {
    'scanner-prompt': { title: 'Scanner Generation Prompt', content: scripts.scannerPrompt, language: 'markdown' },
    'scanner-code': { title: 'Scanner Script Code', content: scripts.scannerScript, language: 'typescript' },
    'execution-prompt': { title: 'Execution Generation Prompt', content: scripts.executionPrompt, language: 'markdown' },
    'execution-code': { title: 'Execution Script Code', content: scripts.executionScript, language: 'typescript' }
  };

  setScriptModal({ isOpen: true, ...modalConfig[type] });
};

// In the iteration details JSX:
<div className="mb-4 flex gap-2">
  <button
    onClick={() => viewScript('scanner-prompt')}
    className="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
  >
    📝 Scanner Prompt
  </button>
  <button
    onClick={() => viewScript('scanner-code')}
    className="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
  >
    📄 Scanner Code
  </button>
  <button
    onClick={() => viewScript('execution-prompt')}
    className="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
  >
    📝 Execution Prompt
  </button>
  <button
    onClick={() => viewScript('execution-code')}
    className="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded"
  >
    📄 Execution Code
  </button>
</div>

{scriptModal && (
  <ScriptViewerModal
    {...scriptModal}
    onClose={() => setScriptModal(null)}
  />
)}
```

## Alternative Approach: Direct File Links

Instead of fetching via API, link directly to VSCode:

```typescript
const openInVSCode = (filePath: string) => {
  window.location.href = `vscode://file${filePath}`;
};

<button onClick={() => openInVSCode(scannerScriptPath)}>
  Open Scanner Script in VSCode
</button>
```

## Challenges

1. **Script File Discovery** - Need to know which UUID files correspond to which iteration
2. **Prompt Reconstruction** - Prompts are generated dynamically; need to recreate them or store them
3. **File Path Management** - Scripts stored in dated folders; need consistent path construction

## Recommended Next Steps

1. Add `scanner_script_id` and `execution_script_id` columns to iterations table
2. Store these IDs when generating scripts
3. Create API endpoint to serve script files
4. Build frontend modal component
5. Add buttons to AgentIterationView

## Benefits

- **Transparency** - Users can see exactly what prompts generated the scripts
- **Debugging** - Easy to inspect generated code when iterations fail
- **Learning** - Users can learn from successful prompt patterns
- **Reproducibility** - Can recreate or modify prompts based on what worked
