var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var fel = function (socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  logger.info("Initializing FEL job with params: " + JSON.stringify({
    id: params.analysis && params.analysis._id,
    msaid: params.msa && params.msa._id
  }));

  // object specific attributes
  self.type = "fel";

  // New attributes for multiple hits and site multihit
  self.multiple_hits = self.params.analysis.multiple_hits || "None"; // e.g., [Double, Double+Triple, None]
  self.site_multihit = self.params.analysis.site_multihit || "Estimate"; // e.g., [Estimate, Global]

  self.qsub_script_name = "fel.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // bootstrap attributes
  self.bootstrap = self.params.analysis.bootstrap;
  self.resample = self.params.analysis.resample;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nwk_tree = self.params.analysis.tagged_nwk_tree;
  self.rate_variation = self.params.analysis.ds_variation == 1 ? "Yes" : "No";
  self.ci = self.params.analysis.ci == true ? "Yes" : "No";

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".fel";
  self.results_fn = self.fn + ".FEL.json";
  self.progress_fn = self.fn + ".fel.progress";
  self.tree_fn = self.fn + ".tre";

  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.fel_walltime) {
      const parts = config.fel_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.fel_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.fel_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.fel_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.fel_procs}`,                       // Use multiple tasks for MPI
      "--cpus-per-task=1",                                  // One CPU per task for MPI
      `--time=${slurmTime}`,                                // Converted time limit
      `--partition=${config.slurm_partition || "defq"}`,    // Use configured partition
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
      self.results_short_fn +
      ",treemode=" +
      self.treemode +
      ",bootstrap=" +
      self.bootstrap +
      ",resample=" +
      self.resample +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",rate_variation=" +
      self.rate_variation +
      ",ci=" +
      self.ci +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.fel_procs +
      ",multiple_hits=" +
      self.multiple_hits +
      ",site_multihit=" +
      self.site_multihit,
      `--output=${self.output_dir}/fel_${self.id}_%j.out`,
      `--error=${self.output_dir}/fel_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" +
      config.fel_walltime +
      ",nodes=1:ppn=" +
      config.fel_procs,
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
      ",bootstrap=" +
      self.bootstrap +
      ",resample=" +
      self.resample +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",rate_variation=" +
      self.rate_variation +
      ",ci=" +
      self.ci +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.fel_procs +
      ",multiple_hits=" +
      self.multiple_hits +
      ",site_multihit=" +
      self.site_multihit,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script,
    ];
  }
  
  // Log the parameters being used
  logger.info(`FEL job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
    if (err) throw err;
  });

  // Ensure output directory exists
  logger.info(`FEL job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
  utilities.ensureDirectoryExists(self.output_dir);

  // Ensure the progress file exists
  logger.info(`FEL job ${self.id}: Creating progress file at ${self.progress_fn}`);
  fs.openSync(self.progress_fn, "w");
  
  logger.info(`FEL job ${self.id}: Initializing job`);
  self.init();
  logger.info(`FEL job ${self.id}: Job initialized`);
};

util.inherits(fel, hyphyJob);
exports.fel = fel;
