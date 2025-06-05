/**
 * Test script for job configuration settings
 * 
 * This script tests different job submission configurations by modifying the 
 * config.json file and running sample analyses with each configuration.
 * 
 * It tests:
 * 1. TORQUE (qsub) - the original scheduler
 * 2. SLURM (sbatch) - added in recent commit
 * 3. Local execution - added in recent commit
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const redis = require('redis');
const program = require('commander');

// Parse command line arguments
program
  .version('1.0.0')
  .option('--test-type <type>', 'Job submission type to test (qsub, sbatch, local, all)', 'all')
  .option('--config <path>', 'Path to config file', './config.json')
  .parse(process.argv);

// Backup original config file
const configPath = program.config;
const configBackupPath = `${configPath}.backup`;

// Ensure config backup exists
if (!fs.existsSync(configBackupPath)) {
  fs.copyFileSync(configPath, configBackupPath);
  console.log(`Config file backed up to ${configBackupPath}`);
}

// Function to read config
function readConfig(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// Function to write config
function writeConfig(path, config) {
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
}

// Function to restore original config
function restoreConfig() {
  if (fs.existsSync(configBackupPath)) {
    fs.copyFileSync(configBackupPath, configPath);
    console.log('Original config restored');
  }
}

// Set up test configurations
const testConfigs = {
  qsub: {
    submit_type: 'qsub',
  },
  sbatch: {
    submit_type: 'sbatch',
  },
  local: {
    submit_type: 'local',
  }
};

// Mock simple analysis job for testing
function createMockJob(type) {
  const mockOutputDir = path.join(__dirname, 'test_output');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(mockOutputDir)) {
    fs.mkdirSync(mockOutputDir, { recursive: true });
  }
  
  // Create mock script
  const mockScriptPath = path.join(mockOutputDir, 'mock_job.sh');
  const scriptContent = `#!/bin/bash
echo "Starting mock job"
echo "Job type: ${type}"
echo "Current time: $(date)"
echo "Sleeping for 5 seconds..."
sleep 5
echo "Mock job completed successfully at $(date)"
echo "{ \\"result\\": \\"success\\", \\"job_type\\": \\"${type}\\" }" > ${mockOutputDir}/mock_results_${type}.json
exit 0
`;
  
  fs.writeFileSync(mockScriptPath, scriptContent);
  fs.chmodSync(mockScriptPath, '755'); // Make executable
  
  return {
    scriptPath: mockScriptPath,
    outputDir: mockOutputDir,
    resultFile: path.join(mockOutputDir, `mock_results_${type}.json`)
  };
}

// Function to run test with specific configuration
function runTest(configType) {
  return new Promise((resolve) => {
    console.log(`\n=== Testing ${configType} configuration ===\n`);
    
    // Update config with test settings
    const config = readConfig(configPath);
    const originalSubmitType = config.submit_type;
    
    config.submit_type = testConfigs[configType].submit_type;
    writeConfig(configPath, config);
    
    console.log(`Updated config.json with submit_type: ${config.submit_type}`);
    
    // Create mock job
    const mockJob = createMockJob(configType);
    
    // Run test script to test job submission
    const testProcess = spawn('node', [
      './test_job_submission.js',
      `--type=${configType}`,
      `--script=${mockJob.scriptPath}`,
      `--output-dir=${mockJob.outputDir}`
    ]);
    
    testProcess.stdout.on('data', (data) => {
      console.log(`${data}`);
    });
    
    testProcess.stderr.on('data', (data) => {
      console.error(`${data}`);
    });
    
    testProcess.on('close', (code) => {
      console.log(`Test process exited with code ${code}`);
      
      // Check for results file
      setTimeout(() => {
        if (fs.existsSync(mockJob.resultFile)) {
          try {
            const results = JSON.parse(fs.readFileSync(mockJob.resultFile, 'utf8'));
            console.log(`Results: ${JSON.stringify(results)}`);
            console.log(`✅ ${configType} test PASSED`);
          } catch (e) {
            console.log(`❌ ${configType} test FAILED: Could not parse results file`);
          }
        } else {
          console.log(`❌ ${configType} test FAILED: No results file found`);
        }
        
        // Restore original config
        config.submit_type = originalSubmitType;
        writeConfig(configPath, config);
        
        resolve();
      }, 1000);
    });
  });
}

// Main test sequence
async function runTests() {
  try {
    // Determine which tests to run
    const testTypes = program.testType === 'all' 
      ? Object.keys(testConfigs) 
      : [program.testType];
    
    console.log(`Running tests for: ${testTypes.join(', ')}`);
    
    // Run tests sequentially
    for (const testType of testTypes) {
      await runTest(testType);
    }
    
    console.log('\n=== All tests completed ===\n');
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