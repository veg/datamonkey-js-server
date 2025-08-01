var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var slac = function (socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  logger.info("SLAC constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // object specific attributes
  self.type = "slac";

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.genetic_code = params.genetic_code || "Universal";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".slac";
    self.results_fn = self.fn + ".SLAC.json";
    self.progress_fn = self.fn + ".slac.progress";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    
    // parameter attributes
    if (self.params.msa) {
      self.msaid = self.params.msa._id;
      self.genetic_code = self.params.msa[0] ? code[self.params.msa[0].gencodeid + 1] : "Universal";
      self.nj = self.params.msa[0] ? self.params.msa[0].nj : "";
    } else {
      self.msaid = self.params.msaid || "unknown";
      self.genetic_code = self.params.genetic_code || "Universal";
      self.nj = self.params.nj || self.params.tree || "";
    }
    
    if (self.params.analysis) {
      self.id = self.params.analysis._id || self.params.id || "unknown-" + Date.now();
    } else {
      self.id = self.params.id || "unknown-" + Date.now();
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".slac";
    self.results_fn = self.fn + ".SLAC.json";
    self.progress_fn = self.fn + ".slac.progress";
    self.tree_fn = self.fn + ".tre";
  }
  
  // Set treemode with default value
  self.treemode = self.params.treemode || "0";
  
  self.qsub_script_name = "slac.sh";
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
      "rfn=" + self.results_short_fn,
      "treemode=" + self.treemode,
      "genetic_code=" + self.genetic_code,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.slac_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.slac_walltime) {
      const parts = config.slac_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.slac_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.slac_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.slac_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.slac_procs}`,                       // Use multiple tasks for MPI
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
      ",rfn=" +
      self.results_short_fn +
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.slac_procs,
      `--output=${self.output_dir}/slac_${self.id}_%j.out`,
      `--error=${self.output_dir}/slac_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.slac_walltime + ",nodes=1:ppn=" + config.slac_procs,
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
        ",rfn=" +
        self.results_short_fn +
        ",treemode=" +
        self.treemode +
        ",genetic_code=" +
        self.genetic_code +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.slac_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  
  // Log the parameters being used
  logger.info(`SLAC job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Write tree to a file
    logger.info(`SLAC job ${self.id}: Writing tree file to ${self.tree_fn}`, {
      tree_content: self.nj ? (self.nj.length > 100 ? self.nj.substring(0, 100) + "..." : self.nj) : "null"
    });
    fs.writeFile(self.tree_fn, self.nj, function (err) {
      if (err) {
        logger.error(`SLAC job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`SLAC job ${self.id}: Tree file written successfully`);
    });

    // Ensure output directory exists
    logger.info(`SLAC job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Ensure the progress file exists
    logger.info(`SLAC job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }
  
  logger.info(`SLAC job ${self.id}: Initializing job`);
  self.init();
  logger.info(`SLAC job ${self.id}: Job initialized`);
};

util.inherits(slac, hyphyJob);
exports.slac = slac;