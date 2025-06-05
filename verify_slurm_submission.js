/**
 * Verify SLURM Submission Script
 * 
 * This script tests only the SLURM job submission functionality without worrying
 * about actual HYPHY analysis success. It creates a simple shell script that always
 * succeeds and submits it via SLURM to verify the integration.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const utilities = require('./lib/utilities');

// Create a test directory
const testDir = path.join(__dirname, 'test_output');
utilities.ensureDirectoryExists(testDir);

// Create a simple test script that always succeeds
const testScriptPath = path.join(testDir, 'test_slurm.sh');
const testScriptContent = `#!/bin/bash
echo "Starting test SLURM job"
echo "Job ID: $SLURM_JOB_ID"
echo "Hostname: $(hostname)"
echo "Current directory: $(pwd)"
echo "Environment variables:"
printenv | sort

# Create successful output
echo "Success" > "$STATUS_FILE"
echo "Test SLURM job completed successfully" > "$PROGRESS_FILE"
`;

fs.writeFileSync(testScriptPath, testScriptContent);
fs.chmodSync(testScriptPath, '755'); // Make executable

// Create status and progress files
const statusFile = path.join(testDir, 'test_slurm.status');
const progressFile = path.join(testDir, 'test_slurm.progress');

fs.writeFileSync(statusFile, '');
fs.writeFileSync(progressFile, '');

// Submit the job to SLURM
console.log('Submitting test job to SLURM...');

const slurmParams = [
  '--job-name=test_slurm',
  '--ntasks=1',
  '--time=00:05:00',
  '--partition=defq',
  '--nodes=1',
  `--export=ALL,STATUS_FILE=${statusFile},PROGRESS_FILE=${progressFile}`,
  `--output=${testDir}/slurm.out`,
  `--error=${testDir}/slurm.err`,
  testScriptPath
];

console.log(`sbatch ${slurmParams.join(' ')}`);

const sbatch = spawn('sbatch', slurmParams);

let stdout = '';
let stderr = '';

sbatch.stdout.on('data', (data) => {
  stdout += data.toString();
  process.stdout.write(data);
});

sbatch.stderr.on('data', (data) => {
  stderr += data.toString();
  process.stderr.write(data);
});

sbatch.on('close', (code) => {
  console.log(`sbatch process exited with code ${code}`);
  
  if (code === 0) {
    console.log('Job submitted successfully!');
    
    // Extract job ID
    const match = stdout.match(/Submitted batch job (\d+)/);
    if (match) {
      const jobId = match[1];
      console.log(`Job ID: ${jobId}`);
      
      // Wait for job completion
      console.log('Waiting for job to complete...');
      
      const checkInterval = setInterval(() => {
        try {
          if (fs.existsSync(statusFile)) {
            const status = fs.readFileSync(statusFile, 'utf8').trim();
            if (status === 'Success') {
              clearInterval(checkInterval);
              console.log('\nJob completed successfully!');
              
              // Read progress file
              if (fs.existsSync(progressFile)) {
                const progress = fs.readFileSync(progressFile, 'utf8');
                console.log('\nProgress file content:');
                console.log(progress);
              }
              
              console.log('\nSLURM output:');
              if (fs.existsSync(path.join(testDir, 'slurm.out'))) {
                const output = fs.readFileSync(path.join(testDir, 'slurm.out'), 'utf8');
                console.log(output);
              }
              
              console.log('\nVerification complete: SLURM submission is working correctly!');
              process.exit(0);
            }
          }
        } catch (err) {
          console.warn('Error checking status:', err.message);
        }
      }, 2000); // Check every 2 seconds
      
      // Add timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log('\nTimeout: Job is taking too long to complete');
        console.log('Check the job status manually:');
        console.log(`squeue -j ${jobId}`);
        process.exit(1);
      }, 60000); // 1 minute timeout
    } else {
      console.error('Could not extract job ID from sbatch output');
      process.exit(1);
    }
  } else {
    console.error('Failed to submit job');
    console.error(`Error: ${stderr}`);
    process.exit(1);
  }
});