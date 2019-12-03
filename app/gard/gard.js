var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  util = require("util"),
  fs = require("fs"),
  path = require("path");

var gard = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "gard";
  self.qsub_script_name = "gard.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  var variation_map = {
    none: 'None', general_discrete: 'GDD', beta_gamma: 'Gamma'
  };
  self.rate_variation =
    variation_map[self.params.analysis.site_to_site_variation];
  self.rate_classes = self.params.analysis.rate_classes || 2;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nj = self.params.msa[0].nj;
  self.data_type = ['Codon', 'Nucleotide', 'Protein'][
    self.params.msa[0].datatype
  ];

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + "gard";
  self.results_fn = self.fn + ".GARD.json";
  self.progress_fn = self.fn + ".GARD.progress";
  self.tree_fn = self.fn + ".tre";

  self.qsub_params = [
    "-l walltime=" + 
    config.gard_walltime + 
    ",nodes=" + config.gard_nodes + ":ppn=" + 
    config.gard_procs,
    "-q",
    config.qsub_avx_queue,
    "-v",
    "fn=" +
      self.fn +
      ",sfn=" +
      self.status_fn +
      ",pfn=" +
      self.progress_fn +
      ",rfn=" +
      self.results_short_fn +
      ",genetic_code=" +
      self.genetic_code +
      ",rate_var=" +
      self.rate_variation +
      ",rate_classes=" +
      self.rate_classes +
      ",data_type=" +
      self.data_type +
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

util.inherits(gard, hyphyJob);
exports.gard = gard;
