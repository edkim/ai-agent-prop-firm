/**
 * Scanner Script Validation - Lookahead Bias Detection
 *
 * Static analysis tool to detect common lookahead bias patterns in generated scanner scripts.
 * Prevents scanners from using future data that wouldn't be available in real-time trading.
 */

export interface ValidationResult {
  hasLookAheadBias: boolean;
  violations: Array<{
    type: string;
    message: string;
    line?: number;
    severity: 'error' | 'warning';
    codeSnippet?: string;
  }>;
  summary: string;
}

/**
 * Detect lookahead bias in scanner code
 */
export function detectLookAheadBias(scannerCode: string): ValidationResult {
  const violations: ValidationResult['violations'] = [];
  const lines = scannerCode.split('\n');

  // Pattern 1: Finding peak/trough before processing
  // Looks for: "peakBar", "peakIndex", "topBar", "bottomBar", "maxGainPercent"
  const peakFindingPattern = /\b(peak|top|bottom|trough)(Bar|Index|Time|Price)\s*=/i;
  const maxMinPattern = /\b(max|min)(Gain|Loss|High|Low)(Percent|Price|Index)\s*=/i;

  lines.forEach((line, idx) => {
    if (peakFindingPattern.test(line) || maxMinPattern.test(line)) {
      // Check if this is inside a loop that processes all bars
      const context = lines.slice(Math.max(0, idx - 5), Math.min(lines.length, idx + 5)).join('\n');
      if (/for\s*\([^)]*\bi\b[^)]*<\s*\w+\.length/i.test(context)) {
        violations.push({
          type: 'peak_finding',
          message: 'Finding peak/trough by looping through all bars - likely lookahead bias. In real-time, you cannot know the high/low before it happens.',
          line: idx + 1,
          severity: 'error',
          codeSnippet: line.trim()
        });
      }
    }
  });

  // Pattern 2: Math.max/min on entire day arrays
  // Looks for: Math.max(...allBars.map()) or Math.max(...dayBars.map())
  const mathMaxMinPattern = /Math\.(max|min)\([^)]*\.(allBars|dayBars|bars|morningBars|afternoonBars)\.map\(/i;

  lines.forEach((line, idx) => {
    if (mathMaxMinPattern.test(line)) {
      // Check if this is NOT inside a lookback slice
      if (!/slice\(.*i\s*-\s*\d+.*,.*i\s*\)/.test(line)) {
        violations.push({
          type: 'math_extremes',
          message: 'Using Math.max/min on entire array - may include future bars. Use lookback windows instead: dayBars.slice(i - 20, i)',
          line: idx + 1,
          severity: 'error',
          codeSnippet: line.trim()
        });
      }
    }
  });

  // Pattern 3: Slicing from beginning to end of day
  // Looks for: .slice(0, allBars.length) or .slice(0, dayBars.length)
  const fullSlicePattern = /\.slice\s*\(\s*0\s*,\s*\w+\.length\s*\)/i;

  lines.forEach((line, idx) => {
    if (fullSlicePattern.test(line)) {
      violations.push({
        type: 'full_array_slice',
        message: 'Slicing entire array from 0 to length - includes future bars. Use lookback windows: dayBars.slice(i - N, i)',
        line: idx + 1,
        severity: 'error',
        codeSnippet: line.trim()
      });
    }
  });

  // Pattern 4: Processing future bars after finding a signal
  // Looks for: .slice(peakIndex + 1) or similar patterns
  const postEventPattern = /\.slice\s*\(\s*(peak|top|bottom|signal)(Index|Idx)\s*\+\s*1/i;

  lines.forEach((line, idx) => {
    if (postEventPattern.test(line)) {
      violations.push({
        type: 'post_event_processing',
        message: 'Processing bars after peak/signal - lookahead bias. In real-time, you detect patterns as they form, not after finding the peak.',
        line: idx + 1,
        severity: 'error',
        codeSnippet: line.trim()
      });
    }
  });

  // Pattern 5: Filtering morning bars all at once
  // Looks for: .filter(b => time >= '13:35' && time <= '15:30')
  const morningFilterPattern = /\.filter\s*\([^)]*time[^)]*>=.*&&.*time[^)]*<=/i;

  lines.forEach((line, idx) => {
    if (morningFilterPattern.test(line)) {
      const context = lines.slice(Math.max(0, idx - 3), Math.min(lines.length, idx + 10)).join('\n');
      // Check if the filtered array is then looped through
      if (/for\s*\([^)]*\bj\b[^)]*<\s*(morningBars|filteredBars)\.length/i.test(context)) {
        violations.push({
          type: 'time_window_filter',
          message: 'Filtering all morning/afternoon bars at once, then looping - lookahead bias. Process bars sequentially instead.',
          line: idx + 1,
          severity: 'error',
          codeSnippet: line.trim()
        });
      }
    }
  });

  // Pattern 6: Two-pass algorithms (find something, then process based on it)
  // Look for nested loops where outer loop finds max, inner loop processes
  const nestedLoopPattern = /for\s*\([^)]*\bi\b[^)]*<\s*\w+\.length[^}]*\{[^}]*for\s*\([^)]*\bj\b[^)]*<\s*i\b/gs;

  if (nestedLoopPattern.test(scannerCode)) {
    violations.push({
      type: 'two_pass_algorithm',
      message: 'Nested loop pattern detected - may be finding max/min first, then processing. Ensure outer loop processes sequentially without future knowledge.',
      severity: 'warning',
      codeSnippet: '(nested loop structure)'
    });
  }

  // Pattern 7: Check for proper sequential processing
  // Look for the CORRECT pattern: for (let i = N; i < bars.length; i++)
  const sequentialPattern = /for\s*\(\s*let\s+i\s*=\s*\d+\s*;\s*i\s*<\s*\w+\.length/i;
  const hasSequentialProcessing = sequentialPattern.test(scannerCode);

  if (!hasSequentialProcessing) {
    violations.push({
      type: 'no_sequential_processing',
      message: 'No sequential bar-by-bar processing detected. Scanner should use: for (let i = 30; i < dayBars.length; i++)',
      severity: 'warning'
    });
  }

  // Pattern 8: Check for lookback windows
  // Look for: bars.slice(i - N, i)
  const lookbackPattern = /\w+\.slice\s*\(\s*i\s*-\s*\d+\s*,\s*i\s*\)/i;
  const hasLookbackWindows = lookbackPattern.test(scannerCode);

  if (hasSequentialProcessing && !hasLookbackWindows) {
    violations.push({
      type: 'no_lookback_windows',
      message: 'Sequential processing found but no lookback windows (bars.slice(i - N, i)). Ensure you only use past data.',
      severity: 'warning'
    });
  }

  // Generate summary
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;

  let summary = '';
  if (errorCount === 0 && warningCount === 0) {
    summary = '✅ No lookahead bias detected. Scanner appears to use sequential bar-by-bar processing.';
  } else if (errorCount > 0) {
    summary = `🚨 ${errorCount} lookahead bias error(s) detected. Scanner likely uses future data. ${warningCount > 0 ? `Also ${warningCount} warning(s).` : ''}`;
  } else {
    summary = `⚠️  ${warningCount} potential issue(s) detected. Review scanner logic for proper sequential processing.`;
  }

  return {
    hasLookAheadBias: errorCount > 0,
    violations,
    summary
  };
}

/**
 * Format validation result for console output
 */
export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('\n' + '='.repeat(80));
  lines.push('📋 LOOKAHEAD BIAS VALIDATION REPORT');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(result.summary);
  lines.push('');

  if (result.violations.length > 0) {
    lines.push('Issues found:');
    lines.push('');

    result.violations.forEach((violation, idx) => {
      const icon = violation.severity === 'error' ? '🚨' : '⚠️ ';
      lines.push(`${idx + 1}. ${icon} ${violation.type.toUpperCase()}`);
      lines.push(`   ${violation.message}`);
      if (violation.line) {
        lines.push(`   Line ${violation.line}: ${violation.codeSnippet || '(see code)'}`);
      }
      lines.push('');
    });
  }

  lines.push('='.repeat(80));
  lines.push('');

  return lines.join('\n');
}

/**
 * Quick check - returns true if scanner passes validation
 */
export function validateScanner(scannerCode: string): boolean {
  const result = detectLookAheadBias(scannerCode);
  console.log(formatValidationReport(result));
  return !result.hasLookAheadBias;
}
