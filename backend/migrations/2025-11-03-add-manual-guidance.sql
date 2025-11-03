-- Add manual guidance column to agent_iterations
-- Date: 2025-11-03
-- Purpose: Allow manual user guidance to be provided for next iteration

ALTER TABLE agent_iterations ADD COLUMN manual_guidance TEXT;

-- Display migration status
SELECT 'Migration complete! Added manual_guidance column to agent_iterations' AS status;
