const spawn = require("child_process").spawn,
  _ = require("underscore"),
  moment = require("moment-timezone"),
  logger = require("./logger").logger,
  config = require("../config.json");

// Validate that the job_id contains only alphanumeric characters, dots, and underscores
function validateJobId(job_id) {
  return /^[\w\.]+$/.test(job_id);
}

/**
 * QsubJobStatus class for Torque job scheduler
 */
var QsubJobStatus = function(job_id) {
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

// Define the status-returning function for Torque jobs
QsubJobStatus.prototype.returnJobStatus = function(job_id, callback) {
  var self = this;
  self.callback = callback;
  self.job_id = job_id;
  self.status = "";
  self.error = "";

  var qstat = {};

  if (validateJobId(job_id)) {
    qstat = spawn("qstat", ["-f", self.job_id]);
  } else {
    self.error = job_id + " : invalid";
    callback(self.error, "");
    return;
  }

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

  qstat.on("error", function(err) {
    self.error = "Error spawning qstat: " + err.message;
    callback(self.error, self.status);
  });

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
    logger.info(self.job_id + " " + data);

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

QsubJobStatus.prototype.fullJobInfo = function(callback) {
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

  var qstat = {};
  
  if (validateJobId(self.job_id)) {
    qstat = spawn("qstat", ["-f", self.job_id]);
  } else {
    self.error = self.job_id + " : invalid";
    callback(self.error, "");
    return;
  }

  qstat.on("error", function(err) {
    self.error = "Error spawning qstat: " + err.message;
    callback(self.error, self.status);
  });

  qstat.stdout.on("data", function(data) {
    var job_status = translateQstat(data.toString());
    self.callback(self.error, job_status);
  });

  qstat.stderr.on("data", function(data) {
    logger.info(self.job_id + " " + data);
    self.error = self.job_id + " no longer exists in the queue";
    self.callback(self.error, "");
  });
};

QsubJobStatus.prototype.watch = function(callback) {
  var self = this;

  var metronome = new setInterval(
    self.returnJobStatus,
    5000,
    self.job_id,
    callback
  );

  return metronome;
};

/**
 * SlurmJobStatus class for Slurm job scheduler
 */
var SlurmJobStatus = function(job_id) {
  var self = this;

  self.metronome = 0;
  self.job_id = job_id;
  self.status = "";

  self.valid_statuses = {
    "BOOT_FAIL": "completed",
    "CANCELLED": "completed",
    "COMPLETED": "completed",
    "DEADLINE": "completed",
    "FAILED": "completed",
    "NODE_FAIL": "completed",
    "OUT_OF_MEMORY": "completed",
    "PENDING": "queued",
    "PREEMPTED": "exiting",
    "RUNNING": "running",
    "REQUEUED": "queued",
    "RESIZING": "queued",
    "REVOKED": "exiting",
    "SUSPENDED": "queued",
    "TIMEOUT": "completed"
  };
};

// Define the status-returning function for Slurm jobs
SlurmJobStatus.prototype.returnJobStatus = function(job_id, callback) {
  var self = this;
  self.callback = callback;
  self.job_id = job_id;
  self.status = "";
  self.error = "";

  var sacct = {};

  if (validateJobId(job_id)) {
    sacct = spawn("sacct", ["-j", self.job_id, "-o", "submit,start,state", "-P"]);
  } else {
    self.error = job_id + " : invalid";
    callback(self.error, "");
    return;
  }

  var status = self.valid_statuses;

  sacct.on("error", function(err) {
    self.error = "Error spawning sacct: " + err.message;
    callback(self.error, self.status);
  });

  sacct.stdout.on("data", function(data) {
    var job_status = null;
    var job_ctime = null;
    var job_stime = null;

    data = data.toString();
    
    try {
      // Skip the header line and get the last line
      let items = _.chain(data).split('\n').filter().last().value().split('|');
      
      // Extract job status, creation time, and start time
      job_status = items[2];
      job_ctime = items[0];
      job_ctime = moment(job_ctime).tz('America/Los_Angeles').tz('GMT').format();
      job_stime = items[1];
      job_stime = moment(job_stime).tz('America/Los_Angeles').tz('GMT').format();
    } catch (e) {
      logger.warn("Error parsing sacct output: " + e);
    }

    if (job_status in status) {
      self.status = status[job_status];
      callback(self.error, {
        status: self.status,
        ctime: job_ctime,
        stime: job_stime
      });
    } else {
      self.error = "Unknown Status: " + job_status;
      callback(self.error, {
        status: self.status,
        ctime: job_ctime,
        stime: job_stime
      });
    }
  });

  sacct.stderr.on("data", function(data) {
    logger.info(self.job_id + " " + data);

    var doesnt_exist = data.toString().includes("error: Job(s) not found");

    if (doesnt_exist) {
      self.error = self.job_id + " no longer exists in the queue";
    } else {
      self.error = self.job_id + ": " + data;
    }

    self.callback(self.error, self.status);
  });
};

SlurmJobStatus.prototype.fullJobInfo = function(callback) {
  var self = this;
  self.callback = callback;

  var sacct = spawn("sacct", ["--parsable", "-j", self.job_id]);

  sacct.on("error", function(err) {
    self.error = "Error spawning sacct: " + err.message;
    callback(self.error, self.status);
  });

  sacct.stdout.on("data", function(data) {
    const lines = data.toString().split('\n');
    
    if (lines.length < 2) {
      self.error = "Invalid sacct output format";
      self.callback(self.error, {});
      return;
    }
    
    // Convert camelCase keys to snake_case
    const camelToSnake = (str) => str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    
    const keys = lines[0].split('|').map(camelToSnake);
    const values = lines[1].split('|');
    const job_status = _.zipObject(keys, values);
    
    // Parse exit code if available
    if (job_status.exit_code && job_status.exit_code.includes(':')) {
      job_status.exit_status = parseInt(job_status.exit_code.split(':')[0]);
    }
    
    self.callback(self.error, job_status);
  });

  sacct.stderr.on("data", function(data) {
    logger.info(self.job_id + " " + data);
    self.error = self.job_id + " sacct error: " + data;
    self.callback(self.error, {});
  });
};

SlurmJobStatus.prototype.watch = function(callback) {
  var self = this;

  var metronome = new setInterval(
    self.returnJobStatus,
    5000,
    self.job_id,
    callback
  );

  return metronome;
};

// Choose the appropriate JobStatus class based on config.submit_type
const JobStatus = config.submit_type === "qsub" ? QsubJobStatus : SlurmJobStatus;

exports.JobStatus = JobStatus;
