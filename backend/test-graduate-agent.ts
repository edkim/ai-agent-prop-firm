/**
 * Graduate VWAP agent to paper trading (force)
 * Tests that exit_strategy_config is copied correctly
 */

import { initializeDatabase, getDatabase } from './src/database/db';
import { GraduationService } from './src/services/graduation.service';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runGraduationTest() {
  const dbPath = process.env.DATABASE_PATH || './backtesting.db';
  initializeDatabase(dbPath);
  const db = getDatabase();

  const AGENT_ID = '3159d447-5cbc-41ec-828d-525c76db97b0'; // VWAP Mean Reversion Agent

  console.log('🎓 Testing Agent Graduation with Template-Based Exits\n');
  console.log('='.repeat(80));

// Check current status
console.log('\n📝 Step 1: Check current agent status');
console.log('-'.repeat(80));

const agentBefore = db.prepare(`
  SELECT id, name, status, exit_strategy_config
  FROM trading_agents
  WHERE id = ?
`).get(AGENT_ID) as any;

console.log(`Agent: ${agentBefore.name}`);
console.log(`Status: ${agentBefore.status}`);
console.log(`Exit config: ${agentBefore.exit_strategy_config || 'NULL'}`);

// Check latest iteration's winning template
console.log('\n📝 Step 2: Check latest iteration\'s winning template');
console.log('-'.repeat(80));

const latestIteration = db.prepare(`
  SELECT iteration_number, winning_template, win_rate, sharpe_ratio, total_return
  FROM agent_iterations
  WHERE agent_id = ?
  ORDER BY iteration_number DESC
  LIMIT 1
`).get(AGENT_ID) as any;

console.log(`Iteration: ${latestIteration.iteration_number}`);
console.log(`Winning template: ${latestIteration.winning_template}`);
console.log(`Win rate: ${(latestIteration.win_rate * 100).toFixed(1)}%`);
console.log(`Sharpe ratio: ${latestIteration.sharpe_ratio.toFixed(2)}`);
console.log(`Total return: ${latestIteration.total_return.toFixed(2)}%`);

// Graduate the agent (forced)
console.log('\n📝 Step 3: Graduate agent to paper_trading (FORCED)');
console.log('-'.repeat(80));

const graduationService = new GraduationService();

try {
  const newStatus = await graduationService.graduate(AGENT_ID, true); // force = true
  console.log(`✅ Agent graduated successfully to: ${newStatus}`);
} catch (error: any) {
  console.log(`❌ Graduation failed: ${error.message}`);
  process.exit(1);
}

// Check status after graduation
console.log('\n📝 Step 4: Verify agent state AFTER graduation');
console.log('-'.repeat(80));

const agentAfter = db.prepare(`
  SELECT id, name, status, exit_strategy_config
  FROM trading_agents
  WHERE id = ?
`).get(AGENT_ID) as any;

console.log(`Agent: ${agentAfter.name}`);
console.log(`Status: ${agentAfter.status}`);
console.log(`Exit config: ${agentAfter.exit_strategy_config ? 'SET' : 'NULL'}`);

if (agentAfter.exit_strategy_config) {
  const config = JSON.parse(agentAfter.exit_strategy_config);
  console.log('\n📊 Exit Strategy Configuration:');
  console.log(`  - Template: ${config.template}`);
  console.log(`  - Stop Loss %: ${config.stopLossPercent || 'null (uses template default)'}`);
  console.log(`  - Take Profit %: ${config.takeProfitPercent || 'null (uses template default)'}`);
  console.log(`  - Trailing Stop %: ${config.trailingStopPercent || 'null'}`);
  console.log(`  - Exit Time: ${config.exitTime || 'null'}`);
  console.log(`  - ATR Multiplier: ${config.atrMultiplier || 'null'}`);
}

// Check paper account
console.log('\n📝 Step 5: Verify paper trading account');
console.log('-'.repeat(80));

const paperAccount = db.prepare(`
  SELECT id, initial_balance, current_balance, equity, status
  FROM paper_accounts
  WHERE agent_id = ?
`).get(AGENT_ID) as any;

if (paperAccount) {
  console.log(`✅ Paper account exists: ${paperAccount.id}`);
  console.log(`   - Initial balance: $${paperAccount.initial_balance.toLocaleString()}`);
  console.log(`   - Current balance: $${paperAccount.current_balance.toLocaleString()}`);
  console.log(`   - Status: ${paperAccount.status}`);
} else {
  console.log(`❌ No paper account found (should have been created)`);
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('📋 GRADUATION TEST SUMMARY');
console.log('='.repeat(80));
console.log('');

const tests = [
  {
    name: 'Agent graduated from learning to paper_trading',
    pass: agentBefore.status === 'learning' && agentAfter.status === 'paper_trading'
  },
  {
    name: 'Exit strategy config was set',
    pass: agentAfter.exit_strategy_config !== null
  },
  {
    name: 'Template is price_action (the winning template)',
    pass: agentAfter.exit_strategy_config &&
          JSON.parse(agentAfter.exit_strategy_config).template === 'price_action'
  },
  {
    name: 'Trailing stop percent set to 2.0',
    pass: agentAfter.exit_strategy_config &&
          JSON.parse(agentAfter.exit_strategy_config).trailingStopPercent === 2.0
  },
  {
    name: 'Paper account exists and is active',
    pass: paperAccount && paperAccount.status === 'active'
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test) => {
  const status = test.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${test.name}`);
  if (test.pass) passed++;
  else failed++;
});

console.log('');
console.log(`Results: ${passed}/${tests.length} tests passed`);

if (failed === 0) {
  console.log('\n🎉 SUCCESS! Agent graduated with Price Action Trailing template!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Deploy to paper trading orchestrator');
  console.log('  2. Monitor live exits using Price Action Trailing logic');
  console.log('  3. Validate 80% win rate holds in real-time trading');
  console.log('');
  console.log(`Expected performance: ~80% WR, ~1.5% avg P&L per trade`);
} else {
  console.log(`\n⚠️  ${failed} test(s) failed. Please review.`);
  process.exit(1);
}
}

runGraduationTest().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
