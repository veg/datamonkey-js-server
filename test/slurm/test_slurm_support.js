/**
 * Comprehensive test for SLURM and local job submission support
 * 
 * This script tests the three job submission methods implemented in datamonkey-js-server:
 * 1. TORQUE submission (qsub) - the original method
 * 2. SLURM submission (sbatch) - newly implemented
 * 3. Local execution - newly implemented
 * 
 * Usage:
 *   node test_slurm_support.js [--submit-type=<qsub|sbatch|local>]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const job = require('../../app/job.js');
const logger = require('../../lib/logger.js').logger;
const redis = require('redis');
const program = require('commander');

// Parse command line arguments
program
  .version('1.0.0')
  .option('--submit-type <type>', 'Job submission type (qsub, sbatch, local, all)', 'all')
  .option('--config <path>', 'Path to config file', './config.json')
  .option('--output-dir <dir>', 'Output directory', path.join(__dirname, 'test_output'))
  .parse(process.argv);

// Ensure output directory exists
if (!fs.existsSync(program.outputDir)) {
  fs.mkdirSync(program.outputDir, { recursive: true });
}

// Backup and read config
const configPath = program.config;
const configBackupPath = `${configPath}.backup`;

if (!fs.existsSync(configBackupPath)) {
  fs.copyFileSync(configPath, configBackupPath);
  console.log(`Config file backed up to ${configBackupPath}`);
}

function readConfig(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`Error reading config: ${e.message}`);
    return {};
  }
}

function writeConfig(path, config) {
  try {
    fs.writeFileSync(path, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error(`Error writing config: ${e.message}`);
  }
}

function restoreConfig() {
  if (fs.existsSync(configBackupPath)) {
    fs.copyFileSync(configBackupPath, configPath);
    console.log('Original config restored');
  }
}

// Test configurations
const testConfigs = {
  qsub: { submit_type: 'qsub' },
  sbatch: { submit_type: 'sbatch' },
  local: { submit_type: 'local' }
};

// Job testing class
class JobTest {
  constructor(submitType) {
    this.submitType = submitType;
    this.outputDir = path.join(program.outputDir, submitType);
    this.scriptPath = path.join(__dirname, 'test_script.sh');
    this.resultsPath = path.join(this.outputDir, `${submitType}_results.json`);
    this.events = [];
    
    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  updateConfig() {
    const config = readConfig(configPath);
    this.originalSubmitType = config.submit_type;
    config.submit_type = this.submitType;
    writeConfig(configPath, config);
    console.log(`Updated config.json with submit_type: ${config.submit_type}`);
  }
  
  restoreConfig() {
    const config = readConfig(configPath);
    config.submit_type = this.originalSubmitType;
    writeConfig(configPath, config);
    console.log(`Restored config.json submit_type to: ${config.submit_type}`);
  }
  
  logEvent(event, data) {
    const timestamp = new Date().toISOString();
    this.events.push({ timestamp, event, data });
    console.log(`[${timestamp}] ${event}:`, data);
  }
  
  async runTest() {
    console.log(`\n=== Testing ${this.submitType} job submission ===\n`);
    
    return new Promise((resolve) => {
      // Update config
      this.updateConfig();
      
      // Create job runner
      const jobRunner = new job.jobRunner([], this.resultsPath);
      
      // Set up event handlers
      jobRunner.on('job created', data => this.logEvent('job created', data));
      jobRunner.on('status update', data => this.logEvent('status update', data));
      jobRunner.on('job metadata', data => this.logEvent('job metadata', data));
      jobRunner.on('completed', () => this.logEvent('completed', 'Job completed successfully'));
      jobRunner.on('script error', err => this.logEvent('script error', err || 'Unknown error'));
      
      // Start job based on submission type
      if (this.submitType === 'local') {
        // Local execution
        const env = { JOB_TYPE: this.submitType, OUTPUT_FILE: this.resultsPath };
        jobRunner.submit_local(this.scriptPath, env, this.outputDir);
      } else if (this.submitType === 'sbatch') {
        // SLURM submission
        const params = [
          '--job-name=test_slurm_job',
          '--output=' + path.join(this.outputDir, 'slurm.out'),
          '--error=' + path.join(this.outputDir, 'slurm.err'),
          '--time=00:10:00',
          '--ntasks=1',
          '--export=JOB_TYPE=' + this.submitType + ',OUTPUT_FILE=' + this.resultsPath,
          this.scriptPath
        ];
        jobRunner.submit(params, this.outputDir);
      } else {
        // TORQUE submission
        const params = [
          '-l', 'walltime=00:10:00,nodes=1:ppn=1',
          '-o', path.join(this.outputDir, 'torque.out'),
          '-e', path.join(this.outputDir, 'torque.err'),
          '-v', 'JOB_TYPE=' + this.submitType + ',OUTPUT_FILE=' + this.resultsPath,
          this.scriptPath
        ];
        jobRunner.submit(params, this.outputDir);
      }
      
      console.log(`${this.submitType} job submitted. Waiting for completion...`);
      
      // Wait for job completion or timeout after 30 seconds
      const checkInterval = setInterval(() => {
        if (fs.existsSync(this.resultsPath)) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          
          try {
            const results = JSON.parse(fs.readFileSync(this.resultsPath, 'utf8'));
            console.log(`\n=== ${this.submitType} Test Results ===`);
            console.log(JSON.stringify(results, null, 2));
            this.success = true;
            this.results = results;
          } catch (e) {
            console.error(`Error reading results: ${e.message}`);
            this.success = false;
          }
          
          this.restoreConfig();
          resolve({
            submitType: this.submitType,
            success: this.success,
            events: this.events,
            results: this.results
          });
        }
      }, 1000);
      
      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        console.log(`\n=== ${this.submitType} Test TIMED OUT ===`);
        this.success = false;
        this.restoreConfig();
        resolve({
          submitType: this.submitType,
          success: false,
          events: this.events,
          error: 'Test timed out'
        });
      }, 30000);
    });
  }
}

// Main test function
async function runTests() {
  try {
    const submitTypes = program.submitType === 'all' 
      ? Object.keys(testConfigs) 
      : [program.submitType];
    
    console.log(`Running tests for job submission types: ${submitTypes.join(', ')}`);
    
    const results = {};
    
    // Run tests sequentially
    for (const submitType of submitTypes) {
      const tester = new JobTest(submitType);
      results[submitType] = await tester.runTest();
    }
    
    // Generate final report
    console.log('\n=== Final Test Report ===\n');
    
    for (const submitType of submitTypes) {
      const result = results[submitType];
      
      if (result.success) {
        console.log(`✅ ${submitType}: Success`);
      } else {
        console.log(`❌ ${submitType}: Failed${result.error ? ' - ' + result.error : ''}`);
      }
    }
    
    console.log('\nTest summary:');
    console.log(`Total tests: ${submitTypes.length}`);
    console.log(`Successful: ${Object.values(results).filter(r => r.success).length}`);
    console.log(`Failed: ${Object.values(results).filter(r => !r.success).length}`);
    
  } catch (error) {
    console.error('Error running tests:', error);
  } finally {
    // Always restore the original config
    restoreConfig();
  }
}

// Handle interruptions
process.on('SIGINT', () => {
  console.log('\nTest interrupted. Restoring original config...');
  restoreConfig();
  process.exit(1);
});

// Run tests
runTests();