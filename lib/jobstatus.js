var config = require("../config.json"),
  spawn = require("child_process").spawn,
  _ = require("underscore"),
  moment = require("moment-timezone"),
  winston = require("winston");

winston.level = config.loglevel || "info";

var JobStatus = function(job_id) {

  var self = this;

  self.metronome = 0;
  self.job_id = job_id;
  self.status = "";

  self.valid_statuses = {
    C: "completed",
    E: "exiting",
    H: "held",
    Q: "queued",
    R: "running",
    T: "transit",
    W: "waiting",
    S: "suspended"
  };

};

// Define the status-returning function.
JobStatus.prototype.returnJobStatus = function(job_id, callback) {

  var self = this;
  self.callback = callback;
  self.job_id = job_id;
  self.status = "";
  self.error = "";

  var qstat = spawn("qstat", ["-f", self.job_id]);

  var status = {
    C: "completed",
    E: "exiting",
    H: "held",
    Q: "queued",
    R: "running",
    T: "transit",
    W: "waiting",
    S: "suspended"
  };

  // If the job exists, check and return its status. If it is complete, stop
  // the metronome.

  qstat.stdout.on("data", function(data) {

    var job_status = null;
    var job_ctime = null;
    var job_stime = null;

    data = String(data);

    // The job may not be completely submitted quite yet, so parsing could fail
    try {
      job_status = data.split("job_state = ")[1].split("\n")[0];
    } catch (e) {}

    try {
      job_ctime = data.split("ctime = ")[1].split("\n")[0];
      job_ctime = moment(job_ctime, "ddd MMM DD HH:mm:ss YYYY")
        .tz("America/Los_Angeles")
        .tz("GMT")
        .format();
    } catch (e) {}

    try {
      job_stime = data.split("start_time = ")[1].split("\n")[0];
      job_stime = moment(job_stime, "ddd MMM DD HH:mm:ss YYYY")
        .tz("America/Los_Angeles")
        .tz("GMT")
        .format();
    } catch (e) {}

    if (job_status in status) {
      self.status = status[job_status];
      callback(self.error, {
        status: self.status,
        ctime: job_ctime,
        stime: job_stime
      });

      if (self.status == status["C"] || self.status == status["E"]) {
        //clearInterval(self.metronome);
      }
    } else {
      self.error = "Unknown Status: " + job_status;
      callback(self.error, {
        status: self.status,
        ctime: job_ctime,
        stime: job_stime
      });
    }
  });

  // If the job doesn't exist, return that information and stop the metronome.
  // If some other error occurs, say so.
  qstat.stderr.on("data", function(data) {

    winston.info(self.job_id + " " + data);

    var doesnt_exist =
      data.toString().slice(0, 27) == "qstat: Unknown Job Id Error";

    if (doesnt_exist) {
      self.error = self.job_id + " no longer exists in the queue";
    } else {
      self.error = self.job_id + ": " + data;
    }

    self.callback(self.error, self.status);
  });

};

JobStatus.prototype.fullJobInfo = function(callback) {

  var self = this;

  self.callback = callback;

  var translateQstat = function(d) {
    var job = {};

    // iterate over each line
    var job_arr = d.toString().split("\n");
    _.each(job_arr, function(item) {
      var item_split = item.split("=");
      if (item_split.length == 2) {
        job[item_split[0].trim()] = item_split[1].trim();
      }
    });

    return job;
  };

  var qstat = spawn("qstat", ["-f", self.job_id]);

  qstat.stdout.on("data", function(data) {
    var job_status = translateQstat(data.toString());
    self.callback(self.error, job_status);
  });

  // If the job doesn't exist, return that information.
  // If some other error occurs, say so.
  qstat.stderr.on("data", function(data) {
    winston.info(self.job_id + " " + data);
    self.error = self.job_id + " no longer exists in the queue";
    self.callback(self.error, "");
  });

};

JobStatus.prototype.watch = function(callback) {

  var self = this;

  var metronome = new setInterval(
    self.returnJobStatus,
    5000,
    self.job_id,
    callback
  );

  return metronome;

};

exports.JobStatus = JobStatus;
