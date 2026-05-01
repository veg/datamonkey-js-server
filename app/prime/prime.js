var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var prime = function (socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;

  logger.info("PRIME constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // object specific attributes
  self.type = "prime";

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    self.property_set = params.property_set || params["property-set"] || "5PROP";
    self.pvalue = params.pvalue || 0.1;
    self.impute_states = params.impute_states || params["impute-states"] || "No";
    self.branches = params.branches || "All";
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.genetic_code = params.genetic_code || "Universal";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".prime";
    self.results_fn = self.fn + ".PRIME.json";
    self.progress_fn = self.fn + ".prime.progress";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    self.property_set = analysisParams.property_set || analysisParams["property-set"] || "5PROP";
    self.pvalue = analysisParams.pvalue || 0.1;
    self.impute_states = analysisParams.impute_states || analysisParams["impute-states"] || "No";
    self.branches = analysisParams.branches || "All";

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
    self.results_short_fn = self.fn + ".prime";
    self.results_fn = self.fn + ".PRIME.json";
    self.progress_fn = self.fn + ".prime.progress";
    self.tree_fn = self.fn + ".tre";
  }

  // Set treemode with default value
  self.treemode = self.params.treemode || "0";

  self.qsub_script_name = "prime.sh";
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
      "genetic_code=" + self.genetic_code,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.prime_procs || 4),
      "branches=" + self.branches,
      "property_set=" + self.property_set,
      "pvalue=" + self.pvalue,
      "impute_states=" + self.impute_states
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.prime_walltime) {
      const parts = config.prime_walltime.split(':');
      if (parts.length === 4) {
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        slurmTime = config.prime_walltime;
      }
    }

    logger.info(`Converted walltime from ${config.prime_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.prime_walltime} to SLURM format: ${slurmTime}`);

    self.qsub_params = [
      `--ntasks=${config.prime_procs || 4}`,
      "--cpus-per-task=1",
      `--time=${slurmTime}`,
      `--partition=${config.slurm_partition || "datamonkey"}`,
      "--nodes=1",
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
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      (config.prime_procs || 4) +
      ",branches=" +
      self.branches +
      ",property_set=" +
      self.property_set +
      ",pvalue=" +
      self.pvalue +
      ",impute_states=" +
      self.impute_states,
      `--output=${self.output_dir}/prime_${self.id}_%j.out`,
      `--error=${self.output_dir}/prime_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + (config.prime_walltime || "72:00:00:00") + ",nodes=1:ppn=" + (config.prime_procs || 4),
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
        ",genetic_code=" +
        self.genetic_code +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        (config.prime_procs || 4) +
        ",branches=" +
        self.branches +
        ",property_set=" +
        self.property_set +
        ",pvalue=" +
        self.pvalue +
        ",impute_states=" +
        self.impute_states,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Log the parameters being used
  logger.info(`PRIME job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

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
        self.selectedTree = msa.usertree;
      } else {
        logger.warn(`PRIME job ${self.id}: Neither usertree nor neighbor-joining tree is available.`);
      }
      logger.info(`PRIME job ${self.id}: Selected tree`, {
        tree_content: self.selectedTree ? (self.selectedTree.length > 100 ? self.selectedTree.substring(0, 100) + "..." : self.selectedTree) : "null"
      });
    } else {
      logger.warn(`PRIME job ${self.id}: self.params.analysis.msa structure is missing.`);
    }

    // Ensure output directory exists BEFORE writing files
    logger.info(`PRIME job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file
    logger.info(`PRIME job ${self.id}: Writing tree file to ${self.tree_fn}`, {
      tree_content: self.selectedTree ? (self.selectedTree.length > 100 ? self.selectedTree.substring(0, 100) + "..." : self.selectedTree) : "null"
    });
    fs.writeFile(self.tree_fn, self.selectedTree, function (err) {
      if (err) {
        logger.error(`PRIME job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`PRIME job ${self.id}: Tree file written successfully`);
    });

    // Ensure the progress file exists
    logger.info(`PRIME job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }

  logger.info(`PRIME job ${self.id}: Initializing job`);
  self.init();
  logger.info(`PRIME job ${self.id}: Job initialized`);
};

util.inherits(prime, hyphyJob);
exports.prime = prime;
