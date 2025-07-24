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

  self.qsub_params = [
    "-l walltime=" + 
    config.difFubar_walltime + 
    ",nodes=1:ppn=" + 
    config.difFubar_procs,
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
      self.pos_threshold,
    "-o",
    self.output_dir,
    "-e",
    self.output_dir,
    self.qsub_script
  ];

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nj, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(difFubar, hyphyJob);
exports.difFubar = difFubar;