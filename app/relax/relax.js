var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var relax = function(socket, stream, relax_params) {

  var self = this;

  self.socket = socket;
  self.stream = stream;
  self.params = relax_params;

  // object specific attributes
  self.type = "relax";
  self.qsub_script_name = "relax.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = self.params.msa[0].gencodeid + 1;
  self.analysis_type = self.params.analysis.analysis_type;
  self.nwk_tree = self.params.analysis.tagged_nwk_tree;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.progress_fn = self.fn + ".RELAX.progress";
  self.results_fn = self.fn + ".RELAX.json";
  self.tree_fn = self.fn + ".tre";

  self.qsub_params = [
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
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.analysis_type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid,
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
  fs.openSync(self.status_fn, "w");

  self.init();
};

util.inherits(relax, hyphyJob);

exports.relax = relax;
