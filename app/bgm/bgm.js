var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  model = require("../model").model,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

const datatypes = {
  "1": "nucleotide",
  "2": "amino-acid",
  "3": "codon"
}

var bgm = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  logger.info("BGM constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // object specific attributes
  self.type = "bgm";
  self.qsub_script_name = "bgm.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields with complete parameter coverage
    self.genetic_code = params.genetic_code || "Universal";
    self.datatype = params.datatype || params.type || "codon";
    self.substitution_model = params.substitution_model || params.baseline_model || null;
    self.length_of_each_chain = params.length_of_each_chain || params.steps || 1000000;
    self.number_of_burn_in_samples = params.number_of_burn_in_samples || params.burn_in || 100000;
    self.number_of_samples = params.number_of_samples || params.samples || params['chain-sample'] || 100;
    self.maximum_parents_per_node = parseInt(params.maximum_parents_per_node || params.max_parents || 1);
    self.minimum_subs_per_site = parseInt(params.minimum_subs_per_site || params.min_subs || 1);
    self.branches = params.branches || "All";
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.nwk_tree = params.nwk_tree || params.tree || "";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".bgm";
    self.results_fn = self.fn + ".BGM.json";
    self.progress_fn = self.fn + ".bgm.progress";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    
    // parameter attributes with fallbacks
    if (self.params.msa) {
      self.msaid = self.params.msa._id;
      self.genetic_code = self.params.msa[0] ? code[self.params.msa[0].gencodeid + 1] : "Universal";
      self.nwk_tree = self.params.msa[0] ? self.params.msa[0].nj : "";
      self.datatype = self.params.msa[0] ? datatypes[self.params.msa[0].datatype] : "codon";
    } else {
      self.msaid = self.params.msaid || "unknown";
      self.genetic_code = self.params.genetic_code || "Universal";
      self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      self.datatype = self.params.datatype || self.params.type || "codon";
    }
    
    if (self.params.analysis) {
      self.id = self.params.analysis._id || self.params.id || "unknown-" + Date.now();
      self.substitution_model = self.params.analysis.substitution_model ? model[self.params.analysis.substitution_model] : (analysisParams.baseline_model || null);
      // Advanced options with complete parameter coverage
      self.length_of_each_chain = analysisParams.length_of_each_chain || analysisParams.steps || 1000000;
      self.number_of_burn_in_samples = analysisParams.number_of_burn_in_samples || analysisParams.burn_in || 100000;
      self.number_of_samples = analysisParams.number_of_samples || analysisParams.samples || analysisParams['chain-sample'] || 100;
      self.maximum_parents_per_node = parseInt(analysisParams.maximum_parents_per_node || analysisParams.max_parents || 1);
      self.minimum_subs_per_site = parseInt(analysisParams.minimum_subs_per_site || analysisParams.min_subs || 1);
      self.branches = analysisParams.branches || "All";
    } else {
      self.id = self.params.id || "unknown-" + Date.now();
      self.substitution_model = self.params.substitution_model ? model[self.params.substitution_model] : (self.params.baseline_model || null);
      // Advanced options with complete parameter coverage
      self.length_of_each_chain = self.params.length_of_each_chain || self.params.steps || 1000000;
      self.number_of_burn_in_samples = self.params.number_of_burn_in_samples || self.params.burn_in || 100000;
      self.number_of_samples = self.params.number_of_samples || self.params.samples || self.params['chain-sample'] || 100;
      self.maximum_parents_per_node = parseInt(self.params.maximum_parents_per_node || self.params.max_parents || 1);
      self.minimum_subs_per_site = parseInt(self.params.minimum_subs_per_site || self.params.min_subs || 1);
      self.branches = self.params.branches || "All";
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".bgm";
    self.results_fn = self.fn + ".BGM.json";
    self.progress_fn = self.fn + ".bgm.progress";
    self.tree_fn = self.fn + ".tre";
  }

  
  // Set treemode with default value
  self.treemode = self.params.treemode || "0";

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
      "datatype=" + self.datatype,
      "substitution_model=" + (self.substitution_model || ""),
      "branches=" + self.branches,
      "length_of_each_chain=" + self.length_of_each_chain,
      "number_of_burn_in_samples=" + self.number_of_burn_in_samples,
      "number_of_samples=" + self.number_of_samples,
      "maximum_parents_per_node=" + self.maximum_parents_per_node,
      "minimum_subs_per_site=" + self.minimum_subs_per_site,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.bgm_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.bgm_walltime) {
      const parts = config.bgm_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.bgm_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.bgm_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.bgm_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.bgm_procs}`,                       // Use multiple tasks for MPI
      "--cpus-per-task=1",                                  // One CPU per task for MPI
      `--time=${slurmTime}`,                                // Converted time limit
      `--partition=${config.slurm_partition || "datamonkey"}`,    // Use configured partition
      "--nodes=1",                                          // Run on a single node
      "--export=ALL,slurm_mpi_type=" + 
      (config.slurm_mpi_type || "pmix") + 
      "," +
      "fn=" + self.fn + ",tree_fn=" + self.tree_fn + ",sfn=" + self.status_fn + ",pfn=" + self.progress_fn + ",rfn=" + self.results_short_fn + ",treemode=" + self.treemode + ",genetic_code=" + self.genetic_code + ",datatype=" + self.datatype + ",substitution_model=" + (self.substitution_model || "") + ",branches=" + self.branches + ",length_of_each_chain=" + self.length_of_each_chain + ",number_of_burn_in_samples=" + self.number_of_burn_in_samples + ",number_of_samples=" + self.number_of_samples + ",maximum_parents_per_node=" + self.maximum_parents_per_node + ",minimum_subs_per_site=" + self.minimum_subs_per_site + ",analysis_type=" + self.type + ",cwd=" + __dirname + ",msaid=" + self.msaid + ",procs=" + config.bgm_procs,
      `--output=${self.output_dir}/bgm_${self.id}_%j.out`,
      `--error=${self.output_dir}/bgm_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.bgm_walltime + ",nodes=1:ppn=" + config.bgm_procs,
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
        ",datatype=" +
        self.datatype +
        ",substitution_model=" +
        (self.substitution_model || "") +
        ",branches=" +
        self.branches +
        ",length_of_each_chain=" +
        self.length_of_each_chain +
        ",number_of_burn_in_samples=" +
        self.number_of_burn_in_samples +
        ",number_of_samples=" +
        self.number_of_samples +
        ",maximum_parents_per_node=" +
        self.maximum_parents_per_node +
        ",minimum_subs_per_site=" +
        self.minimum_subs_per_site +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.bgm_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  
  // Log the parameters being used
  logger.info(`BGM job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Ensure output directory exists BEFORE writing files
    logger.info(`BGM job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file
    const cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info(`BGM job ${self.id}: Writing cleaned tree file to ${self.tree_fn}`, {
      original_length: self.nwk_tree ? self.nwk_tree.length : 0,
      cleaned_length: cleanTree ? cleanTree.length : 0,
      tree_preview: cleanTree ? (cleanTree.length > 100 ? cleanTree.substring(0, 100) + "..." : cleanTree) : "null"
    });
    try {
      fs.writeFileSync(self.tree_fn, cleanTree);
      logger.info(`BGM job ${self.id}: Tree file written successfully`);
    } catch (err) {
      logger.error(`BGM job ${self.id}: Error writing tree file: ${err.message}`);
      throw err;
    }

    // Ensure the progress file exists
    logger.info(`BGM job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }
  
  logger.info(`BGM job ${self.id}: Initializing job`);
  self.init();
  logger.info(`BGM job ${self.id}: Job initialized`);

};

util.inherits(bgm, hyphyJob);
exports.bgm = bgm;
