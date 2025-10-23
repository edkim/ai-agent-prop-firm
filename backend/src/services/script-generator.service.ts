/**
 * Script Generator Service
 *
 * Simplified service for writing generated scripts to files
 * (Template generation removed - now using Claude AI exclusively)
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class ScriptGeneratorService {
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
}

// Export singleton instance
export default new ScriptGeneratorService();
