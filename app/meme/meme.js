var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

var meme = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "meme";
  self.qsub_script_name = "meme.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nj = self.params.msa[0].nj;

  // bootstrap attributes
  self.bootstrap = self.params.analysis.bootstrap;
  self.resample = self.params.analysis.resample;

  // New attributes for multiple hits and site multihit
  self.multiple_hits = self.params.analysis.multiple_hits || "None"; // e.g., [Double, Double+Triple, None]
  self.site_multihit = self.params.analysis.site_multihit || "Estimate"; // e.g., [Estimate, Global]
  self.rates = self.params.analysis.rates || 2;
  self.impute_states = self.params.analysis.impute_states || "No";

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".meme";
  self.results_fn = self.fn + ".MEME.json";
  self.progress_fn = self.fn + ".meme.progress";
  self.tree_fn = self.fn + ".tre";

  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.meme_walltime) {
      const parts = config.meme_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.meme_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.meme_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.meme_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.meme_procs}`,                      // Use multiple tasks for MPI
      "--cpus-per-task=1",                                  // One CPU per task for MPI
      `--time=${slurmTime}`,                                // Converted time limit
      `--partition=${config.slurm_partition || "datamonkey"}`,    // Use configured partition
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
      ",multiple_hits=" +
      self.multiple_hits +
      ",site_multihit=" +
      self.site_multihit +
      ",rates=" +
      self.rates +
      ",resample=" +
      self.resample +
      ",impute_states=" +
      self.impute_states +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.meme_procs,
      `--output=${self.output_dir}/meme_${self.id}_%j.out`,
      `--error=${self.output_dir}/meme_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.meme_walltime + ",nodes=1:ppn=" + config.meme_procs,
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
        ",multiple_hits=" +
        self.multiple_hits +
        ",site_multihit=" +
        self.site_multihit +
        ",rates=" +
        self.rates +
        ",resample=" +
        self.resample +
        ",impute_states=" +
        self.impute_states +
        ",genetic_code=" +
        self.genetic_code +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.meme_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  self.selectedTree = self.nj;

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
    } else {
      // Handle the case where neither usertree nor nj is available
      console.warn("Neither usertree nor neighbor-joining tree is available.");
    }
    console.log("MEME selected Tree:", self.selectedTree);
  } else {
    console.log("self.params.analysis.msa structure is missing.");
  }

  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.selectedTree, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(meme, hyphyJob);
exports.meme = meme;