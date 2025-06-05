var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;


const synSubstitutionVar = {
  "1" : "Yes",
  "2" : "No",
  "3" : "Branch-site"
}

const multihitVar = {
  "Default" : "None",
  "Double" : "Double",
  "Double+Triple" : "Double+Triple"
}


var busted = function(socket, stream, busted_params) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = busted_params;

  // object specific attributes
  self.type = "busted";
  self.qsub_script_name = "busted_submit.sh";
  self.qsub_script = path.join(__dirname, self.qsub_script_name);

  // parameter attributes
  self.msaid = busted_params.msa._id;
  self.id = busted_params.analysis._id;
  self.ds_variation = synSubstitutionVar[busted_params.analysis.ds_variation] || "Yes";
  self.error_protection = busted_params.analysis.error_protection;
  self.multihit = multihitVar[busted_params.analysis.multihit] || "None";
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.type = self.params.type;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);
  self.status_fn = self.fn + ".status";
  self.progress_fn = self.fn + ".BUSTED.progress";
  self.results_fn = self.fn + ".BUSTED.json";
  self.tree_fn = self.fn + ".tre";

  //1|datamonk | info: busted : 5ce5b46ce0493944e73da3ef : job created : {"torque_id":""}
  //1|datamonk | info: emitting {"torque_id":""}
  //1|datamonk | info: emitting {"torque_id":""}

  
  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.busted_walltime) {
      const parts = config.busted_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.busted_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.busted_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.busted_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.busted_procs}`,                       // Use multiple tasks for MPI
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
      self.results_fn +
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",synRateVariation=" +
      self.ds_variation +
      ",errorProtection=" +
      self.error_protection +
      ",multihit=" +
      self.multihit +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.busted_procs,
      `--output=${self.output_dir}/busted_${self.id}_%j.out`,
      `--error=${self.output_dir}/busted_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.busted_walltime + ",nodes=1:ppn=" + config.busted_procs,
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
        ",treemode=" +
        self.treemode +
        ",genetic_code=" +
        self.genetic_code +
        ",synRateVariation=" +
        self.ds_variation +
        ",errorProtection=" +
        self.error_protection +
        ",multihit=" +
        self.multihit +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.busted_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Write tree to a file
  fs.writeFile(self.tree_fn, busted_params.analysis.tagged_nwk_tree, function(
    err
  ) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");

  self.init();
};

util.inherits(busted, hyphyJob);

exports.busted = busted;