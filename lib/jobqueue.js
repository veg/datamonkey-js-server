const exec = require("child_process").exec,
  moment = require("moment-timezone"),
  redis = require("redis"),
  spawn = require("child_process").spawn,
  logger = require("./logger").logger,
  config = require("../config.json");

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Validate that the job_id contains only alphanumeric characters, dots, and underscores
function validateJobId(job_id) {
  return /^[\w\.]+$/.test(job_id);
}

/**
 * Functions for Torque job scheduler (qsub)
 */
function returnQsubJobInfo(job_id, callback) {
  // Declare some variables, including the child process.
  if (!validateJobId(job_id)) {
    logger.warn(job_id + " : invalid job ID format");
    callback({});
    return;
  }
  
  var qstat = spawn("qstat", ["-f", "-1", job_id]);

  var status = {
    C: "Completed",
    E: "Exiting",
    H: "Held",
    Q: "Queued",
    R: "Running",
    T: "Transit",
    W: "Waiting",
    S: "Suspended"
  };

  // Extract job status, creation time, and running time from qstat's output.
  try {
    qstat.stdout.on("data", function(data) {
      var job_data = data.toString(),
        job_state = null,
        job_ctime = null,
        job_stime = null,
        type = null,
        sites = null,
        sequences = null;
  
      try {
        job_state = job_data.split("job_state = ")[1].split("\n")[0];
  
        job_ctime = job_data.split("ctime = ")[1].split("\n")[0];
        job_ctime = moment(job_ctime, "ddd MMM DD HH:mm:ss YYYY")
          .tz("America/Los_Angeles")
          .tz("GMT")
          .format();
      } catch (e) { logger.info("no job_state or job_ctime available"); }
  
      try {
        job_stime = job_data.split("start_time = ")[1].split("\n")[0];
        job_stime = moment(job_stime, "ddd MMM DD HH:mm:ss YYYY")
          .tz("America/Los_Angeles")
          .tz("GMT")
          .format();
      } catch (e) { }
      
      client.hgetall(job_id, function(err, obj) {
        if (obj) {
          type = obj.type;
          sites = obj.sites;
          sequences = obj.sequences;
        }
  
        // Report the collected information.
        callback({
          id: job_id,
          status: status[job_state],
          creation_time: job_ctime,
          start_time: job_stime,
          type: type,
          sites: sites,
          sequences: sequences
        });
      });
    });
  } catch (e) { 
    logger.warn("Error in returnQsubJobInfo: " + e.message);
    callback({});
  }

  qstat.stderr.on("data", function(data) {
    logger.warn("qstat stderr: " + data);
    callback({});
  });
  
  qstat.on("error", function(err) {
    logger.warn("qstat error: " + err.message);
    callback({});
  });
}

function QsubJobQueue(callback) {
  // Declare some variables, including the child process.
  exec("qstat", function(error, stdout, stderr) {
    if (error || !stdout || stderr) {
      logger.warn("Error executing qstat: " + (error ? error.message : stderr));
      callback([]);
      return;
    }

    var data = stdout;
    var job_data = data.toString().split("\n");
    var jobs = [];

    if (job_data.length <= 2) {
      // No jobs in the queue
      callback([]);
      return;
    }

    for (var i = 2; i < job_data.length - 1; i++) {
      var job_id = job_data[i].split(" ")[0];
      returnQsubJobInfo(job_id, function(data) {
        if (Object.keys(data).length > 0) {
          jobs.push(data);
        }
        
        if (jobs.length == job_data.length - 3) {
          callback(jobs);
          return;
        }
      });
    }
  });
}

/**
 * Functions for SLURM job scheduler (sbatch)
 */
function returnSlurmJobInfo(job_id, callback) {
  if (!validateJobId(job_id)) {
    logger.warn(job_id + " : invalid job ID format");
    callback({});
    return;
  }
  
  var sacct = spawn("sacct", ["-j", job_id, "-o", "JobID,Submit,Start,State", "-P"]);
  
  var slurmStatus = {
    "BOOT_FAIL": "Failed",
    "CANCELLED": "Cancelled",
    "COMPLETED": "Completed",
    "DEADLINE": "Failed",
    "FAILED": "Failed",
    "NODE_FAIL": "Failed",
    "OUT_OF_MEMORY": "Failed",
    "PENDING": "Queued",
    "PREEMPTED": "Exiting",
    "RUNNING": "Running",
    "REQUEUED": "Queued",
    "RESIZING": "Queued",
    "REVOKED": "Exiting",
    "SUSPENDED": "Queued",
    "TIMEOUT": "Failed"
  };
  
  try {
    sacct.stdout.on("data", function(data) {
      var lines = data.toString().split("\n").filter(line => line.trim() !== "");
      
      if (lines.length < 2) {
        logger.warn("Invalid sacct output format for job " + job_id);
        callback({});
        return;
      }
      
      // Skip the header line and get the job data line
      var job_fields = lines[1].split("|");
      
      if (job_fields.length < 4) {
        logger.warn("Invalid sacct output field count for job " + job_id);
        callback({});
        return;
      }
      
      var job_state = job_fields[3];
      var job_ctime = (job_fields[1] && job_fields[1] !== 'Unknown') ? moment(job_fields[1]).format() : null;
      var job_stime = (job_fields[2] && job_fields[2] !== 'Unknown') ? moment(job_fields[2]).format() : null;
      
      client.hgetall(job_id, function(err, obj) {
        var type = null, sites = null, sequences = null;
        
        if (obj) {
          type = obj.type;
          sites = obj.sites;
          sequences = obj.sequences;
        }
        
        callback({
          id: job_id,
          status: slurmStatus[job_state] || "Unknown",
          creation_time: job_ctime,
          start_time: job_stime,
          type: type,
          sites: sites,
          sequences: sequences
        });
      });
    });
  } catch (e) {
    logger.warn("Error in returnSlurmJobInfo: " + e.message);
    callback({});
  }
  
  sacct.stderr.on("data", function(data) {
    logger.warn("sacct stderr: " + data);
    callback({});
  });
  
  sacct.on("error", function(err) {
    logger.warn("sacct error: " + err.message);
    callback({});
  });
}

function SlurmJobQueue(callback) {
  exec("squeue --format='%i %j %u %T %M %l %D %R' --noheader", function(error, stdout, stderr) {
    if (error || !stdout) {
      logger.warn("Error executing squeue: " + (error ? error.message : stderr));
      callback([]);
      return;
    }

    var job_data = stdout.toString().split("\n").filter(line => line.trim() !== "");
    var jobs = [];

    if (job_data.length === 0) {
      // No jobs in the queue
      callback([]);
      return;
    }

    var completed_count = 0;

    for (var i = 0; i < job_data.length; i++) {
      var job_id = job_data[i].trim().split(/\s+/)[0];

      returnSlurmJobInfo(job_id, function(data) {
        completed_count++;

        // Only include jobs that have a type (i.e., datamonkey jobs in Redis)
        if (Object.keys(data).length > 0 && data.type) {
          jobs.push(data);
        }

        if (completed_count >= job_data.length) {
          callback(jobs);
          return;
        }
      });
    }
  });
}

// Select the appropriate job queue function based on configuration
const JobQueue = config.submit_type === "qsub" ? QsubJobQueue : SlurmJobQueue;

exports.JobQueue = JobQueue;
