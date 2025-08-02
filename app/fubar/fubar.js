var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  logger = require("../../lib/logger").logger;

var fubar = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  // object specific attributes
  self.type = "fubar";
  self.qsub_script_name = "fubar.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields with parameter coverage
    self.genetic_code = params.genetic_code || "Universal";
    self.number_of_grid_points = params.number_of_grid_points || params.grid || 20;
    self.concentration_of_dirichlet_prior = params.concentration_of_dirichlet_prior || params.concentration_parameter || 0.5;
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".fubar";
    self.results_fn = self.fn + ".FUBAR.json";
    self.progress_fn = self.fn + ".fubar.progress";
    self.tree_fn = self.fn + ".tre";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    
    // parameter attributes - support both old and new formats
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
    self.results_short_fn = self.fn + ".fubar";
    self.results_fn = self.fn + ".FUBAR.json";
    self.progress_fn = self.fn + ".fubar.progress";
    self.tree_fn = self.fn + ".tre";
  }

  // Advanced options with full parameter coverage (supporting multiple naming conventions)
  self.number_of_grid_points = analysisParams?.number_of_grid_points || params.number_of_grid_points || params.grid || 20;
  self.concentration_of_dirichlet_prior = analysisParams?.concentration_of_dirichlet_prior || params.concentration_of_dirichlet_prior || params.concentration_parameter || 0.5;
  
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
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "number_of_grid_points=" + self.number_of_grid_points,
      "concentration_of_dirichlet_prior=" + self.concentration_of_dirichlet_prior,
      "procs=" + (config.fubar_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.fubar_walltime) {
      const parts = config.fubar_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.fubar_walltime;
      }
    }
    
    self.qsub_params = [
      `--ntasks=${config.fubar_procs}`,
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
      ",number_of_grid_points=" +
      self.number_of_grid_points +
      ",concentration_of_dirichlet_prior=" +
      self.concentration_of_dirichlet_prior +
      ",procs=" +
      config.fubar_procs,
      `--output=${self.output_dir}/fubar_${self.id}_%j.out`,
      `--error=${self.output_dir}/fubar_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + 
      config.fubar_walltime + 
      ",nodes=1:ppn=" + 
      config.fubar_procs,
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
        ",number_of_grid_points=" +
        self.number_of_grid_points +
        ",concentration_of_dirichlet_prior=" +
        self.concentration_of_dirichlet_prior +
        ",procs=" +
        config.fubar_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Determine the tree to use - support both unified format and legacy format
    self.selectedTree = self.nj;

    // For legacy format, check for usertree in msa
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
      }
    }
    
    // For unified format, tree is already in self.nj (from params.tree)
    // No additional override needed as self.nj is correctly set above

    // Ensure output directory exists BEFORE writing files
    const utilities = require("../../lib/utilities");
    utilities.ensureDirectoryExists(self.output_dir);

    // Clean tree data to ensure it's in Newick format
    const cleanTree = utilities.cleanTreeToNewick(self.selectedTree);
    
    logger.info(`FUBAR job ${self.id}: Tree processing details`, {
      tree_source: self.params.tree ? "unified_format" : "legacy_format",
      has_params_tree: !!self.params.tree,
      has_msa: !!self.params.msa,
      original_length: self.selectedTree ? self.selectedTree.length : 0,
      cleaned_length: cleanTree ? cleanTree.length : 0,
      is_nexus: self.selectedTree ? self.selectedTree.trim().startsWith('#NEXUS') : false,
      tree_preview: cleanTree ? (cleanTree.length > 100 ? cleanTree.substring(0, 100) + "..." : cleanTree) : "null"
    });

    // Write tree to a file
    fs.writeFile(self.tree_fn, cleanTree, function(err) {
      if (err) {
        logger.error(`FUBAR job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`FUBAR job ${self.id}: Tree file written successfully`);
    });

    // Ensure the progress file exists
    fs.openSync(self.progress_fn, "w");
  }
  
  self.init();
};

util.inherits(fubar, hyphyJob);
exports.fubar = fubar;
