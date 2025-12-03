var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var fubar = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "fubar";
  self.qsub_script_name = "fubar.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nj = self.params.msa[0].nj;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".fubar";
  self.results_fn = self.fn + ".FUBAR.json";
  self.progress_fn = self.fn + ".fubar.progress";
  self.tree_fn = self.fn + ".tre";

  // advanced options
  self.number_of_grid_points = self.params.analysis.number_of_grid_points;
  self.concentration_of_dirichlet_prior =
    self.params.analysis.concentration_of_dirichlet_prior;

  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.fubar_walltime) {
      const parts = config.fubar_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = hours + ":" + parts[2] + ":" + parts[3];
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.fubar_walltime;
      }
    }

    logger.info("FUBAR job " + self.id + ": Converted walltime from " + config.fubar_walltime + " to SLURM format: " + slurmTime);

    self.qsub_params = [
      "--ntasks=" + config.fubar_procs,
      "--cpus-per-task=1",
      "--time=" + slurmTime,
      "--partition=" + (config.slurm_partition || "datamonkey"),
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
        ",number_of_grid_points=" +
        self.number_of_grid_points +
        ",concentration_of_dirichlet_prior=" +
        self.concentration_of_dirichlet_prior,
      "--output=" + self.output_dir + "/fubar_" + self.id + "_%j.out",
      "--error=" + self.output_dir + "/fubar_" + self.id + "_%j.err",
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
        self.concentration_of_dirichlet_prior,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  logger.info("FUBAR job " + self.id + ": Using " + config.submit_type + " parameters: " + JSON.stringify(self.qsub_params));

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nj, function(err) {
    if (err) throw err;
  });

  // Ensure output directory exists
  logger.info("FUBAR job " + self.id + ": Ensuring output directory exists at " + self.output_dir);
  utilities.ensureDirectoryExists(self.output_dir);

  // Ensure the progress file exists
  logger.info("FUBAR job " + self.id + ": Creating progress file at " + self.progress_fn);
  fs.openSync(self.progress_fn, "w");

  logger.info("FUBAR job " + self.id + ": Initializing job");
  self.init();
  logger.info("FUBAR job " + self.id + ": Job initialized");
};

util.inherits(fubar, hyphyJob);
exports.fubar = fubar;
