var config = require("../../config.json"),
  cs = require("../../lib/clientsocket.js"),
  job = require("../job.js"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  jobdel = require("../../lib/jobdel.js"),
  util = require("util"),
  _ = require("underscore"),
  fs = require("fs"),
  path = require("path"),
  ss = require("socket.io-stream");

var meme = function(socket, stream, params) {
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
  self.genetic_code = self.params.msa[0].gencodeid + 1;
  self.nj = self.params.msa[0].nj;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".meme";
  self.results_fn = self.fn + ".MEME.json";
  self.progress_fn = self.fn + ".meme.progress";
  self.tree_fn = self.fn + ".tre";

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
      ",genetic_code=" +
      self.genetic_code +
      ",analysis_type=" +
      self.type +
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
  fs.writeFile(self.tree_fn, self.nj, function(err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, "w");
  self.init();
};

util.inherits(meme, hyphyJob);
exports.meme = meme;
