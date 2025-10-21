/**
 * Test Script Execution Service
 * Tests the dynamic script generation and execution
 */

import ScriptGeneratorService from './src/services/script-generator.service';
import ScriptExecutionService from './src/services/script-execution.service';

async function testScriptExecution() {
  console.log('Testing Script Generation and Execution');
  console.log('='.repeat(60));

  try {
    // Generate script
    console.log('\n1. Generating script...');
    const script = await ScriptGeneratorService.generateScript({
      strategyType: 'orb',
      ticker: 'HOOD',
      date: '2025-07-31',
      timeframe: '5min',
      config: {
        trailingStopPct: 2.0,
        marketFilterTicker: 'QQQ',
      },
    });

    console.log('Script generated successfully');
    console.log(`Script length: ${script.length} characters`);

    // Write to temp file
    console.log('\n2. Writing script to temp file...');
    const scriptPath = await ScriptGeneratorService.writeScriptToFile(script);
    console.log(`Script written to: ${scriptPath}`);

    // Show first few lines of generated script
    console.log('\n3. First 20 lines of generated script:');
    const lines = script.split('\n').slice(0, 20);
    lines.forEach((line, i) => console.log(`   ${i + 1}: ${line}`));

    // Execute script
    console.log('\n4. Executing script...');
    console.log('This may take a few seconds...');
    const result = await ScriptExecutionService.executeScript(scriptPath);

    if (result.success) {
      console.log('\n✅ Script executed successfully!');
      console.log(`\nExecution time: ${result.executionTime}ms`);

      if (result.data) {
        console.log('\n5. Parsed Results:');
        console.log('Backtest:', JSON.stringify(result.data.backtest, null, 2));
        console.log('\nTrades:', JSON.stringify(result.data.trades, null, 2));
        console.log('\nMetrics:', JSON.stringify(result.data.metrics, null, 2));
        console.log('\nSummary:');
        console.log(result.data.summary);
      } else {
        console.log('\n⚠️  No structured data parsed, showing raw output:');
        console.log(result.stdout);
      }
    } else {
      console.error('\n❌ Script execution failed!');
      console.error('Error:', result.error);
      console.error('\nStderr:', result.stderr);
      console.error('\nStdout:', result.stdout);
    }

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }

  console.log('\n' + '='.repeat(60));
}

testScriptExecution().catch(console.error);
