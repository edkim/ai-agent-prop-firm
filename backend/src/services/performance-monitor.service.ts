/**
 * Performance Monitor Service
 * Tracks agent performance over time and generates alerts for significant events
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/db';
import { AgentActivityLogService } from './agent-activity-log.service';

export type AlertType =
  | 'PERFORMANCE_DEGRADATION'
  | 'CONVERGENCE'
  | 'GRADUATION_READY'
  | 'ERROR'
  | 'MILESTONE';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  agent_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: string; // JSON
  acknowledged: number;
  created_at: string;
}

export class PerformanceMonitorService {
  private activityLog: AgentActivityLogService;

  constructor() {
    this.activityLog = new AgentActivityLogService();
  }

  /**
   * Analyze performance after an iteration and generate alerts
   */
  async analyzeIteration(agentId: string, iterationId: string): Promise<Alert[]> {
    const db = getDatabase();

    const alerts: Alert[] = [];

    // Get current iteration
    const iteration = db.prepare(`
      SELECT *
      FROM agent_iterations
      WHERE id = ? AND agent_id = ?
    `).get(iterationId, agentId) as any;

    if (!iteration) {
      return alerts;
    }

    // Get recent iterations for trend analysis
    const recentIterations = db.prepare(`
      SELECT win_rate, sharpe_ratio, total_return, signals_found
      FROM agent_iterations
      WHERE agent_id = ?
      ORDER BY iteration_number DESC
      LIMIT 5
    `).all(agentId) as any[];

    // 1. Check for performance degradation
    if (recentIterations.length >= 3) {
      const degradationAlert = this.checkPerformanceDegradation(agentId, iteration, recentIterations);
      if (degradationAlert) alerts.push(degradationAlert);
    }

    // 2. Check for convergence
    if (recentIterations.length >= 3) {
      const convergenceAlert = this.checkConvergence(agentId, iteration, recentIterations);
      if (convergenceAlert) alerts.push(convergenceAlert);
    }

    // 3. Check for milestones
    const milestoneAlert = this.checkMilestones(agentId, iteration);
    if (milestoneAlert) alerts.push(milestoneAlert);

    // 4. Check graduation readiness
    const graduationAlert = await this.checkGraduationReadiness(agentId);
    if (graduationAlert) alerts.push(graduationAlert);

    // Save alerts to database
    for (const alert of alerts) {
      await this.createAlert(alert);
    }

    return alerts;
  }

  /**
   * Check for performance degradation
   */
  private checkPerformanceDegradation(
    agentId: string,
    current: any,
    recent: any[]
  ): Alert | null {
    // Calculate average of previous 3 iterations (excluding current)
    const previous = recent.slice(1, 4);
    if (previous.length < 3) return null;

    const avgWinRate = previous.reduce((sum, it) => sum + it.win_rate, 0) / previous.length;
    const avgSharpe = previous.reduce((sum, it) => sum + it.sharpe_ratio, 0) / previous.length;
    const avgReturn = previous.reduce((sum, it) => sum + it.total_return, 0) / previous.length;

    // Check if current is significantly worse (>15% drop in win rate OR >20% drop in Sharpe)
    const winRateDrop = (avgWinRate - current.win_rate) / avgWinRate;
    const sharpeDrop = avgSharpe > 0 ? (avgSharpe - current.sharpe_ratio) / avgSharpe : 0;

    if (winRateDrop > 0.15 || sharpeDrop > 0.20) {
      return {
        id: uuidv4(),
        agent_id: agentId,
        alert_type: 'PERFORMANCE_DEGRADATION',
        severity: 'WARNING',
        message: `Performance has degraded significantly from recent average`,
        details: JSON.stringify({
          current: {
            win_rate: current.win_rate,
            sharpe_ratio: current.sharpe_ratio,
            total_return: current.total_return
          },
          recent_avg: {
            win_rate: avgWinRate,
            sharpe_ratio: avgSharpe,
            total_return: avgReturn
          },
          degradation: {
            win_rate_drop: (winRateDrop * 100).toFixed(1) + '%',
            sharpe_drop: (sharpeDrop * 100).toFixed(1) + '%'
          }
        }),
        acknowledged: 0,
        created_at: new Date().toISOString()
      };
    }

    return null;
  }

  /**
   * Check for convergence (no significant improvement)
   */
  private checkConvergence(
    agentId: string,
    current: any,
    recent: any[]
  ): Alert | null {
    // Look at last 3 iterations
    if (recent.length < 3) return null;

    const last3 = recent.slice(0, 3);

    // Calculate coefficient of variation for key metrics
    const winRates = last3.map(it => it.win_rate);
    const sharpes = last3.map(it => it.sharpe_ratio);

    const winRateCV = this.coefficientOfVariation(winRates);
    const sharpeCV = this.coefficientOfVariation(sharpes);

    // If CV is very low (<5%), performance has plateaued
    if (winRateCV < 0.05 && sharpeCV < 0.05) {
      return {
        id: uuidv4(),
        agent_id: agentId,
        alert_type: 'CONVERGENCE',
        severity: 'INFO',
        message: 'Agent performance has converged - minimal improvement in recent iterations',
        details: JSON.stringify({
          last_3_iterations: last3.map((it, idx) => ({
            iteration: recent.length - idx,
            win_rate: it.win_rate,
            sharpe_ratio: it.sharpe_ratio
          })),
          variation: {
            win_rate_cv: (winRateCV * 100).toFixed(2) + '%',
            sharpe_cv: (sharpeCV * 100).toFixed(2) + '%'
          }
        }),
        acknowledged: 0,
        created_at: new Date().toISOString()
      };
    }

    return null;
  }

  /**
   * Check for milestones
   */
  private checkMilestones(agentId: string, iteration: any): Alert | null {
    // Milestone conditions
    const milestones: { condition: boolean; message: string }[] = [
      {
        condition: iteration.iteration_number === 10,
        message: '10 learning iterations completed'
      },
      {
        condition: iteration.iteration_number === 50,
        message: '50 learning iterations completed'
      },
      {
        condition: iteration.iteration_number === 100,
        message: '100 learning iterations completed'
      },
      {
        condition: iteration.win_rate >= 0.70 && iteration.sharpe_ratio >= 2.0,
        message: 'Exceptional performance achieved: 70%+ win rate with 2.0+ Sharpe ratio'
      },
      {
        condition: iteration.signals_found >= 100,
        message: '100+ signals found in single iteration'
      }
    ];

    const achieved = milestones.find(m => m.condition);

    if (achieved) {
      return {
        id: uuidv4(),
        agent_id: agentId,
        alert_type: 'MILESTONE',
        severity: 'INFO',
        message: achieved.message,
        details: JSON.stringify({
          iteration_number: iteration.iteration_number,
          metrics: {
            win_rate: iteration.win_rate,
            sharpe_ratio: iteration.sharpe_ratio,
            total_return: iteration.total_return,
            signals: iteration.signals_found
          }
        }),
        acknowledged: 0,
        created_at: new Date().toISOString()
      };
    }

    return null;
  }

  /**
   * Check if agent is ready for graduation to paper trading
   */
  private async checkGraduationReadiness(agentId: string): Promise<Alert | null> {
    const db = getDatabase();

    // Get agent status
    const agent = db.prepare(`
      SELECT status
      FROM trading_agents
      WHERE id = ?
    `).get(agentId) as any;

    // Only check if still in learning mode
    if (agent?.status !== 'learning') return null;

    // Get iteration stats
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

    // Get recent performance (last 5 iterations)
    const recentIterations = db.prepare(`
      SELECT win_rate, sharpe_ratio, total_return
      FROM agent_iterations
      WHERE agent_id = ?
      ORDER BY iteration_number DESC
      LIMIT 5
    `).all(agentId) as any[];

    // Graduation criteria (strict requirements)
    const meetsIterationCount = stats.total_iterations >= 20;
    const meetsWinRate = stats.avg_win_rate >= 0.60;
    const meetsSharpe = stats.avg_sharpe >= 2.0;
    const meetsReturn = stats.avg_return >= 0.05;
    const meetsSignals = stats.total_signals >= 50;

    // Check consistency (last 5 iterations)
    const recentWinRates = recentIterations.map(it => it.win_rate);
    const consistentPerformance = recentWinRates.every(wr => wr >= 0.55);

    const allCriteriaMet = meetsIterationCount && meetsWinRate && meetsSharpe &&
                            meetsReturn && meetsSignals && consistentPerformance;

    if (allCriteriaMet) {
      return {
        id: uuidv4(),
        agent_id: agentId,
        alert_type: 'GRADUATION_READY',
        severity: 'INFO',
        message: 'Agent is ready for graduation to paper trading',
        details: JSON.stringify({
          criteria_met: {
            iterations: `${stats.total_iterations} >= 20`,
            avg_win_rate: `${(stats.avg_win_rate * 100).toFixed(1)}% >= 60%`,
            avg_sharpe: `${stats.avg_sharpe.toFixed(2)} >= 2.0`,
            avg_return: `${(stats.avg_return * 100).toFixed(2)}% >= 5%`,
            total_signals: `${stats.total_signals} >= 50`,
            consistent_performance: 'Yes (last 5 iterations all >55% win rate)'
          }
        }),
        acknowledged: 0,
        created_at: new Date().toISOString()
      };
    }

    return null;
  }

  /**
   * Create an alert in the database
   */
  private async createAlert(alert: Alert): Promise<void> {
    const db = getDatabase();

    // Check if similar alert already exists and is unacknowledged
    const existing = db.prepare(`
      SELECT id
      FROM agent_alerts
      WHERE agent_id = ?
      AND alert_type = ?
      AND acknowledged = 0
      AND created_at > datetime('now', '-24 hours')
    `).get(alert.agent_id, alert.alert_type);

    if (existing) {
      console.log(`⚠ Skipping duplicate alert: ${alert.alert_type} for agent ${alert.agent_id}`);
      return;
    }

    // Insert alert
    db.prepare(`
      INSERT INTO agent_alerts (id, agent_id, alert_type, severity, message, details, acknowledged, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.id,
      alert.agent_id,
      alert.alert_type,
      alert.severity,
      alert.message,
      alert.details || null,
      alert.acknowledged,
      alert.created_at
    );

    console.log(`🔔 Alert created: [${alert.severity}] ${alert.alert_type} for agent ${alert.agent_id}`);

    // Log to activity log
    await this.activityLog.log({
      agent_id: alert.agent_id,
      activity_type: `ALERT_${alert.alert_type}`,
      description: alert.message,
      data: alert.details
    });
  }

  /**
   * Get alerts for an agent
   */
  getAgentAlerts(agentId: string, includeAcknowledged: boolean = false): Alert[] {
    const db = getDatabase();

    const query = includeAcknowledged
      ? `SELECT * FROM agent_alerts WHERE agent_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM agent_alerts WHERE agent_id = ? AND acknowledged = 0 ORDER BY created_at DESC`;

    return db.prepare(query).all(agentId) as Alert[];
  }

  /**
   * Get all unacknowledged alerts
   */
  getAllUnacknowledgedAlerts(): Alert[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT *
      FROM agent_alerts
      WHERE acknowledged = 0
      ORDER BY severity DESC, created_at DESC
    `).all() as Alert[];
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const db = getDatabase();

    db.prepare(`
      UPDATE agent_alerts
      SET acknowledged = 1
      WHERE id = ?
    `).run(alertId);

    console.log(`✓ Alert acknowledged: ${alertId}`);
  }

  /**
   * Delete an alert
   */
  deleteAlert(alertId: string): void {
    const db = getDatabase();

    db.prepare(`
      DELETE FROM agent_alerts
      WHERE id = ?
    `).run(alertId);

    console.log(`✓ Alert deleted: ${alertId}`);
  }

  /**
   * Calculate coefficient of variation
   */
  private coefficientOfVariation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    if (mean === 0) return 0;

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return stdDev / mean;
  }
}
