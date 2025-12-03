var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;


const synSubstitutionVar = {
  "1" : "Yes",
  "2" : "No",
  "3" : "Branch-site"
}

const multihitVar = {
  "Default" : "None",
  "Double" : "Double",
  "Double+Triple" : "Double+Triple"
}


var busted = function(socket, stream, params) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  logger.info("BUSTED constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // Helper function to convert boolean to Yes/No
  function boolToYesNo(value) {
    if (value === true || value === "true") return "Yes";
    if (value === false || value === "false") return "No";
    return value; // Return as-is if already a string
  }

  // object specific attributes
  self.type = "busted";
  self.qsub_script_name = "busted_submit.sh";
  self.qsub_script = path.join(__dirname, self.qsub_script_name);

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields with complete parameter coverage
    self.ds_variation = synSubstitutionVar[params.ds_variation] || params.srv || "Yes";
    self.error_protection = boolToYesNo(params.error_protection || params.error_sink || false);
    self.multihit = multihitVar[params.multihit] || params.multiple_hits || "None";
    self.branches = params.branches || "All";
    self.rates = params.rates || 3;
    self.syn_rates = params.syn_rates || params.syn_rates || 3;
    self.grid_size = params.grid_size || 250;
    self.starting_points = params.starting_points || 1;
    self.save_fit = params.save_fit || "/dev/null";
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.genetic_code = params.genetic_code || "Universal";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.progress_fn = self.fn + ".BUSTED.progress";
    self.results_fn = self.fn + ".BUSTED.json";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    
    // parameter attributes with fallbacks
    if (self.params.msa) {
      self.msaid = self.params.msa._id;
      self.genetic_code = self.params.msa[0] ? code[self.params.msa[0].gencodeid + 1] : "Universal";
    } else {
      self.msaid = self.params.msaid || "unknown";
      self.genetic_code = self.params.genetic_code || "Universal";
    }
    
    if (self.params.analysis) {
      self.id = self.params.analysis._id || (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
      self.ds_variation = synSubstitutionVar[self.params.analysis.ds_variation] || analysisParams.srv || "Yes";
      self.error_protection = boolToYesNo(self.params.analysis.error_protection || analysisParams.error_sink || false);
      self.multihit = multihitVar[self.params.analysis.multihit] || analysisParams.multiple_hits || "None";
      self.branches = self.params.analysis.branches || "All";
      self.rates = self.params.analysis.rates || 3;
      self.syn_rates = self.params.analysis.syn_rates || 3;
      self.grid_size = self.params.analysis.grid_size || 250;
      self.starting_points = self.params.analysis.starting_points || 1;
      self.save_fit = self.params.analysis.save_fit || "/dev/null";
      self.nwk_tree = self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
    } else {
      self.id = (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
      self.ds_variation = synSubstitutionVar[self.params.ds_variation] || self.params.srv || "Yes";
      self.error_protection = boolToYesNo(self.params.error_protection || self.params.error_sink || false);
      self.multihit = multihitVar[self.params.multihit] || self.params.multiple_hits || "None";
      self.branches = self.params.branches || "All";
      self.rates = self.params.rates || 3;
      self.syn_rates = self.params.syn_rates || 3;
      self.grid_size = self.params.grid_size || 250;
      self.starting_points = self.params.starting_points || 1;
      self.save_fit = self.params.save_fit || "/dev/null";
      self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.progress_fn = self.fn + ".BUSTED.progress";
    self.results_fn = self.fn + ".BUSTED.json";
    self.tree_fn = self.fn + ".tre";
  }
  
  // Set treemode with default value
  self.treemode = self.params.treemode || "0";


  //1|datamonk | info: busted : 5ce5b46ce0493944e73da3ef : job created : {"torque_id":""}
  //1|datamonk | info: emitting {"torque_id":""}
  //1|datamonk | info: emitting {"torque_id":""}

  
  // Define parameters for job submission (different formats for qsub vs slurm vs local)
  if (config.submit_type === "local") {
    // For local execution, the script path must be first
    self.qsub_params = [
      self.qsub_script,
      "fn=" + self.fn,
      "tree_fn=" + self.tree_fn,
      "sfn=" + self.status_fn,
      "pfn=" + self.progress_fn,
      "rfn=" + self.results_fn,
      "treemode=" + self.treemode,
      "genetic_code=" + self.genetic_code,
      "synRateVariation=" + self.ds_variation,
      "errorProtection=" + self.error_protection,
      "multihit=" + self.multihit,
      "branches=" + self.branches,
      "rates=" + self.rates,
      "syn_rates=" + self.syn_rates,
      "grid_size=" + self.grid_size,
      "starting_points=" + self.starting_points,
      "save_fit=" + self.save_fit,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.busted_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.busted_walltime) {
      const parts = config.busted_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.busted_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.busted_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.busted_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.busted_procs}`,                       // Use multiple tasks for MPI
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
      self.results_fn +
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",synRateVariation=" +
      self.ds_variation +
      ",errorProtection=" +
      self.error_protection +
      ",multihit=" +
      self.multihit +
      ",branches=" +
      self.branches +
      ",rates=" +
      self.rates +
      ",syn_rates=" +
      self.syn_rates +
      ",grid_size=" +
      self.grid_size +
      ",starting_points=" +
      self.starting_points +
      ",save_fit=" +
      self.save_fit +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.busted_procs,
      `--output=${self.output_dir}/busted_${self.id}_%j.out`,
      `--error=${self.output_dir}/busted_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.busted_walltime + ",nodes=1:ppn=" + config.busted_procs,
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
        self.results_fn +
        ",treemode=" +
        self.treemode +
        ",genetic_code=" +
        self.genetic_code +
        ",synRateVariation=" +
        self.ds_variation +
        ",errorProtection=" +
        self.error_protection +
        ",multihit=" +
        self.multihit +
        ",branches=" +
        self.branches +
        ",rates=" +
        self.rates +
        ",syn_rates=" +
        self.syn_rates +
        ",grid_size=" +
        self.grid_size +
        ",starting_points=" +
        self.starting_points +
        ",save_fit=" +
        self.save_fit +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.busted_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }
  
  // Log the parameters being used
  logger.info(`BUSTED job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Ensure output directory exists BEFORE writing files
    logger.info(`BUSTED job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file
    logger.info(`BUSTED job ${self.id}: Writing tree file to ${self.tree_fn}`, {
      tree_content: self.nwk_tree ? (self.nwk_tree.length > 100 ? self.nwk_tree.substring(0, 100) + "..." : self.nwk_tree) : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
      if (err) {
        logger.error(`BUSTED job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`BUSTED job ${self.id}: Tree file written successfully`);
    });

    // Ensure the progress file exists
    logger.info(`BUSTED job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }
  
  logger.info(`BUSTED job ${self.id}: Initializing job`);
  self.init();
  logger.info(`BUSTED job ${self.id}: Job initialized`);
};

util.inherits(busted, hyphyJob);

exports.busted = busted;