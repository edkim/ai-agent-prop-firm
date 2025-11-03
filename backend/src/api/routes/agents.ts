/**
 * Agent API Routes
 * Endpoints for multi-agent laboratory
 */

import express, { Request, Response } from 'express';
import { AgentManagementService } from '../../services/agent-management.service';
import { AgentLearningService } from '../../services/agent-learning.service';
import { SchedulerService } from '../../services/scheduler.service';
import { RefinementApprovalService } from '../../services/refinement-approval.service';
import { ContinuousLearningService } from '../../services/continuous-learning.service';
import { PerformanceMonitorService } from '../../services/performance-monitor.service';
import { GraduationService } from '../../services/graduation.service';
import { AgentActivityLogService } from '../../services/agent-activity-log.service';
import { getDatabase } from '../../database/db';
import {
  CreateAgentRequest,
  StartIterationRequest,
  ApplyRefinementsRequest,
} from '../../types/agent.types';

const router = express.Router();
const agentMgmt = new AgentManagementService();
const agentLearning = new AgentLearningService();
const scheduler = SchedulerService.getInstance();
const refinementApproval = new RefinementApprovalService();
const continuousLearning = ContinuousLearningService.getInstance();
const performanceMonitor = new PerformanceMonitorService();
const graduation = new GraduationService();
const activityLog = new AgentActivityLogService();

/**
 * Helper function to format expert analysis JSON for display
 */
function formatExpertAnalysis(analysisJson: string | null): string {
  if (!analysisJson) return 'No analysis available';

  try {
    const analysis = JSON.parse(analysisJson);

    let formatted = '';

    // Summary
    if (analysis.summary) {
      formatted += `SUMMARY\n${analysis.summary}\n\n`;
    }

    // Working Elements
    if (analysis.working_elements && analysis.working_elements.length > 0) {
      formatted += 'WORKING ELEMENTS\n';
      analysis.working_elements.forEach((element: string) => {
        formatted += `• ${element}\n`;
      });
      formatted += '\n';
    }

    // Failure Points
    if (analysis.failure_points && analysis.failure_points.length > 0) {
      formatted += 'FAILURE POINTS\n';
      analysis.failure_points.forEach((point: string) => {
        formatted += `• ${point}\n`;
      });
      formatted += '\n';
    }

    // Strategic Insights
    if (analysis.strategic_insights && analysis.strategic_insights.length > 0) {
      formatted += 'STRATEGIC INSIGHTS\n';
      analysis.strategic_insights.forEach((insight: string) => {
        formatted += `• ${insight}\n`;
      });
      formatted += '\n';
    }

    // Parameter Recommendations
    if (analysis.parameter_recommendations && analysis.parameter_recommendations.length > 0) {
      formatted += 'PARAMETER RECOMMENDATIONS\n';
      analysis.parameter_recommendations.forEach((rec: any) => {
        formatted += `• ${rec.parameter}: ${rec.currentValue} → ${rec.recommendedValue}\n`;
        formatted += `  Reason: ${rec.expectedImprovement}\n`;
      });
      formatted += '\n';
    }

    // Trade Quality Assessment
    if (analysis.trade_quality_assessment) {
      formatted += `TRADE QUALITY\n${analysis.trade_quality_assessment}\n\n`;
    }

    // Risk Assessment
    if (analysis.risk_assessment) {
      formatted += `RISK ASSESSMENT\n${analysis.risk_assessment}\n\n`;
    }

    // Market Conditions
    if (analysis.market_condition_notes) {
      formatted += `MARKET CONDITIONS\n${analysis.market_condition_notes}\n\n`;
    }

    // Missing Context
    if (analysis.missing_context && analysis.missing_context.length > 0) {
      formatted += 'MISSING DATA\n';
      analysis.missing_context.forEach((item: string) => {
        formatted += `• ${item}\n`;
      });
      formatted += '\n';
    }

    return formatted.trim();
  } catch (error) {
    console.error('Error formatting expert analysis:', error);
    return analysisJson; // Return raw JSON if parsing fails
  }
}

// ========================================
// Agent CRUD Routes
// ========================================

/**
 * POST /api/agents/create
 * Create a new trading agent from natural language instructions
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const request: CreateAgentRequest = req.body;

    if (!request.instructions) {
      return res.status(400).json({
        success: false,
        error: 'Instructions are required',
      });
    }

    const result = await agentMgmt.createAgent(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error creating agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents
 * List all agents
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const agents = await agentMgmt.listAgents(activeOnly);

    res.json({
      success: true,
      agents,
    });
  } catch (error: any) {
    console.error('Error listing agents:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:id
 * Get agent by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const agent = await agentMgmt.getAgent(req.params.id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    res.json({
      success: true,
      agent,
    });
  } catch (error: any) {
    console.error('Error getting agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/agents/:id
 * Update agent
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const agent = await agentMgmt.updateAgent(req.params.id, updates);

    res.json({
      success: true,
      agent,
    });
  } catch (error: any) {
    console.error('Error updating agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete agent
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await agentMgmt.deleteAgent(req.params.id);

    res.json({
      success: true,
      message: 'Agent deleted',
    });
  } catch (error: any) {
    console.error('Error deleting agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// Learning Iteration Routes
// ========================================

/**
 * POST /api/agents/:id/iterations/start
 * Start a new learning iteration for an agent
 */
router.post('/:id/iterations/start', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id;
    const result = await agentLearning.runIteration(agentId);

    res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Error running iteration:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:id/iterations
 * Get all iterations for an agent
 */
router.get('/:id/iterations', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;

    const rows = db.prepare(`
      SELECT * FROM agent_iterations
      WHERE agent_id = ?
      ORDER BY iteration_number DESC
    `).all(agentId);

    // Parse JSON fields and format expert_analysis
    const iterations = rows.map((row: any) => ({
      ...row,
      backtest_results: row.backtest_results ? JSON.parse(row.backtest_results) : null,
      refinements_suggested: row.refinements_suggested ? JSON.parse(row.refinements_suggested) : [],
      expert_analysis: formatExpertAnalysis(row.expert_analysis),
    }));

    res.json({
      success: true,
      iterations,
    });
  } catch (error: any) {
    console.error('Error getting iterations:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:id/iterations/:iteration_id
 * Get specific iteration
 */
router.get('/:id/iterations/:iteration_id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;
    const iterationId = req.params.iteration_id;

    const row: any = db.prepare(`
      SELECT * FROM agent_iterations
      WHERE agent_id = ? AND id = ?
    `).get(agentId, iterationId);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Iteration not found',
      });
    }

    // Parse JSON fields and format expert_analysis
    const iteration = {
      ...row,
      backtest_results: row.backtest_results ? JSON.parse(row.backtest_results) : null,
      refinements_suggested: row.refinements_suggested ? JSON.parse(row.refinements_suggested) : [],
      expert_analysis: formatExpertAnalysis(row.expert_analysis),
    };

    res.json({
      success: true,
      iteration,
    });
  } catch (error: any) {
    console.error('Error getting iteration:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/iterations/:iteration_id/apply-refinements
 * Apply refinements from an iteration
 */
router.post('/:id/iterations/:iteration_id/apply-refinements', async (req: Request, res: Response) => {
  try {
    const request: ApplyRefinementsRequest = {
      agent_id: req.params.id,
      iteration_id: req.params.iteration_id,
      approved: req.body.approved,
    };

    const result = await agentLearning.applyRefinements(request);

    res.json(result);
  } catch (error: any) {
    console.error('Error applying refinements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// Strategy Routes
// ========================================

/**
 * GET /api/agents/:id/strategies
 * Get all strategy versions for an agent
 */
router.get('/:id/strategies', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;

    const strategies = db.prepare(`
      SELECT * FROM agent_strategies
      WHERE agent_id = ?
      ORDER BY created_at DESC
    `).all(agentId);

    res.json({
      success: true,
      strategies,
    });
  } catch (error: any) {
    console.error('Error getting strategies:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:id/strategies/:version
 * Get specific strategy version
 */
router.get('/:id/strategies/:version', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;
    const version = req.params.version;

    const strategy = db.prepare(`
      SELECT * FROM agent_strategies
      WHERE agent_id = ? AND version = ?
    `).get(agentId, version);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Strategy version not found',
      });
    }

    res.json({
      success: true,
      strategy,
    });
  } catch (error: any) {
    console.error('Error getting strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// Knowledge Base Routes
// ========================================

/**
 * GET /api/agents/:id/knowledge
 * Get agent's accumulated knowledge
 */
router.get('/:id/knowledge', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;

    // Optional filters from query params
    const knowledgeType = req.query.type as string | undefined;
    const patternType = req.query.pattern as string | undefined;

    let query = `SELECT * FROM agent_knowledge WHERE agent_id = ?`;
    const params: any[] = [agentId];

    if (knowledgeType) {
      query += ` AND knowledge_type = ?`;
      params.push(knowledgeType);
    }

    if (patternType) {
      query += ` AND pattern_type = ?`;
      params.push(patternType);
    }

    query += ` ORDER BY confidence DESC, created_at DESC`;

    const rows = db.prepare(query).all(...params);

    // Parse JSON fields
    const knowledge = rows.map((row: any) => ({
      ...row,
      supporting_data: row.supporting_data ? JSON.parse(row.supporting_data) : null,
    }));

    res.json({
      success: true,
      knowledge,
    });
  } catch (error: any) {
    console.error('Error getting knowledge:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// PHASE 2: AUTONOMY FEATURES API ENDPOINTS
// ========================================

// ------------------
// Scheduled Learning
// ------------------

/**
 * POST /api/agents/:id/auto-learn/enable
 * Enable scheduled learning for an agent
 */
router.post('/:id/auto-learn/enable', async (req: Request, res: Response) => {
  try {
    const { schedule } = req.body;

    if (!schedule) {
      return res.status(400).json({
        success: false,
        error: 'Schedule (cron expression) is required',
      });
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE trading_agents
      SET auto_learn_enabled = 1, learning_schedule = ?
      WHERE id = ?
    `).run(schedule, req.params.id);

    // Schedule the agent
    await scheduler.scheduleAgent(req.params.id, schedule);

    res.json({
      success: true,
      message: 'Scheduled learning enabled',
      schedule,
    });
  } catch (error: any) {
    console.error('Error enabling scheduled learning:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/auto-learn/disable
 * Disable scheduled learning for an agent
 */
router.post('/:id/auto-learn/disable', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare(`
      UPDATE trading_agents
      SET auto_learn_enabled = 0
      WHERE id = ?
    `).run(req.params.id);

    scheduler.unscheduleAgent(req.params.id);

    res.json({
      success: true,
      message: 'Scheduled learning disabled',
    });
  } catch (error: any) {
    console.error('Error disabling scheduled learning:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/agents/:id/schedule
 * Update learning schedule for an agent
 */
router.put('/:id/schedule', async (req: Request, res: Response) => {
  try {
    const { schedule } = req.body;

    if (!schedule) {
      return res.status(400).json({
        success: false,
        error: 'Schedule (cron expression) is required',
      });
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE trading_agents
      SET learning_schedule = ?
      WHERE id = ?
    `).run(schedule, req.params.id);

    // Reschedule
    await scheduler.scheduleAgent(req.params.id, schedule);

    res.json({
      success: true,
      message: 'Learning schedule updated',
      schedule,
    });
  } catch (error: any) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------
// Auto-Approval
// ------------------

/**
 * POST /api/agents/:id/auto-approve/enable
 * Enable auto-approval of refinements
 */
router.post('/:id/auto-approve/enable', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare(`
      UPDATE trading_agents
      SET auto_approve_enabled = 1
      WHERE id = ?
    `).run(req.params.id);

    res.json({
      success: true,
      message: 'Auto-approval enabled',
    });
  } catch (error: any) {
    console.error('Error enabling auto-approval:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/auto-approve/disable
 * Disable auto-approval of refinements
 */
router.post('/:id/auto-approve/disable', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare(`
      UPDATE trading_agents
      SET auto_approve_enabled = 0
      WHERE id = ?
    `).run(req.params.id);

    res.json({
      success: true,
      message: 'Auto-approval disabled',
    });
  } catch (error: any) {
    console.error('Error disabling auto-approval:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/agents/:id/approval-thresholds
 * Update auto-approval thresholds
 */
router.put('/:id/approval-thresholds', async (req: Request, res: Response) => {
  try {
    const thresholds = req.body;

    await refinementApproval.updateThresholds(req.params.id, thresholds);

    res.json({
      success: true,
      message: 'Approval thresholds updated',
      thresholds,
    });
  } catch (error: any) {
    console.error('Error updating thresholds:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------
// Continuous Learning
// ------------------

/**
 * POST /api/agents/:id/continuous-learning/start
 * Start continuous learning loop
 */
router.post('/:id/continuous-learning/start', async (req: Request, res: Response) => {
  try {
    await continuousLearning.startContinuousLearning(req.params.id);

    res.json({
      success: true,
      message: 'Continuous learning started',
    });
  } catch (error: any) {
    console.error('Error starting continuous learning:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/continuous-learning/stop
 * Stop continuous learning loop
 */
router.post('/:id/continuous-learning/stop', async (req: Request, res: Response) => {
  try {
    continuousLearning.stopContinuousLearning(req.params.id);

    res.json({
      success: true,
      message: 'Continuous learning stopped',
    });
  } catch (error: any) {
    console.error('Error stopping continuous learning:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/:id/continuous-learning/status
 * Get continuous learning status
 */
router.get('/:id/continuous-learning/status', async (req: Request, res: Response) => {
  try {
    const status = continuousLearning.getContinuousLearningStatus(req.params.id);

    res.json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error('Error getting continuous learning status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------
// Alerts
// ------------------

/**
 * GET /api/agents/:id/alerts
 * Get all alerts for an agent
 */
router.get('/:id/alerts', async (req: Request, res: Response) => {
  try {
    const includeAcknowledged = req.query.includeAcknowledged === 'true';
    const alerts = performanceMonitor.getAgentAlerts(req.params.id, includeAcknowledged);

    res.json({
      success: true,
      alerts,
    });
  } catch (error: any) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/alerts
 * Get all unacknowledged alerts across all agents
 */
router.get('/alerts/unacknowledged', async (req: Request, res: Response) => {
  try {
    const alerts = performanceMonitor.getAllUnacknowledgedAlerts();

    res.json({
      success: true,
      alerts,
    });
  } catch (error: any) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/:id/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    performanceMonitor.acknowledgeAlert(req.params.alertId);

    res.json({
      success: true,
      message: 'Alert acknowledged',
    });
  } catch (error: any) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/agents/:id/alerts/:alertId
 * Delete an alert
 */
router.delete('/:id/alerts/:alertId', async (req: Request, res: Response) => {
  try {
    performanceMonitor.deleteAlert(req.params.alertId);

    res.json({
      success: true,
      message: 'Alert deleted',
    });
  } catch (error: any) {
    console.error('Error deleting alert:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------
// Graduation
// ------------------

/**
 * GET /api/agents/:id/graduation/eligibility
 * Check if agent is eligible for graduation
 */
router.get('/:id/graduation/eligibility', async (req: Request, res: Response) => {
  try {
    const eligibility = await graduation.checkEligibility(req.params.id);

    res.json({
      success: true,
      eligibility,
    });
  } catch (error: any) {
    console.error('Error checking graduation eligibility:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/graduate
 * Graduate agent to next status level
 */
router.post('/:id/graduate', async (req: Request, res: Response) => {
  try {
    const { force } = req.body;
    const newStatus = await graduation.graduate(req.params.id, force || false);

    res.json({
      success: true,
      message: `Agent graduated to ${newStatus}`,
      newStatus,
    });
  } catch (error: any) {
    console.error('Error graduating agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agents/:id/demote
 * Demote agent back to learning status
 */
router.post('/:id/demote', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason for demotion is required',
      });
    }

    await graduation.demote(req.params.id, reason);

    res.json({
      success: true,
      message: 'Agent demoted to learning status',
    });
  } catch (error: any) {
    console.error('Error demoting agent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------
// Activity Log
// ------------------

/**
 * GET /api/agents/:id/activity
 * Get activity log for an agent
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const activity = activityLog.getAgentLogs(req.params.id, limit);

    res.json({
      success: true,
      activity,
    });
  } catch (error: any) {
    console.error('Error getting activity log:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agents/activity/recent
 * Get recent activity across all agents
 */
router.get('/activity/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const activity = activityLog.getRecentActivity(limit);

    res.json({
      success: true,
      activity,
    });
  } catch (error: any) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
