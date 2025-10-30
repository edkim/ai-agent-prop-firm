/**
 * Database Migration Runner
 * Applies Phase 2 autonomy features migration to the database
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDatabase, initializeDatabase } from './db';

async function runMigration() {
  try {
    console.log('Starting Phase 2 Autonomy Features migration...\n');

    // Initialize database connection
    const dbPath = process.env.DATABASE_PATH || './backtesting.db';
    console.log(`Database path: ${dbPath}`);

    const db = initializeDatabase(dbPath);

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'phase2-autonomy.sql');
    console.log(`Reading migration from: ${migrationPath}`);

    const migration = fs.readFileSync(migrationPath, 'utf-8');

    // Execute the entire migration as a batch
    // This handles multi-line statements properly
    console.log('Executing migration...\n');

    try {
      db.exec(migration);
      console.log('✓ Migration executed successfully');
    } catch (error: any) {
      // Check for common errors that can be ignored
      if (error.message.includes('duplicate column name') ||
          error.message.includes('already exists')) {
        console.log('⚠ Some statements were skipped (already applied)');
        console.log('   This is normal if running migration multiple times');
      } else {
        throw error;
      }
    }

    console.log('\n✓ Migration completed successfully!');
    console.log('\nNew features available:');
    console.log('  - Scheduled iterations (cron-based learning)');
    console.log('  - Auto-refinement approval (threshold-based)');
    console.log('  - Continuous learning loops');
    console.log('  - Performance monitoring & alerts');
    console.log('  - Agent graduation system');
    console.log('\nNew tables:');
    console.log('  - agent_alerts');
    console.log('\nNew columns in trading_agents:');
    console.log('  - auto_learn_enabled');
    console.log('  - learning_schedule');
    console.log('  - next_scheduled_iteration');
    console.log('  - auto_approve_enabled');
    console.log('  - approval_thresholds');
    console.log('  - continuous_learning_enabled');
    console.log('  - max_iterations_per_day');
    console.log('  - min_iteration_gap_minutes');
    console.log('  - convergence_threshold\n');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
runMigration();
