# API Endpoints Quick Reference

## Learning Agent Endpoints

### Trigger a Single Iteration
```bash
POST /api/learning-agents/:id/iterations/start
```
- **No convergence checks** - runs immediately
- **No daily limits** - can be called multiple times
- Perfect for testing fixes

Example:
```bash
curl -X POST http://localhost:3000/api/learning-agents/4eed4e6a-dec3-4115-a865-c125df39b8d1/iterations/start \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Start Continuous Learning
```bash
POST /api/learning-agents/:id/continuous-learning/start
```
- Runs iterations in a loop
- Checks convergence between iterations
- Checks daily iteration limits
- Auto-stops when converged

### Get Agent Status
```bash
GET /api/learning-agents/:id
```

### Get All Iterations
```bash
GET /api/learning-agents/:id/iterations
```

### Stop Continuous Learning
```bash
POST /api/learning-agents/:id/continuous-learning/stop
```

## Common Agent IDs

- **First Red Day Fader**: `4eed4e6a-dec3-4115-a865-c125df39b8d1`

## Notes

- The iteration endpoint is defined in `src/api/routes/agents.ts` line 164
- All learning agent routes are mounted at `/api/learning-agents` (not `/api/agents`)
- Server runs on port 3000 by default
