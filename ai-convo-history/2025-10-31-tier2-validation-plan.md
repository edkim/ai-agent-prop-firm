# Tier 2: Validation & Monitoring Plan

**Date**: 2025-10-31
**Status**: Planning Phase
**Prerequisites**: Tier 1 complete (max_tokens increased to 20000, truncation detection added)

---

## Executive Summary

Tier 1 successfully increased max_tokens and added basic truncation warnings, achieving a 67% error reduction (6 errors → 2 errors per script). However, 2 stubborn errors remain:

1. **Line 298**: Null in typed arrays (`const tradingDays: string[] = [null]`)
2. **Line 365**: Code truncation (incomplete scripts missing closing braces)

Tier 2 focuses on **early detection, automatic validation, and comprehensive monitoring** to catch these errors before script execution, providing data-driven insights for further improvements.

---

## Goals

### Primary Objectives
1. **Detect truncated scripts** before execution (save 2+ seconds per failure)
2. **Validate script completeness** (check syntax, required patterns, closing statements)
3. **Monitor token usage** to understand generation patterns
4. **Flag problematic patterns** in generated code automatically
5. **Create feedback loop** to improve TypeScript guidance iteratively

### Success Metrics
- 100% of truncated scripts detected before execution
- <5 second validation overhead per script
- Detailed token usage logs for optimization decisions
- Zero false positives in validation (no valid scripts rejected)
- Data-driven insights for Tier 3 prompt optimization

---

## Implementation Plan

### Phase 1: Script Completeness Validation (2-3 hours)

#### 1.1 Create Validation Utility

**File**: `backend/src/utils/script-validator.ts`

```typescript
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metrics: {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    openBraces: number;
    closeBraces: number;
    hasRunBacktestCall: boolean;
    hasCatchStatement: boolean;
    estimatedCompleteness: number; // 0-100%
  };
}

export interface ValidationError {
  type: 'TRUNCATION' | 'SYNTAX' | 'MISSING_REQUIRED' | 'NULL_IN_ARRAY';
  line?: number;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ValidationWarning {
  type: 'SUSPICIOUS_PATTERN' | 'POTENTIAL_ISSUE';
  line?: number;
  message: string;
}

export class ScriptValidator {
  /**
   * Validate a generated TypeScript script for completeness and common issues
   */
  static validate(script: string, scriptType: 'scanner' | 'execution'): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Check for truncation indicators
    const truncationErrors = this.detectTruncation(script);
    errors.push(...truncationErrors);

    // 2. Check for null in typed arrays
    const nullArrayErrors = this.detectNullInArrays(script);
    errors.push(...nullArrayErrors);

    // 3. Check for required patterns
    const missingPatternErrors = this.checkRequiredPatterns(script, scriptType);
    errors.push(...missingPatternErrors);

    // 4. Calculate metrics
    const metrics = this.calculateMetrics(script);

    // 5. Check for suspicious patterns
    const suspiciousWarnings = this.detectSuspiciousPatterns(script);
    warnings.push(...suspiciousWarnings);

    return {
      isValid: errors.filter(e => e.severity === 'CRITICAL').length === 0,
      errors,
      warnings,
      metrics
    };
  }

  /**
   * Detect truncation by checking for incomplete code patterns
   */
  private static detectTruncation(script: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = script.split('\n');
    const lastLine = lines[lines.length - 1]?.trim();

    // Check 1: Missing final catch statement
    if (!script.includes('.catch(console.error)') && !script.includes('.catch(err =>')) {
      errors.push({
        type: 'TRUNCATION',
        message: 'Script missing final .catch() statement - likely truncated',
        severity: 'CRITICAL'
      });
    }

    // Check 2: Unbalanced braces
    const openBraces = (script.match(/\{/g) || []).length;
    const closeBraces = (script.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      errors.push({
        type: 'TRUNCATION',
        line: lines.length,
        message: `Unbalanced braces: ${openBraces} open, ${closeBraces} close - likely truncated`,
        severity: 'CRITICAL'
      });
    }

    // Check 3: Last line is incomplete (doesn't end with ; or })
    if (lastLine && !lastLine.endsWith(';') && !lastLine.endsWith('}') &&
        !lastLine.endsWith(');') && !lastLine.startsWith('//')) {
      errors.push({
        type: 'TRUNCATION',
        line: lines.length,
        message: `Last line incomplete: "${lastLine.substring(0, 50)}..." - likely truncated`,
        severity: 'CRITICAL'
      });
    }

    // Check 4: Missing runBacktest() or runScan() call
    const hasRunCall = script.includes('runBacktest()') || script.includes('runScan()');
    if (!hasRunCall) {
      errors.push({
        type: 'TRUNCATION',
        message: 'Missing runBacktest() or runScan() function call - likely truncated',
        severity: 'CRITICAL'
      });
    }

    return errors;
  }

  /**
   * Detect null values in typed arrays (TypeScript strict mode violation)
   */
  private static detectNullInArrays(script: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = script.split('\n');

    // Regex to find patterns like: const foo: type[] = [null]
    const nullArrayPattern = /const\s+\w+\s*:\s*\w+\[\]\s*=\s*\[null\]/g;

    lines.forEach((line, index) => {
      if (nullArrayPattern.test(line)) {
        errors.push({
          type: 'NULL_IN_ARRAY',
          line: index + 1,
          message: `Null value in typed array: "${line.trim()}" - TypeScript strict mode violation`,
          severity: 'HIGH'
        });
      }
    });

    return errors;
  }

  /**
   * Check for required patterns based on script type
   */
  private static checkRequiredPatterns(script: string, scriptType: 'scanner' | 'execution'): ValidationError[] {
    const errors: ValidationError[] = [];

    // Common required patterns
    const requiredPatterns = [
      { pattern: /import.*initializeDatabase/, message: 'Missing database import' },
      { pattern: /interface.*Result/, message: 'Missing result interface definition' }
    ];

    if (scriptType === 'scanner') {
      requiredPatterns.push(
        { pattern: /interface ScanMatch/, message: 'Missing ScanMatch interface' },
        { pattern: /runScan\(\)/, message: 'Missing runScan() function' }
      );
    } else {
      requiredPatterns.push(
        { pattern: /interface TradeResult/, message: 'Missing TradeResult interface' },
        { pattern: /runBacktest\(\)/, message: 'Missing runBacktest() function' }
      );
    }

    requiredPatterns.forEach(({ pattern, message }) => {
      if (!pattern.test(script)) {
        errors.push({
          type: 'MISSING_REQUIRED',
          message,
          severity: 'HIGH'
        });
      }
    });

    return errors;
  }

  /**
   * Calculate script metrics for analysis
   */
  private static calculateMetrics(script: string) {
    const lines = script.split('\n');
    const totalLines = lines.length;
    const codeLines = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;
    const commentLines = lines.filter(l => l.trim().startsWith('//')).length;
    const openBraces = (script.match(/\{/g) || []).length;
    const closeBraces = (script.match(/\}/g) || []).length;
    const hasRunBacktestCall = script.includes('runBacktest()') || script.includes('runScan()');
    const hasCatchStatement = script.includes('.catch(');

    // Estimate completeness (0-100%)
    let completeness = 100;
    if (!hasRunBacktestCall) completeness -= 30;
    if (!hasCatchStatement) completeness -= 20;
    if (openBraces !== closeBraces) completeness -= 25;
    if (totalLines < 100) completeness -= 15; // Suspiciously short

    return {
      totalLines,
      codeLines,
      commentLines,
      openBraces,
      closeBraces,
      hasRunBacktestCall,
      hasCatchStatement,
      estimatedCompleteness: Math.max(0, completeness)
    };
  }

  /**
   * Detect suspicious patterns that might indicate issues
   */
  private static detectSuspiciousPatterns(script: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const lines = script.split('\n');

    // Pattern 1: Non-existent scanner signal properties
    const suspiciousMetricsAccess = /metrics\.(volume_spike|bearish_rejection|bullish_rejection)/;
    lines.forEach((line, index) => {
      if (suspiciousMetricsAccess.test(line)) {
        warnings.push({
          type: 'SUSPICIOUS_PATTERN',
          line: index + 1,
          message: `Accessing non-existent metrics property: "${line.trim()}"`
        });
      }
    });

    // Pattern 2: Missing ticker field in TradeResult
    const resultPushPattern = /results\.push\(\{[^}]*\}\)/;
    lines.forEach((line, index) => {
      if (resultPushPattern.test(line) && !line.includes('ticker')) {
        warnings.push({
          type: 'SUSPICIOUS_PATTERN',
          line: index + 1,
          message: 'TradeResult might be missing required ticker field'
        });
      }
    });

    return warnings;
  }
}
```

#### 1.2 Integrate Validation into Script Generation

**File**: `backend/src/services/claude.service.ts`

Add validation after script extraction:

```typescript
// After line 78 (in generateScript method)
const scriptResult = this.parseClaudeResponse(textContent.text);

// NEW: Validate script before returning
const validation = ScriptValidator.validate(scriptResult.code, 'execution');
if (!validation.isValid) {
  console.error('❌ Generated script failed validation:');
  validation.errors.forEach(err => {
    console.error(`  [${err.severity}] ${err.message}${err.line ? ` (line ${err.line})` : ''}`);
  });

  // Log metrics for analysis
  console.log('📊 Script metrics:', validation.metrics);

  // Optionally: Throw error or flag for retry
  if (validation.errors.some(e => e.type === 'TRUNCATION')) {
    console.warn('⚠️  TRUNCATION DETECTED - Consider simplifying prompt or increasing max_tokens');
  }
}

return scriptResult;
```

---

### Phase 2: Token Usage Monitoring (1-2 hours)

#### 2.1 Create Token Tracking System

**File**: `backend/src/utils/token-tracker.ts`

```typescript
export interface TokenUsageLog {
  timestamp: string;
  scriptType: 'scanner' | 'execution';
  model: string;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  maxTokensConfig: number;
  stopReason: string;
  truncated: boolean;
  scriptLength: number;
  scriptLines: number;
  iterationId?: string;
}

export class TokenTracker {
  private static logs: TokenUsageLog[] = [];

  /**
   * Log token usage from Claude API response
   */
  static log(usage: {
    scriptType: 'scanner' | 'execution';
    model: string;
    response: any; // Anthropic API response
    maxTokensConfig: number;
    generatedScript: string;
    iterationId?: string;
  }) {
    const log: TokenUsageLog = {
      timestamp: new Date().toISOString(),
      scriptType: usage.scriptType,
      model: usage.model,
      promptTokens: usage.response.usage?.input_tokens || 0,
      responseTokens: usage.response.usage?.output_tokens || 0,
      totalTokens: (usage.response.usage?.input_tokens || 0) + (usage.response.usage?.output_tokens || 0),
      maxTokensConfig: usage.maxTokensConfig,
      stopReason: usage.response.stop_reason || 'unknown',
      truncated: usage.response.stop_reason === 'max_tokens',
      scriptLength: usage.generatedScript.length,
      scriptLines: usage.generatedScript.split('\n').length,
      iterationId: usage.iterationId
    };

    this.logs.push(log);

    // Persist to file for analysis
    this.persist(log);

    // Console output
    this.logToConsole(log);
  }

  /**
   * Save token usage to JSON file for later analysis
   */
  private static persist(log: TokenUsageLog) {
    const fs = require('fs');
    const path = require('path');

    const logDir = path.join(__dirname, '../../token-usage-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(log) + '\n');
  }

  /**
   * Output formatted token usage to console
   */
  private static logToConsole(log: TokenUsageLog) {
    console.log('\n📊 Token Usage Report:');
    console.log(`   Type: ${log.scriptType}`);
    console.log(`   Input tokens: ${log.promptTokens.toLocaleString()}`);
    console.log(`   Output tokens: ${log.responseTokens.toLocaleString()} / ${log.maxTokensConfig.toLocaleString()} (${((log.responseTokens / log.maxTokensConfig) * 100).toFixed(1)}%)`);
    console.log(`   Stop reason: ${log.stopReason}${log.truncated ? ' ⚠️  TRUNCATED' : ''}`);
    console.log(`   Script: ${log.scriptLines} lines, ${(log.scriptLength / 1024).toFixed(1)} KB`);
  }

  /**
   * Get analytics from recent logs
   */
  static getAnalytics(lastN: number = 100) {
    const recentLogs = this.logs.slice(-lastN);

    const truncatedCount = recentLogs.filter(l => l.truncated).length;
    const avgInputTokens = recentLogs.reduce((sum, l) => sum + l.promptTokens, 0) / recentLogs.length;
    const avgOutputTokens = recentLogs.reduce((sum, l) => sum + l.responseTokens, 0) / recentLogs.length;
    const avgUtilization = (avgOutputTokens / recentLogs[0]?.maxTokensConfig || 1) * 100;

    return {
      totalCalls: recentLogs.length,
      truncatedCalls: truncatedCount,
      truncationRate: (truncatedCount / recentLogs.length) * 100,
      avgInputTokens: Math.round(avgInputTokens),
      avgOutputTokens: Math.round(avgOutputTokens),
      avgUtilization: avgUtilization.toFixed(1) + '%',
      recommendation: this.getRecommendation(avgOutputTokens, recentLogs[0]?.maxTokensConfig, truncatedCount / recentLogs.length)
    };
  }

  private static getRecommendation(avgOutput: number, maxConfig: number, truncationRate: number): string {
    if (truncationRate > 0.2) {
      return 'High truncation rate - increase max_tokens or simplify prompts';
    } else if (avgOutput / maxConfig > 0.9) {
      return 'Output tokens near limit - consider increasing max_tokens';
    } else if (avgOutput / maxConfig < 0.5) {
      return 'Output tokens well below limit - current config is sufficient';
    }
    return 'Token usage is balanced';
  }
}
```

#### 2.2 Integrate Token Tracking

**File**: `backend/src/services/claude.service.ts`

```typescript
// After line 66 (in generateScript, after response received)
// NEW: Track token usage
TokenTracker.log({
  scriptType: 'execution',
  model: this.model,
  response,
  maxTokensConfig: this.maxTokens,
  generatedScript: textContent.text,
  iterationId: params.iterationId // if available
});
```

---

### Phase 3: Error Pattern Detection (1 hour)

#### 3.1 Create Pattern Detector

**File**: `backend/src/utils/error-pattern-detector.ts`

```typescript
export interface ErrorPattern {
  pattern: RegExp;
  errorType: string;
  guidance: string;
  ruleNumber?: number;
}

export class ErrorPatternDetector {
  private static patterns: ErrorPattern[] = [
    {
      pattern: /const\s+\w+\s*:\s*string\[\]\s*=\s*\[null\]/,
      errorType: 'NULL_IN_TYPED_ARRAY',
      guidance: 'Never use null in typed arrays. Use [] or proper values.',
      ruleNumber: 7
    },
    {
      pattern: /metrics\.(volume_spike|bearish_rejection|bullish_rejection)/,
      errorType: 'NON_EXISTENT_METRICS_PROPERTY',
      guidance: 'Only access metrics properties that scanner actually outputs.',
      ruleNumber: 8
    },
    {
      pattern: /results\.push\(\{\s*date:/,
      errorType: 'POTENTIALLY_MISSING_TICKER',
      guidance: 'Always include ticker field in TradeResult objects.',
      ruleNumber: 9
    }
  ];

  /**
   * Scan script for known error patterns
   */
  static detect(script: string): { found: boolean; matches: Array<{ line: number; type: string; guidance: string }> } {
    const lines = script.split('\n');
    const matches: Array<{ line: number; type: string; guidance: string }> = [];

    lines.forEach((line, index) => {
      this.patterns.forEach(pattern => {
        if (pattern.pattern.test(line)) {
          matches.push({
            line: index + 1,
            type: pattern.errorType,
            guidance: pattern.guidance
          });
        }
      });
    });

    return {
      found: matches.length > 0,
      matches
    };
  }

  /**
   * Generate improvement suggestions based on detected patterns
   */
  static suggestImprovements(detections: ReturnType<typeof ErrorPatternDetector.detect>): string[] {
    const suggestions: string[] = [];
    const errorCounts = new Map<string, number>();

    // Count occurrences of each error type
    detections.matches.forEach(m => {
      errorCounts.set(m.type, (errorCounts.get(m.type) || 0) + 1);
    });

    // Generate suggestions
    errorCounts.forEach((count, type) => {
      const pattern = this.patterns.find(p => p.errorType === type);
      if (pattern && pattern.ruleNumber) {
        suggestions.push(
          `Rule ${pattern.ruleNumber} violated ${count}x: ${pattern.guidance}`
        );
      }
    });

    return suggestions;
  }
}
```

---

### Phase 4: Automated Retry Logic (2 hours)

#### 4.1 Create Retry Manager

**File**: `backend/src/utils/script-retry-manager.ts`

```typescript
export interface RetryConfig {
  maxRetries: number;
  retryOnTruncation: boolean;
  retryOnValidationFailure: boolean;
  simplifyPromptOnRetry: boolean;
}

export class ScriptRetryManager {
  private static defaultConfig: RetryConfig = {
    maxRetries: 2,
    retryOnTruncation: true,
    retryOnValidationFailure: true,
    simplifyPromptOnRetry: true
  };

  /**
   * Attempt script generation with automatic retry on failure
   */
  static async generateWithRetry(
    generatorFn: () => Promise<{ code: string; explanation: string }>,
    scriptType: 'scanner' | 'execution',
    config: Partial<RetryConfig> = {}
  ): Promise<{ code: string; explanation: string; attempts: number }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let attempts = 0;
    let lastError: any;

    while (attempts < finalConfig.maxRetries) {
      attempts++;
      console.log(`🔄 Generation attempt ${attempts}/${finalConfig.maxRetries}...`);

      try {
        const result = await generatorFn();

        // Validate
        const validation = ScriptValidator.validate(result.code, scriptType);

        if (validation.isValid) {
          console.log(`✅ Script generated successfully on attempt ${attempts}`);
          return { ...result, attempts };
        }

        // Check if we should retry
        const hasTruncation = validation.errors.some(e => e.type === 'TRUNCATION');
        const hasCriticalErrors = validation.errors.some(e => e.severity === 'CRITICAL');

        if (!hasTruncation && !hasCriticalErrors) {
          console.log(`⚠️  Script has warnings but is usable (attempt ${attempts})`);
          return { ...result, attempts };
        }

        if (attempts < finalConfig.maxRetries) {
          console.warn(`⚠️  Script validation failed, retrying...`);
          validation.errors.forEach(err => console.error(`   - ${err.message}`));

          // TODO: Implement prompt simplification logic if enabled
          if (finalConfig.simplifyPromptOnRetry) {
            console.log('   📝 Simplifying prompt for next attempt...');
          }
        } else {
          console.error(`❌ Max retries reached. Returning best attempt.`);
          return { ...result, attempts };
        }

      } catch (error) {
        lastError = error;
        console.error(`❌ Generation attempt ${attempts} failed:`, error);

        if (attempts >= finalConfig.maxRetries) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Script generation failed after max retries');
  }
}
```

---

## Monitoring Dashboard (Phase 5 - Optional)

### Create Analysis Script

**File**: `backend/scripts/analyze-token-usage.ts`

```typescript
/**
 * Analyze token usage logs and generate insights
 * Run: npx ts-node scripts/analyze-token-usage.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TokenLog {
  timestamp: string;
  scriptType: string;
  promptTokens: number;
  responseTokens: number;
  maxTokensConfig: number;
  truncated: boolean;
  scriptLines: number;
}

function analyzeLogs(logDir: string) {
  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl'));
  const allLogs: TokenLog[] = [];

  files.forEach(file => {
    const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      try {
        allLogs.push(JSON.parse(line));
      } catch (e) {
        // Skip invalid lines
      }
    });
  });

  console.log('📊 Token Usage Analysis Report\n');
  console.log(`Total API calls: ${allLogs.length}`);
  console.log(`Date range: ${allLogs[0]?.timestamp.split('T')[0]} to ${allLogs[allLogs.length - 1]?.timestamp.split('T')[0]}\n`);

  // Truncation analysis
  const truncated = allLogs.filter(l => l.truncated);
  console.log(`Truncation Rate: ${((truncated.length / allLogs.length) * 100).toFixed(1)}% (${truncated.length}/${allLogs.length})`);

  // Average token usage
  const avgPrompt = allLogs.reduce((sum, l) => sum + l.promptTokens, 0) / allLogs.length;
  const avgResponse = allLogs.reduce((sum, l) => sum + l.responseTokens, 0) / allLogs.length;
  console.log(`\nAverage prompt tokens: ${Math.round(avgPrompt).toLocaleString()}`);
  console.log(`Average response tokens: ${Math.round(avgResponse).toLocaleString()}`);
  console.log(`Average utilization: ${((avgResponse / allLogs[0].maxTokensConfig) * 100).toFixed(1)}%`);

  // By script type
  const scannerLogs = allLogs.filter(l => l.scriptType === 'scanner');
  const executionLogs = allLogs.filter(l => l.scriptType === 'execution');

  console.log(`\n📝 Scanner Scripts (${scannerLogs.length}):`);
  console.log(`   Avg response tokens: ${Math.round(scannerLogs.reduce((s, l) => s + l.responseTokens, 0) / scannerLogs.length).toLocaleString()}`);
  console.log(`   Truncation rate: ${((scannerLogs.filter(l => l.truncated).length / scannerLogs.length) * 100).toFixed(1)}%`);

  console.log(`\n⚡ Execution Scripts (${executionLogs.length}):`);
  console.log(`   Avg response tokens: ${Math.round(executionLogs.reduce((s, l) => s + l.responseTokens, 0) / executionLogs.length).toLocaleString()}`);
  console.log(`   Truncation rate: ${((executionLogs.filter(l => l.truncated).length / executionLogs.length) * 100).toFixed(1)}%`);

  // Recommendations
  console.log('\n💡 Recommendations:');
  if (truncated.length / allLogs.length > 0.2) {
    console.log('   ⚠️  High truncation rate - consider increasing max_tokens or simplifying prompts');
  }
  if (avgResponse / allLogs[0].maxTokensConfig > 0.9) {
    console.log('   ⚠️  Response tokens near limit - increase max_tokens recommended');
  }
  if (avgPrompt > 3000) {
    console.log('   📝 Large prompt size - consider simplifying system prompts');
  }
}

const logDir = path.join(__dirname, '../token-usage-logs');
if (fs.existsSync(logDir)) {
  analyzeLogs(logDir);
} else {
  console.log('No token usage logs found. Run some iterations first.');
}
```

---

## Testing Plan

### Unit Tests

```typescript
// backend/src/utils/__tests__/script-validator.test.ts

describe('ScriptValidator', () => {
  it('should detect truncated scripts', () => {
    const truncatedScript = `
      import { something } from './somewhere';
      function runBacktest() {
        const data =
    `;

    const result = ScriptValidator.validate(truncatedScript, 'execution');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.type === 'TRUNCATION')).toBe(true);
  });

  it('should detect null in typed arrays', () => {
    const scriptWithNull = `
      const tradingDays: string[] = [null];
    `;

    const result = ScriptValidator.validate(scriptWithNull, 'execution');
    expect(result.errors.some(e => e.type === 'NULL_IN_ARRAY')).toBe(true);
  });

  it('should pass valid complete scripts', () => {
    const validScript = `
      import { initializeDatabase } from './db';
      interface TradeResult { date: string; ticker: string; }
      async function runBacktest() {
        return [];
      }
      runBacktest().catch(console.error);
    `;

    const result = ScriptValidator.validate(validScript, 'execution');
    expect(result.isValid).toBe(true);
  });
});
```

### Integration Tests

1. **Test validation integration** - Generate 10 scripts, verify all are validated
2. **Test truncation detection** - Manually create truncated script, verify detection
3. **Test token tracking** - Verify logs are created and contain correct data
4. **Test retry logic** - Mock failed generation, verify retry behavior

---

## Deployment Plan

### Step 1: Deploy Validation (Low Risk)
1. Create `script-validator.ts` utility
2. Add unit tests
3. Integrate into claude.service.ts (non-blocking initially)
4. Monitor for false positives
5. Enable blocking after 24 hours of observation

### Step 2: Deploy Token Tracking (Low Risk)
1. Create `token-tracker.ts` utility
2. Integrate into both generateScript() and generateScannerScript()
3. Run for 7 days to collect baseline data
4. Analyze logs for optimization opportunities

### Step 3: Deploy Error Pattern Detection (Medium Risk)
1. Create `error-pattern-detector.ts`
2. Run on historical scripts to validate patterns
3. Integrate into validation pipeline
4. Use for reporting only initially (no blocking)

### Step 4: Deploy Retry Logic (High Risk - Optional)
1. Create `script-retry-manager.ts`
2. Test extensively in development
3. Enable for 10% of requests initially
4. Monitor impact on API usage and latency
5. Gradually increase to 100% if beneficial

---

## Success Criteria

### Quantitative Metrics
- [ ] 100% truncation detection rate
- [ ] <5% false positive rate in validation
- [ ] Token usage logs created for 100% of API calls
- [ ] <100ms validation overhead per script
- [ ] Error pattern detection accuracy >95%

### Qualitative Metrics
- [ ] Developers can analyze token trends easily
- [ ] Validation errors are actionable and clear
- [ ] System provides data-driven improvement suggestions
- [ ] Retry logic reduces failed iterations (if implemented)

---

## Rollback Plan

Each phase is independent and can be rolled back by:
1. Removing validation call from claude.service.ts
2. Removing token tracking call
3. Disabling error pattern detection
4. Disabling retry logic

No data loss risk - all phases are additive and log-based.

---

## Cost/Benefit Analysis

### Costs
- **Development time**: 6-8 hours total
- **Maintenance**: Minimal (utilities are self-contained)
- **Runtime overhead**: ~50-100ms per generation (validation)
- **Storage**: ~1MB/day for token logs

### Benefits
- **Time saved**: 2-5 seconds per failed script (no execution needed)
- **Data insights**: Understand exactly where improvements needed
- **Reduced debugging**: Validation provides clear error messages
- **Optimization guidance**: Token analytics drive Tier 3 decisions
- **Quality assurance**: Catch issues before they reach execution

**ROI**: High - pays for itself in first week of usage

---

## Next Actions

1. **Review this plan** with stakeholders
2. **Prioritize phases** (recommend 1, 2, 3, then optionally 4)
3. **Create task breakdown** in project management tool
4. **Schedule implementation** (recommend 1-2 days)
5. **Set up monitoring** to track Tier 2 effectiveness

---

## Appendix: File Structure

```
backend/
├── src/
│   ├── utils/
│   │   ├── script-validator.ts          (Phase 1)
│   │   ├── token-tracker.ts             (Phase 2)
│   │   ├── error-pattern-detector.ts    (Phase 3)
│   │   ├── script-retry-manager.ts      (Phase 4)
│   │   └── __tests__/
│   │       ├── script-validator.test.ts
│   │       ├── token-tracker.test.ts
│   │       └── error-pattern-detector.test.ts
│   └── services/
│       └── claude.service.ts            (Updated)
├── scripts/
│   └── analyze-token-usage.ts           (Phase 5)
└── token-usage-logs/                    (Generated)
    └── 2025-10-31.jsonl
```

---

**Document Version**: 1.0
**Author**: Claude Code
**Status**: Ready for Review
