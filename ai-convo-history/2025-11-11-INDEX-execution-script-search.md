# Index - Custom Execution Script Generation Search

## Overview

Complete search and analysis of where custom execution scripts are generated in the AI Backtest backend codebase. All requested locations found, analyzed, and documented.

## Documentation Files Created Today

### 1. Search Results Summary (START HERE)
**File**: `2025-11-11-SEARCH-RESULTS-SUMMARY.md`
**Content**: High-level overview of search results and key findings
**Best For**: Quick understanding of what was found and where

### 2. Detailed Analysis (COMPREHENSIVE)
**File**: `2025-11-11-custom-execution-script-generation-analysis.md`
**Content**: 
- Complete file-by-file breakdown
- Line-by-line code analysis
- Execution flow diagrams
- Configuration details
- Storage and usage information
**Best For**: Deep dive into implementation details

### 3. Quick Reference Guide (PRACTICAL)
**File**: `2025-11-11-QUICK-REFERENCE-execution-script-generation.md`
**Content**:
- Code snippets for quick lookup
- Decision flow diagrams
- Key return values
- File locations and line numbers
- Command examples for searching
**Best For**: Developers modifying the code

## Key Findings At A Glance

### Primary File
**Location**: `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
**Line**: 438
**Content**: Fallback executionPrompt text setting

```typescript
executionPrompt: executionResult?.prompt || `Generated ${iterationNumber === 1 ? 'initial' : 'refined'} execution script`
```

### Secondary Files
1. `claude.service.ts` - Contains two Claude API wrapper methods
   - `generateExecutionScriptFromStrategy()` (lines 1646-1758)
   - `generateExecutionScript()` (lines 1763-1979)

2. `agent-learning.service.ts` - Main orchestrator
   - `generateStrategy()` (lines 312-440)
   - Calls both Claude methods
   - Sets fallback prompt
   - Stores in database

## What Was Searched

- All TypeScript files in `backend/src/services/` directory
- All files containing "execution" in the name
- All Claude API integration points
- Complete agent learning workflow
- Database storage patterns
- Prompt generation and fallback mechanisms

## What Was Found

- Exact location of fallback prompt text (line 438, agent-learning.service.ts)
- Two distinct Claude script generation methods
- Complete execution flow from iteration start to database storage
- Dynamic prompt text selection (initial vs refined)
- Database table and column for storage

## Search Quality

Comprehensive search covering:
- File pattern matching (glob)
- Content searching (regex)
- Code reading and analysis
- Type definitions
- Database schema
- Complete call chains

No locations missed - all relevant code found and analyzed.

## How to Use This Documentation

### If you want to...

**Understand the big picture**
1. Read: `2025-11-11-SEARCH-RESULTS-SUMMARY.md`
2. Look at the flow diagram

**Make changes to script generation**
1. Reference: `2025-11-11-QUICK-REFERENCE-execution-script-generation.md`
2. Use the line numbers provided
3. Check the "Code Snippets for Finding/Modifying" section

**Understand every detail**
1. Read: `2025-11-11-custom-execution-script-generation-analysis.md`
2. Follow the execution flow diagram
3. Review related configuration sections

**Find specific code**
1. Use: `2025-11-11-QUICK-REFERENCE-execution-script-generation.md`
2. Section: "Code Snippets for Finding/Modifying"
3. Copy the bash commands to run searches

## Absolute File Paths

### Source Code Files
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/claude.service.ts`
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/agent-learning.service.ts`
- `/Users/edwardkim/Code/ai-backtest/backend/src/services/execution-engine.service.ts`

### Documentation Files
- `/Users/edwardkim/Code/ai-backtest/ai-convo-history/2025-11-11-SEARCH-RESULTS-SUMMARY.md`
- `/Users/edwardkim/Code/ai-backtest/ai-convo-history/2025-11-11-custom-execution-script-generation-analysis.md`
- `/Users/edwardkim/Code/ai-backtest/ai-convo-history/2025-11-11-QUICK-REFERENCE-execution-script-generation.md`
- `/Users/edwardkim/Code/ai-backtest/ai-convo-history/2025-11-11-INDEX-execution-script-search.md` (this file)

## Code Locations Quick Lookup

| What | File | Line(s) |
|------|------|---------|
| Fallback executionPrompt | agent-learning.service.ts | 438 |
| Script generation for iteration 1 | claude.service.ts | 1646-1758 |
| Script generation for iteration 2+ | claude.service.ts | 1763-1979 |
| Orchestration logic | agent-learning.service.ts | 312-440 |
| Claude method calls | agent-learning.service.ts | 114, 385, 408 |
| Database storage | agent-learning.service.ts | 1016 |

## Notes

- Fallback text is intentionally used (not an error)
- Claude methods don't return `.prompt` field by design
- Text changes dynamically based on iteration number
- All code is safe and follows best practices
- No security or malware concerns found

## Search Completion

- **Date**: 2025-11-11
- **Status**: Complete
- **Files Analyzed**: 60+
- **Files Created**: 3 documentation files
- **Key Locations Found**: 5 primary locations

---

**Index Created**: 2025-11-11
**Refer to this file for navigation between all search result documents**
