/**
 * Scheduler Service
 * Manages cron-based scheduled learning iterations for agents
 */

import cron from 'node-cron';
import { getDatabase } from '../database/db';
import { LearningIterationService } from './learning-iteration.service';
import { AgentActivityLogService } from './agent-activity-log.service';

interface ScheduledTask {
  agentId: string;
  schedule: string;
  task: cron.ScheduledTask;
}

export class SchedulerService {
  private static instance: SchedulerService;
  private tasks: Map<string, ScheduledTask> = new Map();
  private learningService: LearningIterationService;
  private activityLog: AgentActivityLogService;
  private isRunning: boolean = false;

  private constructor() {
    this.learningService = new LearningIterationService();
    this.activityLog = new AgentActivityLogService();
  }

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Start the scheduler service
   * Loads all agents with auto_learn_enabled and schedules them
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠ Scheduler already running');
      return;
    }

    console.log('📅 Starting Scheduler Service...');

    const db = getDatabase();

    // Load agents with auto_learn_enabled
    const agents = db.prepare(`
      SELECT id, name, learning_schedule
      FROM learning_agents
      WHERE auto_learn_enabled = 1
      AND active = 1
    `).all() as any[];

    console.log(`📊 Found ${agents.length} agents with scheduled learning enabled`);

    for (const agent of agents) {
      if (agent.learning_schedule) {
        await this.scheduleAgent(agent.id, agent.learning_schedule);
      }
    }

    this.isRunning = true;
    console.log('✓ Scheduler Service started');
  }

  /**
   * Stop the scheduler service
   */
  stop(): void {
    console.log('🛑 Stopping Scheduler Service...');

    for (const [agentId, scheduled] of this.tasks.entries()) {
      scheduled.task.stop();
      console.log(`  Stopped schedule for agent: ${agentId}`);
    }

    this.tasks.clear();
    this.isRunning = false;
    console.log('✓ Scheduler Service stopped');
  }

  /**
   * Schedule an agent for automatic learning iterations
   */
  async scheduleAgent(agentId: string, schedule: string): Promise<void> {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    // Remove existing schedule if any
    if (this.tasks.has(agentId)) {
      this.unscheduleAgent(agentId);
    }

    console.log(`📅 Scheduling agent ${agentId} with schedule: ${schedule}`);

    // Create scheduled task
    const task = cron.schedule(schedule, async () => {
      await this.executeScheduledIteration(agentId);
    }, {
      scheduled: true,
      timezone: 'America/New_York' // Market timezone
    });

    this.tasks.set(agentId, { agentId, schedule, task });

    // Calculate and save next scheduled run
    await this.updateNextScheduledIteration(agentId);

    await this.activityLog.log({
      learning_agent_id: agentId,
      activity_type: 'SCHEDULE_ENABLED',
      description: `Scheduled learning enabled with cron: ${schedule}`,
      data: JSON.stringify({ schedule })
    });
  }

  /**
   * Unschedule an agent
   */
  unscheduleAgent(agentId: string): void {
    const scheduled = this.tasks.get(agentId);
    if (scheduled) {
      scheduled.task.stop();
      this.tasks.delete(agentId);
      console.log(`🛑 Unscheduled agent: ${agentId}`);
    }
  }

  /**
   * Execute a scheduled learning iteration
   */
  private async executeScheduledIteration(agentId: string): Promise<void> {
    console.log(`\n🔄 Executing scheduled iteration for agent: ${agentId}`);

    try {
      const db = getDatabase();

      // Check if agent is still eligible
      const agent = db.prepare(`
        SELECT auto_learn_enabled, status
        FROM learning_agents
        WHERE id = ? AND active = 1
      `).get(agentId) as any;

      if (!agent || !agent.auto_learn_enabled) {
        console.log(`⚠ Agent ${agentId} no longer eligible for scheduled learning`);
        this.unscheduleAgent(agentId);
        return;
      }

      // Run iteration
      await this.learningService.runIteration(agentId);

      // Update next scheduled run
      await this.updateNextScheduledIteration(agentId);

      await this.activityLog.log({
        learning_agent_id: agentId,
        activity_type: 'SCHEDULED_ITERATION_COMPLETED',
        description: 'Scheduled learning iteration completed successfully'
      });

    } catch (error: any) {
      console.error(`❌ Scheduled iteration failed for agent ${agentId}:`, error.message);

      await this.activityLog.log({
        learning_agent_id: agentId,
        activity_type: 'SCHEDULED_ITERATION_FAILED',
        description: `Scheduled iteration failed: ${error.message}`,
        data: JSON.stringify({ error: error.message, stack: error.stack })
      });
    }
  }

  /**
   * Update the next_scheduled_iteration timestamp for an agent
   */
  private async updateNextScheduledIteration(agentId: string): Promise<void> {
    const scheduled = this.tasks.get(agentId);
    if (!scheduled) return;

    // Calculate next run time (approximation)
    // This is a simple calculation; for precise timing we'd need a cron parser
    const now = new Date();
    const nextRun = new Date(now.getTime() + 3600000); // Default: 1 hour from now

    const db = getDatabase();
    db.prepare(`
      UPDATE learning_agents
      SET next_scheduled_iteration = ?
      WHERE id = ?
    `).run(nextRun.toISOString(), agentId);
  }

  /**
   * Get scheduled agents
   */
  getScheduledAgents(): { agentId: string; schedule: string }[] {
    return Array.from(this.tasks.values()).map(t => ({
      agentId: t.agentId,
      schedule: t.schedule
    }));
  }

  /**
   * Check if an agent is scheduled
   */
  isAgentScheduled(agentId: string): boolean {
    return this.tasks.has(agentId);
  }
}
