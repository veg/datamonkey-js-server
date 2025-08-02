var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  util = require("util"),
  code = require("../code").code,
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var relax = function (socket, stream, relax_params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = relax_params;
  
  // Check if this is a check-only operation
  var isCheckOnly = relax_params.checkOnly || false;
  
  logger.info("RELAX constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(relax_params),
    params_full: JSON.stringify(relax_params),
    checkOnly: isCheckOnly
  });

  // object specific attributes
  self.type = "relax";

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields with complete parameter coverage
    self.genetic_code = relax_params.genetic_code || "Universal";
    self.mode = relax_params.mode || "Classic mode";
    self.test_branches = relax_params.test || relax_params.test_branches || "TEST";
    self.reference_branches = relax_params.reference || relax_params.reference_branches || "REFERENCE";
    self.models = relax_params.models || relax_params.analysis_type || "All";
    self.rates = relax_params.rates || relax_params.omega_rate_classes || 3;
    self.kill_zero_lengths = relax_params.kill_zero_lengths || "No";
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.nwk_tree = relax_params.nwk_tree || relax_params.tree || "";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.progress_fn = self.fn + ".RELAX.progress";
    self.results_fn = self.fn + ".RELAX.json";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    
    // parameter attributes
    if (self.params.msa) {
      self.msaid = self.params.msa._id;
      self.genetic_code = self.params.msa[0] ? code[self.params.msa[0].gencodeid + 1] : "Universal";
    } else {
      self.msaid = self.params.msaid || "unknown";
      self.genetic_code = self.params.genetic_code || "Universal";
    }
    
    if (self.params.analysis) {
      self.id = self.params.analysis._id || self.params.id || "unknown-" + Date.now();
      self.mode = analysisParams.mode || "Classic mode";
      self.test_branches = analysisParams.test || analysisParams.test_branches || "TEST";
      self.reference_branches = analysisParams.reference || analysisParams.reference_branches || "REFERENCE";
      self.models = analysisParams.models || analysisParams.analysis_type || "All";
      self.rates = analysisParams.rates || analysisParams.omega_rate_classes || 3;
      self.kill_zero_lengths = analysisParams.kill_zero_lengths || "No";
      self.nwk_tree = self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
    } else {
      self.id = self.params.id || "unknown-" + Date.now();
      self.mode = self.params.mode || "Classic mode";
      self.test_branches = self.params.test || self.params.test_branches || "TEST";
      self.reference_branches = self.params.reference || self.params.reference_branches || "REFERENCE";
      self.models = self.params.models || self.params.analysis_type || "All";
      self.rates = self.params.rates || self.params.omega_rate_classes || 3;
      self.kill_zero_lengths = self.params.kill_zero_lengths || "No";
      self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.progress_fn = self.fn + ".RELAX.progress";
    self.results_fn = self.fn + ".RELAX.json";
    self.tree_fn = self.fn + ".tre";
  }
  
  // Set treemode with default value
  self.treemode = self.params.treemode || "0";
  
  self.qsub_script_name = "relax.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // Define parameters for job submission (different formats for qsub vs slurm vs local)
  if (config.submit_type === "local") {
    // For local execution, the script path must be first
    self.qsub_params = [
      self.qsub_script,
      "fn=" + self.fn,
      "tree_fn=" + self.tree_fn,
      "sfn=" + self.status_fn,
      "pfn=" + self.progress_fn,
      "treemode=" + self.treemode,
      "genetic_code=" + self.genetic_code,
      "mode=" + self.mode,
      "test_branches=" + self.test_branches,
      "reference_branches=" + self.reference_branches,
      "models=" + self.models,
      "rates=" + self.rates,
      "kill_zero_lengths=" + self.kill_zero_lengths,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.relax_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.relax_walltime) {
      const parts = config.relax_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.relax_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.relax_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.relax_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.relax_procs}`,                       // Use multiple tasks for MPI
      "--cpus-per-task=1",                                  // One CPU per task for MPI
      `--time=${slurmTime}`,                                // Converted time limit
      `--partition=${config.slurm_partition || "datamonkey"}`,    // Use configured partition
      "--nodes=1",                                          // Run on a single node
      "--export=ALL,slurm_mpi_type=" + 
      (config.slurm_mpi_type || "pmix") + 
      "," +
      "fn=" +
      self.fn +
      ",tree_fn=" +
      self.tree_fn +
      ",sfn=" +
      self.status_fn +
      ",pfn=" +
      self.progress_fn +
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",mode=" +
      self.mode +
      ",test_branches=" +
      self.test_branches +
      ",reference_branches=" +
      self.reference_branches +
      ",models=" +
      self.models +
      ",rates=" +
      self.rates +
      ",kill_zero_lengths=" +
      self.kill_zero_lengths +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.relax_procs,
      `--output=${self.output_dir}/relax_${self.id}_%j.out`,
      `--error=${self.output_dir}/relax_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + 
      config.relax_walltime + 
      ",nodes=1:ppn=" + 
      config.relax_procs,
      "-q",
      config.qsub_queue,
      "-v",
      "fn=" +
        self.fn +
        ",tree_fn=" +
        self.tree_fn +
        ",sfn=" +
        self.status_fn +
        ",pfn=" +
        self.progress_fn +
        ",treemode=" +
        self.treemode +
        ",genetic_code=" +
        self.genetic_code +
        ",mode=" +
        self.mode +
        ",test_branches=" +
        self.test_branches +
        ",reference_branches=" +
        self.reference_branches +
        ",models=" +
        self.models +
        ",rates=" +
        self.rates +
        ",kill_zero_lengths=" +
        self.kill_zero_lengths +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.relax_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  
  // Log the parameters being used
  logger.info(`RELAX job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Ensure output directory exists BEFORE writing files
    logger.info(`RELAX job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file
    logger.info(`RELAX job ${self.id}: Writing tree file to ${self.tree_fn}`, {
      tree_content: self.nwk_tree ? (self.nwk_tree.length > 100 ? self.nwk_tree.substring(0, 100) + "..." : self.nwk_tree) : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
      if (err) {
        logger.error(`RELAX job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`RELAX job ${self.id}: Tree file written successfully`);
    });

    // Ensure the progress file exists
    logger.info(`RELAX job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
    fs.openSync(self.status_fn, "w");
  }
  
  logger.info(`RELAX job ${self.id}: Initializing job`);
  self.init();
  logger.info(`RELAX job ${self.id}: Job initialized`);
};

util.inherits(relax, hyphyJob);

exports.relax = relax;
