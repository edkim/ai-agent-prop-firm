/**
 * Script viewing routes
 * Endpoints for viewing generated backtest scripts
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

const router = Router();

/**
 * GET /api/scripts/view
 * View a generated script file
 */
router.get('/view', async (req: Request, res: Response) => {
  try {
    const scriptPath = req.query.path as string;

    if (!scriptPath) {
      return res.status(400).send('Missing script path parameter');
    }

    // Security: Ensure the path is within the backend directory
    const absolutePath = path.resolve(scriptPath);
    const backendDir = path.resolve(__dirname, '../../../');

    if (!absolutePath.startsWith(backendDir)) {
      return res.status(403).send('Access denied: Invalid path');
    }

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      return res.status(404).send('Script file not found');
    }

    // Read and return the file content
    const content = await fs.readFile(absolutePath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);

  } catch (error: any) {
    console.error('Error reading script:', error);
    res.status(500).send(`Failed to read script: ${error.message}`);
  }
});

export default router;
