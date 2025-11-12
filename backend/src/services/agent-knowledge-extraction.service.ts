/**
 * Agent Knowledge Extraction Service
 * Converts Expert Analysis into structured, reusable knowledge
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/db';
import {
  AgentKnowledge,
  ExpertAnalysis,
  AnalysisElement,
  FailurePoint,
  MissingContext,
  ParameterRecommendation,
  KnowledgeType,
  TradingAgent
} from '../types/agent.types';

interface KnowledgeItem {
  knowledge_type: KnowledgeType;
  pattern_type?: string;
  insight: string;
  supporting_data: any;
  confidence: number;
}

export class AgentKnowledgeExtractionService {
  /**
   * Extract knowledge items from expert analysis
   */
  async extractKnowledge(
    agentId: string,
    analysis: ExpertAnalysis,
    iterationNumber: number
  ): Promise<AgentKnowledge[]> {
    const knowledgeItems: KnowledgeItem[] = [];
    const agent = await this.getAgent(agentId);

    // 1. Extract from parameter recommendations -> PARAMETER_PREF
    for (const param of analysis.parameter_recommendations || []) {
      knowledgeItems.push(this.mapParameterToKnowledge(param, agent));
    }

    // 2. Extract from working elements -> PATTERN_RULE (positive)
    for (const element of analysis.working_elements || []) {
      knowledgeItems.push(this.mapWorkingElementToKnowledge(element, agent));
    }

    // 3. Extract from failure points -> PATTERN_RULE (negative)
    for (const failure of analysis.failure_points || []) {
      knowledgeItems.push(this.mapFailureToKnowledge(failure, agent));
    }

    // 4. Extract from missing context -> INSIGHT
    for (const missing of analysis.missing_context || []) {
      knowledgeItems.push(this.mapMissingContextToKnowledge(missing, agent));
    }

    // 5. Extract from execution analysis -> PARAMETER_PREF and PATTERN_RULE
    if (analysis.execution_analysis) {
      knowledgeItems.push(...this.mapExecutionAnalysisToKnowledge(analysis.execution_analysis, agent));
    }

    // Convert to AgentKnowledge records
    const knowledge: AgentKnowledge[] = knowledgeItems.map(item => ({
      id: uuidv4(),
      learning_agent_id: agentId,
      knowledge_type: item.knowledge_type,
      pattern_type: item.pattern_type,
      insight: item.insight,
      supporting_data: item.supporting_data,
      confidence: item.confidence,
      learned_from_iteration: iterationNumber,
      times_validated: 0,
      created_at: new Date().toISOString()
    }));

    console.log(`   Extracted ${knowledge.length} knowledge items from analysis`);
    return knowledge;
  }

  /**
   * Store knowledge with deduplication
   */
  async storeKnowledge(agentId: string, knowledgeItems: AgentKnowledge[]): Promise<void> {
    const db = getDatabase();
    let inserted = 0;
    let updated = 0;

    for (const item of knowledgeItems) {
      // Skip items with no insight (invalid knowledge)
      if (!item.insight || item.insight.trim() === '' || item.insight === 'Unknown pattern element') {
        console.log(`   Skipping invalid knowledge item (no insight)`);
        continue;
      }

      // Check for similar existing knowledge
      const existing = this.findSimilarKnowledge(agentId, item);

      if (existing) {
        // Update existing knowledge: boost confidence and validation count
        const newConfidence = Math.min(1.0, (existing.confidence + item.confidence) / 2 * 1.1);

        db.prepare(`
          UPDATE agent_knowledge
          SET confidence = ?,
              times_validated = times_validated + 1,
              last_validated = ?
          WHERE id = ?
        `).run(newConfidence, new Date().toISOString(), existing.id);

        updated++;
        const preview = item.insight ? item.insight.substring(0, 50) : 'unknown';
        console.log(`   Updated existing knowledge: "${preview}..."`);
      } else {
        // Insert new knowledge
        db.prepare(`
          INSERT INTO agent_knowledge (
            id, learning_agent_id, knowledge_type, pattern_type, insight,
            supporting_data, confidence, learned_from_iteration,
            times_validated, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.id,
          item.learning_agent_id,
          item.knowledge_type,
          item.pattern_type || null,
          item.insight,
          JSON.stringify(item.supporting_data),
          item.confidence,
          item.learned_from_iteration,
          item.times_validated,
          item.created_at
        );

        inserted++;
        const preview = item.insight ? item.insight.substring(0, 50) : 'unknown';
        console.log(`   Stored new knowledge: "${preview}..."`);
      }
    }

    console.log(`   Knowledge storage: ${inserted} new, ${updated} updated`);
  }

  /**
   * Format knowledge for strategy generation prompts
   */
  formatKnowledgeForStrategyGeneration(knowledge: AgentKnowledge[], patternFocus: string[]): string {
    if (knowledge.length === 0) {
      return 'No accumulated knowledge yet. This is your first iteration.';
    }

    // Group by knowledge type
    const byType: { [key: string]: AgentKnowledge[] } = {
      PARAMETER_PREF: [],
      PATTERN_RULE: [],
      INSIGHT: []
    };

    for (const item of knowledge) {
      byType[item.knowledge_type].push(item);
    }

    // Sort each group by confidence
    for (const type in byType) {
      byType[type].sort((a, b) => b.confidence - a.confidence);
    }

    // Format output
    const sections: string[] = [];

    // Parameter preferences
    if (byType.PARAMETER_PREF.length > 0) {
      sections.push('**Parameter Insights:**');
      byType.PARAMETER_PREF.slice(0, 3).forEach(k => {
        sections.push(`- ${k.insight} (confidence: ${Math.round(k.confidence * 100)}%, validated: ${k.times_validated}x)`);
      });
    }

    // Pattern rules
    if (byType.PATTERN_RULE.length > 0) {
      sections.push('\n**Pattern Recognition Rules:**');
      byType.PATTERN_RULE.slice(0, 5).forEach(k => {
        sections.push(`- ${k.insight} (confidence: ${Math.round(k.confidence * 100)}%, validated: ${k.times_validated}x)`);
      });
    }

    // General insights
    if (byType.INSIGHT.length > 0) {
      sections.push('\n**Strategic Insights:**');
      byType.INSIGHT.slice(0, 3).forEach(k => {
        sections.push(`- ${k.insight} (confidence: ${Math.round(k.confidence * 100)}%)`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Mark knowledge as mature (after convergence)
   */
  async markKnowledgeMature(agentId: string): Promise<void> {
    const db = getDatabase();

    const updated = db.prepare(`
      UPDATE agent_knowledge
      SET confidence = MIN(1.0, confidence * 1.1)
      WHERE learning_agent_id = ? AND times_validated >= 3
    `).run(agentId);

    console.log(`   Marked ${updated.changes} knowledge items as mature`);
  }

  /**
   * Reduce confidence in recent knowledge (after performance degradation)
   */
  async reduceKnowledgeConfidence(agentId: string): Promise<void> {
    const db = getDatabase();

    // Reduce confidence for recently added, unvalidated knowledge
    const updated = db.prepare(`
      UPDATE agent_knowledge
      SET confidence = confidence * 0.85
      WHERE learning_agent_id = ?
        AND times_validated < 2
        AND date(created_at) >= date('now', '-7 days')
    `).run(agentId);

    console.log(`   Reduced confidence for ${updated.changes} recent knowledge items`);
  }

  /**
   * Increment validation count when knowledge is used in approved refinement
   */
  async validateKnowledge(agentId: string, iterationId: string): Promise<void> {
    const db = getDatabase();

    // Get the iteration number
    const iteration = db.prepare(`
      SELECT iteration_number
      FROM agent_iterations
      WHERE id = ?
    `).get(iterationId) as { iteration_number: number } | undefined;

    if (!iteration) return;

    // Mark all knowledge from previous iteration as validated
    const updated = db.prepare(`
      UPDATE agent_knowledge
      SET times_validated = times_validated + 1,
          last_validated = ?,
          confidence = MIN(1.0, confidence * 1.05)
      WHERE learning_agent_id = ? AND learned_from_iteration = ?
    `).run(new Date().toISOString(), agentId, iteration.iteration_number - 1);

    if (updated.changes > 0) {
      console.log(`   Validated ${updated.changes} knowledge items from previous iteration`);
    }
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  /**
   * Map parameter recommendation to knowledge
   */
  private mapParameterToKnowledge(param: ParameterRecommendation, agent: TradingAgent): KnowledgeItem {
    const insight = `${param.parameter} performs better at ${this.formatValue(param.recommendedValue)} than ${this.formatValue(param.currentValue)}`;

    return {
      knowledge_type: 'PARAMETER_PREF',
      pattern_type: agent.pattern_focus[0] || undefined,
      insight,
      supporting_data: {
        parameter: param.parameter,
        current_value: param.currentValue,
        recommended_value: param.recommendedValue,
        expected_improvement: param.expectedImprovement,
        applicable_to: agent.pattern_focus
      },
      confidence: 0.75 // Parameters start at moderate confidence
    };
  }

  /**
   * Map working element to knowledge
   */
  private mapWorkingElementToKnowledge(element: AnalysisElement, agent: TradingAgent): KnowledgeItem {
    return {
      knowledge_type: 'PATTERN_RULE',
      pattern_type: this.extractPatternType(element.element, agent.pattern_focus),
      insight: element.element || 'Unknown pattern element',
      supporting_data: {
        evidence: element.evidence || 'No evidence provided',
        pattern_contexts: agent.market_conditions,
        applicable_patterns: agent.pattern_focus
      },
      confidence: Math.min(0.95, element.confidence || 0.5)
    };
  }

  /**
   * Map failure point to knowledge
   */
  private mapFailureToKnowledge(failure: FailurePoint, agent: TradingAgent): KnowledgeItem {
    return {
      knowledge_type: 'PATTERN_RULE',
      pattern_type: undefined, // Failures are often general
      insight: failure.issue,
      supporting_data: {
        evidence: failure.evidence,
        impact: failure.impact,
        suggested_fix: failure.suggestedFix,
        negative_rule: true // Marks this as a "don't do this"
      },
      confidence: 0.80 // Failure patterns are fairly reliable
    };
  }

  /**
   * Map missing context to knowledge
   */
  private mapMissingContextToKnowledge(missing: MissingContext, agent: TradingAgent): KnowledgeItem {
    const reasoning = missing.reasoning || 'improve strategy performance';
    const insight = `Strategy would benefit from ${missing.dataType} to ${reasoning.toLowerCase()}`;

    return {
      knowledge_type: 'INSIGHT',
      pattern_type: undefined,
      insight,
      supporting_data: {
        missing_data_type: missing.dataType,
        reasoning: missing.reasoning,
        recommendation: missing.recommendation,
        priority: 'medium' // Could be enhanced with impact estimation
      },
      confidence: 0.60 // Lower confidence until implemented and tested
    };
  }

  /**
   * Map execution analysis to knowledge
   */
  private mapExecutionAnalysisToKnowledge(executionAnalysis: any, agent: TradingAgent): KnowledgeItem[] {
    const items: KnowledgeItem[] = [];

    // Extract insights from template comparison
    if (executionAnalysis.template_comparison) {
      items.push({
        knowledge_type: 'PARAMETER_PREF',
        pattern_type: agent.pattern_focus[0] || undefined,
        insight: `Exit strategy preference: ${executionAnalysis.template_comparison}`,
        supporting_data: {
          analysis_type: 'template_comparison',
          details: executionAnalysis.template_comparison
        },
        confidence: 0.85
      });
    }

    // Extract insights from stop loss effectiveness
    if (executionAnalysis.stop_loss_effectiveness) {
      items.push({
        knowledge_type: 'PARAMETER_PREF',
        pattern_type: agent.pattern_focus[0] || undefined,
        insight: `Stop loss assessment: ${executionAnalysis.stop_loss_effectiveness}`,
        supporting_data: {
          analysis_type: 'stop_loss_effectiveness',
          assessment: executionAnalysis.stop_loss_effectiveness
        },
        confidence: 0.80
      });
    }

    // Extract insights from take profit effectiveness
    if (executionAnalysis.take_profit_effectiveness) {
      items.push({
        knowledge_type: 'PARAMETER_PREF',
        pattern_type: agent.pattern_focus[0] || undefined,
        insight: `Take profit assessment: ${executionAnalysis.take_profit_effectiveness}`,
        supporting_data: {
          analysis_type: 'take_profit_effectiveness',
          assessment: executionAnalysis.take_profit_effectiveness
        },
        confidence: 0.80
      });
    }

    // Extract timing issues as pattern rules
    if (executionAnalysis.exit_timing_issues && executionAnalysis.exit_timing_issues.length > 0) {
      for (const issue of executionAnalysis.exit_timing_issues) {
        items.push({
          knowledge_type: 'PATTERN_RULE',
          pattern_type: agent.pattern_focus[0] || undefined,
          insight: `Exit timing issue: ${issue}`,
          supporting_data: {
            analysis_type: 'exit_timing_issue',
            issue: issue,
            negative_rule: true
          },
          confidence: 0.75
        });
      }
    }

    // Extract suggested improvements as insights
    if (executionAnalysis.suggested_improvements && executionAnalysis.suggested_improvements.length > 0) {
      for (const improvement of executionAnalysis.suggested_improvements) {
        items.push({
          knowledge_type: 'INSIGHT',
          pattern_type: agent.pattern_focus[0] || undefined,
          insight: `Execution improvement: ${improvement}`,
          supporting_data: {
            analysis_type: 'execution_improvement',
            suggestion: improvement
          },
          confidence: 0.70
        });
      }
    }

    return items;
  }

  /**
   * Find similar existing knowledge
   */
  private findSimilarKnowledge(agentId: string, item: AgentKnowledge): AgentKnowledge | null {
    const db = getDatabase();

    // Look for knowledge with similar insight (fuzzy match on first 100 chars)
    if (!item.insight) {
      return null; // Can't match if there's no insight
    }
    const insightPrefix = item.insight.substring(0, 100);

    const existing = db.prepare(`
      SELECT * FROM agent_knowledge
      WHERE learning_agent_id = ?
        AND knowledge_type = ?
        AND substr(insight, 1, 100) = ?
      LIMIT 1
    `).get(agentId, item.knowledge_type, insightPrefix) as any;

    if (existing) {
      return {
        id: existing.id,
        learning_agent_id: existing.learning_agent_id,
        knowledge_type: existing.knowledge_type as KnowledgeType,
        pattern_type: existing.pattern_type,
        insight: existing.insight,
        supporting_data: JSON.parse(existing.supporting_data || '{}'),
        confidence: existing.confidence,
        learned_from_iteration: existing.learned_from_iteration,
        times_validated: existing.times_validated,
        last_validated: existing.last_validated,
        created_at: existing.created_at
      };
    }

    return null;
  }

  /**
   * Extract pattern type from element text
   */
  private extractPatternType(text: string, patternFocus: string[]): string | undefined {
    if (!text) {
      return patternFocus[0]; // Return default pattern if text is undefined/null
    }
    const lowerText = text.toLowerCase();

    // Check if any of the agent's patterns are mentioned
    for (const pattern of patternFocus) {
      if (lowerText.includes(pattern.toLowerCase().replace('_', ' '))) {
        return pattern;
      }
    }

    return patternFocus[0]; // Default to primary pattern
  }

  /**
   * Format value for display
   */
  private formatValue(value: any): string {
    if (typeof value === 'number') {
      if (value < 1) {
        return `${(value * 100).toFixed(1)}%`;
      }
      return value.toFixed(2);
    }
    return String(value);
  }

  /**
   * Get agent details
   */
  private async getAgent(agentId: string): Promise<TradingAgent> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM trading_agents WHERE id = ?').get(agentId) as any;

    if (!row) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return {
      id: row.id,
      name: row.name,
      instructions: row.instructions || '',
      system_prompt: row.system_prompt,
      risk_tolerance: row.risk_tolerance || 'moderate',
      trading_style: row.trading_style || 'day_trader',
      pattern_focus: JSON.parse(row.pattern_focus || '[]'),
      market_conditions: JSON.parse(row.market_conditions || '[]'),
      risk_config: row.risk_config ? JSON.parse(row.risk_config) : undefined,
      status: row.status || 'learning',
      active: row.active === 1,
      account_id: row.account_id,
      timeframe: row.timeframe,
      strategies: row.strategies ? JSON.parse(row.strategies) : undefined,
      risk_limits: row.risk_limits ? JSON.parse(row.risk_limits) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}
