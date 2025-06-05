/**
 * Test script for SLURM and local job submission configurations
 * 
 * This script tests the job submission functionality for different scheduler types:
 * - TORQUE (qsub) - the original scheduler
 * - SLURM (sbatch) - added in recent commit
 * - Local execution - added in recent commit
 * 
 * Usage:
 *   node test_job_submission.js [--type=<qsub|sbatch|local>]
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { spawn } = require('child_process');
const job = require('./app/job.js');
const logger = require('./lib/logger.js').logger;
const config = require('./config.json');
const program = require('commander');

// Define test parameters
program
  .version('1.0.0')
  .option('--type <type>', 'Job submission type (qsub, sbatch, local)', 'local')
  .option('--script <script>', 'Test script to run', path.join(__dirname, 'test_script.sh'))
  .option('--output-dir <dir>', 'Output directory', path.join(__dirname, 'test_output'))
  .parse(process.argv);

// Ensure output directory exists
if (!fs.existsSync(program.outputDir)) {
  fs.mkdirSync(program.outputDir, { recursive: true });
}

// Create test script if it doesn't exist
const testScriptPath = program.script;
if (!fs.existsSync(testScriptPath)) {
  const scriptContent = `#!/bin/bash
echo "Starting test job"
echo "Job type: $JOB_TYPE"
echo "Hostname: $(hostname)"
echo "Process ID: $$"
sleep 5
echo "Test job completed successfully"
exit 0
`;
  fs.writeFileSync(testScriptPath, scriptContent);
  fs.chmodSync(testScriptPath, '755'); // Make executable
}

// Create a simple EventEmitter subclass to capture events from jobRunner
class TestEventHandler {
  constructor() {
    this.events = [];
  }

  handleEvent(eventName, data) {
    this.events.push({ event: eventName, data: data, time: new Date() });
    console.log(`Event: ${eventName}`, data);
  }
}

// Test job submission using the specified type
function testJobSubmission(type) {
  console.log(`\n=== Testing ${type} job submission ===\n`);
  
  // Override config for testing
  const originalSubmitType = config.submit_type;
  config.submit_type = type;
  
  // Create test parameters based on submission type
  let jobRunner;
  const testHandler = new TestEventHandler();
  
  const resultsFn = path.join(program.outputDir, `test_${type}_results.txt`);
  
  if (type === 'local') {
    console.log('Submitting local job');
    jobRunner = new job.jobRunner([], resultsFn);
    
    // Set up event handlers
    jobRunner.on('job created', data => testHandler.handleEvent('job created', data));
    jobRunner.on('completed', data => testHandler.handleEvent('completed', data));
    jobRunner.on('script error', data => testHandler.handleEvent('script error', data));
    
    // Submit the local job
    const env = { JOB_TYPE: type };
    jobRunner.submit_local(testScriptPath, env, program.outputDir);
  } else {
    // For SLURM or TORQUE
    let params;
    
    if (type === 'sbatch') {
      console.log('Submitting SLURM job');
      params = [
        '--job-name=test_slurm_job',
        '--output=' + path.join(program.outputDir, 'test_slurm.out'),
        '--error=' + path.join(program.outputDir, 'test_slurm.err'),
        '--time=00:10:00',
        '--ntasks=1',
        '--export=JOB_TYPE=' + type,
        testScriptPath
      ];
    } else {
      console.log('Submitting TORQUE job');
      params = [
        '-l', 'walltime=00:10:00,nodes=1:ppn=1',
        '-o', path.join(program.outputDir, 'test_torque.out'),
        '-e', path.join(program.outputDir, 'test_torque.err'),
        '-v', 'JOB_TYPE=' + type,
        testScriptPath
      ];
    }
    
    jobRunner = new job.jobRunner(params, resultsFn);
    
    // Set up event handlers
    jobRunner.on('job created', data => testHandler.handleEvent('job created', data));
    jobRunner.on('status update', data => testHandler.handleEvent('status update', data));
    jobRunner.on('job metadata', data => testHandler.handleEvent('job metadata', data));
    jobRunner.on('completed', data => testHandler.handleEvent('completed', data));
    jobRunner.on('script error', data => testHandler.handleEvent('script error', data));
    
    // Submit the job
    jobRunner.submit(params, program.outputDir);
  }
  
  console.log(`Job submitted. Waiting for completion...`);
  
  // Wait a maximum of 30 seconds for the job to complete
  setTimeout(() => {
    console.log('\n=== Job test results ===\n');
    console.log(`Job events: ${testHandler.events.length}`);
    
    let completed = testHandler.events.some(event => event.event === 'completed');
    let error = testHandler.events.some(event => event.event === 'script error');
    
    console.log(`Job completed: ${completed}`);
    console.log(`Job error: ${error}`);
    
    if (!completed && !error) {
      console.log('Job is still running or was not processed.');
    }
    
    // Restore original config
    config.submit_type = originalSubmitType;
    
    // Exit if testing just this type
    if (program.type === type) {
      process.exit(0);
    }
  }, 30000);
}

// Run the test for the specified type
if (program.type === 'all') {
  // Test all submission types
  testJobSubmission('qsub');
  
  setTimeout(() => {
    testJobSubmission('sbatch');
  }, 35000);
  
  setTimeout(() => {
    testJobSubmission('local');
  }, 70000);
} else {
  testJobSubmission(program.type);
}