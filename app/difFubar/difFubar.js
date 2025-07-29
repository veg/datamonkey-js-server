var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

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
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".difFubar";
  self.results_fn = self.fn + ".DIFFUBAR.json";
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
      self.status_fn,
      self.progress_fn,
      self.results_short_fn,
      self.pos_threshold,
      self.mcmc_iterations,
      self.burnin_samples,
      self.concentration_of_dirichlet_prior,
      config.julia_path,
      config.julia_project
    ];
  } else {
    // For cluster execution (qsub/sbatch)
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
        ",sfn=" +
        self.status_fn +
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
  
  // First send plot files
  self.sendPlotFiles((err, success) => {
    if (err) {
      self.warn("error sending plot files", err);
    }
    
    // Then proceed with standard completion (send main JSON results)
    fs.readFile(self.results_fn, "utf8", function(err, data) {
      if (err) {
        self.onError("unable to read results file. " + err);
      } else {
        if (data && data.length > 0) {
          var redis_packet = { results: data };
          redis_packet.type = "completed";
          var str_redis_packet = JSON.stringify(redis_packet);
          
          self.log("complete", "success");
          
          var client = require("../../lib/database.js").active();
          client.hset(self.id, "results", str_redis_packet, "status", "completed");
          client.publish(self.id, str_redis_packet);
          client.lrem("active_jobs", 1, self.id);
          delete this;
        } else {
          self.onError("job seems to have completed, but no results found");
          delete this;
        }
      }
    });
  });
};

util.inherits(difFubar, hyphyJob);
exports.difFubar = difFubar;