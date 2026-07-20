const exec = require("child_process").exec,
  dateFns = require("date-fns"),
  spawn = require("child_process").spawn,
  logger = require("./logger").logger,
  client = require("./redis-client").client,
  config = require("./config");

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
    qstat.stdout.on("data", async function(data) {
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

      // redis@5 hGetAll returns a promise; on failure fall back to `{}` so the
      // single shared reporting body below runs with the null type/sites/
      // sequences defaults (matches the old duplicated .catch branch).
      const obj = await client.hGetAll(job_id).catch(function(err) {
        logger.warn("redis hGetAll failed for " + job_id + ": " + err.message);
        return {};
      });

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
  exec("qstat", async function(error, stdout, stderr) {
    if (error || !stdout || stderr) {
      logger.warn("Error executing qstat: " + (error ? error.message : stderr));
      callback([]);
      return;
    }

    var data = stdout;
    var job_data = data.toString().split("\n");

    if (job_data.length <= 2) {
      // No jobs in the queue
      callback([]);
      return;
    }

    // qstat output has a 2-line header and a trailing blank line; the job rows
    // are lines [2 .. length-2] (== length-3 rows), matching the old loop.
    var ids = job_data.slice(2, job_data.length - 1).map(line => line.split(" ")[0]);

    var jobs = (await Promise.all(
      ids.map(id => jobInfoPromise(returnQsubJobInfo, id))
    )).filter(data => Object.keys(data).length > 0);

    callback(jobs);
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
    sacct.stdout.on("data", async function(data) {
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

      // redis@5 hGetAll returns a promise; on failure fall back to `{}` so the
      // single shared reporting body below keeps type/sites/sequences null
      // (matches the old duplicated .catch branch).
      const obj = await client.hGetAll(job_id).catch(function(err) {
        logger.warn("redis hGetAll failed for " + job_id + ": " + err.message);
        return {};
      });

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

// Promisify a callback-based `return*JobInfo` function: resolves with the job
// info object on the first callback invocation. This matches the old
// counter-based fan-out, which advanced its completion counter once per job's
// first callback and then invoked `callback` once the counter reached the job
// count.
function jobInfoPromise(fn, job_id) {
  return new Promise(function(resolve) {
    var settled = false;
    fn(job_id, function(data) {
      if (settled) return;
      settled = true;
      resolve(data);
    });
  });
}

function SlurmJobQueue(callback) {
  exec("squeue --format='%i %j %u %T %M %l %D %R' --noheader", async function(error, stdout, stderr) {
    if (error || !stdout) {
      logger.warn("Error executing squeue: " + (error ? error.message : stderr));
      callback([]);
      return;
    }

    var job_data = stdout.toString().split("\n").filter(line => line.trim() !== "");

    if (job_data.length === 0) {
      // No jobs in the queue
      callback([]);
      return;
    }

    var ids = job_data.map(line => line.trim().split(/\s+/)[0]);

    // Fan out over all job ids concurrently, then keep only the non-empty
    // results (an empty object means the job could not be resolved). Preserves
    // the old behavior: push non-empty job info, invoke `callback` once when
    // every job has reported.
    var jobs = (await Promise.all(
      ids.map(id => jobInfoPromise(returnSlurmJobInfo, id))
    )).filter(data => Object.keys(data).length > 0);

    callback(jobs);
  });
}

// Select the appropriate job queue function based on configuration
const JobQueue = config.submit_type === "qsub" ? QsubJobQueue : SlurmJobQueue;

exports.JobQueue = JobQueue;
