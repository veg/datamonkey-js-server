const exec = require("child_process").exec,
  dateFns = require("date-fns"),
  spawn = require("child_process").spawn,
  logger = require("./logger").logger,
  client = require("./redis-client").client,
  config = require("../config.json");

/**
 * Parse a Torque qstat ctime/start_time string ("ddd MMM DD HH:mm:ss YYYY",
 * e.g. "Wed Jul 16 14:23:45 2025") and return it as a GMT ISO-8601 string with
 * no fractional seconds (e.g. "2025-07-16T18:23:45Z").
 *
 * This reproduces the previous moment-timezone chain exactly:
 *   moment(str, "ddd MMM DD HH:mm:ss YYYY").tz("America/Los_Angeles").tz("GMT").format()
 * The string is parsed in the machine's local time zone (moment's default when
 * no zone token is present); `.tz(...)` only changes the *display* zone, so the
 * final value is that same instant rendered in GMT. date-fns `parse` likewise
 * yields a local-zone Date, and `toISOString()` renders it in UTC (== GMT);
 * we strip the ".000" milliseconds to match moment's `.format()` output.
 */
function parseQstatTimeToGmt(str) {
  const d = dateFns.parse(str, "EEE MMM dd HH:mm:ss yyyy", new Date());
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Format a sacct Submit/Start timestamp the way the old code did with
 * `moment(x).format()` (no format token): parse the ISO-ish string in the
 * machine's local zone and render it in ISO-8601 with the local UTC offset and
 * no fractional seconds (e.g. "2025-07-16T14:23:45-04:00"). date-fns
 * `formatISO(new Date(x))` produces byte-for-byte the same output.
 */
function formatSacctTime(str) {
  return dateFns.formatISO(new Date(str));
}

// Validate that the job_id contains only alphanumeric characters, dots, and underscores
function validateJobId(job_id) {
  return /^[\w.]+$/.test(job_id);
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
        job_ctime = parseQstatTimeToGmt(job_ctime);
      } catch (e) { logger.info("no job_state or job_ctime available"); }

      try {
        job_stime = job_data.split("start_time = ")[1].split("\n")[0];
        job_stime = parseQstatTimeToGmt(job_stime);
      } catch (e) { }

      client.hGetAll(job_id).then(function(obj) {
        if (obj && Object.keys(obj).length) {
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
      }).catch(function(err) {
        logger.warn("redis hGetAll failed for " + job_id + ": " + err.message);
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
      var job_ctime = job_fields[1] ? formatSacctTime(job_fields[1]) : null;
      var job_stime = job_fields[2] ? formatSacctTime(job_fields[2]) : null;

      client.hGetAll(job_id).then(function(obj) {
        var type = null, sites = null, sequences = null;

        if (obj && Object.keys(obj).length) {
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
      }).catch(function(err) {
        logger.warn("redis hGetAll failed for " + job_id + ": " + err.message);
        callback({
          id: job_id,
          status: slurmStatus[job_state] || "Unknown",
          creation_time: job_ctime,
          start_time: job_stime,
          type: null,
          sites: null,
          sequences: null
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
        
        if (Object.keys(data).length > 0) {
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
