const config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  redis = require("redis"),
  util = require("util"),
  logger = require("../../lib/logger").logger,
  fs = require("fs"),
  datatypes = require("../type").type,
  path = require("path"),
  utilities = require("../../lib/utilities");

// Use redis as our key-value store
const client = redis.createClient({ host: config.redis_host, port: config.redis_port });

var gard = function(socket, stream, params) {

  const self = this;

  const variation_map = { none: "None", general_discrete: "GDD", beta_gamma: "Gamma" };

  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "gard";
  self.qsub_script_name = "gard.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.rate_variation =
    variation_map[self.params.analysis.site_to_site_variation];
  self.rate_classes = self.params.analysis.rate_classes || 2;
  self.genetic_code = self.params.msa[0].gencodeid + 1;
  self.run_mode = self.params.analysis.run_mode == "1" ? "Faster": "Normal";
  self.datatype = self.params.analysis.datatype || "0";
  self.datatype = datatypes[self.datatype];
  self.nj = self.params.msa[0].nj;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  // Ensure output directory exists
  utilities.ensureDirectoryExists(self.output_dir);
  self.status_fn = self.fn + ".status";
  self.results_fn = self.fn + ".GARD.json";
  self.progress_fn = self.fn + ".GARD.progress";
  self.tree_fn = self.fn + ".tre";

  // output fn
  self.finalout_results_fn = self.fn + ".best-gard";

  
  // Define parameters for job submission (different formats for qsub vs slurm)
  if (config.submit_type === "slurm") {
    // Convert walltime from PBS format (DD:HH:MM:SS) to SLURM format (HH:MM:SS or minutes)
    let slurmTime = "72:00:00"; // Default 3 days
    if (config.gard_walltime) {
      const parts = config.gard_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.gard_walltime;
      }
    }
    
    logger.info(`Converted walltime from ${config.gard_walltime} to SLURM format: ${slurmTime}`);
    console.log(`Converted walltime from ${config.gard_walltime} to SLURM format: ${slurmTime}`);
    
    self.qsub_params = [
      `--ntasks=${config.gard_procs}`,                       // Use multiple tasks for MPI
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
      ",rate_var=" +
      self.rate_variation +
      ",rate_classes=" +
      self.rate_classes +
      ",datatype=" +
      self.datatype +
      ",run_mode=" +
      self.run_mode +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.gard_procs,
      `--output=${self.output_dir}/gard.out`,
      `--error=${self.output_dir}/gard.err`,
      self.qsub_script
    ];
  } else {
    self.qsub_params = [
      "-l walltime=" + config.gard_walltime + ",nodes=" + config.gard_nodes + ":ppn=" + config.gard_procs,
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
        ",rate_var=" +
        self.rate_variation +
        ",rate_classes=" +
        self.rate_classes +
        ",datatype=" +
        self.datatype +
        ",run_mode=" +
        self.run_mode +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        config.gard_procs,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nj, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(gard, hyphyJob);

gard.prototype.sendNexusFile = function(cb) {
  var self = this;

  fs.readFile(self.finalout_results_fn, function(err, results) {
    if (results) {
      self.socket.emit("gard nexus file", { buffer: results });
      cb(null, "success!");
    } else {
      cb(self.finalout_results_fn + ": no gard nexus to send", null);
    }
  });
};

gard.prototype.onComplete = function() {
  var self = this;

  var files = {
    finalout: self.finalout_results_fn,
    json: self.results_fn
  };

  logger.info("gard results files to translate : " + JSON.stringify(files));

  self.sendNexusFile((err, success) => {
    if (err) {
      // Error reading results file
      self.onError("unable to read results file. " + err);
    } else {
      fs.readFile(self.results_fn, "utf8", function(err, data) {

        if (err || !data.length) {
          // Error reading results file
          self.onError("unable to read results file. " + err);
        } else {

          var stringified_results = String(data);

          // Prepare redis packet for delivery
          var redis_packet = { results: stringified_results };
          redis_packet.type = "completed";
          var str_redis_packet = JSON.stringify(redis_packet);

          // Log that the job has been completed
          self.log("complete", "success");

          // Store packet in redis and publish to channel
          client.hset(self.id, "results", str_redis_packet);
          client.hset(self.id, "status", "completed");
          client.publish(self.id, str_redis_packet);

          // Remove id from active_job queue
          client.lrem("active_jobs", 1, self.id);
        }    
      });
    }
  });
};

exports.gard = gard;