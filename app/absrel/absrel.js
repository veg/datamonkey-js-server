var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var absrel = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "absrel";
  self.qsub_script_name = "absrel.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nwk = self.params.analysis.tagged_nwk_tree;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".absrel";
  self.results_fn = self.fn + ".ABSREL.json";
  self.progress_fn = self.fn + ".absrel.progress";
  self.tree_fn = self.fn + ".tre";

  
  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.absrel_walltime) {
      const parts = config.absrel_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.absrel_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.absrel_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.absrel_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.absrel_procs}`,                       // Use multiple tasks for MPI
      "--cpus-per-task=1",                                  // One CPU per task for MPI
      `--time=${slurmTime}`,                                // Converted time limit
      `--partition=${config.slurm_partition || "datamonkey"}`,    // Use configured partition
      "--nodes=1",                                          // Run on a single node
      "--export=ALL,slurm_mpi_type=" + 
      (config.slurm_mpi_type || "pmix") + 
      "," +
      "fn=" + self.fn + ",tree_fn=" + self.tree_fn + ",sfn=" + self.status_fn + ",pfn=" + self.progress_fn + ",rfn=" + self.results_short_fn + ",treemode=" + self.treemode + ",genetic_code=" + self.genetic_code + ",analysis_type=" + self.type + ",cwd=" + __dirname + ",msaid=" + self.msaid + ",procs=" + config.absrel_procs,
      `--output=${self.output_dir}/absrel_${self.id}_%j.out`,
      `--error=${self.output_dir}/absrel_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.absrel_walltime + ",nodes=1:ppn=" + config.absrel_procs,
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
        ",procs=" +
        config.absrel_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nwk, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(absrel, hyphyJob);

exports.absrel = absrel;
