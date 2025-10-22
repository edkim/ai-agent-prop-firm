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
    // Determine which template to use based on date params
    const useMultiDay = params.dateRange || params.specificDates;
    const templateType = useMultiDay ? 'orb-multiday' : params.strategyType;

    // Load appropriate template
    const template = await this.loadTemplate(templateType);

    // Replace template variables
    let script = template;

    // Strategy-specific replacements
    if (params.strategyType === 'orb') {
      if (useMultiDay) {
        // Multi-day template replacements
        script = this.generateMultiDayScript(script, params);
      } else {
        // Single-day template replacements (legacy)
        script = this.generateSingleDayScript(script, params);
      }
    }

    return script;
  }

  /**
   * Generate multi-day script (uses orb-multiday.template.ts)
   */
  private generateMultiDayScript(script: string, params: ScriptGenerationParams): string {
    // Replace ticker
    script = script.replace(/TEMPLATE_TICKER/g, params.ticker);

    // Replace timeframe
    script = script.replace(/TEMPLATE_TIMEFRAME/g, params.timeframe || '5min');

    // Handle date injection
    let dates: string[] = [];
    if (params.specificDates) {
      // Use provided specific dates
      dates = params.specificDates;
    } else if (params.dateRange) {
      // Generate consecutive trading days from range
      dates = this.generateTradingDays(params.dateRange.from, params.dateRange.to);
    }

    // Inject dates array
    script = script.replace(/TEMPLATE_TRADING_DAYS/g, JSON.stringify(dates));

    // Handle exit time
    const exitTime = ('exitTime' in params.config) ? params.config.exitTime : '16:00'; // Default to market close
    script = script.replace(/TEMPLATE_EXIT_TIME/g, exitTime);

    return script;
  }

  /**
   * Generate single-day script (legacy method)
   */
  private generateSingleDayScript(script: string, params: ScriptGenerationParams): string {
    if (!params.date) {
      throw new Error('Single day backtest requires a date parameter');
    }

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

    return script;
  }

  /**
   * Generate list of trading days between from and to dates
   * Excludes weekends (simple implementation)
   */
  private generateTradingDays(from: string, to: string): string[] {
    const dates: string[] = [];
    const current = new Date(from);
    const end = new Date(to);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      // Exclude weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
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
    // For ORB multi-day, use the new multi-day template
    if (strategyType === 'orb-multiday') {
      const templatePath = path.join(this.templatesDir, 'orb-multiday.template.ts');
      try {
        const template = await fs.readFile(templatePath, 'utf8');
        return template;
      } catch (error: any) {
        throw new Error(`Failed to load ORB multi-day template: ${error.message}`);
      }
    }

    // For ORB single-day, use the existing working script as template
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
