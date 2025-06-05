/**
 * Run all analysis job tests to verify SLURM integration
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const colors = require('colors/safe');

// Define the analysis methods to test
const methods = [
  { name: 'FEL', script: 'test_fel_job.js' },
  { name: 'MEME', script: 'test_meme_job.js' },
  { name: 'SLAC', script: 'test_slac_job.js' },
  { name: 'ABSREL', script: 'test_absrel_job.js' },
  { name: 'BUSTED', script: 'test_busted_job.js' },
  { name: 'GARD', script: 'test_gard_job.js' }
];

console.log(colors.cyan.bold('\n=== SLURM Integration Test Suite ===\n'));
console.log(colors.cyan(`Testing ${methods.length} analysis methods with SLURM job submission`));
console.log(colors.cyan('This will submit jobs to the SLURM scheduler\n'));

// Create a summary array to hold results
const results = [];

// Function to run a test and return a promise
function runTest(method) {
  return new Promise((resolve, reject) => {
    console.log(colors.yellow.bold(`\n[${method.name}] Starting test...`));
    
    const scriptPath = path.join(__dirname, method.script);
    
    // Check if test script exists
    if (!fs.existsSync(scriptPath)) {
      console.log(colors.red(`[${method.name}] Test script not found: ${scriptPath}`));
      results.push({
        method: method.name,
        status: 'NOT FOUND',
        jobId: null,
        error: `Test script not found: ${scriptPath}`
      });
      resolve();
      return;
    }
    
    // Run the test script
    const proc = spawn('node', [scriptPath], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    let jobId = null;
    
    proc.stdout.on('data', (data) => {
      const dataStr = data.toString();
      stdout += dataStr;
      
      // Print output
      process.stdout.write(dataStr);
      
      // Try to extract job ID
      const jobIdMatch = dataStr.match(/Submitted batch job (\d+)/);
      if (jobIdMatch) {
        jobId = jobIdMatch[1];
        console.log(colors.green(`[${method.name}] Job submitted with ID: ${jobId}`));
      }
      
      // Check for completion
      if (dataStr.includes('"type":"completed"')) {
        console.log(colors.green(`[${method.name}] Job completed successfully`));
      }
    });
    
    proc.stderr.on('data', (data) => {
      const dataStr = data.toString();
      stderr += dataStr;
      
      // Print errors
      process.stderr.write(dataStr);
    });
    
    proc.on('close', (code) => {
      // Store results
      results.push({
        method: method.name,
        status: code === 0 ? 'PASS' : 'FAIL',
        jobId: jobId,
        exitCode: code,
        error: stderr.length > 0 ? stderr : null
      });
      
      if (code === 0 || code === null) {
        console.log(colors.green(`[${method.name}] Test process exited with code ${code}`));
      } else {
        console.log(colors.red(`[${method.name}] Test process exited with code ${code}`));
      }
      
      resolve();
    });
    
    proc.on('error', (err) => {
      console.log(colors.red(`[${method.name}] Error running test: ${err.message}`));
      results.push({
        method: method.name,
        status: 'ERROR',
        jobId: null,
        error: err.message
      });
      resolve();
    });
    
    // Handle timeout after 3 minutes
    setTimeout(() => {
      if (!proc.killed) {
        console.log(colors.yellow(`[${method.name}] Test is taking too long, continuing to next test...`));
        
        if (!results.find(r => r.method === method.name)) {
          results.push({
            method: method.name,
            status: 'TIMEOUT',
            jobId: jobId,
            error: 'Test timed out after 3 minutes'
          });
        }
        
        proc.kill();
        resolve();
      }
    }, 180000); // 3 minutes timeout
  });
}

// Run tests sequentially
async function runAllTests() {
  for (const method of methods) {
    await runTest(method);
  }
  
  // Print summary
  console.log(colors.cyan.bold('\n=== Test Results Summary ===\n'));
  
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => ['FAIL', 'ERROR', 'TIMEOUT', 'NOT FOUND'].includes(r.status)).length;
  
  console.log(colors.cyan(`Tests: ${results.length}, Passed: ${passCount}, Failed: ${failCount}\n`));
  
  // Print detailed results
  const padLength = Math.max(...methods.map(m => m.name.length)) + 2;
  
  results.forEach(result => {
    const status = result.status === 'PASS' 
      ? colors.green(result.status) 
      : colors.red(result.status);
    
    const methodName = result.method.padEnd(padLength);
    const jobInfo = result.jobId ? `Job ID: ${result.jobId}` : '';
    
    console.log(`${methodName} ${status} ${jobInfo}`);
    
    if (result.error) {
      console.log(colors.red(`  Error: ${result.error.split('\n')[0]}`));
    }
  });
  
  // Exit with appropriate code
  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Start the tests
runAllTests().catch(err => {
  console.error(colors.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});