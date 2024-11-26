var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var fel = function (socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "fel";

  // New attributes for multiple hits and site multihit
  self.multiple_hits = self.params.analysis.multiple_hits || "None"; // e.g., [Double, Double+Triple, None]
  self.site_multihit = self.params.analysis.site_multihit || "Estimate"; // e.g., [Estimate, Global]

  self.qsub_script_name = "fel.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // bootstrap attributes
  self.bootstrap = self.params.analysis.bootstrap;
  self.resample = self.params.analysis.resample;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nwk_tree = self.params.analysis.tagged_nwk_tree;
  self.rate_variation = self.params.analysis.ds_variation == 1 ? "Yes" : "No";
  self.ci = self.params.analysis.ci == true ? "Yes" : "No";

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".fel";
  self.results_fn = self.fn + ".FEL.json";
  self.progress_fn = self.fn + ".fel.progress";
  self.tree_fn = self.fn + ".tre";

  self.qsub_params = [
    "-l walltime=" +
    config.fel_walltime +
    ",nodes=1:ppn=" +
    config.fel_procs,
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
    ",genetic_code=" +
    self.genetic_code +
    ",analysis_type=" +
    self.type +
    ",rate_variation=" +
    self.rate_variation +
    ",ci=" +
    self.ci +
    ",cwd=" +
    __dirname +
    ",msaid=" +
    self.msaid +
    ",procs=" +
    config.fel_procs +
    ",multiple_hits=" +
    self.multiple_hits +
    ",site_multihit=" +
    self.site_multihit,
    "-o",
    self.output_dir,
    "-e",
    self.output_dir,
    self.qsub_script,
  ];

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(fel, hyphyJob);
exports.fel = fel;
