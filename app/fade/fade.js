var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  model = require("../model").model,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

estimationMethod = {
  "1" : "Metropolis-Hastings",
  "2" : "Collapsed-Gibbs", 
  "3" : "Variational-Bayes"
}

var fade = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "fade";
  self.qsub_script_name = "fade.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.nj = self.params.msa[0].nj;

  // FADE specific attributes
  self.substitution_model = model[self.params.analysis.substitution_model];
  self.posterior_estimation_method = estimationMethod[self.params.analysis.posterior_estimation_method];

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".fade";
  self.results_fn = self.fn + ".FADE.json";
  self.progress_fn = self.fn + ".fade.progress";
  self.tree_fn = self.fn + ".tre";

  // advanced options
  self.number_of_grid_points = self.params.analysis.number_of_grid_points;
  self.number_of_mcmc_chains = self.params.analysis.number_of_mcmc_chains;
  self.length_of_each_chain = self.params.analysis.length_of_each_chain;
  self.number_of_burn_in_samples =
    self.params.analysis.number_of_burn_in_samples;
  self.number_of_samples = self.params.analysis.number_of_samples;
  self.concentration_of_dirichlet_prior =
    self.params.analysis.concentration_of_dirichlet_prior;

  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.fade_walltime) {
      const parts = config.fade_walltime.split(':');
      if (parts.length === 4) {
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = hours + ":" + parts[2] + ":" + parts[3];
      } else if (parts.length === 3) {
        slurmTime = config.fade_walltime;
      }
    }

    logger.info("FADE job " + self.id + ": Converted walltime to SLURM format: " + slurmTime);

    self.qsub_params = [
      "--ntasks=" + config.fade_procs,
      "--cpus-per-task=1",
      "--time=" + slurmTime,
      "--partition=" + (config.slurm_partition || "datamonkey"),
      "--export=ALL,slurm_mpi_type=" +
      (config.slurm_mpi_type || "pmix") +
      "," +
      "fn=" + self.fn +
      ",tree_fn=" + self.tree_fn +
      ",sfn=" + self.status_fn +
      ",pfn=" + self.progress_fn +
      ",rfn=" + self.results_short_fn +
      ",substitution_model=" + self.substitution_model +
      ",posterior_estimation_method=" + self.posterior_estimation_method +
      ",analysis_type=" + self.type +
      ",cwd=" + __dirname +
      ",msaid=" + self.msaid +
      ",number_of_grid_points=" + self.number_of_grid_points +
      ",number_of_mcmc_chains=" + self.number_of_mcmc_chains +
      ",length_of_each_chain=" + self.length_of_each_chain +
      ",number_of_burn_in_samples=" + self.number_of_burn_in_samples +
      ",number_of_samples=" + self.number_of_samples +
      ",concentration_of_dirichlet_prior=" + self.concentration_of_dirichlet_prior,
      "--output=" + self.output_dir + "/fade_" + self.id + "_%j.out",
      "--error=" + self.output_dir + "/fade_" + self.id + "_%j.err",
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.fade_walltime + ",nodes=1:ppn=" + config.fade_procs,
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
        ",substitution_model=" +
        self.substitution_model +
        ",posterior_estimation_method=" +
        self.posterior_estimation_method +
        ",treemode=" +
        self.treemode +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",number_of_grid_points=" +
        self.number_of_grid_points +
        ",number_of_mcmc_chains=" +
        self.number_of_mcmc_chains +
        ",length_of_each_chain=" +
        self.length_of_each_chain +
        ",number_of_burn_in_samples=" +
        self.number_of_burn_in_samples +
        ",number_of_samples=" +
        self.number_of_samples +
        ",concentration_of_dirichlet_prior=" +
        self.concentration_of_dirichlet_prior,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  logger.info("FADE job " + self.id + ": Using " + config.submit_type + " parameters");

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nj, function(err) {
    if (err) throw err;
  });

  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");

  logger.info("FADE job " + self.id + ": Initializing job");
  self.init();
};

util.inherits(fade, hyphyJob);
exports.fade = fade;
