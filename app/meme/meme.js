var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var meme = function (socket, stream, params) {
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
    self.qsub_script,
  ];

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nj, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(meme, hyphyJob);
exports.meme = meme;
