/**
 * Simple server test
 */

const { spawn } = require('child_process');
const http = require('http');

console.log('Starting server test...\n');

// Start the server
const server = spawn('node', ['dist/api/server.js']);

let serverOutput = '';

server.stdout.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  console.log(output);
});

server.stderr.on('data', (data) => {
  console.error(data.toString());
});

// Wait for server to start, then test
setTimeout(() => {
  console.log('\nTesting health endpoint...\n');

  http.get('http://localhost:3000/health', (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('Response:', data);
      const response = JSON.parse(data);

      if (response.status === 'ok') {
        console.log('\n✅ Server test PASSED!\n');
      } else {
        console.log('\n❌ Server test FAILED!\n');
      }

      server.kill();
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('\n❌ Server test FAILED:', err.message);
    server.kill();
    process.exit(1);
  });
}, 2000);

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n❌ Server test TIMEOUT!');
  server.kill();
  process.exit(1);
}, 10000);
