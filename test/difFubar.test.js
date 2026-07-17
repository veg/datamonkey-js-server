const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const config = require('../config.json');
const difFubar = require('../app/difFubar/difFubar.js').difFubar;

describe('difFUBAR Backend Tests', function() {
  this.timeout(30000); // Allow longer timeout for Julia tests

  const testDir = path.join(__dirname, 'difFubar_test_output');
  const difFubarDir = path.join(__dirname, '../app/difFubar');

  // Use the configured Julia binary rather than a hardcoded path, and the
  // repo-root .julia_env project (relative to app/difFubar it is ../../.julia_env).
  const juliaPath = (config && config.julia_path) || '/usr/local/bin/julia';
  const juliaProject = '../../.julia_env';
  // Gate Julia-dependent tests on the binary actually being available.
  let juliaAvailable = false;
  try {
    juliaAvailable = spawnSync(juliaPath, ['--version'], { timeout: 15000 }).status === 0;
  } catch (e) {
    juliaAvailable = false;
  }
  
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
    // The difFubar constructor unconditionally calls self.init(), which runs the
    // full hyphyJob submit pipeline (sbatch/qsub) against a live SLURM cluster.
    // These three tests only assert constructed fields, so stub init() (a no-op)
    // for the duration of this block. This makes them true unit tests with zero
    // cluster impact.
    let originalInit;
    beforeEach(function() {
      originalInit = difFubar.prototype.init;
      difFubar.prototype.init = function() {};
    });
    afterEach(function() {
      difFubar.prototype.init = originalInit;
    });

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
      
      // Local positional contract (see difFubar.js): qsub_script, fn, tree_fn,
      // results_short_fn, progress_fn, pos_threshold, mcmc_iterations,
      // burnin_samples, concentration_of_dirichlet_prior, julia_path, julia_project.
      expect(job.qsub_params).to.be.an('array');
      expect(job.qsub_params[0]).to.include('difFubar.sh');
      expect(job.qsub_params[1]).to.include('test789'); // fn
      expect(job.qsub_params[2]).to.include('.tre'); // tree_fn
      expect(job.qsub_params[3]).to.include('.difFubar'); // results_short_fn
      expect(job.qsub_params[4]).to.include('.progress'); // progress_fn
      expect(job.qsub_params[5]).to.equal(0.9); // pos_threshold
      expect(job.qsub_params[6]).to.equal(100); // mcmc_iterations
      expect(job.qsub_params[7]).to.equal(25); // burnin_samples
      expect(job.qsub_params[8]).to.equal(0.5); // concentration_of_dirichlet_prior

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

    it('should echo its parameters using the positional (local) contract', function(done) {
      // difFubar.sh positional order (see difFubar.sh):
      //   FN TREE_FN RFN PFN POS MCMC BURNIN CONC JULIA_PATH JULIA_PROJECT
      // Use a harmless JULIA_PATH ("true") so the script exits fast without
      // running a real Julia analysis to completion.
      const testId = Date.now().toString();
      const testFiles = {
        fn: path.join(testDir, `${testId}.nex`),
        tree_fn: path.join(testDir, `${testId}.tre`),
        results_fn: path.join(testDir, `${testId}.difFubar`),
        progress_fn: path.join(testDir, `${testId}.progress`)
      };

      fs.writeFileSync(testFiles.fn, sampleNexusNoLabels);
      fs.writeFileSync(testFiles.tree_fn, sampleTaggedTree);

      const proc = spawn('bash', [
        scriptPath,
        testFiles.fn,
        testFiles.tree_fn,
        testFiles.results_fn,
        testFiles.progress_fn,
        '0.95',
        '10',
        '5',
        '0.5',
        'true', // JULIA_PATH stub: exits immediately, no real analysis
        './.julia_env'
      ]);

      let output = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });

      proc.on('close', (code) => {
        expect(output).to.include('=== DIFUBAR PARAMETERS ===');
        expect(output).to.include(`Alignment file: ${testFiles.fn}`);
        expect(output).to.include(`Tree file: ${testFiles.tree_fn}`);
        expect(output).to.include('Positive threshold: 0.95');
        expect(output).to.include('MCMC iterations: 10');
        expect(output).to.include('Burnin samples: 5');

        Object.values(testFiles).forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
        done();
      });
    });

    it('should initialize the progress file', function(done) {
      // The script writes progress updates to $PFN (the 4th positional arg),
      // starting with '[BASH] Initializing difFUBAR analysis...'. There is no
      // separate status file. Use a stub JULIA_PATH so no real analysis runs.
      const testId = Date.now().toString();
      const testFiles = {
        fn: path.join(testDir, `${testId}.nex`),
        tree_fn: path.join(testDir, `${testId}.tre`),
        results_fn: path.join(testDir, `${testId}.difFubar`),
        progress_fn: path.join(testDir, `${testId}.progress`)
      };

      fs.writeFileSync(testFiles.fn, sampleNexusNoLabels);
      fs.writeFileSync(testFiles.tree_fn, sampleTaggedTree);

      const proc = spawn('bash', [
        scriptPath,
        testFiles.fn,
        testFiles.tree_fn,
        testFiles.results_fn,
        testFiles.progress_fn,
        '0.95',
        '10',
        '5',
        '0.5',
        'true', // JULIA_PATH stub
        './.julia_env'
      ]);

      proc.on('close', (code) => {
        expect(fs.existsSync(testFiles.progress_fn)).to.be.true;
        const progressContent = fs.readFileSync(testFiles.progress_fn, 'utf8');
        expect(progressContent).to.include('[BASH] Initializing difFUBAR analysis...');

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
      if (!juliaAvailable) { this.skip(); return; }
      const proc = spawn(juliaPath, [`--project=${juliaProject}`, juliaScriptPath], {
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
      if (!juliaAvailable) { this.skip(); return; }
      const testId = Date.now().toString();
      const testFiles = {
        fn: path.join(testDir, `${testId}.nex`),
        tree_fn: path.join(testDir, `${testId}.tre`),
        results_fn: path.join(testDir, `${testId}.difFubar`),
        status_fn: path.join(testDir, `${testId}.status`)
      };

      // Create minimal test files. The Julia positional order is
      // fn, tree_fn, rfn, pfn, pos, mcmc, burnin, conc (see difFubar_analysis.jl).
      fs.writeFileSync(testFiles.fn, sampleNexusNoLabels);
      fs.writeFileSync(testFiles.tree_fn, sampleTaggedTree);

      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
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
      let finished = false;
      const cleanup = () => {
        Object.values(testFiles).forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        try { proc.kill('SIGKILL'); } catch (e) {}
        expect(output).to.include('=== JULIA DIFUBAR PARAMETERS ===');
        expect(output).to.include(`Alignment file: ${testFiles.fn}`);
        expect(output).to.include(`Tree file: ${testFiles.tree_fn}`);
        expect(output).to.include('Positive threshold: 0.95');
        expect(output).to.include('MCMC iterations: 10');
        expect(output).to.include('Burnin samples: 5');
        expect(output).to.include('Dirichlet concentration: 0.5');
        cleanup();
        done();
      };

      proc.stdout.on('data', (data) => {
        output += data.toString();
        // We only assert on the printed parameter block; kill the process as
        // soon as it is emitted so we never run the analysis to completion.
        if (output.includes('Dirichlet concentration: 0.5')) {
          finish();
        }
      });

      proc.on('close', () => { finish(); });
    });
  });

  describe('NEXUS parsing', function() {
    it('should handle NEXUS format with labels', function(done) {
      if (!juliaAvailable) { this.skip(); return; }
      const testId = Date.now().toString();
      const testFile = path.join(testDir, `${testId}_labels.nex`);
      fs.writeFileSync(testFile, sampleNexusWithLabels);

      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
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

    it('should handle NEXUS format with Windows line endings', function(done) {
      if (!juliaAvailable) { this.skip(); return; }
      const testId = Date.now().toString();
      const testFile = path.join(testDir, `${testId}_windows.nex`);
      // Create NEXUS file with Windows line endings (\r only)
      const windowsNexus = sampleNexusNoLabels.replace(/\n/g, '\r');
      fs.writeFileSync(testFile, windowsNexus);

      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
        '-e',
        `
        file_content = read("${testFile}", String)
        # Test original vs fixed line parsing
        original_lines = split(file_content, '\\n')
        fixed_lines = split(replace(file_content, '\\r' => '\\n'), '\\n')
        println("Original lines: \", length(original_lines))
        println("Fixed lines: \", length(fixed_lines))
        println("Has CR line endings: \", occursin('\\r', file_content))
        `
      ], {
        cwd: difFubarDir
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        expect(output).to.include('Original lines: 1');
        expect(output).to.include('Fixed lines:');
        expect(output).to.include('Has CR line endings: true');
        fs.unlinkSync(testFile);
        done();
      });
    });

    it('should handle NEXUS format with NOLABELS', function(done) {
      if (!juliaAvailable) { this.skip(); return; }
      const testId = Date.now().toString();
      const testFile = path.join(testDir, `${testId}_nolabels.nex`);
      fs.writeFileSync(testFile, sampleNexusNoLabels);

      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
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
      if (!juliaAvailable) { this.skip(); return; }
      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
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
      if (!juliaAvailable) { this.skip(); return; }
      const nonExistentFile = path.join(testDir, 'does_not_exist.nex');
      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
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
      if (!juliaAvailable) { this.skip(); return; }
      const malformedTree = "((A,B,C"; // Missing closing parentheses
      const proc = spawn(juliaPath, [
        `--project=${juliaProject}`,
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