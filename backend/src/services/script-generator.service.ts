/**
 * Script Generator Service
 *
 * Generates TypeScript backtest scripts from templates
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ScriptGenerationParams } from '../types/script.types';

export class ScriptGeneratorService {
  private readonly templatesDir = path.join(__dirname, '../templates');

  /**
   * Generate a backtest script from template
   */
  async generateScript(params: ScriptGenerationParams): Promise<string> {
    // Load template
    const template = await this.loadTemplate(params.strategyType);

    // Replace template variables
    let script = template;

    // Strategy-specific replacements for ORB
    if (params.strategyType === 'orb') {
      // Replace ticker
      script = script.replace(/const ticker = '[A-Z]+';/g, `const ticker = '${params.ticker}';`);

      // Replace timeframe
      script = script.replace(/const timeframe = '\w+';/g, `const timeframe = '${params.timeframe || '5min'}';`);

      // Replace trailing stop percentage
      const trailingStop = ('trailingStopPct' in params.config)
        ? params.config.trailingStopPct?.toString() || '2.0'
        : '2.0';
      script = script.replace(/const trailingStopPct = [\d.]+;/g, `const trailingStopPct = ${trailingStop};`);

      // Replace dates
      script = script.replace(/new Date\('2025-07-31T00:00:00Z'\)/g, `new Date('${params.date}T00:00:00Z')`);

      // Calculate next day for end date
      const startDate = new Date(params.date);
      startDate.setDate(startDate.getDate() + 1);
      const endDate = startDate.toISOString().split('T')[0];
      script = script.replace(/new Date\('2025-08-01T00:00:00Z'\)/g, `new Date('${endDate}T00:00:00Z')`);

      // Replace display date
      script = script.replace(/Date: 2025-07-31/g, `Date: ${params.date}`);

      // TODO: Handle market filter ticker if provided
      // For now, the script doesn't have QQQ filter by default
    }

    return script;
  }

  /**
   * Generate unique filename for script
   */
  generateFilename(prefix: string = 'backtest'): string {
    const uuid = crypto.randomUUID().split('-')[0]; // Use first segment of UUID
    const timestamp = Date.now();
    // Write to backend directory so imports work correctly
    const backendDir = path.join(__dirname, '../..');
    return path.join(backendDir, `${prefix}-${timestamp}-${uuid}.ts`);
  }

  /**
   * Write script to temp file
   */
  async writeScriptToFile(script: string, filename?: string): Promise<string> {
    const filepath = filename || this.generateFilename();

    await fs.writeFile(filepath, script, 'utf8');

    return filepath;
  }

  /**
   * Load template from file
   */
  private async loadTemplate(strategyType: string): Promise<string> {
    // For ORB, use the existing working script as template
    if (strategyType === 'orb') {
      const scriptPath = path.join(__dirname, '../../run-orb-backtest-trailing-stop.ts');
      try {
        const template = await fs.readFile(scriptPath, 'utf8');
        return template;
      } catch (error: any) {
        throw new Error(`Failed to load ORB template: ${error.message}`);
      }
    }

    // Fall back to templates directory for other types
    const templatePath = path.join(this.templatesDir, `${strategyType}-backtest.template.ts`);

    try {
      const template = await fs.readFile(templatePath, 'utf8');
      return template;
    } catch (error: any) {
      throw new Error(`Failed to load template '${strategyType}': ${error.message}`);
    }
  }

  /**
   * Validate template parameters
   */
  validateParams(params: ScriptGenerationParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate ticker
    if (!params.ticker || !/^[A-Z]{1,5}$/.test(params.ticker)) {
      errors.push('Invalid ticker symbol (must be 1-5 uppercase letters)');
    }

    // Validate date
    if (!params.date || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      errors.push('Invalid date format (must be YYYY-MM-DD)');
    }

    // Validate timeframe
    const validTimeframes = ['1min', '5min', '15min', '30min', '1hour', '1day'];
    if (params.timeframe && !validTimeframes.includes(params.timeframe)) {
      errors.push(`Invalid timeframe (must be one of: ${validTimeframes.join(', ')})`);
    }

    // Strategy-specific validations
    if (params.strategyType === 'orb') {
      if ('trailingStopPct' in params.config) {
        const stopPct = params.config.trailingStopPct;
        if (typeof stopPct === 'number' && (stopPct < 0 || stopPct > 50)) {
          errors.push('Trailing stop percentage must be between 0 and 50');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export default new ScriptGeneratorService();
