/**
 * SLURM Analysis Wrapper Script
 * 
 * This script provides a central interface to run and test different analysis methods
 * with SLURM integration. It includes fixes for common issues and standardizes
 * the approach across all analysis types.
 */

const fs = require('fs');
const path = require('path');
const utilities = require('../../lib/utilities');
const logger = require('../../lib/logger').logger;
const { spawn } = require('child_process');

// Create test output directory
const testOutputDir = path.join(__dirname, 'test_output');
if (!fs.existsSync(testOutputDir)) {
  fs.mkdirSync(testOutputDir, { recursive: true });
}

// Define the analysis methods
const methods = [
  {
    name: 'FEL',
    module: '../../app/fel/fel.js',
    moduleVar: 'fel',
    outputDir: '../../app/fel/output',
    script: '../../app/fel/fel.sh'
  },
  {
    name: 'MEME',
    module: '../../app/meme/meme.js',
    moduleVar: 'meme',
    outputDir: '../../app/meme/output',
    script: '../../app/meme/meme.sh'
  },
  {
    name: 'SLAC',
    module: '../../app/slac/slac.js',
    moduleVar: 'slac',
    outputDir: '../../app/slac/output',
    script: '../../app/slac/slac.sh'
  },
  {
    name: 'ABSREL',
    module: '../../app/absrel/absrel.js',
    moduleVar: 'absrel',
    outputDir: '../../app/absrel/output',
    script: '../../app/absrel/absrel.sh'
  },
  {
    name: 'BUSTED',
    module: '../../app/busted/busted.js',
    moduleVar: 'busted',
    outputDir: '../../app/busted/output',
    script: '../../app/busted/busted.sh'
  },
  {
    name: 'GARD',
    module: '../../app/gard/gard.js',
    moduleVar: 'gard',
    outputDir: '../../app/gard/output',
    script: '../../app/gard/gard.sh'
  }
];

// Update all shell scripts to use proper HYPHY command format
function updateShellScripts() {
  console.log('\nUpdating shell scripts for all analysis methods...');
  
  methods.forEach(method => {
    try {
      const scriptPath = path.join(__dirname, method.script);
      if (fs.existsSync(scriptPath)) {
        let script = fs.readFileSync(scriptPath, 'utf8');
        
        // Check if the script needs updating
        if (script.includes('ENV="TOLERATE_NUMERICAL_ERRORS=1;"')) {
          console.log(`- Updating ${method.name} script to use export instead of ENV parameter`);
          
          // Replace ENV parameter with export statement
          script = script.replace(/ENV="TOLERATE_NUMERICAL_ERRORS=1;"/g, '');
          script = script.replace(/\$HYPHY_NON_MPI LIBPATH=\$HYPHY_PATH/g, 'export TOLERATE_NUMERICAL_ERRORS=1\n      $HYPHY_NON_MPI LIBPATH=$HYPHY_PATH');
          script = script.replace(/srun --mpi=\$MPI_TYPE -n \$PROCS \$HYPHY LIBPATH=\$HYPHY_PATH/g, 'export TOLERATE_NUMERICAL_ERRORS=1\n      srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH');
          script = script.replace(/mpirun -np \$PROCS \$HYPHY LIBPATH=\$HYPHY_PATH/g, 'export TOLERATE_NUMERICAL_ERRORS=1\n      mpirun -np $PROCS $HYPHY LIBPATH=$HYPHY_PATH');
          
          // Update branch selection if needed
          script = script.replace(/--branches FG/g, '--branches All');
          
          // Add fallback to non-MPI HYPHY if needed
          if (!script.includes('HYPHY_NON_MPI=')) {
            const mpiSection = script.match(/if \[ -n "\$SLURM_JOB_ID" \]; then([\s\S]*?)else/);
            if (mpiSection) {
              const replacementSection = `if [ -n "$SLURM_JOB_ID" ]; then
  echo "Running under SLURM with job ID: $SLURM_JOB_ID"
  MPI_TYPE="\${slurm_mpi_type:-pmix}"
  echo "Using MPI type: $MPI_TYPE"
  
  # Try the non-MPI version as a fallback since we're having library issues with MPI
  echo "Running HYPHY in non-MPI mode as a fallback due to library issues..."
  
  HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
  
  if [ -f "$HYPHY_NON_MPI" ]; then
    echo "Using non-MPI HYPHY: $HYPHY_NON_MPI"
    export TOLERATE_NUMERICAL_ERRORS=1`;
              
              script = script.replace(/if \[ -n "\$SLURM_JOB_ID" \]; then[\s\S]*?echo "Using MPI type: \$MPI_TYPE"/g, replacementSection);
            }
          }
          
          // Add module loading for MPI if needed
          if (!script.includes('module load openmpi-arm/5.0.5')) {
            const pathSection = script.match(/export PATH=[^\n]*/);
            if (pathSection) {
              const replacementSection = `# Set the PATH but skip module loading - system specific
export PATH=/usr/local/bin:$PATH

# Try to load modules if they exist, but don't fail if they don't
if [ -f /etc/profile.d/modules.sh ]; then
  source /etc/profile.d/modules.sh
  
  # Load the specific OpenMPI module for ARM architecture
  module load openmpi-arm/5.0.5 2>/dev/null || echo "Failed to load openmpi-arm/5.0.5"
  
  # Check if module was loaded successfully
  module list 2>&1
  
  # Print library paths for debugging
  echo "LD_LIBRARY_PATH: $LD_LIBRARY_PATH"
else
  echo "Module system not available, using system environment"
fi

# Make sure UCX libraries are available - these paths are critical for the MPI support
export LD_LIBRARY_PATH=/opt/ohpc/pub/mpi/ucx-ohpc/1.17.0/lib:$LD_LIBRARY_PATH:/usr/lib64

# Print library paths and attempt to verify UCX is available
echo "LD_LIBRARY_PATH after adjustment: $LD_LIBRARY_PATH"
ls -l /opt/ohpc/pub/mpi/ucx-ohpc/1.17.0/lib/libucp.so* 2>&1 || echo "UCX libraries not found"`;
              
              script = script.replace(/export PATH=[^\n]*(\n|$)/, replacementSection + '\n');
            }
          }
          
          // Write updated script
          fs.writeFileSync(scriptPath, script);
          console.log(`  ✓ Updated ${method.name} shell script`);
        } else {
          console.log(`  ✓ ${method.name} shell script already up to date`);
        }
      } else {
        console.log(`  ! ${method.name} shell script not found at ${scriptPath}`);
      }
    } catch (err) {
      console.error(`  ✗ Error updating ${method.name} shell script:`, err.message);
    }
  });
}

// Run a test for a specific analysis method
async function runAnalysisTest(methodName) {
  console.log(`\n=== Testing ${methodName} analysis with SLURM ===\n`);
  
  // Find the method configuration
  const method = methods.find(m => m.name === methodName);
  if (!method) {
    console.error(`Method ${methodName} not found!`);
    return { status: 'ERROR', message: `Method ${methodName} not found!` };
  }
  
  // Create test output directory if needed
  const outputDir = path.join(__dirname, method.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Create test ID and paths
  const testId = `test_${method.moduleVar.toLowerCase()}_${Date.now()}`;
  const outputPath = path.join(outputDir, testId);
  const treePath = outputPath + '.tre';
  const progressPath = outputPath + `.${method.moduleVar.toLowerCase()}.progress`;
  const statusPath = outputPath + '.status';
  
  // Delete any existing test files
  const existingFiles = fs.readdirSync(outputDir).filter(f => f.startsWith(testId));
  existingFiles.forEach(file => {
    try {
      fs.unlinkSync(path.join(outputDir, file));
    } catch (err) {
      console.warn(`Could not delete file ${file}:`, err.message);
    }
  });
  
  // Create a minimal FASTA file for testing with variation
  fs.writeFileSync(outputPath, '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n');
  
  // Create a tree file
  fs.writeFileSync(treePath, '(((A:0.1,B:0.2):0.3,C:0.4):0.5,D:0.6);');
  
  // Create an empty progress file
  fs.writeFileSync(progressPath, '');
  
  // Import the analysis module
  let AnalysisModule;
  try {
    AnalysisModule = require(method.module)[method.moduleVar];
  } catch (err) {
    console.error(`Error importing ${method.name} module:`, err.message);
    return { status: 'ERROR', message: `Error importing module: ${err.message}` };
  }
  
  // Create mock parameters for the analysis
  const mockMsa = [{
    gencodeid: 0,  // Universal genetic code
    nj: '(((A:0.1,B:0.2):0.3,C:0.4):0.5,D:0.6);'
  }];
  
  const mockAnalysis = {
    _id: testId,
    msa: mockMsa,
    tagged_nwk_tree: '(((A:0.1,B:0.2):0.3,C:0.4):0.5,D:0.6);',
    ds_variation: 1,  // Yes for rate variation
    bootstrap: false, // No for bootstrap
    multiple_hits: 'None',
    site_multihit: 'Estimate',
    rates: 2,
    impute_states: 'No',
    rate_variation: 'Yes',
    rate_classes: 2,
    site_to_site_variation: 'Yes'
  };
  
  // Create mock socket
  const mockSocket = {
    emit: (event, data) => {
      console.log(`[Socket Event] ${event}:`, data);
    },
    on: (event, callback) => {
      console.log(`[Socket Listener] Registered for event: ${event}`);
    }
  };
  
  // Create mock stream
  const mockStream = '>A\nATGACCGAAGGT\n>B\nATGACTGAAGGT\n>C\nATGACCGATGGT\n>D\nATGACCGAAGAT\n';
  
  // Create params object
  const params = {
    msa: mockMsa,
    analysis: mockAnalysis
  };
  
  // Initialize the analysis job
  console.log(`Initializing ${method.name} job...`);
  const analysisJob = new AnalysisModule(mockSocket, mockStream, params);
  
  // Log paths
  console.log(`\nTest initialized with ID: ${testId}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Progress file: ${progressPath}`);
  console.log(`Status file: ${statusPath}`);
  
  // Submit the job and wait for completion
  const submissionResult = await new Promise((resolve) => {
    // Create a timeout to prevent hanging
    const timeout = setTimeout(() => {
      resolve({ status: 'TIMEOUT', message: 'Test timed out after 3 minutes' });
    }, 180000); // 3 minutes
    
    // Check for job completion periodically
    const checkInterval = setInterval(() => {
      try {
        if (fs.existsSync(statusPath)) {
          const status = fs.readFileSync(statusPath, 'utf8').trim();
          if (status === 'Completed' || status === 'Error') {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            
            if (status === 'Completed') {
              resolve({ status: 'COMPLETED', message: `${method.name} job completed successfully` });
            } else {
              resolve({ status: 'ERROR', message: `${method.name} job failed with status: ${status}` });
            }
          }
        }
      } catch (err) {
        console.warn(`Error checking status:`, err.message);
      }
    }, 5000); // Check every 5 seconds
  });
  
  // Capture results
  let resultContent = '';
  if (fs.existsSync(progressPath)) {
    try {
      resultContent = fs.readFileSync(progressPath, 'utf8');
    } catch (err) {
      console.warn(`Could not read progress file:`, err.message);
    }
  }
  
  // Return results
  return {
    ...submissionResult,
    testId,
    progressContent: resultContent
  };
}

// Main function to run tests
async function main() {
  // Process command line arguments
  const args = process.argv.slice(2);
  const methodToTest = args[0]?.toUpperCase();
  
  console.log('SLURM Analysis Test Suite');
  console.log('========================');
  
  // Update shell scripts
  updateShellScripts();
  
  // Run tests for the specified method or all methods
  const results = [];
  
  if (methodToTest && methods.some(m => m.name === methodToTest)) {
    console.log(`\nRunning test for ${methodToTest} only`);
    const result = await runAnalysisTest(methodToTest);
    results.push({ method: methodToTest, ...result });
  } else {
    console.log('\nRunning tests for all analysis methods');
    for (const method of methods) {
      const result = await runAnalysisTest(method.name);
      results.push({ method: method.name, ...result });
    }
  }
  
  // Print summary
  console.log('\n=== Test Results Summary ===');
  results.forEach(result => {
    const status = result.status === 'COMPLETED' ? '✓' : '✗';
    console.log(`${status} ${result.method}: ${result.message}`);
  });
}

// Run the main function
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = {
  updateShellScripts,
  runAnalysisTest,
  methods
};