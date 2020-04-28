var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var multihit = function(socket, stream, params) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "multihit";
  self.qsub_script_name = "multihit.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nwk_tree = self.params.msa[0].usertree || self.params.msa[0].nj;
  self.rate_classes = self.params.analysis.rate_classes || 1;
  self.triple_islands = self.params.analysis.triple_islands || "No";

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".multihit";
  self.results_fn = self.fn + ".MULTI.json";
  self.progress_fn = self.fn + ".multihit.progress";
  self.tree_fn = self.fn + ".tre";

  self.qsub_params = [
    "-l walltime=" + 
    config.multihit_walltime + 
    ",nodes=1:ppn=" + 
    config.multihit_procs,
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
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",branch_sets=" +
      self.branch_sets +
      ",rate_classes=" +
      self.rate_classes+
      ",triple_islands=" +
      self.triple_islands+
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.multihit_procs,
    "-o",
    self.output_dir,
    "-e",
    self.output_dir,
    self.qsub_script
  ];

  // Write tree to a file
  fs.writeFile(self.tree_fn, self.nwk_tree, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();

};

util.inherits(multihit, hyphyJob);
exports.multihit = multihit;
