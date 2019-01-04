var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var fade = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;


  // object specific attributes
  self.type = "fade";
  self.qsub_script_name = "fade.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.nj = self.params.msa[0].nj;

  // FADE specific attributes
  self.substitution_model = self.params.substitution_model;
  self.posterior_estimation_method = self.params.posterior_estimation_method;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".fade";
  self.results_fn = self.fn + ".FADE.json";
  self.progress_fn = self.fn + ".fade.progress";
  self.tree_fn = self.fn + ".tre";

  // advanced options
  self.number_of_grid_points = self.params.analysis.number_of_grid_points;
  self.number_of_mcmc_chains = self.params.analysis.number_of_mcmc_chains;
  self.length_of_each_chain = self.params.analysis.length_of_each_chain;
  self.number_of_burn_in_samples =
    self.params.analysis.number_of_burn_in_samples;
  self.number_of_samples = self.params.analysis.number_of_samples;
  self.concentration_of_dirichlet_prior =
    self.params.analysis.concentration_of_dirichlet_prior;

  self.qsub_params = [
    "-q",
    config.qsub_avx_queue,
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
      ",substitution_model=" +
      self.substitution_model +
      ",posterior_estimation_method=" +
      self.posterior_estimation_method +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",number_of_grid_points=" +
      self.number_of_grid_points +
      ",number_of_mcmc_chains=" +
      self.number_of_mcmc_chains +
      ",length_of_each_chain=" +
      self.length_of_each_chain +
      ",number_of_burn_in_samples=" +
      self.number_of_burn_in_samples +
      ",number_of_samples=" +
      self.number_of_samples +
      ",concentration_of_dirichlet_prior=" +
      self.concentration_of_dirichlet_prior,
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

util.inherits(fade, hyphyJob);
exports.fade = fade;
