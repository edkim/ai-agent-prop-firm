# Frontend Iteration Status Updates Plan

**Date:** 2025-11-11
**Status:** Planned (Not Implemented)

## User Request

Add two features to the Learning Laboratory frontend:
1. Show status updates after clicking "start iteration" button (feedback during long-running operations)
2. Show if an iteration is currently running in the Learning History

## Implementation Plan

### Feature 1: Status Updates After Starting Iteration

**Current Behavior:**
- User clicks "Start Iteration" button
- Request is sent to backend
- No feedback until completion (can take 3-5 minutes)
- User doesn't know if anything is happening

**Desired Behavior:**
- Show immediate feedback: "Starting iteration..."
- Poll backend for status updates every few seconds
- Display current step: "Generating strategy...", "Running scanner...", "Testing execution scripts...", "Analyzing results..."
- Show progress through the iteration lifecycle
- Display final result when complete

**Implementation Approach:**

1. **Add Loading State in Component**
   - Track `isStarting` and `currentStep` in component state
   - Show loading spinner + status message below "Start Iteration" button

2. **Poll for Iteration Status**
   - After starting iteration, begin polling agent endpoint
   - Check for newest iteration's status field
   - Map status to user-friendly messages:
     - `running` → show estimated step based on elapsed time
     - `completed` → show success message
     - `failed` → show error message

3. **Status Message Mapping**
   - Use iteration log timestamps to estimate current step
   - Or add a `current_step` field to backend iteration status

### Feature 2: Show Running Indicator in Learning History

**Current Behavior:**
- Learning History shows list of completed iterations
- No indication if an iteration is currently running
- User might start duplicate iteration

**Desired Behavior:**
- Show "RUNNING" badge/indicator for in-progress iterations
- Display elapsed time: "Running for 2m 15s..."
- Update in real-time (or with polling)
- Disable "Start Iteration" button if one is already running

**Implementation Approach:**

1. **Add Status Badge Component**
   - Create `<IterationStatusBadge />` component
   - Props: `status`, `startedAt`, `completedAt`
   - Render different badges:
     - `running` → Yellow/orange badge with spinner
     - `completed` → Green badge
     - `failed` → Red badge

2. **Calculate Elapsed Time**
   - For running iterations: `Date.now() - startedAt`
   - Update every second using `setInterval`
   - Format: "2m 15s ago", "Running for 3m 42s"

3. **Disable Start Button**
   - Check if any iteration has `status === 'running'`
   - Disable button + show message: "Iteration 4 is currently running..."

## Files to Modify

### Frontend
- `frontend/src/components/LearningLaboratory/AgentIterationView.tsx`
  - Add loading state after clicking "Start Iteration"
  - Add polling mechanism for status updates
  - Display current step/status message

- `frontend/src/components/LearningLaboratory/IterationHistory.tsx` (or similar)
  - Add `<IterationStatusBadge />` component
  - Add elapsed time calculation for running iterations
  - Poll for updates when a running iteration exists

- Create: `frontend/src/components/LearningLaboratory/IterationStatusBadge.tsx`
  - New component for status display
  - Handle running, completed, failed states

### Backend (Minimal Changes)
- Possibly add `current_step` field to iteration status (optional enhancement)
- Ensure `status` field is consistently returned: 'running', 'completed', 'failed'

## Technical Details

### Polling Strategy
```typescript
useEffect(() => {
  if (hasRunningIteration) {
    const pollInterval = setInterval(() => {
      // Fetch agent data to check iteration status
      refetchAgent();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }
}, [hasRunningIteration]);
```

### Status Message Examples
- "Starting iteration..."
- "Generating strategy... (Step 1/5)"
- "Running scanner... (Step 2/5)"
- "Regenerating execution script... (Step 3/5)"
- "Running backtests... (Step 4/5)"
- "Analyzing results... (Step 5/5)"
- "Iteration 4 completed! ✓"

### Status Badge Colors
- Running: `bg-yellow-100 text-yellow-800` with spinner
- Completed: `bg-green-100 text-green-800`
- Failed: `bg-red-100 text-red-800`

## Benefits

1. **Better UX**: Users know the system is working
2. **Progress Visibility**: Can see which step is taking time
3. **Prevent Duplicates**: Clear indication when iteration is running
4. **Debugging**: Easier to identify if system is stuck
5. **Professional Feel**: More polished interface

## Next Steps

1. Explore `AgentIterationView.tsx` to find start button
2. Find Learning History/iteration list component
3. Implement polling mechanism
4. Add status badge component
5. Test with long-running iteration
6. Consider adding websockets for real-time updates (future enhancement)
