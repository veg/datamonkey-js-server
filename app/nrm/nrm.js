var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var nrm = function(socket, stream, params) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "nrm";
  self.qsub_script_name = "nrm.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.nwk_tree = self.params.msa[0].usertree || self.params.msa[0].nj;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".nrm";
  self.results_fn = self.fn + ".NRM.json";
  self.progress_fn = self.fn + ".nrm.progress";
  self.tree_fn = self.fn + ".tre";

  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS)
    let slurmTime = "72:00:00";
    if (config.nrm_walltime) {
      const parts = config.nrm_walltime.split(':');
      if (parts.length === 4) {
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = hours + ":" + parts[2] + ":" + parts[3];
      } else if (parts.length === 3) {
        slurmTime = config.nrm_walltime;
      }
    }

    logger.info("NRM job " + self.id + ": Converted walltime to SLURM format: " + slurmTime);

    self.qsub_params = [
      "--ntasks=" + config.nrm_procs,
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
      ",rfn=" + self.results_fn +
      ",cwd=" + __dirname +
      ",msaid=" + self.msaid +
      ",procs=" + config.nrm_procs,
      "--output=" + self.output_dir + "/nrm_" + self.id + "_%j.out",
      "--error=" + self.output_dir + "/nrm_" + self.id + "_%j.err",
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + 
      config.nrm_walltime + 
      ",nodes=1:ppn=" + 
      config.nrm_procs,
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
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.nrm_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  logger.info("NRM job " + self.id + ": Using " + config.submit_type + " parameters");

  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nwk_tree, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  
  logger.info("NRM job " + self.id + ": Initializing job");
  self.init();

};

util.inherits(nrm, hyphyJob);
exports.nrm = nrm;
