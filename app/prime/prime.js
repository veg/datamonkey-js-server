var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var prime = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "prime";
  self.qsub_script_name = "prime.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.id = self.params.analysis._id;
  self.genetic_code = self.params.msa[0].gencodeid + 1;
  self.usertree = self.params.msa[0].nj;
  self.sites = self.params.msa[0].rawsites - 1;
  //self.treemode = prime_params.analysis.treemode;
  //self.posterior_p = prime_params.analysis.posterior_p;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".prime";
  self.results_fn = self.fn + ".prime.json";
  self.progress_fn = self.fn + ".progress";
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
      ",rfn=" +
      self.results_short_fn +
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname,
    "-o",
    self.output_dir,
    "-e",
    self.output_dir,
    self.qsub_script
  ];

  // Write tree to a file
  // For PRIME, we need to write out the number of partitions and sites first
  var tree_to_write = "1\n";
  tree_to_write += "      0-        " + self.sites + "\n";
  tree_to_write += self.usertree;

  fs.writeFile(self.tree_fn, tree_to_write, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(prime, hyphyJob);
exports.prime = prime;
