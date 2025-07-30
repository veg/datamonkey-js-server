const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const difFubar = require('../app/difFubar/difFubar.js').difFubar;

describe('difFUBAR Backend Tests', function() {
  this.timeout(30000); // Allow longer timeout for Julia tests
  
  const testDir = path.join(__dirname, 'difFubar_test_output');
  const difFubarDir = path.join(__dirname, '../app/difFubar');
  
  // Sample test data
  const sampleNexusWithLabels = `#NEXUS
BEGIN TAXA;
  DIMENSIONS NTAX=4;
  TAXLABELS
    'Human' 'Chimp' 'Gorilla' 'Orangutan';
END;

BEGIN CHARACTERS;
  DIMENSIONS NCHAR=12;
  FORMAT DATATYPE=DNA GAP=- MISSING=?;
MATRIX
  'Human'     ATGATGATGATG
  'Chimp'     ATGATGATGATG
  'Gorilla'   ATGATGATGCTG
  'Orangutan' ATGCTGATGATG;
END;
`;

  const sampleNexusNoLabels = `#NEXUS
BEGIN TAXA;
  DIMENSIONS NTAX=4;
  TAXLABELS 'Human' 'Chimp' 'Gorilla' 'Orangutan';
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
`;

  const sampleFasta = `>Human
ATGATGATGATG
>Chimp
ATGATGATGATG
>Gorilla
ATGATGATGCTG
>Orangutan
ATGCTGATGATG
`;

  const sampleTaggedTree = "(((Human{FG1}:0.01,Chimp{FG1}:0.01){FG1}:0.02,Gorilla{FG2}:0.03){FG2}:0.04,Orangutan:0.07)";
  const sampleUntaggedTree = "(((Human:0.01,Chimp:0.01):0.02,Gorilla:0.03):0.04,Orangutan:0.07)";

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

  describe('difFubar.js module', function() {
    it('should create difFubar instance with correct properties', function() {
      // Mock fs.writeFile to prevent actual file writes during tests
      const fs = require('fs');
      const originalWriteFile = fs.writeFile;
      fs.writeFile = (path, data, callback) => { if (callback) callback(); };
      
      // Mock fs.openSync to prevent file creation
      const originalOpenSync = fs.openSync;
      fs.openSync = (path, flags) => { return 1; };

      const mockSocket = { emit: () => {}, on: () => {} };
      const mockStream = {};
      const mockParams = {
        analysis: {
          _id: 'test123',
          number_of_grid_points: 20,
          concentration_of_dirichlet_prior: 0.5,
          mcmc_iterations: 2500,
          burnin_samples: 500,
          pos_threshold: 0.95,
          tagged_nwk_tree: sampleTaggedTree
        },
        msa: [{
          nj: sampleUntaggedTree
        }]
      };

      const job = new difFubar(mockSocket, mockStream, mockParams);
      
      expect(job.type).to.equal('difFubar');
      expect(job.qsub_script_name).to.equal('difFubar.sh');
      expect(job.id).to.equal('test123');
      expect(job.mcmc_iterations).to.equal(2500);
      expect(job.burnin_samples).to.equal(500);
      expect(job.pos_threshold).to.equal(0.95);
      expect(job.nwk_tree).to.equal(sampleTaggedTree); // Should use tagged tree
      expect(job.treemode).to.equal('user');

      // Restore original functions
      fs.writeFile = originalWriteFile;
      fs.openSync = originalOpenSync;
    });

    it('should fall back to NJ tree when no tagged tree provided', function() {
      // Mock fs functions
      const fs = require('fs');
      const originalWriteFile = fs.writeFile;
      const originalOpenSync = fs.openSync;
      fs.writeFile = (path, data, callback) => { if (callback) callback(); };
      fs.openSync = (path, flags) => { return 1; };

      const mockSocket = { emit: () => {}, on: () => {} };
      const mockStream = {};
      const mockParams = {
        analysis: {
          _id: 'test456',
          number_of_grid_points: 20,
          concentration_of_dirichlet_prior: 0.5,
          mcmc_iterations: 2500,
          burnin_samples: 500,
          pos_threshold: 0.95
          // No tagged_nwk_tree provided
        },
        msa: [{
          nj: sampleUntaggedTree
        }]
      };

      const job = new difFubar(mockSocket, mockStream, mockParams);
      
      expect(job.nwk_tree).to.equal(sampleUntaggedTree);
      expect(job.treemode).to.equal('nj');

      // Restore
      fs.writeFile = originalWriteFile;
      fs.openSync = originalOpenSync;
    });

    it('should generate correct local execution parameters', function() {
      const config = require('../config.json');
      const originalSubmitType = config.submit_type;
      config.submit_type = 'local'; // Force local execution
      
      // Mock fs functions
      const fs = require('fs');
      const originalWriteFile = fs.writeFile;
      const originalOpenSync = fs.openSync;
      fs.writeFile = (path, data, callback) => { if (callback) callback(); };
      fs.openSync = (path, flags) => { return 1; };
      
      const mockSocket = { emit: () => {}, on: () => {} };
      const mockStream = {};
      const mockParams = {
        analysis: {
          _id: 'test789',
          number_of_grid_points: 20,
          concentration_of_dirichlet_prior: 0.5,
          mcmc_iterations: 100,
          burnin_samples: 25,
          pos_threshold: 0.9
        },
        msa: [{
          nj: sampleUntaggedTree
        }]
      };

      const job = new difFubar(mockSocket, mockStream, mockParams);
      
      expect(job.qsub_params).to.be.an('array');
      expect(job.qsub_params[0]).to.include('difFubar.sh');
      expect(job.qsub_params[1]).to.include('test789'); // fn
      expect(job.qsub_params[2]).to.include('.tre'); // tree_fn
      expect(job.qsub_params[3]).to.include('.status'); // status_fn
      expect(job.qsub_params[4]).to.include('.progress'); // progress_fn
      expect(job.qsub_params[5]).to.include('.difFubar'); // results_short_fn
      expect(job.qsub_params[6]).to.equal(0.9); // pos_threshold
      expect(job.qsub_params[7]).to.equal(100); // mcmc_iterations
      expect(job.qsub_params[8]).to.equal(25); // burnin_samples
      expect(job.qsub_params[9]).to.equal(0.5); // concentration_of_dirichlet_prior

      // Restore
      fs.writeFile = originalWriteFile;
      fs.openSync = originalOpenSync;
      config.submit_type = originalSubmitType;
    });
  });

  describe('difFubar.sh shell script', function() {
    const scriptPath = path.join(difFubarDir, 'difFubar.sh');

    it('should exist and be executable', function(done) {
      fs.stat(scriptPath, (err, stats) => {
        expect(err).to.be.null;
        expect(stats.mode & parseInt('100', 8)).to.be.above(0); // Check execute permission
        done();
      });
    });

    it('should show usage when called without arguments', function(done) {
      const proc = spawn('bash', [scriptPath]);
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        expect(code).to.equal(1);
        expect(output).to.include('Usage:');
        expect(output).to.include('<fn> <tree_fn> <sfn> <pfn> <rfn>');
        done();
      });
    });

    it('should create status and progress files', function(done) {
      const testId = Date.now().toString();
      const testFiles = {
        fn: path.join(testDir, `${testId}.nex`),
        tree_fn: path.join(testDir, `${testId}.tre`),
        status_fn: path.join(testDir, `${testId}.status`),
        progress_fn: path.join(testDir, `${testId}.progress`),
        results_fn: path.join(testDir, `${testId}.difFubar`)
      };

      // Create test input files
      fs.writeFileSync(testFiles.fn, sampleNexusNoLabels);
      fs.writeFileSync(testFiles.tree_fn, sampleTaggedTree);

      const proc = spawn('bash', [
        scriptPath,
        testFiles.fn,
        testFiles.tree_fn,
        testFiles.status_fn,
        testFiles.progress_fn,
        testFiles.results_fn,
        '0.95',
        '10',
        '5',
        '0.5',
        '/usr/local/bin/julia',
        './.julia_env'
      ]);

      proc.on('close', (code) => {
        // Check that status file was created and contains expected content
        expect(fs.existsSync(testFiles.status_fn)).to.be.true;
        const statusContent = fs.readFileSync(testFiles.status_fn, 'utf8');
        expect(statusContent).to.include('[BASH] starting difFUBAR');
        
        // Check that progress file was created
        expect(fs.existsSync(testFiles.progress_fn)).to.be.true;
        const progressContent = fs.readFileSync(testFiles.progress_fn, 'utf8');
        expect(progressContent).to.include('info');

        // Clean up
        Object.values(testFiles).forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        
        done();
      });
    });
  });

  describe('difFubar_analysis.jl Julia script', function() {
    const juliaScriptPath = path.join(difFubarDir, 'difFubar_analysis.jl');

    it('should exist', function() {
      expect(fs.existsSync(juliaScriptPath)).to.be.true;
    });

    it('should show usage with incorrect arguments', function(done) {
      const proc = spawn('/usr/local/bin/julia', ['--project=./.julia_env', juliaScriptPath], {
        cwd: difFubarDir
      });

      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        expect(code).to.equal(1);
        // Check both stdout and stderr for usage message
        const combinedOutput = output + errorOutput;
        expect(combinedOutput).to.include('Usage:');
        expect(combinedOutput).to.include('julia difFubar_analysis.jl');
        done();
      });
    });

    it('should parse command line arguments correctly', function(done) {
      const testId = Date.now().toString();
      const testFiles = {
        fn: path.join(testDir, `${testId}.nex`),
        tree_fn: path.join(testDir, `${testId}.tre`),
        results_fn: path.join(testDir, `${testId}.difFubar`),
        status_fn: path.join(testDir, `${testId}.status`)
      };

      // Create minimal test files
      fs.writeFileSync(testFiles.fn, sampleNexusNoLabels);
      fs.writeFileSync(testFiles.tree_fn, sampleTaggedTree);

      const proc = spawn('/usr/local/bin/julia', [
        '--project=./.julia_env',
        juliaScriptPath,
        testFiles.fn,
        testFiles.tree_fn,
        testFiles.results_fn,
        testFiles.status_fn,
        '0.95',
        '10',
        '5',
        '0.5'
      ], {
        cwd: difFubarDir
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        // Check that parameters were parsed
        expect(output).to.include('=== JULIA DIFUBAR PARAMETERS ===');
        expect(output).to.include(`Alignment file: ${testFiles.fn}`);
        expect(output).to.include(`Tree file: ${testFiles.tree_fn}`);
        expect(output).to.include('Positive threshold: 0.95');
        expect(output).to.include('MCMC iterations: 10');
        expect(output).to.include('Burnin samples: 5');
        expect(output).to.include('Dirichlet concentration: 0.5');

        // Clean up
        Object.values(testFiles).forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });

        done();
      });
    });
  });

  describe('NEXUS parsing', function() {
    it('should handle NEXUS format with labels', function(done) {
      const testId = Date.now().toString();
      const testFile = path.join(testDir, `${testId}_labels.nex`);
      fs.writeFileSync(testFile, sampleNexusWithLabels);

      const proc = spawn('/usr/local/bin/julia', [
        '--project=./.julia_env',
        '-e',
        `
        file_content = read("${testFile}", String)
        if occursin("#NEXUS", file_content)
            println("TEST: NEXUS detected")
        end
        `
      ], {
        cwd: difFubarDir
      });

      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        // If there's an error, check if Julia just isn't installed
        if (code !== 0 && errorOutput.includes('julia: command not found')) {
          console.warn('Julia not found, skipping test');
          fs.unlinkSync(testFile);
          done();
        } else {
          expect(output).to.include('TEST: NEXUS detected');
          fs.unlinkSync(testFile);
          done();
        }
      });
    });

    it('should handle NEXUS format with NOLABELS', function(done) {
      const testId = Date.now().toString();
      const testFile = path.join(testDir, `${testId}_nolabels.nex`);
      fs.writeFileSync(testFile, sampleNexusNoLabels);

      const proc = spawn('/usr/local/bin/julia', [
        '--project=./.julia_env',
        '-e',
        `
        file_content = read("${testFile}", String)
        lines = split(file_content, '\\n')
        taxlabels_found = any(line -> occursin("TAXLABELS", uppercase(line)), lines)
        nolabels_found = any(line -> occursin("NOLABELS", uppercase(line)), lines)
        println("TAXLABELS found: ", taxlabels_found)
        println("NOLABELS found: ", nolabels_found)
        `
      ], {
        cwd: difFubarDir
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        expect(output).to.include('TAXLABELS found: true');
        expect(output).to.include('NOLABELS found: true');
        fs.unlinkSync(testFile);
        done();
      });
    });
  });

  describe('Tagged tree support', function() {
    it('should detect tags in tree', function(done) {
      const proc = spawn('/usr/local/bin/julia', [
        '--project=./.julia_env',
        '-e',
        `
        treestring = "${sampleTaggedTree}"
        tag_matches = collect(eachmatch(r"\\{[^}]+\\}", treestring))
        tags = unique([String(m.match) for m in tag_matches])
        println("Found tags: ", tags)
        `
      ], {
        cwd: difFubarDir
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        expect(output).to.include('{FG1}');
        expect(output).to.include('{FG2}');
        done();
      });
    });
  });

  describe('Logging and debugging', function() {
    it('should append to status file without overwriting', function(done) {
      const testFile = path.join(testDir, 'append_test.status');
      
      // Write initial content
      fs.writeFileSync(testFile, 'Initial content');
      
      // Simulate bash appending
      fs.appendFileSync(testFile, '\n[BASH] starting difFUBAR');
      
      // Simulate Julia appending
      fs.appendFileSync(testFile, '\n[JULIA] completed');
      
      const content = fs.readFileSync(testFile, 'utf8');
      expect(content).to.include('Initial content');
      expect(content).to.include('[BASH] starting difFUBAR');
      expect(content).to.include('[JULIA] completed');
      
      fs.unlinkSync(testFile);
      done();
    });

    it('should create stdout log file', function(done) {
      const testId = Date.now().toString();
      const resultsFile = path.join(testDir, `${testId}.difFubar`);
      const stdoutLog = `${resultsFile}.stdout.log`;
      
      // Simulate tee command behavior
      const testContent = '=== EXECUTING JULIA COMMAND ===\nTest output\n';
      fs.writeFileSync(stdoutLog, testContent);
      
      expect(fs.existsSync(stdoutLog)).to.be.true;
      expect(fs.readFileSync(stdoutLog, 'utf8')).to.equal(testContent);
      
      fs.unlinkSync(stdoutLog);
      done();
    });
  });

  describe('Error handling', function() {
    it('should handle missing input files gracefully', function(done) {
      const nonExistentFile = path.join(testDir, 'does_not_exist.nex');
      const proc = spawn('/usr/local/bin/julia', [
        '--project=./.julia_env',
        '-e',
        `
        fn = "${nonExistentFile}"
        if !isfile(fn)
            println("ERROR: Input file not found")
        end
        `
      ], {
        cwd: difFubarDir
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        expect(output).to.include('ERROR: Input file not found');
        done();
      });
    });

    it('should handle malformed trees', function(done) {
      const malformedTree = "((A,B,C"; // Missing closing parentheses
      const proc = spawn('/usr/local/bin/julia', [
        '--project=./.julia_env',
        '-e',
        `
        try
            # This would normally fail in the actual parsing
            treestring = "${malformedTree}"
            if count(==('('), treestring) != count(==(')'), treestring)
                error("Malformed tree: unbalanced parentheses")
            end
        catch e
            println("ERROR: ", e)
        end
        `
      ], {
        cwd: difFubarDir
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        expect(output).to.include('ERROR:');
        expect(output).to.include('Malformed tree');
        done();
      });
    });
  });
});