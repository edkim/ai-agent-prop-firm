/**
 * Agent Activity Log Service
 * Manages the agent_activity_log table for audit trail and debugging
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/db';

export interface ActivityLogEntry {
  agent_id: string;
  activity_type: string;
  ticker?: string;
  description: string;
  data?: string; // JSON string
}

export interface ActivityLog extends ActivityLogEntry {
  id: string;
  timestamp: string;
}

export class AgentActivityLogService {
  /**
   * Log an activity for an agent
   */
  async log(entry: ActivityLogEntry): Promise<void> {
    const db = getDatabase();

    db.prepare(`
      INSERT INTO agent_activity_log (id, agent_id, activity_type, ticker, description, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      entry.agent_id,
      entry.activity_type,
      entry.ticker || null,
      entry.description,
      entry.data || null,
      new Date().toISOString()
    );
  }

  /**
   * Get activity logs for an agent
   */
  getAgentLogs(agentId: string, limit: number = 100): ActivityLog[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT *
      FROM agent_activity_log
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(agentId, limit) as ActivityLog[];
  }

  /**
   * Get logs by activity type
   */
  getLogsByType(activityType: string, limit: number = 100): ActivityLog[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT *
      FROM agent_activity_log
      WHERE activity_type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(activityType, limit) as ActivityLog[];
  }

  /**
   * Get recent activity across all agents
   */
  getRecentActivity(limit: number = 50): ActivityLog[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT *
      FROM agent_activity_log
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as ActivityLog[];
  }

  /**
   * Delete old logs (cleanup)
   */
  deleteOldLogs(daysToKeep: number = 30): number {
    const db = getDatabase();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = db.prepare(`
      DELETE FROM agent_activity_log
      WHERE timestamp < ?
    `).run(cutoffDate.toISOString());

    return result.changes;
  }
}
