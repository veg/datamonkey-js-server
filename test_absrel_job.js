// Test script for ABSREL job submission with SLURM
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
  _id: 'test_absrel_' + Date.now(),
  msa: mockMsa,
  tagged_nwk_tree: '(((A:0.1,B:0.2):0.3,C:0.4):0.5,D:0.6);',
  multiple_hits: 'None',
  site_multihit: 'Estimate'
};

// Create minimal test files
const testDir = path.join(__dirname, 'app', 'absrel', 'output');
utilities.ensureDirectoryExists(testDir);

// Create a minimal FASTA file for testing (must be divisible by 3 for codon analysis)
// Add some sequence variation for analysis
const fastaPath = path.join(testDir, mockAnalysis._id);
fs.writeFileSync(fastaPath, '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n');

// Import the ABSREL module
const ABSREL = require('./app/absrel/absrel.js').absrel;

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
logger.info('Starting ABSREL test with SLURM');
logger.info(`Test ID: ${mockAnalysis._id}`);
logger.info(`Test files will be in: ${testDir}`);

// Initialize the ABSREL job
console.log('Initializing ABSREL job...');
const absrelJob = new ABSREL(mockSocket, mockStream, params);

// Log success
console.log('\nTest initialized successfully!');
console.log(`To check the job status: sbatch --test-only ${absrelJob.qsub_script}`);
console.log(`To check the script content: cat ${absrelJob.qsub_script}`);
console.log(`To check the progress file: cat ${absrelJob.progress_fn}`);
console.log(`To check the status file: cat ${absrelJob.status_fn}`);
console.log(`Test ID: ${mockAnalysis._id}`);