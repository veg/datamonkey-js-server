var config = require("../../config.json"),
  hyphyJob = require("../hyphyjob.js").hyphyJob,
  redis = require("redis"),
  util = require("util"),
  winston = require("winston"),
  fs = require("fs"),
  path = require("path"),
  translate_gard = require("translate-gard");

// Use redis as our key-value store
var client = redis.createClient();

var gard = function(socket, stream, params) {
  var self = this;

  var variation_map = { none: 1, general_discrete: 2, beta_gamma: 3 };

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
  self.rate_variation =
    variation_map[self.params.analysis.site_to_site_variation];
  self.rate_classes = self.params.analysis.rate_classes || 2;
  self.genetic_code = self.params.msa[0].gencodeid + 1;
  self.nj = self.params.msa[0].nj;

  // parameter-derived attributes
  self.fn = __dirname + "/output/" + self.id;
  self.output_dir = path.dirname(self.fn);
  self.status_fn = self.fn + ".status";
  self.results_fn = self.fn + ".GARD";
  self.progress_fn = self.fn + ".GARD.progress";
  self.tree_fn = self.fn + ".tre";

  // output fn
  self.html_results_fn = self.results_fn;
  self.finalout_results_fn = self.results_fn + "_finalout";
  self.ga_details_results_fn = self.results_fn + "_ga_details";
  self.splits = self.results_fn + "_splits";
  self.json_fn = self.results_fn + ".json";

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
      ",tree_fn=" +
      self.tree_fn +
      ",sfn=" +
      self.status_fn +
      ",pfn=" +
      self.progress_fn +
      ",rfn=" +
      self.results_fn +
      ",treemode=" +
      self.treemode +
      ",genetic_code=" +
      self.genetic_code +
      ",rate_var=" +
      self.rate_variation +
      ",rate_classes=" +
      self.rate_classes +
      ",analysis_type=" +
      self.type +
      ",cwd=" +
      __dirname +
      ",msaid=" +
      self.msaid +
      ",procs=" +
      config.gard_procs,
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

gard.prototype.sendNexusFile = function(cb) {
  var self = this;

  fs.readFile(self.finalout_results_fn, function(err, results) {
    if (results) {
      self.socket.emit("gard nexus file", { buffer: results });
      cb(null, "success!");
    } else {
      cb(self.finalout_results_fn + ": no gard nexus to send", null);
    }
  });
};

gard.prototype.onComplete = function() {
  var self = this;

  var files = {
    html: self.html_results_fn,
    finalout: self.finalout_results_fn,
    ga_details: self.ga_details_results_fn,
    splits: self.splits,
    json: self.json_fn
  };

  winston.info("gard results files to translate : " + JSON.stringify(files));

  self.sendNexusFile((err, success) => {
    translate_gard.toJSON(files, (err, data) => {
      if (err) {
        // Error reading results file
        self.onError("unable to read results file. " + err);
      } else {
        if (data) {
          var stringified_results = JSON.stringify(data);

          // Prepare redis packet for delivery
          var redis_packet = { results: stringified_results };
          redis_packet.type = "completed";
          var str_redis_packet = JSON.stringify(redis_packet);

          // Log that the job has been completed
          self.log("complete", "success");

          // Store packet in redis and publish to channel
          client.hset(self.id, "results", str_redis_packet);
          client.hset(self.id, "status", "completed");
          client.publish(self.id, str_redis_packet);

          // Remove id from active_job queue
          client.lrem("active_jobs", 1, self.id);
        } else {
          // Empty results file
          self.onError("job seems to have completed, but no results found");
        }
      }
    });
  });
};

exports.gard = gard;
