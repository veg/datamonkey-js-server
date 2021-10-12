var spawn = require("child_process").spawn,
  redis = require("redis"),
  fs = require("fs"),
  util = require("util"),
  cs = require("../lib/clientsocket.js"),
  logger = require("../lib/logger.js").logger,
  jobdel = require("../lib/jobdel.js"),
  JobStatus = require(__dirname + "/../lib/jobstatus.js").JobStatus,
  EventEmitter = require("events").EventEmitter,
  config = require("../config.json");


// Use redis as our key-value store
var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// resubscribes a socket to an existing pending job,
// otherwise reports contents from redis
var resubscribe = function(socket, id) {
  var self = this;
  self.id = id;

  var callback = function(err, obj) {
    if (err || !obj) {
      logger.warn(self.id + " : resubscribe : " + err);
      socket.emit("script error", { error: err });
    } else {
      // check job status
      var current_status = obj.status;
      logger.info(self.id + " : job : current status : " + obj.status);
      if (current_status != "completed" && current_status != "exiting") {
        // if job is still pending, resubscribe
        logger.warn(
          "info",
          self.id + " : job : resubscribe : job pending, resuming"
        );

        var clientSocket = new cs.ClientSocket(socket, self.id);
      } else if (current_status == "completed") {
        // if job completed, emit results
        logger.info(self.id + " : job : resubscribe : job completed");
        var json_results = JSON.parse(obj.results);
        socket.emit("completed", json_results);
        socket.disconnect();
      } else {
        // if job aborted, emit error
        socket.emit("script error", obj.error);
      }
    }
  };

  client.hgetall(self.id, callback);
};

var cancel = function(socket, id) {
  var self = this;
  self.id = id;

  var callback = function(err, obj) {
    if (err || !obj) {
      logger.warn(self.id + " : cancel : " + err);
      socket.emit("cancelled", { success: "no", error: err });
    } else {
      // check job status
      var current_status = obj.status,
        torque_id = "";

      try {
        torque_id = JSON.parse(obj.torque_id).torque_id;
      } catch (e) {
        logger.info(
          self.id + " : job : cancel : could not retrieve torque information"
        );
        socket.emit("cancelled", {
          success: "no",
          error: "could not retrieve torque id"
        });
      }

      if (current_status != "completed" && current_status != "exiting") {
        // if job is still pending, cancel
        logger.warn("info", self.id + " : job : cancel : cancelling job");

        jobdel.jobDelete(torque_id, function() {
          logger.warn("info", self.id + " : job : cancel : job cancelled");
          client.hset(self.id, "status", "aborted");
          socket.emit("cancelled", { success: "ok" });
          socket.disconnect();
        });
      } else if (current_status == "completed") {
        // if job completed, emit results
        logger.info(self.id + " : job : cancel : job completed");
        socket.emit("cancelled", { success: "ok" });
        socket.disconnect();
      } else {
        // if job aborted, emit error
        logger.info(self.id + " : job : cancel : job does not exist");
        socket.emit("cancelled", { success: "no", error: "no job" });
      }
    }
  };

  client.hgetall(self.id, callback);
};

var jobRunner = function(params, results_fn) {

  var self = this;
  self.torque_id = "";
  self.error_count = 0;
  self.QSTAT_ERROR_LIMIT = 500;
  self.results_fn = results_fn || "";
  self.qsub_params = params;

  self.states = {
    completed: "completed",
    exiting: "exiting",
    held: "held",
    queued: "queued",
    running: "running",
    transit: "transit",
    waiting: "waiting",
    suspended: "suspended"
  };

};

util.inherits(jobRunner, EventEmitter);

// Submits a job to TORQUE by spawning qsub_submit.sh
// Emit events
jobRunner.prototype.submit = function(params, cwd) {

  var self = this;
  self.qsub_params = params;

  var qsub = spawn("qsub", params, { cwd: cwd });

  logger.info("qsub", params);

  qsub.stderr.on("data", function(data) {
    logger.info(data.toString("utf8"));
  });

  qsub.stdout.on("data", function(data) {
    var torque_id = String(data).replace(/\n$/, "");
    self.torque_id = torque_id;
    self.emit("job created", { torque_id: torque_id });
  });

  qsub.on("close", function(code) {
    self.status_watcher();
  });

};

// Once the job has been scheduled, we need to watch the files that it
// sends updates to.
jobRunner.prototype.status_watcher = function() {

  var self = this;
  var job_status = new JobStatus(self.torque_id);

  self.metronome_id = job_status.watch(function(error, status_packet) {

    // Check if results file exists if there is an error
    if(error) {

      fs.stat(self.results_fn, (err, res) => {

        self.error_count += 1;

        if(!err) {

          if(res.size > 0) {
            clearInterval(self.metronome_id);
            self.emit(self.states.completed, "");
            return
          }

        }

        if(self.error_count > self.QSTAT_ERROR_LIMIT) {
          clearInterval(self.metronome_id);
          self.emit("script error", "");
          return
        }

      });

    }

    self.error_count = 0;

    if (
      status_packet.status == self.states.completed ||
      status_packet.status == self.states.exiting
    ) {
      clearInterval(self.metronome_id);
      self.emit(self.states.completed, "");
    } else if (status_packet.status == self.states.queued) {
      self.emit("job created", { torque_id: self.torque_id });
    } else {
      status_packet.torque_id = self.torque_id;
      self.emit("job metadata", status_packet);
      self.emit("status update", status_packet);
    }

  });

};

exports.resubscribe = resubscribe;
exports.cancel = cancel;
exports.jobRunner = jobRunner;

