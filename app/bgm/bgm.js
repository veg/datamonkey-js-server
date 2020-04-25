var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  code = require("../code").code,
  model = require("../model").model,
  util = require("util"),
  fs = require("fs"),
  winston = require("winston"),
  path = require("path");

const datatypes = {
  "1": "nucleotide",
  "2": "amino-acid",
  "3": "codon"
}

var bgm = function(socket, stream, params) {
  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.type = "bgm";
  self.qsub_script_name = "bgm.sh";
  self.qsub_script = __dirname + "/" + self.qsub_script_name;

  // parameter attributes
  self.msaid = self.params.msa._id;
  self.id = self.params.analysis._id;
  self.genetic_code = code[self.params.msa[0].gencodeid + 1];
  self.nj = self.params.msa[0].nj;
  self.datatype = datatypes[self.params.msa[0].datatype];

  if(self.params.analysis.substitution_model) {
    self.substitution_model = model[self.params.analysis.substitution_model];
  } else {
    self.substitution_model = null;
  }

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_short_fn = self.fn + ".bgm";
  self.results_fn = self.fn + ".BGM.json";
  self.progress_fn = self.fn + ".bgm.progress";
  self.tree_fn = self.fn + ".tre";

  // advanced options
  self.length_of_each_chain = self.params.analysis.length_of_each_chain;
  self.number_of_burn_in_samples =
    self.params.analysis.number_of_burn_in_samples;
  self.number_of_samples = self.params.analysis.number_of_samples;
  self.maximum_parents_per_node = parseInt(self.params.analysis.maximum_parents_per_node);
  self.minimum_subs_per_site = parseInt(self.params.analysis.minimum_subs_per_site);

  self.qsub_params = [
    "-l walltime=" + 
    config.bgm_walltime + 
    ",nodes=1:ppn=" + 
    config.bgm_procs,
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
      self.msaid + 
      ",datatype=" +
      self.datatype +
      ",substitution_model=" +
      self.substitution_model+
      ",length_of_each_chain=" +
      self.length_of_each_chain  +
      ",number_of_burn_in_samples=" +
      self.number_of_burn_in_samples  +
      ",number_of_samples=" +
      self.number_of_samples +
      ",maximum_parents_per_node=" +
      self.maximum_parents_per_node  +
      ",minimum_subs_per_site=" +
      self.minimum_subs_per_site ,
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

util.inherits(bgm, hyphyJob);
exports.bgm = bgm;
