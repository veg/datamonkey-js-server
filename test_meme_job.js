// Test script for MEME job submission with SLURM
const fs = require('fs');
const path = require('path');
const utilities = require('./lib/utilities');
const logger = require('./lib/logger').logger;
const config = require('./config.json');

// Create mock data for testing
const mockMsa = [{
  gencodeid: 0,  // Universal genetic code (index 0)
  nj: '(((A:0.1,B:0.2):0.3,C:0.4):0.5,D:0.6);'
}];

const mockAnalysis = {
  _id: 'test_meme_' + Date.now(),
  msa: mockMsa,
  multiple_hits: 'None',
  site_multihit: 'Estimate',
  rates: 2,
  impute_states: 'No',
  bootstrap: false,
  resample: undefined
};

// Create minimal test files
const testDir = path.join(__dirname, 'app', 'meme', 'output');
utilities.ensureDirectoryExists(testDir);

// Create a minimal FASTA file for testing (must be divisible by 3 for codon analysis)
// Add some sequence variation for analysis
const fastaPath = path.join(testDir, mockAnalysis._id);
fs.writeFileSync(fastaPath, '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n');

// Import the MEME module
const MEME = require('./app/meme/meme.js').meme;

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
logger.info('Starting MEME test with SLURM');
logger.info(`Test ID: ${mockAnalysis._id}`);
logger.info(`Test files will be in: ${testDir}`);

// Initialize the MEME job
console.log('Initializing MEME job...');
const memeJob = new MEME(mockSocket, mockStream, params);

// Log success
console.log('\nTest initialized successfully!');
console.log(`To check the job status: sbatch --test-only ${memeJob.qsub_script}`);
console.log(`To check the script content: cat ${memeJob.qsub_script}`);
console.log(`To check the progress file: cat ${memeJob.progress_fn}`);
console.log(`To check the status file: cat ${memeJob.status_fn}`);
console.log(`Test ID: ${mockAnalysis._id}`);