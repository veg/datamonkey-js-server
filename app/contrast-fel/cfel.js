var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var cfel = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  logger.info("Contrast-FEL constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // For Contrast-FEL, branch sets are tag names from the tree, not branch types
  // Just pass them through as-is
  function mapBranchSet(branchSet) {
    return branchSet;
  }

  // object specific attributes
  self.type = "cfel";
  self.qsub_script_name = "cfel.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields with complete parameter coverage
    self.genetic_code = params.genetic_code || "Universal";
    const rawBranchSets = params.branch_sets || "Foreground";
    self.branch_sets = Array.isArray(rawBranchSets) ? rawBranchSets.join(":") : rawBranchSets;
    self.rate_variation = params.srv || (params.ds_variation == 1 ? "Yes" : "No") || "Yes";
    self.permutations = params.permutations || "Yes";
    self.p_value = params.p_value || params.pvalue || 0.05;
    self.q_value = params.q_value || params.qvalue || 0.20;
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.nwk_tree = params.nwk_tree || params.tree || "";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".cfel";
    self.results_fn = self.fn + ".FEL.json";
    self.progress_fn = self.fn + ".cfel.progress";
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
      self.id = self.params.analysis._id || self.params.id || "unknown-" + Date.now();
      self.nwk_tree = self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
      const rawBranchSets = self.params.analysis.branch_sets || analysisParams.branch_sets || "Foreground";
      self.branch_sets = Array.isArray(rawBranchSets) ? rawBranchSets.join(":") : rawBranchSets;
      self.rate_variation = analysisParams.srv || (self.params.analysis.ds_variation == 1 ? "Yes" : "No") || "Yes";
      self.permutations = analysisParams.permutations || "Yes";
      self.p_value = analysisParams.p_value || analysisParams.pvalue || 0.05;
      self.q_value = analysisParams.q_value || analysisParams.qvalue || 0.20;
    } else {
      self.id = self.params.id || "unknown-" + Date.now();
      self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
      const rawBranchSets = self.params.branch_sets || "Foreground";
      self.branch_sets = Array.isArray(rawBranchSets) ? rawBranchSets.join(":") : rawBranchSets;
      self.rate_variation = self.params.srv || (self.params.ds_variation == 1 ? "Yes" : "No") || "Yes";
      self.permutations = self.params.permutations || "Yes";
      self.p_value = self.params.p_value || self.params.pvalue || 0.05;
      self.q_value = self.params.q_value || self.params.qvalue || 0.20;
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".cfel";
    self.results_fn = self.fn + ".FEL.json";
    self.progress_fn = self.fn + ".cfel.progress";
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
      "branch_sets=" + self.branch_sets,
      "rate_variation=" + self.rate_variation,
      "permutations=" + self.permutations,
      "p_value=" + self.p_value,
      "q_value=" + self.q_value,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.cfel_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.cfel_walltime) {
      const parts = config.cfel_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.cfel_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.cfel_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.cfel_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.cfel_procs}`,                       // Use multiple tasks for MPI
      "--cpus-per-task=1",                                  // One CPU per task for MPI
      `--time=${slurmTime}`,                                // Converted time limit
      `--partition=${config.slurm_partition || "datamonkey"}`,    // Use configured partition
      "--nodes=1",                                          // Run on a single node
      "--export=ALL,slurm_mpi_type=" + 
      (config.slurm_mpi_type || "pmix") + 
      "," +
      "fn=" + self.fn + ",tree_fn=" + self.tree_fn + ",sfn=" + self.status_fn + ",pfn=" + self.progress_fn + ",rfn=" + self.results_short_fn + ",treemode=" + self.treemode + ",genetic_code=" + self.genetic_code + ",branch_sets=" + self.branch_sets + ",rate_variation=" + self.rate_variation + ",permutations=" + self.permutations + ",p_value=" + self.p_value + ",q_value=" + self.q_value + ",analysis_type=" + self.type + ",cwd=" + __dirname + ",msaid=" + self.msaid + ",procs=" + config.cfel_procs,
      `--output=${self.output_dir}/cfel_${self.id}_%j.out`,
      `--error=${self.output_dir}/cfel_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.cfel_walltime + ",nodes=1:ppn=" + config.cfel_procs,
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
        ",branch_sets=" +
        self.branch_sets +
        ",rate_variation=" +
        self.rate_variation +
        ",permutations=" +
        self.permutations +
        ",p_value=" +
        self.p_value +
        ",q_value=" +
        self.q_value +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.cfel_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  
  // Log the parameters being used
  logger.info(`Contrast-FEL job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Ensure output directory exists BEFORE writing files
    logger.info(`Contrast-FEL job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data and write to file
    const cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info(`Contrast-FEL job ${self.id}: Writing cleaned tree file to ${self.tree_fn}`, {
      original_length: self.nwk_tree ? self.nwk_tree.length : 0,
      cleaned_length: cleanTree ? cleanTree.length : 0,
      tree_preview: cleanTree ? (cleanTree.length > 100 ? cleanTree.substring(0, 100) + "..." : cleanTree) : "null"
    });
    try {
      fs.writeFileSync(self.tree_fn, cleanTree);
      logger.info(`Contrast-FEL job ${self.id}: Tree file written successfully`);
    } catch (err) {
      logger.error(`Contrast-FEL job ${self.id}: Error writing tree file: ${err.message}`);
      throw err;
    }

    // Ensure the progress file exists
    logger.info(`Contrast-FEL job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }
  
  logger.info(`Contrast-FEL job ${self.id}: Initializing job`);
  self.init();
  logger.info(`Contrast-FEL job ${self.id}: Job initialized`);

};

util.inherits(cfel, hyphyJob);
exports.cfel = cfel;
