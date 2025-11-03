/**
 * Graduate VWAP Mean Reversion Trader to Paper Trading
 */

import { initializeDatabase } from '../src/database/db';
import { GraduationService } from '../src/services/graduation.service';

const VWAP_AGENT_ID = 'd992e829-27d9-406d-b771-8e3789645a5e';

async function main() {
  console.log('🎓 Graduating VWAP Mean Reversion Trader to Paper Trading\n');

  // Initialize database
  const db = initializeDatabase('/Users/edwardkim/Code/ai-backtest/backtesting.db');

  // Check if agent exists
  const agent = db.prepare(`
    SELECT id, name, status FROM trading_agents WHERE id = ?
  `).get(VWAP_AGENT_ID) as any;

  if (!agent) {
    console.error(`❌ Agent not found: ${VWAP_AGENT_ID}`);
    process.exit(1);
  }

  console.log(`Agent: ${agent.name}`);
  console.log(`Current Status: ${agent.status}`);

  if (agent.status === 'paper_trading') {
    console.log('\n✅ Agent is already in paper_trading status');

    // Check if paper account exists
    const paperAccount = db.prepare(`
      SELECT * FROM paper_accounts WHERE agent_id = ?
    `).get(VWAP_AGENT_ID) as any;

    if (paperAccount) {
      console.log(`💰 Paper account exists: $${paperAccount.current_cash.toLocaleString()} balance`);
    } else {
      console.log('⚠️  No paper account found - creating one...');
      const { PaperAccountService } = require('../src/services/paper-account.service');
      const paperService = new PaperAccountService();
      const newAccount = await paperService.createAccount(VWAP_AGENT_ID);
      console.log(`💰 Created paper account: $${newAccount.initial_balance.toLocaleString()}`);
    }

    process.exit(0);
  }

  // Check eligibility
  const graduation = new GraduationService();
  const eligibility = await graduation.checkEligibility(VWAP_AGENT_ID);

  console.log('\n📊 Graduation Eligibility:');
  console.log(`  Eligible: ${eligibility.eligible ? '✅' : '❌'}`);
  console.log(`  Reason: ${eligibility.reason}`);
  console.log('\n  Statistics:');
  console.log(`    Total Iterations: ${eligibility.stats.total_iterations}`);
  console.log(`    Avg Win Rate: ${(eligibility.stats.avg_win_rate * 100).toFixed(1)}%`);
  console.log(`    Avg Sharpe: ${eligibility.stats.avg_sharpe.toFixed(2)}`);
  console.log(`    Avg Return: ${(eligibility.stats.avg_return * 100).toFixed(1)}%`);
  console.log(`    Total Signals: ${eligibility.stats.total_signals}`);
  console.log('\n  Criteria Met:');
  Object.entries(eligibility.criteria_met).forEach(([criterion, met]) => {
    console.log(`    ${criterion}: ${met ? '✅' : '❌'}`);
  });

  // Force graduate (bypassing criteria since agent only has 1 iteration)
  console.log('\n🚀 Force graduating agent (bypassing 20-iteration requirement)...');

  const newStatus = await graduation.graduate(VWAP_AGENT_ID, true);

  console.log(`\n✅ Success! Agent graduated to: ${newStatus}`);

  // Verify paper account was created
  const paperAccount = db.prepare(`
    SELECT * FROM paper_accounts WHERE agent_id = ?
  `).get(VWAP_AGENT_ID) as any;

  if (paperAccount) {
    console.log(`💰 Paper account created successfully!`);
    console.log(`   Account ID: ${paperAccount.id}`);
    console.log(`   Initial Balance: $${paperAccount.initial_balance.toLocaleString()}`);
    console.log(`   Current Cash: $${paperAccount.current_cash.toLocaleString()}`);
    console.log(`   Status: ${paperAccount.status}`);
  } else {
    console.error('❌ Failed to create paper account');
  }

  console.log('\n🎉 VWAP Mean Reversion Trader is ready for paper trading!');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
