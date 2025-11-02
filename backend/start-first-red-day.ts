import { AgentLearningService } from './src/services/agent-learning.service';
import { initializeDatabase } from './src/database/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const agentId = '4eed4e6a-dec3-4115-a865-c125df39b8d1';

async function main() {
  try {
    console.log(`Starting learning iteration for First Red Day Fade Trader (${agentId})...`);

    // Initialize database
    const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'backtesting.db');
    initializeDatabase(dbPath);

    // Create agent learning service
    const learningService = new AgentLearningService();

    // Start learning iteration
    const result = await learningService.runIteration(agentId);

    console.log('\n✅ Learning iteration complete!');
    console.log('Iteration ID:', result.iteration.id);
    console.log('Signals Found:', result.iteration.signals_found);
    console.log('Status:', result.iteration.iteration_status);

  } catch (error: any) {
    console.error('❌ Error starting learning iteration:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
