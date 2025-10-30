/**
 * Graduation Service
 * Manages agent progression from learning → paper trading → live trading
 */

import { getDatabase } from '../database/db';
import { AgentActivityLogService } from './agent-activity-log.service';

export interface GraduationCriteria {
  min_iterations: number;           // e.g., 20
  min_win_rate: number;             // e.g., 0.60 (60%)
  min_sharpe_ratio: number;         // e.g., 2.0
  min_total_return: number;         // e.g., 0.05 (5%)
  min_signals: number;              // e.g., 50 total signals
  consistency_window: number;       // e.g., last 5 iterations
  min_consistent_win_rate: number;  // e.g., 0.55 (55%)
}

export interface GraduationEligibility {
  eligible: boolean;
  reason: string;
  criteria_met: { [key: string]: boolean };
  stats: {
    total_iterations: number;
    avg_win_rate: number;
    avg_sharpe: number;
    avg_return: number;
    total_signals: number;
    recent_consistency: boolean;
  };
}

export class GraduationService {
  private activityLog: AgentActivityLogService;

  constructor() {
    this.activityLog = new AgentActivityLogService();
  }

  /**
   * Check if an agent is eligible for graduation
   */
  async checkEligibility(agentId: string): Promise<GraduationEligibility> {
    const db = getDatabase();

    // Get agent status
    const agent = db.prepare(`
      SELECT status
      FROM trading_agents
      WHERE id = ?
    `).get(agentId) as any;

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get graduation criteria
    const criteria = this.getGraduationCriteria(agent.status);

    // Get iteration statistics
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_iterations,
        AVG(win_rate) as avg_win_rate,
        AVG(sharpe_ratio) as avg_sharpe,
        AVG(total_return) as avg_return,
        SUM(signals_found) as total_signals
      FROM agent_iterations
      WHERE agent_id = ?
    `).get(agentId) as any;

    // Get recent iterations for consistency check
    const recentIterations = db.prepare(`
      SELECT win_rate, sharpe_ratio
      FROM agent_iterations
      WHERE agent_id = ?
      ORDER BY iteration_number DESC
      LIMIT ?
    `).all(agentId, criteria.consistency_window) as any[];

    // Check each criterion
    const criteriaMet = {
      iterations: stats.total_iterations >= criteria.min_iterations,
      win_rate: stats.avg_win_rate >= criteria.min_win_rate,
      sharpe: stats.avg_sharpe >= criteria.min_sharpe_ratio,
      return: stats.avg_return >= criteria.min_total_return,
      signals: stats.total_signals >= criteria.min_signals,
      consistency: recentIterations.length >= criteria.consistency_window &&
                   recentIterations.every(it => it.win_rate >= criteria.min_consistent_win_rate)
    };

    const allMet = Object.values(criteriaMet).every(met => met === true);

    let reason = '';
    if (allMet) {
      reason = `Agent meets all graduation criteria for ${this.getNextStatus(agent.status)}`;
    } else {
      const failed = Object.entries(criteriaMet)
        .filter(([_, met]) => !met)
        .map(([criterion]) => criterion);
      reason = `Failed criteria: ${failed.join(', ')}`;
    }

    return {
      eligible: allMet,
      reason,
      criteria_met: criteriaMet,
      stats: {
        total_iterations: stats.total_iterations || 0,
        avg_win_rate: stats.avg_win_rate || 0,
        avg_sharpe: stats.avg_sharpe || 0,
        avg_return: stats.avg_return || 0,
        total_signals: stats.total_signals || 0,
        recent_consistency: criteriaMet.consistency
      }
    };
  }

  /**
   * Graduate an agent to the next status level
   */
  async graduate(agentId: string, force: boolean = false): Promise<string> {
    const db = getDatabase();

    const agent = db.prepare(`
      SELECT status
      FROM trading_agents
      WHERE id = ?
    `).get(agentId) as any;

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Check eligibility (unless forced)
    if (!force) {
      const eligibility = await this.checkEligibility(agentId);
      if (!eligibility.eligible) {
        throw new Error(`Agent not eligible for graduation: ${eligibility.reason}`);
      }
    }

    const currentStatus = agent.status;
    const nextStatus = this.getNextStatus(currentStatus);

    if (nextStatus === currentStatus) {
      throw new Error(`Agent is already at ${currentStatus} status - cannot graduate further`);
    }

    // Update agent status
    db.prepare(`
      UPDATE trading_agents
      SET status = ?
      WHERE id = ?
    `).run(nextStatus, agentId);

    console.log(`🎓 Agent ${agentId} graduated from ${currentStatus} to ${nextStatus}`);

    await this.activityLog.log({
      agent_id: agentId,
      activity_type: 'AGENT_GRADUATED',
      description: `Agent graduated from ${currentStatus} to ${nextStatus}${force ? ' (forced)' : ''}`,
      data: JSON.stringify({
        previous_status: currentStatus,
        new_status: nextStatus,
        forced: force
      })
    });

    return nextStatus;
  }

  /**
   * Demote an agent back to learning status
   */
  async demote(agentId: string, reason: string): Promise<void> {
    const db = getDatabase();

    const agent = db.prepare(`
      SELECT status
      FROM trading_agents
      WHERE id = ?
    `).get(agentId) as any;

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.status === 'learning') {
      throw new Error('Agent is already in learning status');
    }

    const previousStatus = agent.status;

    // Update to learning status
    db.prepare(`
      UPDATE trading_agents
      SET status = 'learning'
      WHERE id = ?
    `).run(agentId);

    console.log(`📉 Agent ${agentId} demoted from ${previousStatus} to learning`);

    await this.activityLog.log({
      agent_id: agentId,
      activity_type: 'AGENT_DEMOTED',
      description: `Agent demoted from ${previousStatus} to learning. Reason: ${reason}`,
      data: JSON.stringify({
        previous_status: previousStatus,
        reason
      })
    });
  }

  /**
   * Get graduation criteria based on current status
   */
  private getGraduationCriteria(currentStatus: string): GraduationCriteria {
    switch (currentStatus) {
      case 'learning':
        // Criteria for learning → paper_trading
        return {
          min_iterations: 20,
          min_win_rate: 0.60,
          min_sharpe_ratio: 2.0,
          min_total_return: 0.05,
          min_signals: 50,
          consistency_window: 5,
          min_consistent_win_rate: 0.55
        };

      case 'paper_trading':
        // Criteria for paper_trading → live_trading (very strict)
        return {
          min_iterations: 50,
          min_win_rate: 0.65,
          min_sharpe_ratio: 2.5,
          min_total_return: 0.10,
          min_signals: 200,
          consistency_window: 10,
          min_consistent_win_rate: 0.60
        };

      default:
        // Already at max level or unknown status
        return {
          min_iterations: Number.MAX_VALUE,
          min_win_rate: 1.0,
          min_sharpe_ratio: 10.0,
          min_total_return: 1.0,
          min_signals: Number.MAX_VALUE,
          consistency_window: 100,
          min_consistent_win_rate: 1.0
        };
    }
  }

  /**
   * Get next status level
   */
  private getNextStatus(currentStatus: string): string {
    switch (currentStatus) {
      case 'learning':
        return 'paper_trading';
      case 'paper_trading':
        return 'live_trading';
      case 'live_trading':
        return 'live_trading'; // Already at max
      case 'paused':
        return 'paused'; // Can't graduate from paused
      default:
        return currentStatus;
    }
  }
}
