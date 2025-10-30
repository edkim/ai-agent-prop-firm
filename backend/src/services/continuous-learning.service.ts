/**
 * Continuous Learning Service
 * Manages continuous learning loops with rate limiting and convergence detection
 */

import { getDatabase } from '../database/db';
import { AgentLearningService } from './agent-learning.service';
import { AgentActivityLogService } from './agent-activity-log.service';

export class ContinuousLearningService {
  private static instance: ContinuousLearningService;
  private learningService: AgentLearningService;
  private activityLog: AgentActivityLogService;
  private activeLoops: Map<string, NodeJS.Timeout> = new Map();
  private iterationCounts: Map<string, { count: number; date: string }> = new Map();

  private constructor() {
    this.learningService = new AgentLearningService();
    this.activityLog = new AgentActivityLogService();
  }

  static getInstance(): ContinuousLearningService {
    if (!ContinuousLearningService.instance) {
      ContinuousLearningService.instance = new ContinuousLearningService();
    }
    return ContinuousLearningService.instance;
  }

  /**
   * Start continuous learning for an agent
   */
  async startContinuousLearning(agentId: string): Promise<void> {
    if (this.activeLoops.has(agentId)) {
      console.log(`⚠ Continuous learning already active for agent: ${agentId}`);
      return;
    }

    console.log(`🔄 Starting continuous learning for agent: ${agentId}`);

    const db = getDatabase();

    // Enable in database
    db.prepare(`
      UPDATE trading_agents
      SET continuous_learning_enabled = 1
      WHERE id = ?
    `).run(agentId);

    // Start the loop
    await this.runContinuousLoop(agentId);

    await this.activityLog.log({
      agent_id: agentId,
      activity_type: 'CONTINUOUS_LEARNING_STARTED',
      description: 'Continuous learning loop started'
    });
  }

  /**
   * Stop continuous learning for an agent
   */
  stopContinuousLearning(agentId: string): void {
    const timeout = this.activeLoops.get(agentId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeLoops.delete(agentId);
      console.log(`🛑 Stopped continuous learning for agent: ${agentId}`);
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE trading_agents
      SET continuous_learning_enabled = 0
      WHERE id = ?
    `).run(agentId);

    this.activityLog.log({
      agent_id: agentId,
      activity_type: 'CONTINUOUS_LEARNING_STOPPED',
      description: 'Continuous learning loop stopped'
    });
  }

  /**
   * Run the continuous learning loop
   */
  private async runContinuousLoop(agentId: string): Promise<void> {
    try {
      const db = getDatabase();

      // Get agent settings
      const agent = db.prepare(`
        SELECT
          continuous_learning_enabled,
          max_iterations_per_day,
          min_iteration_gap_minutes,
          convergence_threshold,
          status
        FROM trading_agents
        WHERE id = ?
      `).get(agentId) as any;

      if (!agent || !agent.continuous_learning_enabled) {
        console.log(`⚠ Continuous learning disabled for agent: ${agentId}`);
        return;
      }

      // Check daily iteration limit
      if (await this.hasReachedDailyLimit(agentId, agent.max_iterations_per_day)) {
        console.log(`⚠ Daily iteration limit reached for agent: ${agentId}. Will retry tomorrow.`);

        // Schedule next check at midnight
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        const timeout = setTimeout(() => this.runContinuousLoop(agentId), msUntilMidnight);
        this.activeLoops.set(agentId, timeout);
        return;
      }

      // Check for convergence
      if (await this.hasConverged(agentId, agent.convergence_threshold)) {
        console.log(`✓ Agent ${agentId} has converged. Stopping continuous learning.`);
        this.stopContinuousLearning(agentId);

        await this.activityLog.log({
          agent_id: agentId,
          activity_type: 'CONVERGENCE_DETECTED',
          description: 'Agent has converged. Continuous learning stopped.'
        });
        return;
      }

      // Run iteration
      console.log(`🔄 Running continuous learning iteration for agent: ${agentId}`);
      await this.learningService.runIteration(agentId);

      // Track iteration count
      this.incrementIterationCount(agentId);

      // Calculate next run time based on min_iteration_gap
      const gapMs = (agent.min_iteration_gap_minutes || 60) * 60 * 1000;

      // Schedule next iteration
      const timeout = setTimeout(() => this.runContinuousLoop(agentId), gapMs);
      this.activeLoops.set(agentId, timeout);

    } catch (error: any) {
      console.error(`❌ Continuous learning iteration failed for agent ${agentId}:`, error.message);

      await this.activityLog.log({
        agent_id: agentId,
        activity_type: 'CONTINUOUS_LEARNING_ERROR',
        description: `Continuous learning iteration failed: ${error.message}`,
        data: JSON.stringify({ error: error.message, stack: error.stack })
      });

      // Retry after gap period (with error backoff)
      const db = getDatabase();
      const agent = db.prepare(`SELECT min_iteration_gap_minutes FROM trading_agents WHERE id = ?`).get(agentId) as any;
      const retryGapMs = (agent?.min_iteration_gap_minutes || 60) * 60 * 1000 * 2; // 2x gap on error

      const timeout = setTimeout(() => this.runContinuousLoop(agentId), retryGapMs);
      this.activeLoops.set(agentId, timeout);
    }
  }

  /**
   * Check if agent has reached daily iteration limit
   */
  private async hasReachedDailyLimit(agentId: string, maxPerDay: number): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];

    // Get or initialize count
    let countData = this.iterationCounts.get(agentId);
    if (!countData || countData.date !== today) {
      countData = { count: 0, date: today };
      this.iterationCounts.set(agentId, countData);
    }

    return countData.count >= maxPerDay;
  }

  /**
   * Increment iteration count for today
   */
  private incrementIterationCount(agentId: string): void {
    const today = new Date().toISOString().split('T')[0];
    let countData = this.iterationCounts.get(agentId);

    if (!countData || countData.date !== today) {
      countData = { count: 1, date: today };
    } else {
      countData.count++;
    }

    this.iterationCounts.set(agentId, countData);
  }

  /**
   * Check if agent has converged (no significant improvement)
   */
  private async hasConverged(agentId: string, threshold: number): Promise<boolean> {
    const db = getDatabase();

    // Get last 3 iterations
    const iterations = db.prepare(`
      SELECT win_rate, sharpe_ratio, total_return
      FROM agent_iterations
      WHERE agent_id = ?
      ORDER BY iteration_number DESC
      LIMIT 3
    `).all(agentId) as any[];

    if (iterations.length < 3) return false;

    // Calculate average improvement between consecutive iterations
    const improvements: number[] = [];
    for (let i = 0; i < iterations.length - 1; i++) {
      const current = iterations[i];
      const previous = iterations[i + 1];

      // Composite improvement score (average of metrics)
      const winRateImprovement = (current.win_rate - previous.win_rate) / Math.max(previous.win_rate, 0.01);
      const sharpeImprovement = (current.sharpe_ratio - previous.sharpe_ratio) / Math.max(Math.abs(previous.sharpe_ratio), 0.01);
      const returnImprovement = (current.total_return - previous.total_return) / Math.max(Math.abs(previous.total_return), 0.01);

      const avgImprovement = (winRateImprovement + sharpeImprovement + returnImprovement) / 3;
      improvements.push(avgImprovement);
    }

    // If all improvements are below threshold, consider converged
    return improvements.every(imp => Math.abs(imp) < threshold);
  }

  /**
   * Get status of continuous learning for an agent
   */
  getContinuousLearningStatus(agentId: string): { active: boolean; iterationsToday: number } {
    const today = new Date().toISOString().split('T')[0];
    const countData = this.iterationCounts.get(agentId);
    const iterationsToday = countData && countData.date === today ? countData.count : 0;

    return {
      active: this.activeLoops.has(agentId),
      iterationsToday
    };
  }
}
