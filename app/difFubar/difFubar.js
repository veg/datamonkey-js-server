var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  logger = require("../../lib/logger.js").logger,
  redis = require("redis"),
  util = require("util"),
  fs = require("fs"),
  path = require("path");

// Redis client is handled by the base hyphyJob class

var difFubar = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "difFubar";
  self.qsub_script_name = "difFubar.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.nj = self.params.msa[0].nj;
  
  // Use tagged tree if available, otherwise fall back to neighbor-joining tree
  if (self.params.analysis.tagged_nwk_tree) {
    self.nwk_tree = self.params.analysis.tagged_nwk_tree;
    self.treemode = "user";
  } else {
    self.nwk_tree = self.nj;
    self.treemode = "nj";
  }

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.results_short_fn = self.fn + ".difFubar";
  self.results_fn = self.fn + ".difFubar.json";
  self.progress_fn = self.fn + ".difFubar.progress";
  self.tree_fn = self.fn + ".tre";

  // difFUBAR specific options
  self.number_of_grid_points = self.params.analysis.number_of_grid_points;
  self.concentration_of_dirichlet_prior =
    self.params.analysis.concentration_of_dirichlet_prior;
  self.mcmc_iterations = self.params.analysis.mcmc_iterations;
  self.burnin_samples = self.params.analysis.burnin_samples;
  self.pos_threshold = self.params.analysis.pos_threshold;

  // Configure parameters based on execution type
  if (config.submit_type === "local") {
    // For local execution, pass arguments directly to the script
    self.qsub_params = [
      self.qsub_script,
      self.fn,
      self.tree_fn,
      self.results_short_fn,
      self.progress_fn,
      self.pos_threshold,
      self.mcmc_iterations,
      self.burnin_samples,
      self.concentration_of_dirichlet_prior,
      config.julia_path,
      config.julia_project
    ];
  } else if (config.submit_type === "slurm") {
    // Convert walltime from PBS format to SLURM format
    let slurmTime = "24:00:00"; // Default 24 hours
    if (config.difFubar_walltime) {
      const parts = config.difFubar_walltime.split(':');
      if (parts.length === 4) {
        // Convert D:HH:MM:SS to SLURM format
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]) + (days * 24);
        slurmTime = `${hours}:${parts[2]}:${parts[3]}`;
      } else if (parts.length === 3) {
        // HH:MM:SS format, already compatible with SLURM
        slurmTime = config.difFubar_walltime;
      }
    }

    self.qsub_params = [
      `--ntasks=${config.difFubar_procs || "8"}`,
      "--cpus-per-task=1",
      `--time=${slurmTime}`,
      `--partition=${config.slurm_partition || "datamonkey"}`,
      `--nodes=${config.difFubar_nodes || "1"}`,
      `--mem=${config.difFubar_memory || "32GB"}`,
      "--export=ALL,slurm_mpi_type=" + 
      (config.slurm_mpi_type || "pmix") + 
      "," +
      "fn=" +
      self.fn +
      ",tree_fn=" +
      self.tree_fn +
      ",pfn=" +
      self.progress_fn +
      ",rfn=" +
      self.results_short_fn +
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
      ",concentration_of_dirichlet_prior=" +
      self.concentration_of_dirichlet_prior +
      ",mcmc_iterations=" +
      self.mcmc_iterations +
      ",burnin_samples=" +
      self.burnin_samples +
      ",pos_threshold=" +
      self.pos_threshold +
      ",julia_path=" +
      (config.julia_path || "/usr/local/bin/julia") +
      ",julia_project=" +
      (config.julia_project || "../../.julia_env"),
      `--output=${self.output_dir}/difFubar_${self.id}_%j.out`,
      `--error=${self.output_dir}/difFubar_${self.id}_%j.err`,
      self.qsub_script
    ];
  } else {
    // For cluster execution (PBS/Torque qsub)
    self.qsub_params = [
      "-l walltime=" + 
      config.difFubar_walltime + 
      ",nodes=" + config.difFubar_nodes + ":ppn=" + 
      config.difFubar_procs + 
      ",mem=" + config.difFubar_memory,
      "-q",
      config.qsub_queue,
      "-v",
      "fn=" +
        self.fn +
        ",tree_fn=" +
        self.tree_fn +
        ",pfn=" +
        self.progress_fn +
        ",rfn=" +
        self.results_short_fn +
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
        ",concentration_of_dirichlet_prior=" +
        self.concentration_of_dirichlet_prior +
        ",mcmc_iterations=" +
        self.mcmc_iterations +
        ",burnin_samples=" +
        self.burnin_samples +
        ",pos_threshold=" +
        self.pos_threshold +
        ",julia_path=" +
        config.julia_path +
        ",julia_project=" +
        config.julia_project,
      "-o",
      self.output_dir,
      "-e",
      self.output_dir,
      self.qsub_script
    ];
  }

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nwk_tree, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  
  // Add debug logging for job lifecycle
  logger.info(`[DEBUG] difFUBAR ${self.id}: Constructor completed, calling init()`);
  logger.info(`[DEBUG] difFUBAR ${self.id}: Results file will be: ${self.results_fn}`);
  logger.info(`[DEBUG] difFUBAR ${self.id}: Progress file: ${self.progress_fn}`);
  
  self.init();
};

difFubar.prototype.sendPlotFiles = function(cb) {
  var self = this;
  
  // Define the plot files to send
  var plotFiles = [
    { name: 'overview.png', path: self.results_short_fn + '_overview.png', event: 'difFubar overview png' },
    { name: 'overview.svg', path: self.results_short_fn + '_overview.svg', event: 'difFubar overview svg' },
    { name: 'posteriors.png', path: self.results_short_fn + '_posteriors.png', event: 'difFubar posteriors png' },
    { name: 'posteriors.svg', path: self.results_short_fn + '_posteriors.svg', event: 'difFubar posteriors svg' },
    { name: 'detections.png', path: self.results_short_fn + '_detections.png', event: 'difFubar detections png' },
    { name: 'detections.svg', path: self.results_short_fn + '_detections.svg', event: 'difFubar detections svg' }
  ];
  
  var promises = plotFiles.map(file => {
    return new Promise((resolve, reject) => {
      fs.readFile(file.path, (err, data) => {
        if (err || !data) {
          resolve(null); // File doesn't exist, but don't fail
        } else {
          self.socket.emit(file.event, { buffer: data });
          resolve(file.name);
        }
      });
    });
  });
  
  Promise.all(promises).then(results => {
    var sentFiles = results.filter(f => f !== null);
    self.log("sent plot files", sentFiles.join(', '));
    cb(null, "success");
  }).catch(err => {
    cb(err, null);
  });
};

difFubar.prototype.onComplete = function() {
  var self = this;
  
  logger.info(`[DEBUG] difFUBAR ${self.id}: onComplete() called!`);
  logger.info(`[DEBUG] difFUBAR ${self.id}: Socket connected: ${self.socket && self.socket.connected}`);
  logger.info(`[DEBUG] difFUBAR ${self.id}: Socket ID: ${self.socket && self.socket.id}`);
  logger.info(`[DEBUG] difFUBAR ${self.id}: Results file exists: ${fs.existsSync(self.results_fn)}`);
  if (fs.existsSync(self.results_fn)) {
    const stats = fs.statSync(self.results_fn);
    logger.info(`[DEBUG] difFUBAR ${self.id}: Results file size: ${stats.size} bytes`);
    
    // Check if results file is too large for Redis pub/sub inline transmission (>5MB)
    if (stats.size > 5 * 1024 * 1024) {
      logger.info(`[DEBUG] difFUBAR ${self.id}: Results file large (${(stats.size / 1024 / 1024).toFixed(2)}MB), sending via direct socket transmission`);
      
      // Send plot files first
      self.sendPlotFiles((err, success) => {
        if (err) {
          self.warn("error sending plot files", err);
        }
        
        // Send results file directly via socket (like other tools do)
        fs.readFile(self.results_fn, (err, data) => {
          if (err) {
            self.onError("unable to read results file for direct transmission. " + err);
            return;
          }
          
          logger.info(`[DEBUG] difFUBAR ${self.id}: Sending results file directly via socket (${data.length} bytes)`);
          
          // Send results file directly to client
          self.socket.emit("difFubar results file", { buffer: data });
          
          // Send lightweight completion event via Redis
          var redis_packet = { 
            results: JSON.stringify({
              message: "Results sent via direct file transmission",
              file_size: stats.size,
              analysis_complete: true
            })
          };
          redis_packet.type = "completed";
          var str_redis_packet = JSON.stringify(redis_packet);
          
          self.log("complete", "success (direct file transmission)");
          
          // Use shared Redis client pattern like base class
          const redis = require("redis");
          const config = require("../../config.json");
          const client = redis.createClient({
            host: config.redis_host,
            port: config.redis_port
          });
          
          client.hset(self.id, "results", str_redis_packet, "status", "completed");
          client.publish(self.id, str_redis_packet);
          client.lrem("active_jobs", 1, self.id);
          
          logger.info(`[DEBUG] difFUBAR ${self.id}: Sent results via direct socket + Redis completion`);
        });
      });
      return;
    }
  }
  
  // For smaller results, use normal completion flow
  self.sendPlotFiles((err, success) => {
    if (err) {
      self.warn("error sending plot files", err);
    }
    
    logger.info(`[DEBUG] difFUBAR ${self.id}: Calling parent onComplete()`);
    hyphyJob.prototype.onComplete.call(self);
  });
};

util.inherits(difFubar, hyphyJob);
exports.difFubar = difFubar;
