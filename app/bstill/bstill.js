var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  logger = require("../../lib/logger").logger;

var bstill = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  var isCheckOnly = params.checkOnly || false;

  self.type = "bstill";
  self.qsub_script_name = "bstill.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  if (isCheckOnly) {
    self.genetic_code = params.genetic_code || "Universal";
    self.number_of_grid_points = params.number_of_grid_points || params.grid || 20;
    self.concentration_of_dirichlet_prior = params.concentration_of_dirichlet_prior || params.concentration_parameter || 0.5;
    self.method = params.method || "Variational-Bayes";
    self.ebf = params.ebf || 10;
    self.radius_threshold = params.radius_threshold || 0.5;
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".bstill";
    self.results_fn = self.fn + ".FUBAR-inv.json";
    self.progress_fn = self.fn + ".bstill.progress";
    self.tree_fn = self.fn + ".tre";
  } else {
    var analysisParams = self.params.analysis || self.params;

    if (self.params.msa) {
      self.msaid = self.params.msa._id;
      self.genetic_code = self.params.msa[0] ? code[self.params.msa[0].gencodeid + 1] : "Universal";
    } else {
      self.msaid = self.params.msaid || "unknown";
      self.genetic_code = self.params.genetic_code || "Universal";
    }

    if (self.params.analysis) {
      self.id = self.params.analysis._id || (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
      self.nwk_tree = self.params.analysis.tagged_nwk_tree || self.params.nwk_tree || self.params.tree || "";
    } else {
      self.id = (self.params.job && self.params.job.id) || self.params.id || "unknown-" + Date.now();
      self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
    }

    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_short_fn = self.fn + ".bstill";
    self.results_fn = self.fn + ".FUBAR-inv.json";
    self.progress_fn = self.fn + ".bstill.progress";
    self.tree_fn = self.fn + ".tre";
  }

  // Advanced options
  self.number_of_grid_points = analysisParams?.number_of_grid_points || params.number_of_grid_points || params.grid || 20;
  self.concentration_of_dirichlet_prior = analysisParams?.concentration_of_dirichlet_prior || params.concentration_of_dirichlet_prior || params.concentration_parameter || 0.5;
  self.method = analysisParams?.method || params.method || "Variational-Bayes";
  self.ebf = analysisParams?.ebf || params.ebf || 10;
  self.radius_threshold = analysisParams?.radius_threshold || params.radius_threshold || 0.5;

  self.treemode = self.params.treemode || "0";

  if (config.submit_type === "local") {
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
      "method=" + self.method,
      "ebf=" + self.ebf,
      "radius_threshold=" + self.radius_threshold,
      "procs=" + (config.bstill_procs || config.fubar_procs || 1)
    ];
  } else if (config.submit_type === "slurm") {
    let slurmTime = "72:00:00";
    if (config.bstill_walltime || config.fubar_walltime) {
      const walltime = config.bstill_walltime || config.fubar_walltime;
      const parts = walltime.split(':');
      if (parts.length === 4) {
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        slurmTime = walltime;
      }
    }

    self.qsub_params = [
      `--ntasks=${config.bstill_procs || config.fubar_procs}`,
      "--cpus-per-task=1",
      `--time=${slurmTime}`,
      `--partition=${config.slurm_partition || "datamonkey"}`,
      "--nodes=1",
      "--export=ALL,slurm_mpi_type=" +
      (config.slurm_mpi_type || "pmix") +
      "," +
      "fn=" + self.fn +
      ",tree_fn=" + self.tree_fn +
      ",sfn=" + self.status_fn +
      ",pfn=" + self.progress_fn +
      ",rfn=" + self.results_short_fn +
      ",treemode=" + self.treemode +
      ",genetic_code=" + self.genetic_code +
      ",analysis_type=" + self.type +
      ",cwd=" + __dirname +
      ",msaid=" + self.msaid +
      ",number_of_grid_points=" + self.number_of_grid_points +
      ",concentration_of_dirichlet_prior=" + self.concentration_of_dirichlet_prior +
      ",method=" + self.method +
      ",ebf=" + self.ebf +
      ",radius_threshold=" + self.radius_threshold +
      ",procs=" + (config.bstill_procs || config.fubar_procs),
      `--output=${self.output_dir}/bstill_${self.id}_%j.out`,
      `--error=${self.output_dir}/bstill_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" +
      (config.bstill_walltime || config.fubar_walltime) +
      ",nodes=1:ppn=" +
      (config.bstill_procs || config.fubar_procs),
      "-q",
      config.qsub_queue,
      "-v",
      "fn=" + self.fn +
        ",tree_fn=" + self.tree_fn +
        ",sfn=" + self.status_fn +
        ",pfn=" + self.progress_fn +
        ",rfn=" + self.results_short_fn +
        ",treemode=" + self.treemode +
        ",genetic_code=" + self.genetic_code +
        ",analysis_type=" + self.type +
        ",cwd=" + __dirname +
        ",msaid=" + self.msaid +
        ",number_of_grid_points=" + self.number_of_grid_points +
        ",concentration_of_dirichlet_prior=" + self.concentration_of_dirichlet_prior +
        ",method=" + self.method +
        ",ebf=" + self.ebf +
        ",radius_threshold=" + self.radius_threshold +
        ",procs=" + (config.bstill_procs || config.fubar_procs),
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  if (!isCheckOnly) {
    const utilities = require("../../lib/utilities");
    utilities.ensureDirectoryExists(self.output_dir);

    const cleanTree = utilities.cleanTreeToNewick(self.nwk_tree);
    logger.info(`B-STILL job ${self.id}: Writing cleaned tree file to ${self.tree_fn}`, {
      original_length: self.nwk_tree ? self.nwk_tree.length : 0,
      cleaned_length: cleanTree ? cleanTree.length : 0,
      tree_preview: cleanTree ? (cleanTree.length > 100 ? cleanTree.substring(0, 100) + "..." : cleanTree) : "null"
    });
    try {
      fs.writeFileSync(self.tree_fn, cleanTree);
      logger.info(`B-STILL job ${self.id}: Tree file written successfully`);
    } catch (err) {
      logger.error(`B-STILL job ${self.id}: Error writing tree file: ${err.message}`);
      throw err;
    }

    fs.openSync(self.progress_fn, "w");
  }

  logger.info(`B-STILL job ${self.id}: Initializing job`);
  self.init();
  logger.info(`B-STILL job ${self.id}: Job initialized`);
};

util.inherits(bstill, hyphyJob);
exports.bstill = bstill;
