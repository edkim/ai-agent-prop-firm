/**
 * Scanner Service
 *
 * Scans stock universe for patterns using daily metrics
 * Supports natural language queries (to be enhanced with Claude in future)
 */

import { getDatabase } from '../database/db';
import { DailyMetrics } from './universe-data.service';
import universeDataService from './universe-data.service';
import dataBackfillService from './data-backfill.service';
import crypto from 'crypto';

export interface ScanCriteria {
  universe?: string;
  tickers?: string[];

  // Date range
  start_date?: string;
  end_date?: string;

  // Price change filters
  min_change_percent?: number;
  max_change_percent?: number;
  min_change_5d_percent?: number;
  min_change_10d_percent?: number;

  // Volume filters
  min_volume_ratio?: number;
  max_volume_ratio?: number;

  // Consecutive days filters
  min_consecutive_up_days?: number;
  min_consecutive_down_days?: number;

  // SMA filters
  price_above_sma20?: boolean;
  price_below_sma20?: boolean;
  price_above_sma50?: boolean;
  price_below_sma50?: boolean;

  // RSI filters
  min_rsi?: number;
  max_rsi?: number;

  // Range filters
  min_high_low_range_percent?: number;

  // Limit results
  limit?: number;
}

export interface ScanMatch {
  ticker: string;
  date: string;
  metrics: DailyMetrics;
  score?: number; // Relevance score (0-100)
}

export interface ScanResult {
  matches: ScanMatch[];
  criteria: ScanCriteria;
  total_matches: number;
  scan_time_ms: number;
  scan_history_id?: string; // ID of the scan_history record
}

export class ScannerService {
  /**
   * Scan universe for patterns matching criteria
   */
  async scan(criteria: ScanCriteria): Promise<ScanResult> {
    const startTime = Date.now();

    console.log('🔍 Starting scan with criteria:', JSON.stringify(criteria, null, 2));

    // Trigger automatic data backfill in parallel (non-blocking)
    dataBackfillService.backfillLatestData();

    // Validate query before execution
    this.validateQuery(criteria);

    // Build SQL query from criteria
    const { query, params } = await this.buildQuery(criteria);

    console.log('📊 Executing SQL query...');
    console.log('Query:', query);
    console.log('Params:', params);

    const db = getDatabase();
    const stmt = db.prepare(query);

    // Use streaming instead of loading all results into memory
    // Apply defensive limit if not specified
    const maxResults = criteria.limit || 10000;
    const results: DailyMetrics[] = [];
    let count = 0;

    try {
      for (const row of stmt.iterate(...params)) {
        results.push(row as DailyMetrics);
        count++;

        // Stop when we hit the limit to prevent memory issues
        if (count >= maxResults) {
          console.log(`⚠️  Reached maximum result limit of ${maxResults}`);
          break;
        }
      }
    } catch (error: any) {
      console.error('❌ Error during query execution:', error.message);
      throw new Error(`Query execution failed: ${error.message}`);
    }

    console.log(`✅ Found ${results.length} matches`);

    // Convert to ScanMatch format
    const matches: ScanMatch[] = results.map(metrics => ({
      ticker: metrics.ticker,
      date: metrics.date,
      metrics,
      score: this.calculateRelevanceScore(metrics, criteria)
    }));

    // Sort by score (highest first)
    matches.sort((a, b) => (b.score || 0) - (a.score || 0));

    const scanTimeMs = Date.now() - startTime;

    console.log(`⏱️  Scan completed in ${scanTimeMs}ms`);

    // Get universe_id if universe was specified
    let universeId: string | undefined;
    if (criteria.universe) {
      const universeEntity = await universeDataService.getUniverseByName(criteria.universe);
      universeId = universeEntity?.id?.toString();
    }

    // Save scan to history (Phase 3 + Phase 4)
    const scanHistoryId = this.saveScanHistory(
      JSON.stringify(criteria), // Convert criteria to JSON as "user prompt"
      universeId,
      criteria.start_date,
      criteria.end_date,
      matches.length,
      scanTimeMs,
      matches // Phase 4: cache full results
    );

    return {
      matches,
      criteria,
      total_matches: matches.length,
      scan_time_ms: scanTimeMs,
      scan_history_id: scanHistoryId
    };
  }

  /**
   * Natural language scan (uses Claude to generate and execute scanner script)
   */
  async naturalLanguageScan(
    query: string,
    universe: string = 'russell2000',
    dateRange?: { start: string; end: string }
  ): Promise<ScanResult> {
    const startTime = Date.now();
    console.log(`🤖 Natural language scan: "${query}"`);

    // Trigger automatic data backfill in parallel (non-blocking)
    dataBackfillService.backfillLatestData();

    // Import required services
    const claudeService = (await import('./claude.service')).default;
    const scriptExecutionService = (await import('./script-execution.service')).default;
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // 1. Generate scanner script with Claude
      console.log('📝 Generating scanner script with Claude...');
      const { script, explanation } = await claudeService.generateScannerScript({
        query,
        universe,
        dateRange
      });

      console.log('✅ Claude generated script');
      console.log('📄 Explanation:', explanation);

      // 2. Save script to temp file
      const scriptPath = path.join(__dirname, '../../', `scanner-${Date.now()}.ts`);
      await fs.writeFile(scriptPath, script);
      console.log('💾 Saved scanner script to:', scriptPath);

      // 3. Execute script
      console.log('⚙️  Executing scanner script...');
      const executionResult = await scriptExecutionService.executeScript(scriptPath, 60000); // 60 second timeout

      if (!executionResult.success) {
        console.error('❌ Scanner script execution failed:', executionResult.error);
        throw new Error(`Scanner script execution failed: ${executionResult.error}`);
      }

      console.log('✅ Scanner script executed successfully');

      // 4. Parse matches from script output
      let matches: any[] = [];
      try {
        // Try to parse JSON from stdout
        const jsonMatch = executionResult.stdout?.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          matches = JSON.parse(jsonMatch[0]);
          console.log(`📊 Found ${matches.length} matches`);
        } else {
          console.warn('⚠️  No JSON array found in script output');
        }
      } catch (error: any) {
        console.error('❌ Failed to parse scanner output:', error.message);
        throw new Error(`Failed to parse scanner output: ${error.message}`);
      }

      // 5. Convert to ScanResult format
      // First, deduplicate by ticker+date, keeping only the highest scoring match
      const deduplicatedMap = new Map<string, any>();

      for (const match of matches) {
        // Handle both daily scanners (end_date) and intraday scanners (date)
        const matchDate = match.end_date || match.date;
        const key = `${match.ticker}:${matchDate}`;
        const existing = deduplicatedMap.get(key);

        // Keep the match with the highest pattern_strength
        if (!existing || (match.pattern_strength || 0) > (existing.pattern_strength || 0)) {
          deduplicatedMap.set(key, match);
        }
      }

      const uniqueMatches = Array.from(deduplicatedMap.values())
        .sort((a, b) => (b.pattern_strength || 0) - (a.pattern_strength || 0))
        .slice(0, 50); // Limit to 50 results

      console.log(`📊 After deduplication: ${uniqueMatches.length} unique matches (from ${matches.length} total)`);

      const scanMatches: ScanMatch[] = [];

      for (const match of uniqueMatches) {
        const matchDate = match.end_date || match.date;

        // Fetch the actual daily metrics for this ticker/date
        const db = (await import('../database/db')).getDatabase();
        const metrics = db.prepare(
          'SELECT * FROM daily_metrics WHERE ticker = ? AND date = ?'
        ).get(match.ticker, matchDate) as DailyMetrics | undefined;

        if (metrics) {
          scanMatches.push({
            ticker: match.ticker,
            date: matchDate,
            metrics,
            score: match.pattern_strength || 50
          });
        } else {
          // For intraday scans that don't have daily_metrics, create minimal metrics object
          scanMatches.push({
            ticker: match.ticker,
            date: matchDate,
            metrics: {
              ticker: match.ticker,
              date: matchDate,
              // Include any metrics from the match itself
              ...match.metrics
            } as any,
            score: match.pattern_strength || 50
          });
        }
      }

      const scanTimeMs = Date.now() - startTime;
      console.log(`⏱️  Scan completed in ${scanTimeMs}ms`);

      // Get universe_id
      let universeId: string | undefined;
      const universeEntity = await universeDataService.getUniverseByName(universe);
      universeId = universeEntity?.id?.toString();

      // Save scan to history (Phase 3 + Phase 4)
      const scanHistoryId = this.saveScanHistory(
        query,
        universeId,
        dateRange?.start,
        dateRange?.end,
        scanMatches.length,
        scanTimeMs,
        scanMatches // Phase 4: cache full results
      );

      // Save scanner script permanently before cleanup
      await this.saveScannerScript(
        query,
        explanation,
        universe,
        dateRange,
        scanMatches.length,
        scriptPath
      );

      // Clean up temp file
      await fs.unlink(scriptPath).catch(() => {
        // Ignore cleanup errors
      });

      return {
        matches: scanMatches,
        criteria: { universe }, // Store universe only
        total_matches: scanMatches.length,
        scan_time_ms: scanTimeMs,
        scan_history_id: scanHistoryId
      };

    } catch (error: any) {
      console.error('❌ Natural language scan failed:', error.message);
      throw error;
    }
  }

  /**
   * Find similar patterns to a given ticker/date
   */
  async findSimilar(
    ticker: string,
    date: string,
    universe: string = 'russell2000',
    limit: number = 20
  ): Promise<ScanResult> {
    console.log(`🔍 Finding similar patterns to ${ticker} on ${date}`);

    // Get the reference metrics
    const db = getDatabase();
    const refMetrics = db.prepare('SELECT * FROM daily_metrics WHERE ticker = ? AND date = ?')
      .get(ticker, date) as DailyMetrics | undefined;

    if (!refMetrics) {
      throw new Error(`No metrics found for ${ticker} on ${date}`);
    }

    // Build similarity criteria (±20% tolerance)
    const tolerance = 0.2;

    const criteria: ScanCriteria = {
      universe,
      min_change_percent: refMetrics.change_percent ? refMetrics.change_percent * (1 - tolerance) : undefined,
      max_change_percent: refMetrics.change_percent ? refMetrics.change_percent * (1 + tolerance) : undefined,
      min_volume_ratio: refMetrics.volume_ratio ? refMetrics.volume_ratio * (1 - tolerance) : undefined,
      max_volume_ratio: refMetrics.volume_ratio ? refMetrics.volume_ratio * (1 + tolerance) : undefined,
      limit
    };

    return this.scan(criteria);
  }

  /**
   * Validate query criteria before execution
   * Warns about potentially problematic queries
   */
  private validateQuery(criteria: ScanCriteria): void {
    const warnings: string[] = [];

    // Check if query has any meaningful filters
    const hasFilters =
      criteria.universe ||
      criteria.tickers ||
      criteria.start_date ||
      criteria.end_date ||
      criteria.min_change_percent !== undefined ||
      criteria.max_change_percent !== undefined ||
      criteria.min_volume_ratio !== undefined ||
      criteria.min_consecutive_up_days !== undefined ||
      criteria.min_consecutive_down_days !== undefined ||
      criteria.price_above_sma20 !== undefined ||
      criteria.price_above_sma50 !== undefined ||
      criteria.min_rsi !== undefined ||
      criteria.max_rsi !== undefined;

    if (!hasFilters) {
      warnings.push('No filters specified - query may return very large result set');
    }

    // Warn about broad date ranges without other filters
    if (criteria.start_date && criteria.end_date) {
      const start = new Date(criteria.start_date);
      const end = new Date(criteria.end_date);
      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff > 365 && !criteria.limit) {
        warnings.push(`Large date range (${daysDiff} days) without limit - consider adding criteria.limit`);
      }
    }

    // Warn if no limit and universe is specified
    if (criteria.universe && !criteria.limit) {
      warnings.push('Universe scan without limit - defaulting to 10,000 max results');
    }

    // Log warnings
    if (warnings.length > 0) {
      console.log('⚠️  Query validation warnings:');
      warnings.forEach(w => console.log(`   - ${w}`));
    }
  }

  /**
   * Build SQL query from scan criteria
   */
  private async buildQuery(criteria: ScanCriteria): Promise<{ query: string; params: any[] }> {
    const conditions: string[] = [];
    const params: any[] = [];

    // Universe filter
    if (criteria.universe) {
      const universeEntity = await universeDataService.getUniverseByName(criteria.universe);
      if (universeEntity) {
        conditions.push('ticker IN (SELECT ticker FROM universe_stocks WHERE universe_id = ?)');
        params.push(universeEntity.id);
      }
    }

    // Ticker list filter
    if (criteria.tickers && criteria.tickers.length > 0) {
      const placeholders = criteria.tickers.map(() => '?').join(',');
      conditions.push(`ticker IN (${placeholders})`);
      params.push(...criteria.tickers);
    }

    // Date range filters
    if (criteria.start_date) {
      conditions.push('date >= ?');
      params.push(criteria.start_date);
    }
    if (criteria.end_date) {
      conditions.push('date <= ?');
      params.push(criteria.end_date);
    }

    // Price change filters
    if (criteria.min_change_percent !== undefined) {
      conditions.push('change_percent >= ?');
      params.push(criteria.min_change_percent);
    }
    if (criteria.max_change_percent !== undefined) {
      conditions.push('change_percent <= ?');
      params.push(criteria.max_change_percent);
    }
    if (criteria.min_change_5d_percent !== undefined) {
      conditions.push('change_5d_percent >= ?');
      params.push(criteria.min_change_5d_percent);
    }
    if (criteria.min_change_10d_percent !== undefined) {
      conditions.push('change_10d_percent >= ?');
      params.push(criteria.min_change_10d_percent);
    }

    // Volume filters
    if (criteria.min_volume_ratio !== undefined) {
      conditions.push('volume_ratio >= ?');
      params.push(criteria.min_volume_ratio);
    }
    if (criteria.max_volume_ratio !== undefined) {
      conditions.push('volume_ratio <= ?');
      params.push(criteria.max_volume_ratio);
    }

    // Consecutive days filters
    if (criteria.min_consecutive_up_days !== undefined) {
      conditions.push('consecutive_up_days >= ?');
      params.push(criteria.min_consecutive_up_days);
    }
    if (criteria.min_consecutive_down_days !== undefined) {
      conditions.push('consecutive_down_days >= ?');
      params.push(criteria.min_consecutive_down_days);
    }

    // SMA filters
    if (criteria.price_above_sma20 === true) {
      conditions.push('price_to_sma20_percent > 0');
    }
    if (criteria.price_below_sma20 === true) {
      conditions.push('price_to_sma20_percent < 0');
    }
    if (criteria.price_above_sma50 === true) {
      conditions.push('price_to_sma50_percent > 0');
    }
    if (criteria.price_below_sma50 === true) {
      conditions.push('price_to_sma50_percent < 0');
    }

    // RSI filters
    if (criteria.min_rsi !== undefined) {
      conditions.push('rsi_14 >= ?');
      params.push(criteria.min_rsi);
    }
    if (criteria.max_rsi !== undefined) {
      conditions.push('rsi_14 <= ?');
      params.push(criteria.max_rsi);
    }

    // Range filters
    if (criteria.min_high_low_range_percent !== undefined) {
      conditions.push('high_low_range_percent >= ?');
      params.push(criteria.min_high_low_range_percent);
    }

    // Build query
    let query = 'SELECT * FROM daily_metrics';

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date DESC';

    // Always add LIMIT clause for performance and safety
    // Default to 10,000 max to prevent runaway queries
    const limit = criteria.limit || 10000;
    query += ' LIMIT ?';
    params.push(limit);

    return { query, params };
  }

  /**
   * Parse natural language query into criteria (simplified)
   * TODO: Use Claude API for more sophisticated parsing
   */
  private parseNaturalLanguageQuery(
    query: string,
    universe: string,
    dateRange?: { start: string; end: string }
  ): ScanCriteria {
    const criteria: ScanCriteria = {
      universe,
      start_date: dateRange?.start,
      end_date: dateRange?.end,
      limit: 50
    };

    const lowerQuery = query.toLowerCase();

    // Capitulatory move detection
    if (lowerQuery.includes('capitulat') || lowerQuery.includes('capitulation')) {
      criteria.min_change_percent = 5; // Big up move
      criteria.min_volume_ratio = 2; // High volume
      criteria.min_high_low_range_percent = 8; // Wide range
    }

    // Breakout detection
    if (lowerQuery.includes('breakout')) {
      criteria.min_change_percent = 3;
      criteria.min_volume_ratio = 1.5;
      criteria.price_above_sma20 = true;
    }

    // Oversold detection
    if (lowerQuery.includes('oversold')) {
      criteria.max_rsi = 30;
      criteria.min_consecutive_down_days = 3;
    }

    // Overbought detection
    if (lowerQuery.includes('overbought')) {
      criteria.min_rsi = 70;
      criteria.min_consecutive_up_days = 3;
    }

    // High volume detection
    if (lowerQuery.includes('high volume') || lowerQuery.includes('volume spike')) {
      criteria.min_volume_ratio = 3;
    }

    // Consecutive up/down days
    const consecutiveUpMatch = lowerQuery.match(/(\d+)\s*consecutive\s*up/);
    if (consecutiveUpMatch) {
      criteria.min_consecutive_up_days = parseInt(consecutiveUpMatch[1]);
    }

    const consecutiveDownMatch = lowerQuery.match(/(\d+)\s*consecutive\s*down/);
    if (consecutiveDownMatch) {
      criteria.min_consecutive_down_days = parseInt(consecutiveDownMatch[1]);
    }

    // Percentage change
    const percentMatch = lowerQuery.match(/(\d+)%\s*(up|gain|increase)/);
    if (percentMatch) {
      criteria.min_change_percent = parseInt(percentMatch[1]);
    }

    return criteria;
  }

  /**
   * Calculate relevance score for a match (0-100)
   */
  private calculateRelevanceScore(metrics: DailyMetrics, criteria: ScanCriteria): number {
    let score = 50; // Base score

    // Boost score for extreme values
    if (metrics.volume_ratio && metrics.volume_ratio > 3) {
      score += 10;
    }

    if (metrics.change_percent && Math.abs(metrics.change_percent) > 5) {
      score += 10;
    }

    if (metrics.high_low_range_percent && metrics.high_low_range_percent > 10) {
      score += 10;
    }

    if (metrics.consecutive_up_days && metrics.consecutive_up_days >= 5) {
      score += 10;
    }

    if (metrics.consecutive_down_days && metrics.consecutive_down_days >= 5) {
      score += 10;
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Save scan execution to scan_history table (Phase 3 + Phase 4)
   */
  private saveScanHistory(
    userPrompt: string,
    universeId: string | undefined,
    dateRangeStart: string | undefined,
    dateRangeEnd: string | undefined,
    matchesFound: number,
    executionTimeMs: number,
    matches: ScanMatch[] // Phase 4: store full results for caching
  ): string {
    const scanId = crypto.randomUUID();
    const db = getDatabase();

    try {
      // Serialize matches to JSON
      const resultsJson = JSON.stringify(matches);

      const stmt = db.prepare(`
        INSERT INTO scan_history (
          id, user_prompt, universe_id, date_range_start, date_range_end,
          matches_found, results_json, execution_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        scanId,
        userPrompt,
        universeId || null,
        dateRangeStart || null,
        dateRangeEnd || null,
        matchesFound,
        resultsJson,
        executionTimeMs
      );

      console.log(`💾 Saved scan to history: ${scanId} (${matchesFound} matches, ${resultsJson.length} bytes)`);
    } catch (error: any) {
      console.error('❌ Failed to save scan history:', error.message);
      // Don't throw - scan results are still valid even if history save fails
    }

    return scanId;
  }

  /**
   * Save Claude-generated scanner script permanently
   */
  private async saveScannerScript(
    query: string,
    explanation: string,
    universe: string,
    dateRange: { start: string; end: string } | undefined,
    matchesFound: number,
    tempFilepath: string
  ): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `scanner-${timestamp}.ts`;
      const metadataFilename = `scanner-${timestamp}.json`;

      const scriptsDir = path.join(__dirname, '../../claude-generated-scripts');
      const scriptPath = path.join(scriptsDir, filename);
      const metadataPath = path.join(scriptsDir, metadataFilename);

      // Ensure scripts directory exists
      await fs.mkdir(scriptsDir, { recursive: true });

      // Save the script
      await fs.copyFile(tempFilepath, scriptPath);

      // Save metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        type: 'scanner',
        userQuery: query,
        explanation,
        universe,
        dateRange: dateRange || null,
        matchesFound,
        scriptFilename: filename
      };

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

      console.log(`💾 Saved scanner script: ${filename}`);
      console.log(`📄 Saved metadata: ${metadataFilename}`);
    } catch (error: any) {
      console.error('❌ Error saving scanner script:', error);
      // Don't throw - this is a nice-to-have feature
    }
  }
}

// Export singleton instance
export default new ScannerService();
