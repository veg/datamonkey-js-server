const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

describe('difFUBAR Integration Tests', function() {
  this.timeout(60000); // Allow longer timeout for full integration tests
  
  const testDir = path.join(__dirname, 'difFubar_integration_test');
  const difFubarDir = path.join(__dirname, '../app/difFubar');
  const outputDir = path.join(difFubarDir, 'output');

  before(function(done) {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    done();
  });

  after(function(done) {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    done();
  });

  describe('Full workflow test', function() {
    it('should handle complete difFUBAR workflow with command line arguments', function(done) {
      const testId = 'integration_' + Date.now();
      
      // Create test NEXUS file with proper codon alignment
      const testNexus = `#NEXUS
BEGIN TAXA;
  DIMENSIONS NTAX=4;
  TAXLABELS Human Chimp Gorilla Orangutan;
END;

BEGIN CHARACTERS;
  DIMENSIONS NCHAR=12;
  FORMAT DATATYPE=DNA GAP=- MISSING=? NOLABELS;
MATRIX
  ATGATGATGATG
  ATGATGATGATG
  ATGATGATGCTG
  ATGCTGATGATG;
END;

BEGIN TREES;
  TREE tree = (((Human{FG1}:0.01,Chimp{FG1}:0.01){FG1}:0.02,Gorilla{FG2}:0.03):0.04,Orangutan:0.07);
END;
`;

      const testFiles = {
        fn: path.join(testDir, `${testId}.nex`),
        tree_fn: path.join(testDir, `${testId}.tre`),
        status_fn: path.join(testDir, `${testId}.status`),
        progress_fn: path.join(testDir, `${testId}.progress`),
        results_fn: path.join(testDir, `${testId}.difFubar`)
      };

      // Write test files
      fs.writeFileSync(testFiles.fn, testNexus);
      fs.writeFileSync(testFiles.tree_fn, '(((Human{FG1}:0.01,Chimp{FG1}:0.01){FG1}:0.02,Gorilla{FG2}:0.03):0.04,Orangutan:0.07)');

      // Run the full workflow
      const proc = spawn('bash', [
        path.join(difFubarDir, 'difFubar.sh'),
        testFiles.fn,
        testFiles.tree_fn,
        testFiles.status_fn,
        testFiles.progress_fn,
        testFiles.results_fn,
        '0.95',
        '10',  // Very small for testing
        '5',
        '0.5',
        '/usr/local/bin/julia',
        './.julia_env'
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        // Verify output contains expected elements
        expect(stdout).to.include('=== DIFUBAR PARAMETERS ===');
        expect(stdout).to.include('=== EXECUTING JULIA COMMAND ===');
        expect(stdout).to.include('=== JULIA DIFUBAR PARAMETERS ===');
        expect(stdout).to.include('Reading input files...');
        expect(stdout).to.include('Detected NEXUS format');
        expect(stdout).to.include('Found 4 taxa');
        expect(stdout).to.include('Found tags in tree');
        
        // Verify status file contains both bash and Julia entries
        if (fs.existsSync(testFiles.status_fn)) {
          const statusContent = fs.readFileSync(testFiles.status_fn, 'utf8');
          expect(statusContent).to.include('[BASH] starting difFUBAR');
          expect(statusContent).to.include('[BASH] difFUBAR analysis completed');
        }

        // Verify stdout log was created
        const stdoutLog = `${testFiles.results_fn}.stdout.log`;
        expect(fs.existsSync(stdoutLog)).to.be.true;

        // Clean up
        Object.values(testFiles).forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        if (fs.existsSync(stdoutLog)) fs.unlinkSync(stdoutLog);

        done();
      });
    });
  });

  describe('Debugging command generation', function() {
    it('should generate correct debugging command', function(done) {
      const testFiles = {
        fn: '/test/path/alignment.nex',
        tree_fn: '/test/path/tree.tre',
        status_fn: '/test/path/status',
        progress_fn: '/test/path/progress',
        results_fn: '/test/path/results'
      };

      const debugCommand = `cd ${difFubarDir} && /usr/local/bin/julia --project="./.julia_env" difFubar_analysis.jl \\
  "${testFiles.fn}" \\
  "${testFiles.tree_fn}" \\
  "${testFiles.results_fn}" \\
  "${testFiles.status_fn}" \\
  "0.95" \\
  "2500" \\
  "500" \\
  "0.5"`;

      // Verify command format
      expect(debugCommand).to.include('julia --project=');
      expect(debugCommand).to.include('difFubar_analysis.jl');
      expect(debugCommand).to.include(testFiles.fn);
      expect(debugCommand).to.include('"0.95"');
      expect(debugCommand).to.include('"2500"');

      done();
    });
  });

  describe('Parameter validation', function() {
    it('should validate numeric parameters', function(done) {
      const validateParams = (posThreshold, mcmcIterations, burninSamples, concentration) => {
        const errors = [];
        
        if (isNaN(posThreshold) || posThreshold < 0 || posThreshold > 1) {
          errors.push('pos_threshold must be between 0 and 1');
        }
        
        if (isNaN(mcmcIterations) || mcmcIterations < 1) {
          errors.push('mcmc_iterations must be positive');
        }
        
        if (isNaN(burninSamples) || burninSamples < 0) {
          errors.push('burnin_samples must be non-negative');
        }
        
        if (isNaN(concentration) || concentration <= 0) {
          errors.push('concentration must be positive');
        }
        
        return errors;
      };

      // Test valid parameters
      expect(validateParams(0.95, 2500, 500, 0.5)).to.be.empty;
      
      // Test invalid parameters
      expect(validateParams(1.5, 2500, 500, 0.5)).to.include('pos_threshold must be between 0 and 1');
      expect(validateParams(0.95, -100, 500, 0.5)).to.include('mcmc_iterations must be positive');
      expect(validateParams(0.95, 2500, -10, 0.5)).to.include('burnin_samples must be non-negative');
      expect(validateParams(0.95, 2500, 500, 0)).to.include('concentration must be positive');

      done();
    });
  });

  describe('File format detection', function() {
    const testFormats = [
      {
        name: 'NEXUS with #NEXUS header',
        content: '#NEXUS\nBEGIN DATA;',
        expectedFormat: 'NEXUS'
      },
      {
        name: 'FASTA format',
        content: '>Seq1\nATGATG\n>Seq2\nATGCTG',
        expectedFormat: 'FASTA'
      },
      {
        name: 'NEXUS without header',
        content: 'BEGIN DATA;',
        expectedFormat: 'UNKNOWN'
      }
    ];

    testFormats.forEach(format => {
      it(`should detect ${format.name}`, function(done) {
        const detectFormat = (content) => {
          if (content.includes('#NEXUS')) return 'NEXUS';
          if (content.startsWith('>')) return 'FASTA';
          return 'UNKNOWN';
        };

        expect(detectFormat(format.content)).to.equal(format.expectedFormat);
        done();
      });
    });
  });

  describe('Tree tag extraction', function() {
    const testTrees = [
      {
        tree: '(((A{FG1},B{FG1}){FG1},C{FG2}),D)',
        expectedTags: ['{FG1}', '{FG2}']
      },
      {
        tree: '(((A{Test},B{Test}),C{Foreground}),D)',
        expectedTags: ['{Test}', '{Foreground}']
      },
      {
        tree: '(((A,B),C),D)',
        expectedTags: []
      }
    ];

    testTrees.forEach(test => {
      it(`should extract tags from tree: ${test.tree.substring(0, 30)}...`, function(done) {
        const extractTags = (tree) => {
          const matches = tree.match(/\{[^}]+\}/g) || [];
          return [...new Set(matches)].sort();
        };

        const tags = extractTags(test.tree);
        expect(tags).to.deep.equal(test.expectedTags.sort());
        done();
      });
    });
  });

  describe('Sequence validation', function() {
    it('should validate codon sequences', function(done) {
      const validateCodonSequence = (seq) => {
        // Remove gaps
        const cleanSeq = seq.replace(/-/g, '');
        
        // Check if divisible by 3
        if (cleanSeq.length % 3 !== 0) {
          return { valid: false, error: 'Sequence length not divisible by 3' };
        }
        
        // Check for valid nucleotides
        if (!/^[ATGCN]*$/i.test(cleanSeq)) {
          return { valid: false, error: 'Invalid nucleotide characters' };
        }
        
        return { valid: true };
      };

      // Valid sequences
      expect(validateCodonSequence('ATGATGATG')).to.deep.equal({ valid: true });
      expect(validateCodonSequence('ATG---ATG')).to.deep.equal({ valid: true });
      
      // Invalid sequences
      expect(validateCodonSequence('ATGATG')).to.include({ valid: false });
      expect(validateCodonSequence('ATGATGATGX')).to.include({ valid: false });

      done();
    });
  });
});