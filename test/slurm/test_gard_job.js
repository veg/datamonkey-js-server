// Test script for GARD job submission with SLURM
const fs = require('fs');
const path = require('path');
const utilities = require('../../lib/utilities');
const logger = require('../../lib/logger').logger;
const config = require('../../config.json');

// Create mock data for testing
const mockMsa = [{
  gencodeid: 0  // Universal genetic code (index 0)
}];

const mockAnalysis = {
  _id: 'test_gard_' + Date.now(),
  msa: mockMsa,
  rate_variation: "Yes",
  rate_classes: 2,
  site_to_site_variation: "Yes"
};

// Create minimal test files
const testDir = path.join(__dirname, 'app', 'gard', 'output');
utilities.ensureDirectoryExists(testDir);

// Create a minimal FASTA file for testing (must be divisible by 3 for codon analysis)
// Add some sequence variation for analysis
const fastaPath = path.join(testDir, mockAnalysis._id);
fs.writeFileSync(fastaPath, '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n');

// Import the GARD module
const GARD = require('../../app/gard/gard.js').gard;

// Create a mock socket and stream
const mockSocket = {
  emit: (event, data) => {
    console.log(`[Socket Event] ${event}:`, data);
  },
  on: (event, callback) => {
    console.log(`[Socket Listener] Registered for event: ${event}`);
    // No need to call the callback as this is just for testing
  }
};

// Create a string stream with minimal FASTA content (must be divisible by 3 for codon analysis)
const mockStream = '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n';

// Create params object
const params = {
  msa: mockMsa,
  analysis: mockAnalysis
};

// Setup logging for the test
logger.info('Starting GARD test with SLURM');
logger.info(`Test ID: ${mockAnalysis._id}`);
logger.info(`Test files will be in: ${testDir}`);

// Initialize the GARD job
console.log('Initializing GARD job...');
const gardJob = new GARD(mockSocket, mockStream, params);

// Log success
console.log('\nTest initialized successfully!');
console.log(`To check the job status: sbatch --test-only ${gardJob.qsub_script}`);
console.log(`To check the script content: cat ${gardJob.qsub_script}`);
console.log(`To check the progress file: cat ${gardJob.progress_fn}`);
console.log(`To check the status file: cat ${gardJob.status_fn}`);
console.log(`Test ID: ${mockAnalysis._id}`);