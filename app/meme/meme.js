var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var meme = function (socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  logger.info("MEME constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // object specific attributes
  self.type = "meme";

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields
    self.multiple_hits = params.multiple_hits || "None";
    self.site_multihit = params.site_multihit || "Estimate";
    self.rates = params.rates || 2;
    self.impute_states = params.impute_states || "No";
    self.bootstrap = params.bootstrap || false;
    self.resample = params.resample || 0;  // Changed to match docs default
    self.p_value = params.p_value || 0.1;
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.genetic_code = params.genetic_code || "Universal";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".meme";
    self.results_fn = self.fn + ".MEME.json";
    self.progress_fn = self.fn + ".meme.progress";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    self.multiple_hits = analysisParams.multiple_hits || "None";
    self.site_multihit = analysisParams.site_multihit || "Estimate";
    self.rates = analysisParams.rates || 2;
    self.impute_states = analysisParams.impute_states || "No";
    self.p_value = analysisParams.p_value || 0.1;  // P-value threshold
    
    // bootstrap attributes
    self.bootstrap = analysisParams.bootstrap || false;
    self.resample = analysisParams.resample || 0;  // Changed to match docs default
    
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
      self.id = self.params.analysis._id || (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
    } else {
      self.id = (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".meme";
    self.results_fn = self.fn + ".MEME.json";
    self.progress_fn = self.fn + ".meme.progress";
    self.tree_fn = self.fn + ".tre";
  }
  
  // Set treemode with default value
  self.treemode = self.params.treemode || "0";
  
  self.qsub_script_name = "meme.sh";
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
      "bootstrap=" + self.bootstrap,
      "resample=" + self.resample,
      "multiple_hits=" + self.multiple_hits,
      "site_multihit=" + self.site_multihit,
      "rates=" + self.rates,
      "impute_states=" + self.impute_states,
      "pvalue=" + self.p_value,
      "genetic_code=" + self.genetic_code,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.meme_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.meme_walltime) {
      const parts = config.meme_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.meme_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.meme_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.meme_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.meme_procs}`,                      // Use multiple tasks for MPI
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
      ",bootstrap=" +
      self.bootstrap +
      ",resample=" +
      self.resample +
      ",multiple_hits=" +
      self.multiple_hits +
      ",site_multihit=" +
      self.site_multihit +
      ",rates=" +
      self.rates +
      ",impute_states=" +
      self.impute_states +
      ",pvalue=" +
      self.p_value +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.meme_procs,
      `--output=${self.output_dir}/meme_${self.id}_%j.out`,
      `--error=${self.output_dir}/meme_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.meme_walltime + ",nodes=1:ppn=" + config.meme_procs,
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
        ",bootstrap=" +
        self.bootstrap +
        ",resample=" +
        self.resample +
        ",multiple_hits=" +
        self.multiple_hits +
        ",site_multihit=" +
        self.site_multihit +
        ",rates=" +
        self.rates +
        ",impute_states=" +
        self.impute_states +
        ",pvalue=" +
        self.p_value +
        ",genetic_code=" +
        self.genetic_code +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.meme_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  
  // Log the parameters being used
  logger.info(`MEME job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Determine the tree to use
    self.selectedTree = self.nj;

    if (
      self.params &&
      self.params.analysis &&
      self.params.analysis.msa &&
      typeof self.params.analysis.msa === "object"
    ) {
      const msa = self.params.analysis.msa[0];

      if (msa.usertree && msa.usertree.trim()) {
        // Use the usertree if it is populated
        self.selectedTree = msa.usertree;
      } else {
        // Handle the case where neither usertree nor nj is available
        logger.warn(`MEME job ${self.id}: Neither usertree nor neighbor-joining tree is available.`);
      }
      logger.info(`MEME job ${self.id}: Selected tree`, {
        tree_content: self.selectedTree ? (self.selectedTree.length > 100 ? self.selectedTree.substring(0, 100) + "..." : self.selectedTree) : "null"
      });
    } else {
      logger.warn(`MEME job ${self.id}: self.params.analysis.msa structure is missing.`);
    }

    // Ensure output directory exists BEFORE writing files
    logger.info(`MEME job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file
    logger.info(`MEME job ${self.id}: Writing tree file to ${self.tree_fn}`, {
      tree_content: self.selectedTree ? (self.selectedTree.length > 100 ? self.selectedTree.substring(0, 100) + "..." : self.selectedTree) : "null"
    });
    fs.writeFile(self.tree_fn, self.selectedTree, function (err) {
      if (err) {
        logger.error(`MEME job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`MEME job ${self.id}: Tree file written successfully`);
    });

    // Ensure the progress file exists
    logger.info(`MEME job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }
  
  logger.info(`MEME job ${self.id}: Initializing job`);
  self.init();
  logger.info(`MEME job ${self.id}: Job initialized`);
};

util.inherits(meme, hyphyJob);
exports.meme = meme;