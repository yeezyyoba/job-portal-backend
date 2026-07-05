// test_api.js
const { exec } = require('child_process');
const path = require('path');

console.log('--- Starting API Verification Tests ---');

// Start server as a background process
const serverProcess = exec('node server.js', {
  cwd: __dirname
});

// Capture logs
serverProcess.stdout.on('data', (data) => {
  console.log(`[Server Log]: ${data.trim()}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`[Server Error]: ${data.trim()}`);
});

// Wait 2.5 seconds for server setup & SQL migration
setTimeout(async () => {
  try {
    console.log('\n--- Initiating Endpoint Requests ---\n');

    // Test 1: Welcome message
    console.log('Test 1: GET / ...');
    const resRoot = await fetch('http://localhost:5050/');
    const dataRoot = await resRoot.json();
    console.log('Response:', dataRoot);
    if (!dataRoot.message.includes('Welcome')) {
      throw new Error('Test 1 Failed: Welcome message mismatch');
    }
    console.log('✔ Test 1 Passed\n');

    // Test 2: Login Seeker
    console.log('Test 2: POST /api/auth/login (Seeker)...');
    const resLogin = await fetch('http://localhost:5050/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'seeker@portal.com', password: 'password' })
    });
    const dataLogin = await resLogin.json();
    console.log('Response (token excerpt):', dataLogin.token ? dataLogin.token.substring(0, 30) + '...' : 'No Token');
    if (!dataLogin.token) {
      throw new Error('Test 2 Failed: No token returned');
    }
    console.log('✔ Test 2 Passed\n');

    const token = dataLogin.token;

    // Test 3: Get Seeker Profile details
    console.log('Test 3: GET /api/auth/me (Bearer Authentication)...');
    const resMe = await fetch('http://localhost:5050/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataMe = await resMe.json();
    console.log('Response User:', dataMe.name, `(${dataMe.role})`);
    if (dataMe.email !== 'seeker@portal.com' || dataMe.role !== 'seeker') {
      throw new Error('Test 3 Failed: Profile credential mismatch');
    }
    console.log('✔ Test 3 Passed\n');

    // Test 4: Get Jobs list
    console.log('Test 4: GET /api/jobs (Job Board)...');
    const resJobs = await fetch('http://localhost:5050/api/jobs');
    const dataJobs = await resJobs.json();
    console.log('Response List Count:', dataJobs.length, 'jobs found');
    if (!Array.isArray(dataJobs) || dataJobs.length === 0) {
      throw new Error('Test 4 Failed: Expected non-empty jobs array');
    }
    console.log('✔ Test 4 Passed\n');

    console.log('--- All API Verification Tests Passed Successfully! ---');
    cleanup(0);
  } catch (error) {
    console.error('❌ Verification Tests Failed:', error.message);
    cleanup(1);
  }
}, 3000);

function cleanup(exitCode) {
  console.log('Terminating local server process...');
  serverProcess.kill('SIGTERM');
  process.exit(exitCode);
}
