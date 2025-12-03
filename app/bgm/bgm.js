var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  model = require("../model").model,
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  utilities = require("../../lib/utilities"),
  logger = require("../../lib/logger").logger;

const datatypes = {
  "1": "nucleotide",
  "2": "amino-acid",
  "3": "codon"
}

var bgm = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "bgm";
  self.qsub_script_name = "bgm.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nj = self.params.msa[0].nj;
  self.datatype = datatypes[self.params.msa[0].datatype];

  if(self.params.analysis.substitution_model) {
    self.substitution_model = model[self.params.analysis.substitution_model];
  } else {
    self.substitution_model = null;
  }

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".bgm";
  self.results_fn = self.fn + ".BGM.json";
  self.progress_fn = self.fn + ".bgm.progress";
  self.tree_fn = self.fn + ".tre";

  // advanced options
  self.length_of_each_chain = self.params.analysis.length_of_each_chain;
  self.number_of_burn_in_samples =
    self.params.analysis.number_of_burn_in_samples;
  self.number_of_samples = self.params.analysis.number_of_samples;
  self.maximum_parents_per_node = parseInt(self.params.analysis.maximum_parents_per_node);
  self.minimum_subs_per_site = parseInt(self.params.analysis.minimum_subs_per_site);

  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.bgm_walltime) {
      const parts = config.bgm_walltime.split(':');
      if (parts.length === 4) {
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = hours + ":" + parts[2] + ":" + parts[3];
      } else if (parts.length === 3) {
        slurmTime = config.bgm_walltime;
      }
    }

    logger.info("BGM job " + self.id + ": Converted walltime to SLURM format: " + slurmTime);

    self.qsub_params = [
      "--ntasks=" + config.bgm_procs,
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
      ",genetic_code=" + self.genetic_code +
      ",analysis_type=" + self.type +
      ",cwd=" + __dirname +
      ",msaid=" + self.msaid +
      ",datatype=" + self.datatype +
      ",substitution_model=" + self.substitution_model +
      ",length_of_each_chain=" + self.length_of_each_chain +
      ",number_of_burn_in_samples=" + self.number_of_burn_in_samples +
      ",number_of_samples=" + self.number_of_samples +
      ",maximum_parents_per_node=" + self.maximum_parents_per_node +
      ",minimum_subs_per_site=" + self.minimum_subs_per_site,
      "--output=" + self.output_dir + "/bgm_" + self.id + "_%j.out",
      "--error=" + self.output_dir + "/bgm_" + self.id + "_%j.err",
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + 
      config.bgm_walltime + 
      ",nodes=1:ppn=" + 
      config.bgm_procs,
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
        ",datatype=" +
        self.datatype +
        ",substitution_model=" +
        self.substitution_model+
        ",length_of_each_chain=" +
        self.length_of_each_chain  +
        ",number_of_burn_in_samples=" +
        self.number_of_burn_in_samples  +
        ",number_of_samples=" +
        self.number_of_samples +
        ",maximum_parents_per_node=" +
        self.maximum_parents_per_node  +
        ",minimum_subs_per_site=" +
        self.minimum_subs_per_site ,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  logger.info("BGM job " + self.id + ": Using " + config.submit_type + " parameters");

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nj, function(err) {
    if (err) throw err;
  });

  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");

  logger.info("BGM job " + self.id + ": Initializing job");
  self.init();
};

util.inherits(bgm, hyphyJob);
exports.bgm = bgm;
