-- Add git commit tracking to agent_iterations
-- Date: 2025-11-12
-- Purpose: Track which git commit generated each iteration for better debugging

ALTER TABLE agent_iterations ADD COLUMN git_commit_hash TEXT;

-- Add index for filtering by commit
CREATE INDEX IF NOT EXISTS idx_agent_iterations_git_commit ON agent_iterations(git_commit_hash);

SELECT 'Migration complete! Added git_commit_hash column to agent_iterations table' AS status;
