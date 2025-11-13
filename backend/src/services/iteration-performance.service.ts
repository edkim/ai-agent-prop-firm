import { getDatabase } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export interface PerformanceMetrics {
  scanner_generation_time_ms?: number;
  execution_generation_time_ms?: number;
  scan_execution_time_ms?: number;
  backtest_execution_time_ms?: number;
  analysis_time_ms?: number;
  total_time_ms?: number;

  scanner_generation_tokens?: number;
  execution_generation_tokens?: number;
  analysis_tokens?: number;
  total_tokens?: number;

  scanner_model?: string;
  execution_model?: string;
  analysis_model?: string;
}

export type IterationPhase =
  | 'scanner_generation'
  | 'execution_generation'
  | 'scan_execution'
  | 'backtest_execution'
  | 'analysis'
  | 'completed'
  | 'failed';

export class IterationPerformanceService {
  /**
   * Initialize a performance tracking record for a new iteration
   */
  createPerformanceRecord(
    iterationId: string,
    agentId: string,
    iterationNumber: number
  ): string {
    const db = getDatabase();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO iteration_performance (
        id,
        iteration_id,
        learning_agent_id,
        iteration_number,
        current_phase,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      iterationId,
      agentId,
      iterationNumber,
      'scanner_generation',
      new Date().toISOString()
    );

    return id;
  }

  /**
   * Update the current phase of an iteration
   */
  updatePhase(iterationId: string, phase: IterationPhase, errorMessage?: string) {
    const db = getDatabase();

    db.prepare(`
      UPDATE iteration_performance
      SET current_phase = ?,
          error_message = ?,
          completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END
      WHERE iteration_id = ?
    `).run(
      phase,
      errorMessage || null,
      phase,
      new Date().toISOString(),
      iterationId
    );
  }

  /**
   * Update performance metrics for a specific phase
   */
  updateMetrics(iterationId: string, metrics: Partial<PerformanceMetrics>) {
    const db = getDatabase();

    // Build dynamic SQL for the metrics that are provided
    const updates: string[] = [];
    const values: any[] = [];

    if (metrics.scanner_generation_time_ms !== undefined) {
      updates.push('scanner_generation_time_ms = ?');
      values.push(metrics.scanner_generation_time_ms);
    }
    if (metrics.execution_generation_time_ms !== undefined) {
      updates.push('execution_generation_time_ms = ?');
      values.push(metrics.execution_generation_time_ms);
    }
    if (metrics.scan_execution_time_ms !== undefined) {
      updates.push('scan_execution_time_ms = ?');
      values.push(metrics.scan_execution_time_ms);
    }
    if (metrics.backtest_execution_time_ms !== undefined) {
      updates.push('backtest_execution_time_ms = ?');
      values.push(metrics.backtest_execution_time_ms);
    }
    if (metrics.analysis_time_ms !== undefined) {
      updates.push('analysis_time_ms = ?');
      values.push(metrics.analysis_time_ms);
    }
    if (metrics.scanner_generation_tokens !== undefined) {
      updates.push('scanner_generation_tokens = ?');
      values.push(metrics.scanner_generation_tokens);
    }
    if (metrics.execution_generation_tokens !== undefined) {
      updates.push('execution_generation_tokens = ?');
      values.push(metrics.execution_generation_tokens);
    }
    if (metrics.analysis_tokens !== undefined) {
      updates.push('analysis_tokens = ?');
      values.push(metrics.analysis_tokens);
    }
    if (metrics.scanner_model) {
      updates.push('scanner_model = ?');
      values.push(metrics.scanner_model);
    }
    if (metrics.execution_model) {
      updates.push('execution_model = ?');
      values.push(metrics.execution_model);
    }
    if (metrics.analysis_model) {
      updates.push('analysis_model = ?');
      values.push(metrics.analysis_model);
    }

    if (updates.length === 0) return;

    values.push(iterationId);

    db.prepare(`
      UPDATE iteration_performance
      SET ${updates.join(', ')}
      WHERE iteration_id = ?
    `).run(...values);

    // Recalculate totals
    this.recalculateTotals(iterationId);
  }

  /**
   * Recalculate total time and tokens
   */
  private recalculateTotals(iterationId: string) {
    const db = getDatabase();

    db.prepare(`
      UPDATE iteration_performance
      SET
        total_time_ms = COALESCE(scanner_generation_time_ms, 0) +
                       COALESCE(execution_generation_time_ms, 0) +
                       COALESCE(scan_execution_time_ms, 0) +
                       COALESCE(backtest_execution_time_ms, 0) +
                       COALESCE(analysis_time_ms, 0),
        total_tokens = COALESCE(scanner_generation_tokens, 0) +
                      COALESCE(execution_generation_tokens, 0) +
                      COALESCE(analysis_tokens, 0)
      WHERE iteration_id = ?
    `).run(iterationId);
  }

  /**
   * Get performance metrics for an iteration
   */
  getPerformanceMetrics(iterationId: string): PerformanceMetrics & { current_phase: IterationPhase } | null {
    const db = getDatabase();

    const result = db.prepare(`
      SELECT * FROM iteration_performance WHERE iteration_id = ?
    `).get(iterationId) as any;

    return result || null;
  }

  /**
   * Get performance metrics for all iterations of an agent
   */
  getAgentPerformanceHistory(agentId: string) {
    const db = getDatabase();

    return db.prepare(`
      SELECT ip.*, ai.iteration_number, ai.git_commit_hash, ai.created_at as iteration_created_at
      FROM iteration_performance ip
      JOIN agent_iterations ai ON ip.iteration_id = ai.id
      WHERE ip.learning_agent_id = ?
      ORDER BY ai.iteration_number DESC
    `).all(agentId);
  }

  /**
   * Check if there's an iteration currently in progress for an agent
   */
  getInProgressIteration(agentId: string) {
    const db = getDatabase();

    return db.prepare(`
      SELECT ip.*, ai.iteration_number
      FROM iteration_performance ip
      JOIN agent_iterations ai ON ip.iteration_id = ai.id
      WHERE ip.learning_agent_id = ?
        AND ip.current_phase NOT IN ('completed', 'failed')
      ORDER BY ip.created_at DESC
      LIMIT 1
    `).get(agentId);
  }
}

export const iterationPerformanceService = new IterationPerformanceService();
