var spawn = require("child_process").spawn,
  fs = require("fs"),
  tar = require("tar"),
  path = require("path"),
  config = require("../../config.json"),
  util = require("util"),
  moment = require("moment"),
  winston = require("winston"),
  EventEmitter = require("events").EventEmitter;

var FleaRunner = function() {};

util.inherits(FleaRunner, EventEmitter);

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./flea/README
 * Emit events that are being listened for by ./server.js
 */

FleaRunner.prototype.start = function(fn, socket, flea_params) {
  var self = this;

  self.filepath = fn;
  self.output_dir = path.dirname(self.filepath);
  self.id = flea_params.analysis._id;
  self.filedir = path.join(self.output_dir, self.id);
  self.file_list = path.join(self.filedir, "/files");
  self.status_fn = self.filepath + ".status";
  self.results_fn = self.filepath + ".flea";
  self.python = config.flea_python;
  self.nextflow = config.nextflow;
  self.pipeline = config.flea_pipeline;
  self.flea_config = config.flea_config;
  self.status_stack = flea_params.status_stack;
  self.analysis_type = flea_params.analysis.analysis_type;
  self.msas = flea_params.analysis.msas;
  self.genetic_code = "1";
  self.torque_id = "unk";
  self.stdout = "";
  self.stderr = "";
  self.job_completed = false;
  self.socket = socket;

  // Results files
  self.analysis_dir = path.join(self.filedir, "/results/");
  self.session_json_fn = path.join(self.analysis_dir, "session.json");
  self.session_zip_fn = path.join(self.analysis_dir, "session.zip");

  // flea_pipeline.py
  var flea_pipeline_submit = function() {
    self.emit("status update", { phase: self.status_stack[2], msg: "" });

    var flea_pipeline_parameters = [
      "run",
      self.pipeline,
      "-c",
      self.flea_config,
      "--infile",
      self.file_list
    ];

    // check if session json and zip file already exist. If so, do simply state the job has been completed
    fs.stat(self.session_zip_fn, function(err, stats) {
      // file exists skip spawning
      if (!err) {
        self.onComplete();
        return;
      } else {
        winston.info(
          "flea : submitting job : " +
            self.nextflow +
            " " +
            flea_pipeline_parameters.join(" ")
        );

        var flea_pipeline = spawn(self.nextflow, flea_pipeline_parameters, {
          cwd: self.filedir,
          env: Object.assign(process.env, {
            LD_LIBRARY_PATH:
              "/usr/lib64/atlas/:/usr/local/lib64/:/opt/gcc-4.9.2/usr/local/lib64/:/usr/lib64:/usr/local/lib:/opt/gcc-4.9.2/usr/local/lib64/:/usr/local/lib:/opt/scyld/openmpi/1.6.3/gnu/lib:/opt/scyld/maui/lib:/opt/AMDAPP/lib/x86_64:/opt/AMDAPP/lib/x86:/opt/AMDAPP/lib/x86_64:/opt/AMDAPP/lib/x86",
            PATH:
              "/opt/nextflow:/opt/jdk1.8.0_91/bin:/opt/jdk1.8.0_91/jre/bin:/usr/local/bin/:/usr/bin:/usr/local/sbin:/sbin:/bin",
            JAVA_HOME: "/opt/jdk1.8.0_91",
            JRE_HOME: "/opt/jdk1.8.0_91/jre"
          })
        });

        flea_pipeline.stdout.on("data", function(data) {
          self.stdout += String(data);
          winston.info(self.id + " : flea : " + self.stdout);
          var status_update_packet = { phase: "running", msg: self.stdout };
          self.emit("status update", status_update_packet);
        });

        flea_pipeline.stderr.on("data", function(data) {
          self.stderr += String(data);
          winston.info(self.id + " : flea : " + self.stderr);
          var status_update_packet = { phase: "running", msg: self.stderr };
          self.emit("status update", status_update_packet);
        });

        flea_pipeline.on("close", function(code) {
          // Read results files and send
          winston.info("exit code: " + code);

          // should send over session files

          // Save results files
          //self.emit("completed", { results: "hi" });
          self.onComplete();
        });
      }
    });
  };

  // Write the contents of the file in the parameters to a file on the
  // local filesystem, then spawn the job.
  var do_flea = function(stream, flea_params) {
    self.emit("status update", { phase: self.status_stack[1], msg: "" });

    //Unpack the tar file
    function onError(err) {
      err = err + " : " + self.filepath;
      winston.warn("flea : script error: " + self.python + " " + err);
      self.emit("script error", err);
    }

    function onEnd() {
      fs.writeFileSync(self.file_list, "");
      winston.log("flea : status update : creating list");

      // Create list inside filedir
      fs.readdir(self.filedir, function(err, files) {
        // Compare files in directory to file list
        self.msas.forEach(function(msa, index) {
          // Append to file
          // Format : PC64_V00_small.fastq V00 20080301
          if (files.indexOf(msa._id + ".fastq") != -1) {
            var formatted_visit_date = moment(msa.visit_date).format(
              "YYYYMMDD"
            );
            var string_to_write = util.format(
              "%s %s %s\n",
              self.filedir + "/" + msa._id + ".fastq",
              msa.visit_code,
              formatted_visit_date
            );
            winston.log("flea : appending list : " + string_to_write);
            fs.appendFileSync(self.file_list, string_to_write);
          }

          if (index == self.msas.length - 1) {
            flea_pipeline_submit();
          }
        });
      });
    }

    var extractor = tar
      .Extract({ path: self.filedir })
      .on("error", onError)
      .on("end", onEnd);

    fs.createReadStream(self.filepath).on("error", onError).pipe(extractor);
  };

  do_flea(flea_params);
};

FleaRunner.prototype.onComplete = function(fn, flea_params) {
  var self = this;
  self.sendSessionJSONFile((err, success) => {
    self.sendSessionZipFile((err, success) => {
      self.emit("completed", { results: "success" });
    });
  });
};

FleaRunner.prototype.sendSessionJSONFile = function(cb) {
  var self = this;
  fs.readFile(self.session_json_fn, function(err, results) {
    if (results) {
      self.socket.emit("flea session json file", { buffer: results });
      cb(null, "success!");
    } else {
      cb(self.finalout_results_fn + ": no flea session json to send", null);
    }
  });
};

FleaRunner.prototype.sendSessionZipFile = function(cb) {
  var self = this;

  fs.readFile(self.session_zip_fn, function(err, results) {
    if (results) {
      self.socket.emit("flea session zip file", { buffer: results });
      cb(null, "success!");
    } else {
      cb(self.finalout_results_fn + ": no flea session zip to send", null);
    }
  });
};

exports.FleaRunner = FleaRunner;
