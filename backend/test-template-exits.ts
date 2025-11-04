/**
 * Test script for ExecutionTemplateExitsService
 * Validates that template-based exits work correctly
 */

import { ExecutionTemplateExitsService } from './src/services/execution-template-exits.service';
import { ExitStrategyConfig } from './src/types/agent.types';

const service = new ExecutionTemplateExitsService();

console.log('🧪 Testing ExecutionTemplateExitsService\n');
console.log('='.repeat(80));

// Test 1: Price Action Trailing - Initial bars (not profitable yet)
console.log('\n📊 Test 1: Price Action Trailing - Initial State');
console.log('-'.repeat(80));

const priceActionConfig: ExitStrategyConfig = {
  template: 'price_action',
  stopLossPercent: null,
  takeProfitPercent: null,
  trailingStopPercent: 2.0,
  exitTime: null,
  atrMultiplier: null
};

const position1 = {
  side: 'SHORT' as 'SHORT',
  entry_price: 25.75,
  current_price: 25.50,
  highest_price: 25.75,
  lowest_price: 25.40,
  unrealized_pnl_percent: 0.97,
  metadata: null
};

const bar1 = {
  timestamp: Date.now(),
  open: 25.55,
  high: 25.60,
  low: 25.45,
  close: 25.50,
  volume: 10000,
  time_of_day: '12:25:00'
};

const priorBar1 = {
  timestamp: Date.now() - 60000,
  open: 25.70,
  high: 25.75,
  low: 25.65,
  close: 25.70,
  volume: 8000,
  time_of_day: '12:24:00'
};

const result1 = service.checkExit(priceActionConfig, position1, bar1, priorBar1);

console.log(`Position: SHORT @ $${position1.entry_price}, Current: $${position1.current_price}`);
console.log(`P&L: ${position1.unrealized_pnl_percent.toFixed(2)}%`);
console.log(`Result: ${result1.shouldExit ? '❌ EXIT' : '✅ HOLD'}`);
console.log(`Reason: ${result1.exitReason || 'Position still running'}`);
console.log(`Metadata: ${JSON.stringify(result1.updatedMetadata || {})}`);

// Test 2: Price Action Trailing - After 2 profitable bars
console.log('\n📊 Test 2: Price Action Trailing - Trailing Activated (2 profitable bars)');
console.log('-'.repeat(80));

const position2 = {
  side: 'SHORT' as 'SHORT',
  entry_price: 25.75,
  current_price: 25.20,
  highest_price: 25.75,
  lowest_price: 25.15,
  unrealized_pnl_percent: 2.14,
  metadata: {
    trailingActive: true,
    profitableBars: 2,
    priorBarTrailingStop: 25.35
  }
};

const bar2 = {
  timestamp: Date.now(),
  open: 25.25,
  high: 25.30,
  low: 25.15,
  close: 25.20,
  volume: 12000,
  time_of_day: '12:35:00'
};

const priorBar2 = {
  timestamp: Date.now() - 60000,
  open: 25.30,
  high: 25.35,
  low: 25.25,
  close: 25.30,
  volume: 11000,
  time_of_day: '12:34:00'
};

const result2 = service.checkExit(priceActionConfig, position2, bar2, priorBar2);

console.log(`Position: SHORT @ $${position2.entry_price}, Current: $${position2.current_price}`);
console.log(`P&L: ${position2.unrealized_pnl_percent.toFixed(2)}%`);
console.log(`Trailing stop: $${position2.metadata.priorBarTrailingStop}`);
console.log(`Prior bar high: $${priorBar2.high}`);
console.log(`Result: ${result2.shouldExit ? '❌ EXIT' : '✅ HOLD'}`);
console.log(`Reason: ${result2.exitReason || 'Position still running'}`);
console.log(`Updated trailing: $${result2.updatedMetadata?.priorBarTrailingStop || 'N/A'}`);

// Test 3: Price Action Trailing - Trailing stop hit
console.log('\n📊 Test 3: Price Action Trailing - Trailing Stop Hit');
console.log('-'.repeat(80));

const position3 = {
  side: 'SHORT' as 'SHORT',
  entry_price: 25.75,
  current_price: 25.50,
  highest_price: 25.75,
  lowest_price: 25.15,
  unrealized_pnl_percent: 0.97,
  metadata: {
    trailingActive: true,
    profitableBars: 3,
    priorBarTrailingStop: 25.30
  }
};

const bar3 = {
  timestamp: Date.now(),
  open: 25.40,
  high: 25.55, // Breaches trailing stop at 25.30
  low: 25.35,
  close: 25.50,
  volume: 15000,
  time_of_day: '12:45:00'
};

const priorBar3 = {
  timestamp: Date.now() - 60000,
  open: 25.20,
  high: 25.30,
  low: 25.15,
  close: 25.20,
  volume: 12000,
  time_of_day: '12:44:00'
};

const result3 = service.checkExit(priceActionConfig, position3, bar3, priorBar3);

console.log(`Position: SHORT @ $${position3.entry_price}, Current: $${position3.current_price}`);
console.log(`P&L: ${position3.unrealized_pnl_percent.toFixed(2)}%`);
console.log(`Trailing stop: $${position3.metadata.priorBarTrailingStop}`);
console.log(`Current bar high: $${bar3.high}`);
console.log(`Result: ${result3.shouldExit ? '✅ EXIT TRIGGERED' : '❌ HOLD (UNEXPECTED)'}`);
console.log(`Reason: ${result3.exitReason}`);
console.log(`Exit price: $${result3.exitPrice}`);

// Test 4: Intraday Time Exit - Market close
console.log('\n📊 Test 4: Intraday Time Exit - Market Close');
console.log('-'.repeat(80));

const intradayConfig: ExitStrategyConfig = {
  template: 'intraday_time',
  stopLossPercent: null,
  takeProfitPercent: null,
  trailingStopPercent: null,
  exitTime: '15:55:00',
  atrMultiplier: null
};

const position4 = {
  side: 'LONG' as 'LONG',
  entry_price: 25.00,
  current_price: 25.50,
  highest_price: 25.75,
  lowest_price: 24.90,
  unrealized_pnl_percent: 2.0
};

const bar4 = {
  timestamp: Date.now(),
  open: 25.45,
  high: 25.55,
  low: 25.40,
  close: 25.50,
  volume: 20000,
  time_of_day: '15:55:00'
};

const result4 = service.checkExit(intradayConfig, position4, bar4);

console.log(`Position: LONG @ $${position4.entry_price}, Current: $${position4.current_price}`);
console.log(`P&L: ${position4.unrealized_pnl_percent.toFixed(2)}%`);
console.log(`Time: ${bar4.time_of_day}`);
console.log(`Result: ${result4.shouldExit ? '✅ EXIT TRIGGERED' : '❌ HOLD (UNEXPECTED)'}`);
console.log(`Reason: ${result4.exitReason}`);

// Test 5: Fallback to simple exits
console.log('\n📊 Test 5: Fallback - Simple Exits (Unknown Template)');
console.log('-'.repeat(80));

const unknownConfig: ExitStrategyConfig = {
  template: 'unknown_template'
};

const position5 = {
  side: 'LONG' as 'LONG',
  entry_price: 25.00,
  current_price: 22.50,
  highest_price: 26.00,
  lowest_price: 22.00,
  unrealized_pnl_percent: -10.0
};

const bar5 = {
  timestamp: Date.now(),
  open: 22.60,
  high: 22.70,
  low: 22.40,
  close: 22.50,
  volume: 30000,
  time_of_day: '14:30:00'
};

const result5 = service.checkExit(unknownConfig, position5, bar5);

console.log(`Position: LONG @ $${position5.entry_price}, Current: $${position5.current_price}`);
console.log(`P&L: ${position5.unrealized_pnl_percent.toFixed(2)}%`);
console.log(`Result: ${result5.shouldExit ? '✅ EXIT TRIGGERED' : '❌ HOLD (UNEXPECTED)'}`);
console.log(`Reason: ${result5.exitReason}`);

// Summary
console.log('\n' + '='.repeat(80));
console.log('📋 TEST SUMMARY');
console.log('='.repeat(80));
console.log('');

const tests = [
  { name: 'Test 1: Initial state (no trailing)', expected: false, actual: result1.shouldExit },
  { name: 'Test 2: Trailing activated (hold)', expected: false, actual: result2.shouldExit },
  { name: 'Test 3: Trailing stop hit (exit)', expected: true, actual: result3.shouldExit },
  { name: 'Test 4: Time exit (market close)', expected: true, actual: result4.shouldExit },
  { name: 'Test 5: Simple fallback (stop loss)', expected: true, actual: result5.shouldExit }
];

let passed = 0;
let failed = 0;

tests.forEach((test, idx) => {
  const status = test.expected === test.actual ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${test.name}`);
  if (test.expected === test.actual) {
    passed++;
  } else {
    failed++;
  }
});

console.log('');
console.log(`Results: ${passed}/${tests.length} tests passed`);

if (failed === 0) {
  console.log('🎉 All tests passed! Template exits are working correctly.');
} else {
  console.log(`⚠️  ${failed} test(s) failed. Please review implementation.`);
  process.exit(1);
}
