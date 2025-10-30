/**
 * Agent API Routes
 * Endpoints for multi-agent laboratory
 */

import express, { Request, Response } from 'express';
import { AgentManagementService } from '../../services/agent-management.service';
import { AgentLearningService } from '../../services/agent-learning.service';
import { getDatabase } from '../../database/db';
import {
  CreateAgentRequest,
  StartIterationRequest,
  ApplyRefinementsRequest,
} from '../../types/agent.types';

const router = express.Router();
const agentMgmt = new AgentManagementService();
const agentLearning = new AgentLearningService();

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

    // Parse JSON fields
    const iterations = rows.map((row: any) => ({
      ...row,
      backtest_results: row.backtest_results ? JSON.parse(row.backtest_results) : null,
      refinements_suggested: row.refinements_suggested ? JSON.parse(row.refinements_suggested) : [],
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

    // Parse JSON fields
    const iteration = {
      ...row,
      backtest_results: row.backtest_results ? JSON.parse(row.backtest_results) : null,
      refinements_suggested: row.refinements_suggested ? JSON.parse(row.refinements_suggested) : [],
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

export default router;
