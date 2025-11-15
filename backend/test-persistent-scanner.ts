/**
 * Test script for persistent scanner process
 *
 * This creates a minimal scanner and tests the persistent mode communication.
 */

import { PersistentScannerProcess } from './src/backtesting/persistent-scanner.process';
import * as fs from 'fs';
import * as path from 'path';

async function testPersistentScanner() {
  console.log('🧪 Testing Persistent Scanner Process\n');

  // Create a simple test scanner script
  const testScannerCode = `
import * as readline from 'readline';

// ========== ORIGINAL SCANNER CODE (wrapped as async function) ==========
async function executeScannerLogic(): Promise<any> {
  // Simple test: Just return a mock signal
  const databasePath = process.env.DATABASE_PATH || 'unknown';
  const tickers = (process.env.SCAN_TICKERS || '').split(',');

  console.error('[TestScanner] Executing with DB:', databasePath);
  console.error('[TestScanner] Tickers:', tickers);

  // Return mock signal
  return [{
    ticker: tickers[0] || 'TEST',
    signal_date: '2025-11-14',
    signal_time: '10:30:00',
    pattern_strength: 0.85
  }];
}

// ========== PERSISTENT MODE HANDLER ==========
async function main() {
  const isPersistentMode = process.env.PERSISTENT_MODE === 'true';

  if (!isPersistentMode) {
    // Legacy mode: Execute once with environment variables
    try {
      const result = await executeScannerLogic();
      console.log(JSON.stringify(result));
      process.exit(0);
    } catch (error: any) {
      console.error('Scanner error:', error.message);
      process.exit(1);
    }
  } else {
    // Persistent mode: Read requests from stdin, execute, write to stdout
    console.log('READY'); // Signal ready for first request

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line: string) => {
      try {
        // Parse scan request
        const request = JSON.parse(line);
        const { databasePath, tickers, requestId } = request;

        // Set environment variables for scanner
        process.env.DATABASE_PATH = databasePath;
        process.env.SCAN_TICKERS = tickers.join(',');

        // Execute scanner logic
        const result = await executeScannerLogic();

        // Write response
        const response = {
          success: true,
          data: result,
          requestId
        };
        console.log(JSON.stringify(response));
        console.log('READY'); // Signal ready for next request

      } catch (error: any) {
        // Write error response
        const response = {
          success: false,
          error: error.message,
          requestId: 'unknown'
        };
        console.log(JSON.stringify(response));
        console.log('READY'); // Signal ready for next request
      }
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      rl.close();
      process.exit(0);
    });
  }
}

// Start the scanner
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
`;

  // Write test scanner to file
  const scriptDir = path.join(__dirname, 'generated-scripts');
  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
  }

  const testScriptPath = path.join(scriptDir, 'test-persistent-scanner.ts');
  fs.writeFileSync(testScriptPath, testScannerCode);

  try {
    // Initialize persistent scanner
    console.log('1️⃣  Initializing persistent scanner...');
    const scanner = new PersistentScannerProcess();
    await scanner.initialize(testScriptPath);
    console.log('✅ Scanner initialized\n');

    // Test scan #1
    console.log('2️⃣  Running scan #1...');
    const result1 = await scanner.scan('/tmp/test-db-1.db', ['AAPL', 'MSFT']);
    console.log('✅ Scan #1 result:', JSON.stringify(result1, null, 2));
    console.log('');

    // Test scan #2 (reusing same process)
    console.log('3️⃣  Running scan #2 (reusing process)...');
    const result2 = await scanner.scan('/tmp/test-db-2.db', ['GOOGL', 'AMZN']);
    console.log('✅ Scan #2 result:', JSON.stringify(result2, null, 2));
    console.log('');

    // Test scan #3 (reusing same process again)
    console.log('4️⃣  Running scan #3 (reusing process again)...');
    const result3 = await scanner.scan('/tmp/test-db-3.db', ['TSLA']);
    console.log('✅ Scan #3 result:', JSON.stringify(result3, null, 2));
    console.log('');

    // Cleanup
    console.log('5️⃣  Cleaning up...');
    scanner.cleanup();
    console.log('✅ Scanner cleaned up\n');

    // Verify results
    console.log('📊 Test Summary:');
    console.log(`   - Scan #1: ${result1.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   - Scan #2: ${result2.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   - Scan #3: ${result3.success ? '✅ SUCCESS' : '❌ FAILED'}`);

    if (result1.success && result2.success && result3.success) {
      console.log('\n🎉 All tests passed! Persistent scanner is working correctly.');
      console.log('\n💡 Key achievement: 3 scans using a SINGLE process (no respawning!)');
    } else {
      console.log('\n❌ Some tests failed. Check the output above for details.');
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup test script
    if (fs.existsSync(testScriptPath)) {
      fs.unlinkSync(testScriptPath);
    }
  }
}

// Run test
testPersistentScanner();
