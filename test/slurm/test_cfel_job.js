// Test script for Contrast-FEL job submission with SLURM
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
  _id: 'test_cfel_' + Date.now(),
  tagged_nwk_tree: '(((A{test1}:0.1,B{test1}:0.2){test1}:0.3,C{test2}:0.4){test2}:0.5,D:0.6);',
  ds_variation: 1,  // Yes for rate variation
  branch_sets: ['test1', 'test2']  // Contrast-FEL requires branch sets
};

// Create minimal test files
const testDir = path.join(__dirname, 'app', 'contrast-fel', 'output');
utilities.ensureDirectoryExists(testDir);

// Create a minimal FASTA file for testing (must be divisible by 3 for codon analysis)
// Add some sequence variation for analysis
const fastaPath = path.join(testDir, mockAnalysis._id);
fs.writeFileSync(fastaPath, '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n');

// Import the Contrast-FEL module
const CFEL = require('../../app/contrast-fel/cfel.js').cfel;

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
logger.info('Starting Contrast-FEL test with SLURM');
logger.info(`Test ID: ${mockAnalysis._id}`);
logger.info(`Test files will be in: ${testDir}`);

// Initialize the Contrast-FEL job
console.log('Initializing Contrast-FEL job...');
const cfelJob = new CFEL(mockSocket, mockStream, params);

// Log success
console.log('\nTest initialized successfully!');
console.log(`To check the job status: sbatch --test-only ${cfelJob.qsub_script}`);
console.log(`To check the script content: cat ${cfelJob.qsub_script}`);
console.log(`To check the progress file: cat ${cfelJob.progress_fn}`);
console.log(`To check the status file: cat ${cfelJob.status_fn}`);
console.log(`Test ID: ${mockAnalysis._id}`);
