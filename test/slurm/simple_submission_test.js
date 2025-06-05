/**
 * Simple test for job submission methods
 * This test doesn't rely on Redis or other dependencies
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create a test output directory
const outputDir = path.join(__dirname, 'test_output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create a test script to run
const testScriptPath = path.join(outputDir, 'test_script.sh');
const scriptContent = `#!/bin/bash
echo "Starting test job"
echo "Job type: $JOB_TYPE"
echo "Running on: $(hostname)"
echo "Process ID: $$"
sleep 2
echo "{ \\"success\\": true, \\"job_type\\": \\"$JOB_TYPE\\", \\"time\\": \\"\$(date)\\", \\"pid\\": $$, \\"host\\": \\"\$(hostname)\\" }" > "$OUTPUT_FILE"
echo "Test job completed"
exit 0
`;

fs.writeFileSync(testScriptPath, scriptContent);
fs.chmodSync(testScriptPath, '755'); // Make executable

console.log('Test script created at:', testScriptPath);

// Functions to test different submission methods
function testLocalSubmission() {
  console.log('\n=== Testing Local Job Submission ===\n');
  
  const outputFile = path.join(outputDir, 'local_results.json');
  const env = { ...process.env, JOB_TYPE: 'local', OUTPUT_FILE: outputFile };
  
  console.log('Starting local process');
  
  const proc = spawn(testScriptPath, [], { 
    env: env,
    cwd: outputDir
  });
  
  proc.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
  
  proc.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
  
  proc.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
    
    if (fs.existsSync(outputFile)) {
      try {
        const results = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
        console.log('\nLocal job results:');
        console.log(JSON.stringify(results, null, 2));
        console.log('\n✅ Local job test PASSED\n');
      } catch (e) {
        console.error('Error reading results:', e);
        console.log('\n❌ Local job test FAILED\n');
      }
    } else {
      console.log(`No results file found at ${outputFile}`);
      console.log('\n❌ Local job test FAILED\n');
    }
  });
}

function testSlurmSubmission() {
  console.log('\n=== Testing SLURM Job Submission ===\n');
  
  const outputFile = path.join(outputDir, 'slurm_results.json');
  
  try {
    // Check if sbatch is available
    const sbatchCheck = spawn('sbatch', ['--version']);
    let sbatchOutput = '';
    
    sbatchCheck.stdout.on('data', (data) => {
      sbatchOutput += data;
    });
    
    sbatchCheck.on('close', (code) => {
      if (code !== 0) {
        console.log('SLURM (sbatch) is not available on this system');
        console.log('\n⚠️ SLURM test SKIPPED\n');
        return;
      }
      
      console.log('SLURM is available:', sbatchOutput.trim());
      
      // Submit SLURM job
      const params = [
        '--job-name=test_slurm',
        '--output=' + path.join(outputDir, 'slurm.out'),
        '--error=' + path.join(outputDir, 'slurm.err'),
        '--time=00:01:00',
        '--ntasks=1',
        '--export=ALL,JOB_TYPE=slurm,OUTPUT_FILE=' + outputFile,
        testScriptPath
      ];
      
      console.log('Submitting SLURM job with command: sbatch', params.join(' '));
      
      const sbatch = spawn('sbatch', params);
      
      sbatch.stdout.on('data', (data) => {
        console.log(`sbatch: ${data}`);
      });
      
      sbatch.stderr.on('data', (data) => {
        console.error(`sbatch error: ${data}`);
      });
      
      sbatch.on('close', (code) => {
        if (code !== 0) {
          console.error('Failed to submit SLURM job');
          console.log('\n❌ SLURM test FAILED\n');
          return;
        }
        
        console.log('SLURM job submitted successfully');
        console.log('Results will be written to:', outputFile);
        console.log('Check manual for job status.');
      });
    });
  } catch (e) {
    console.error('Error testing SLURM:', e);
    console.log('\n❌ SLURM test FAILED\n');
  }
}

function testTorqueSubmission() {
  console.log('\n=== Testing TORQUE Job Submission ===\n');
  
  const outputFile = path.join(outputDir, 'torque_results.json');
  
  try {
    // Check if qsub is available
    const qsubCheck = spawn('qsub', ['--version']);
    let qsubOutput = '';
    
    qsubCheck.stdout.on('data', (data) => {
      qsubOutput += data;
    });
    
    qsubCheck.stderr.on('data', (data) => {
      qsubOutput += data;
    });
    
    qsubCheck.on('close', (code) => {
      if (code !== 0) {
        console.log('TORQUE (qsub) is not available on this system');
        console.log('\n⚠️ TORQUE test SKIPPED\n');
        return;
      }
      
      console.log('TORQUE is available:', qsubOutput.trim());
      
      // Submit TORQUE job
      const params = [
        '-l', 'walltime=00:01:00,nodes=1:ppn=1',
        '-o', path.join(outputDir, 'torque.out'),
        '-e', path.join(outputDir, 'torque.err'),
        '-v', 'JOB_TYPE=torque,OUTPUT_FILE=' + outputFile,
        testScriptPath
      ];
      
      console.log('Submitting TORQUE job with command: qsub', params.join(' '));
      
      const qsub = spawn('qsub', params);
      
      qsub.stdout.on('data', (data) => {
        console.log(`qsub: ${data}`);
      });
      
      qsub.stderr.on('data', (data) => {
        console.error(`qsub error: ${data}`);
      });
      
      qsub.on('close', (code) => {
        if (code !== 0) {
          console.error('Failed to submit TORQUE job');
          console.log('\n❌ TORQUE test FAILED\n');
          return;
        }
        
        console.log('TORQUE job submitted successfully');
        console.log('Results will be written to:', outputFile);
        console.log('Check manual for job status.');
      });
    });
  } catch (e) {
    console.error('Error testing TORQUE:', e);
    console.log('\n❌ TORQUE test FAILED\n');
  }
}

// Run all tests
console.log('Starting job submission tests...');

// Only run local test by default as it should work on any system
testLocalSubmission();

// Uncomment to test SLURM if available
setTimeout(testSlurmSubmission, 5000);

// Uncomment to test TORQUE if available
// setTimeout(testTorqueSubmission, 10000);