# AI Backtest Platform - Project Memory

## Key Practices

- Always update README.md before git commits when features change
- Save accomplishments and analysis documents to ai-convo-history/ with date prefixes (YYYY-MM-DD)
- Use TodoWrite tool for tracking multi-step tasks
- Remember to always kill and restart the backend server before running any learning iterations or tests
- Check ai-convo-history/API-ENDPOINTS-REFERENCE.md for how to start a learning iteration

## Recent Work (2025-11-11) - Custom Execution Scripts

### What Changed
**Custom execution script generation is now working end-to-end**. The learning agent generates strategy-specific execution code instead of using generic templates.

### Key Files Modified
- **backend/src/services/claude.service.ts** (lines 1648-1750)
  - `generateExecutionScriptFromStrategy()` method generates custom TypeScript
  - Fixed field name issue: signals use `signal_date` and `signal_time` (NOT `date` and `time`)
  - Fixed anthropic client reference: use `this.getClient()` and `this.model`

### Current Status
- **Gap and Go v2 agent** successfully completed 2 iterations with custom execution
- Iteration 2 results: 35% win rate, 3.58 Sharpe, 1.87 profit factor
- Generated scripts saved to `backend/generated-scripts/success/YYYY-MM-DD/`
- Custom execution dramatically improved performance vs generic templates

### Branch
- Working on: `execution-script-evolution`
- Ready to merge to main

### Commits on Branch
- `45d32e9` - Add intelligent analysis for 0-signal scanner iterations
- `0c42bc1` - Fix custom execution script signal embedding + documentation
- `b927850` - Fix custom execution script generation
- `b98704f` - Document iteration 2 field name fix verification
- `31f5682` - Fix custom execution script generation field names (specify signal_date/signal_time)
- `7f3792e` - Fix anthropic client reference in custom execution generation

### Next Steps
- Merge to main
- Consider running more test iterations to validate consistency
- May want to add error handling for edge cases in script generation
