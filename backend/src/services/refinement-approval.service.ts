/**
 * Refinement Approval Service
 * Automatically evaluates and applies refinements based on configured thresholds
 */

import { getDatabase } from '../database/db';
import { LearningIterationService } from './learning-iteration.service';
import { AgentActivityLogService } from './agent-activity-log.service';

export interface ApprovalThresholds {
  min_win_rate: number;        // e.g., 0.55 (55%)
  min_sharpe_ratio: number;     // e.g., 1.5
  min_signals: number;          // e.g., 10
  min_total_return: number;     // e.g., 0.02 (2%)
  require_improvement: boolean; // Must beat current version
}

export interface ApprovalResult {
  approved: boolean;
  reason: string;
  meetsThresholds: boolean;
  improvements: {
    win_rate: number | null;
    sharpe_ratio: number | null;
    total_return: number | null;
  };
}

export class RefinementApprovalService {
  private learningService: LearningIterationService | null = null;
  private activityLog: AgentActivityLogService;

  constructor() {
    // Don't instantiate LearningIterationService here to avoid circular dependency
    // It will be lazy-loaded when needed
    this.activityLog = new AgentActivityLogService();
  }

  /**
   * Lazy-load the learning service to avoid circular dependency
   */
  private getLearningService(): LearningIterationService {
    if (!this.learningService) {
      this.learningService = new LearningIterationService();
    }
    return this.learningService;
  }

  /**
   * Evaluate an iteration and automatically apply refinements if approved
   */
  async evaluateAndApply(agentId: string, iterationId: string): Promise<ApprovalResult> {
    const db = getDatabase();

    // Get agent's approval settings
    const agent = db.prepare(`
      SELECT auto_approve_enabled, approval_thresholds
      FROM trading_agents
      WHERE id = ?
    `).get(agentId) as any;

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agent.auto_approve_enabled) {
      return {
        approved: false,
        reason: 'Auto-approval not enabled for this agent',
        meetsThresholds: false,
        improvements: { win_rate: null, sharpe_ratio: null, total_return: null }
      };
    }

    // Parse thresholds
    const thresholds: ApprovalThresholds = agent.approval_thresholds
      ? JSON.parse(agent.approval_thresholds)
      : this.getDefaultThresholds();

    // Get iteration results
    const iteration = db.prepare(`
      SELECT *
      FROM agent_iterations
      WHERE id = ? AND learning_agent_id = ?
    `).get(iterationId, agentId) as any;

    if (!iteration) {
      throw new Error(`Iteration not found: ${iterationId}`);
    }

    // Evaluate against thresholds
    const result = await this.evaluate(agentId, iteration, thresholds);

    // If approved, automatically apply refinements
    if (result.approved) {
      try {
        await this.getLearningService().applyRefinements({
          learning_agent_id: agentId,
          iteration_id: iterationId,
          selected_refinements: 'all', // Apply all suggested refinements
          version_notes: `Auto-approved: ${result.reason}`
        });

        await this.activityLog.log({
          learning_agent_id: agentId,
          activity_type: 'REFINEMENT_AUTO_APPROVED',
          description: `Refinements automatically approved and applied. ${result.reason}`,
          data: JSON.stringify({
            iteration_id: iterationId,
            thresholds,
            metrics: {
              win_rate: iteration.win_rate,
              sharpe_ratio: iteration.sharpe_ratio,
              total_return: iteration.total_return,
              signals: iteration.signals_found
            }
          })
        });

        console.log(`✓ Auto-approved and applied refinements for agent ${agentId}, iteration ${iteration.iteration_number}`);
      } catch (error: any) {
        console.error(`Failed to apply auto-approved refinements:`, error.message);

        await this.activityLog.log({
          learning_agent_id: agentId,
          activity_type: 'REFINEMENT_AUTO_APPROVAL_FAILED',
          description: `Failed to apply auto-approved refinements: ${error.message}`,
          data: JSON.stringify({ iteration_id: iterationId, error: error.message })
        });
      }
    } else {
      await this.activityLog.log({
        learning_agent_id: agentId,
        activity_type: 'REFINEMENT_AUTO_REJECTED',
        description: `Refinements rejected by auto-approval. ${result.reason}`,
        data: JSON.stringify({
          iteration_id: iterationId,
          thresholds,
          metrics: {
            win_rate: iteration.win_rate,
            sharpe_ratio: iteration.sharpe_ratio,
            total_return: iteration.total_return,
            signals: iteration.signals_found
          }
        })
      });
    }

    return result;
  }

  /**
   * Evaluate iteration against thresholds
   */
  private async evaluate(
    agentId: string,
    iteration: any,
    thresholds: ApprovalThresholds
  ): Promise<ApprovalResult> {
    const db = getDatabase();

    // Check basic thresholds
    const failedChecks: string[] = [];

    if (iteration.win_rate < thresholds.min_win_rate) {
      failedChecks.push(`Win rate ${(iteration.win_rate * 100).toFixed(1)}% below threshold ${(thresholds.min_win_rate * 100).toFixed(1)}%`);
    }

    if (iteration.sharpe_ratio < thresholds.min_sharpe_ratio) {
      failedChecks.push(`Sharpe ratio ${iteration.sharpe_ratio.toFixed(2)} below threshold ${thresholds.min_sharpe_ratio.toFixed(2)}`);
    }

    if (iteration.total_return < thresholds.min_total_return) {
      failedChecks.push(`Total return ${(iteration.total_return * 100).toFixed(2)}% below threshold ${(thresholds.min_total_return * 100).toFixed(2)}%`);
    }

    if (iteration.signals_found < thresholds.min_signals) {
      failedChecks.push(`Signals found ${iteration.signals_found} below threshold ${thresholds.min_signals}`);
    }

    if (failedChecks.length > 0) {
      return {
        approved: false,
        reason: `Failed threshold checks: ${failedChecks.join('; ')}`,
        meetsThresholds: false,
        improvements: { win_rate: null, sharpe_ratio: null, total_return: null }
      };
    }

    // Check improvement requirement if enabled
    if (thresholds.require_improvement) {
      const currentStrategy = db.prepare(`
        SELECT backtest_win_rate, backtest_sharpe, backtest_total_return
        FROM agent_strategies
        WHERE learning_agent_id = ? AND is_current_version = 1
      `).get(agentId) as any;

      if (currentStrategy) {
        const improvements = {
          win_rate: iteration.win_rate - currentStrategy.backtest_win_rate,
          sharpe_ratio: iteration.sharpe_ratio - currentStrategy.backtest_sharpe,
          total_return: iteration.total_return - currentStrategy.backtest_total_return
        };

        // Must show improvement in at least 2 out of 3 metrics
        const positiveImprovements = [
          improvements.win_rate > 0,
          improvements.sharpe_ratio > 0,
          improvements.total_return > 0
        ].filter(Boolean).length;

        if (positiveImprovements < 2) {
          return {
            approved: false,
            reason: `Insufficient improvement over current version (improved only ${positiveImprovements}/3 metrics)`,
            meetsThresholds: true,
            improvements
          };
        }

        return {
          approved: true,
          reason: `Meets all thresholds and shows improvement in ${positiveImprovements}/3 metrics`,
          meetsThresholds: true,
          improvements
        };
      }
    }

    // No current version or improvement not required
    return {
      approved: true,
      reason: 'Meets all threshold requirements',
      meetsThresholds: true,
      improvements: { win_rate: null, sharpe_ratio: null, total_return: null }
    };
  }

  /**
   * Get default approval thresholds
   */
  private getDefaultThresholds(): ApprovalThresholds {
    return {
      min_win_rate: 0.55,         // 55%
      min_sharpe_ratio: 1.5,
      min_signals: 10,
      min_total_return: 0.02,     // 2%
      require_improvement: true
    };
  }

  /**
   * Update approval thresholds for an agent
   */
  async updateThresholds(agentId: string, thresholds: Partial<ApprovalThresholds>): Promise<void> {
    const db = getDatabase();

    // Get current thresholds
    const agent = db.prepare(`
      SELECT approval_thresholds
      FROM trading_agents
      WHERE id = ?
    `).get(agentId) as any;

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const currentThresholds: ApprovalThresholds = agent.approval_thresholds
      ? JSON.parse(agent.approval_thresholds)
      : this.getDefaultThresholds();

    // Merge with new thresholds
    const updated = { ...currentThresholds, ...thresholds };

    // Save
    db.prepare(`
      UPDATE trading_agents
      SET approval_thresholds = ?
      WHERE id = ?
    `).run(JSON.stringify(updated), agentId);

    await this.activityLog.log({
      learning_agent_id: agentId,
      activity_type: 'APPROVAL_THRESHOLDS_UPDATED',
      description: 'Auto-approval thresholds updated',
      data: JSON.stringify({ old: currentThresholds, new: updated })
    });
  }
}
