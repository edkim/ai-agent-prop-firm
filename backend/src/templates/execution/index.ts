/**
 * Execution Template Registry
 *
 * Central registry for all available execution templates.
 * Import this to access any template by name.
 */

import { ExecutionTemplate } from './template.interface';
import { conservativeTemplate } from './conservative';
import { aggressiveTemplate } from './aggressive';
import { timeBasedTemplate } from './time-based';
import { volatilityAdaptiveTemplate } from './volatility-adaptive';
import { priceActionTemplate } from './price-action';
import { gapFillVWAPTemplate } from './gap-fill-vwap';

/**
 * Template registry - maps template names to template objects
 */
export const executionTemplates: Record<string, ExecutionTemplate> = {
  'conservative': conservativeTemplate,
  'aggressive': aggressiveTemplate,
  'time_based': timeBasedTemplate,
  'volatility_adaptive': volatilityAdaptiveTemplate,
  'price_action': priceActionTemplate,
  'gap_fill_vwap': gapFillVWAPTemplate
};

/**
 * Default templates to test for new agents
 * In discovery mode, only the first template is used
 */
export const DEFAULT_TEMPLATES = [
  'price_action',      // Default for discovery mode
  'conservative',
  'aggressive',
  'time_based',
  'volatility_adaptive'
];

/**
 * Get a template by name
 */
export function getTemplate(name: string): ExecutionTemplate | undefined {
  return executionTemplates[name];
}

/**
 * Get all available template names
 */
export function getTemplateNames(): string[] {
  return Object.keys(executionTemplates);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): ExecutionTemplate[] {
  return Object.values(executionTemplates).filter(t => t.category === category);
}

/**
 * Get template metadata (without code) for listing
 */
export function getTemplateMetadata() {
  return Object.entries(executionTemplates).map(([name, template]) => ({
    name,
    displayName: template.name,
    description: template.description,
    category: template.category,
    parameters: template.parameters,
    metadata: template.metadata
  }));
}

// Export types and templates
export * from './template.interface';
export {
  conservativeTemplate,
  aggressiveTemplate,
  timeBasedTemplate,
  volatilityAdaptiveTemplate,
  priceActionTemplate,
  gapFillVWAPTemplate
};
