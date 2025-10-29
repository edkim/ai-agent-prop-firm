const { default: claudeService } = require('./dist/services/claude.service');

async function test() {
  console.log('🧪 Testing Updated VWAP Bounce Scanner\n');

  const result = await claudeService.generateScannerScript({
    query: 'Find VWAP bounce setups on 5-minute charts with price bouncing from VWAP support',
    universe: 'tech_sector',
    dateRange: { start: '2025-10-28', end: '2025-10-29' }
  });

  console.log('✅ Script generated!\n');
  console.log('Script (first 100 lines):');
  console.log('─'.repeat(70));
  const lines = result.script.split('\n');
  console.log(lines.slice(0, 100).join('\n'));
  console.log('─'.repeat(70));
  console.log(`\n... (${lines.length} total lines)\n`);

  // Check for key indicators
  const hasOHLCV = result.script.includes('ohlcv_data');
  const has5Min = result.script.includes("'5min'") || result.script.includes('"5min"');
  const hasVWAP = result.script.toLowerCase().includes('vwap');
  const hasTimeOfDay = result.script.includes('time_of_day');

  console.log('Analysis:');
  console.log(`${hasOHLCV ? '✅' : '❌'} Uses ohlcv_data table`);
  console.log(`${has5Min ? '✅' : '❌'} Queries 5-minute bars`);
  console.log(`${hasVWAP ? '✅' : '❌'} Calculates/uses VWAP`);
  console.log(`${hasTimeOfDay ? '✅' : '❌'} Uses time_of_day field\n`);

  console.log('Explanation:', result.explanation);
}

test().catch(console.error);
