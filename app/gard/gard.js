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
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  
  // Check if this is a check-only operation
  var isCheckOnly = params.checkOnly || false;
  
  logger.info("GARD constructor called with:", {
    stream_type: typeof stream,
    stream_length: stream ? stream.length : 0,
    stream_content: stream ? (stream.length > 100 ? stream.substring(0, 100) + "..." : stream) : "null",
    params_keys: Object.keys(params),
    params_full: JSON.stringify(params),
    checkOnly: isCheckOnly
  });

  // object specific attributes
  self.type = "gard";
  self.qsub_script_name = "gard.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  const variation_map = { none: "None", general_discrete: "GDD", beta_gamma: "Gamma" };

  // For check operations, we only need minimal initialization
  if (isCheckOnly) {
    // Set defaults for required fields with complete parameter coverage
    self.genetic_code = params.genetic_code || "Universal";
    self.site_to_site_variation = params.site_to_site_variation || "none";
    self.rate_variation = variation_map[self.site_to_site_variation] || "None";
    self.rate_classes = parseInt(params.rate_classes || params.classes || 2);
    self.run_mode = params.run_mode === "1" || params.run_mode === "Faster" ? "Faster" : "Normal";
    self.datatype = params.datatype || "codon";
    self.max_breakpoints = parseInt(params.max_breakpoints || 10000);
    self.model = params.model || "JTT";
    self.id = "check-" + Date.now();
    self.msaid = "check";
    self.nwk_tree = params.nwk_tree || params.tree || "";
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_fn = self.fn + ".GARD.json";
    self.progress_fn = self.fn + ".GARD.progress";
    self.tree_fn = self.fn + ".tre";
    self.finalout_results_fn = self.fn + ".best-gard";
  } else {
    // Normal operation with full parameters
    var analysisParams = self.params.analysis || self.params;
    
    // parameter attributes with fallbacks
    if (self.params.msa) {
      self.msaid = self.params.msa._id;
      self.genetic_code = self.params.msa[0] ? (self.params.msa[0].gencodeid + 1) : "Universal";
      self.nwk_tree = self.params.msa[0] ? (self.params.msa[0].usertree || self.params.msa[0].nj) : "";
    } else {
      self.msaid = self.params.msaid || "unknown";
      self.genetic_code = self.params.genetic_code || "Universal";
      self.nwk_tree = self.params.nwk_tree || self.params.tree || "";
    }
    
    if (self.params.analysis) {
      self.id = self.params.analysis._id || self.params.id || "unknown-" + Date.now();
      // GARD specific attributes with complete parameter coverage
      self.site_to_site_variation = analysisParams.site_to_site_variation || "none";
      self.rate_variation = variation_map[self.site_to_site_variation] || "None";
      self.rate_classes = parseInt(analysisParams.rate_classes || analysisParams.classes || 2);
      self.run_mode = analysisParams.run_mode == "1" || analysisParams.run_mode == "Faster" ? "Faster" : "Normal";
      self.datatype = analysisParams.datatype || "0";
      self.datatype = datatypes[self.datatype] || "codon";
      self.max_breakpoints = parseInt(analysisParams.max_breakpoints || 10000);
      self.model = analysisParams.model || "JTT";
    } else {
      self.id = self.params.id || "unknown-" + Date.now();
      // GARD specific attributes with complete parameter coverage
      self.site_to_site_variation = self.params.site_to_site_variation || "none";
      self.rate_variation = variation_map[self.site_to_site_variation] || "None";
      self.rate_classes = parseInt(self.params.rate_classes || self.params.classes || 2);
      self.run_mode = self.params.run_mode === "1" || self.params.run_mode === "Faster" ? "Faster" : "Normal";
      self.datatype = self.params.datatype || "codon";
      self.max_breakpoints = parseInt(self.params.max_breakpoints || 10000);
      self.model = self.params.model || "JTT";
    }
    
    // parameter-derived attributes
    self.fn = __dirname + "/output/" + self.id;
    self.output_dir = path.dirname(self.fn);
    self.status_fn = self.fn + ".status";
    self.results_fn = self.fn + ".GARD.json";
    self.progress_fn = self.fn + ".GARD.progress";
    self.tree_fn = self.fn + ".tre";
    self.finalout_results_fn = self.fn + ".best-gard";
  }

  // Set treemode with default value
  self.treemode = self.params.treemode || "0";

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

  // Define parameters for job submission (different formats for qsub vs slurm vs local)
  if (config.submit_type === "local") {
    // For local execution, the script path must be first
    self.qsub_params = [
      self.qsub_script,
      "fn=" + self.fn,
      "tree_fn=" + self.tree_fn,
      "sfn=" + self.status_fn,
      "pfn=" + self.progress_fn,
      "rfn=" + self.results_fn,
      "treemode=" + self.treemode,
      "genetic_code=" + self.genetic_code,
      "rate_var=" + self.rate_variation,
      "rate_classes=" + self.rate_classes,
      "datatype=" + self.datatype,
      "run_mode=" + self.run_mode,
      "max_breakpoints=" + self.max_breakpoints,
      "model=" + self.model,
      "analysis_type=" + self.type,
      "cwd=" + __dirname,
      "msaid=" + self.msaid,
      "procs=" + (config.gard_procs || 48)
    ];
  } else if (config.submit_type === "slurm") {
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
      `--partition=${config.slurm_partition || "datamonkey"}`,    // Use configured partition
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
      ",max_breakpoints=" +
      self.max_breakpoints +
      ",model=" +
      self.model +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      (config.gard_procs || 48),
      `--output=${self.output_dir}/gard_${self.id}_%j.out`,
      `--error=${self.output_dir}/gard_${self.id}_%j.err`,
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
        ",max_breakpoints=" +
        self.max_breakpoints +
        ",model=" +
        self.model +
        ",analysis_type=" +
        self.type +
        ",cwd=" +
        __dirname +
        ",msaid=" +
        self.msaid +
        ",procs=" +
        (config.gard_procs || 48),
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Log the parameters being used
  logger.info(`GARD job ${self.id}: Using ${config.submit_type} parameters: ${JSON.stringify(self.qsub_params)}`);

  // Skip file operations for check-only mode
  if (!isCheckOnly) {
    // Ensure output directory exists BEFORE writing files
    logger.info(`GARD job ${self.id}: Ensuring output directory exists at ${self.output_dir}`);
    utilities.ensureDirectoryExists(self.output_dir);

    // Write tree to a file
    logger.info(`GARD job ${self.id}: Writing tree file to ${self.tree_fn}`, {
      tree_content: self.nwk_tree ? (self.nwk_tree.length > 100 ? self.nwk_tree.substring(0, 100) + "..." : self.nwk_tree) : "null"
    });
    fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
      if (err) {
        logger.error(`GARD job ${self.id}: Error writing tree file: ${err.message}`);
        throw err;
      }
      logger.info(`GARD job ${self.id}: Tree file written successfully`);
    });

    // Ensure the progress file exists
    logger.info(`GARD job ${self.id}: Creating progress file at ${self.progress_fn}`);
    fs.openSync(self.progress_fn, "w");
  }
  
  logger.info(`GARD job ${self.id}: Initializing job`);
  self.init();
  logger.info(`GARD job ${self.id}: Job initialized`);
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