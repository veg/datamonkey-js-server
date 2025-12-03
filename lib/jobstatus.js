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

  logger.info(`Checking Torque job status for job ID: ${job_id}`);
  
  var qstat = {};

  if (validateJobId(job_id)) {
    logger.info(`Job ID ${job_id} is valid, spawning qstat -f command`);
    qstat = spawn("qstat", ["-f", self.job_id]);
  } else {
    self.error = job_id + " : invalid";
    logger.error(`Invalid job ID format: ${job_id}`);
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

  logger.info(`Checking SLURM job status for job ID: ${job_id}`);
  
  // First try with squeue for more accurate status for running jobs
  const checkWithSqueue = () => {
    const squeueParams = ["-j", self.job_id, "--format=%T", "--noheader"];
    logger.info(`SLURM squeue command: squeue ${squeueParams.join(' ')}`);
    
    const squeue = spawn("squeue", squeueParams);
    
    let squeueOutput = "";
    
    squeue.stdout.on("data", (data) => {
      squeueOutput += data.toString().trim();
    });
    
    squeue.on("close", (code) => {
      if (code !== 0 || !squeueOutput) {
        // If squeue fails or returns nothing, fall back to sacct
        logger.info(`squeue returned no data or error code ${code}, falling back to sacct`);
        checkWithSacct();
      } else {
        logger.info(`squeue returned job state: ${squeueOutput}`);
        
        // Parse the squeue output (should be just the state)
        const state = squeueOutput.trim();
        
        // Create a mapping of SLURM states to our status values
        const valid_statuses = {
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
        
        // Map squeue state to our status
        if (state in valid_statuses) {
          self.status = valid_statuses[state];
          callback(null, {
            status: self.status,
            ctime: new Date().toISOString(),
            stime: state === "RUNNING" ? new Date().toISOString() : null,
            raw_status: state,
            job_id: self.job_id,
            scheduler: "slurm"
          });
        } else {
          // Unknown status, fall back to sacct
          logger.warn(`Unknown squeue status: ${state}, falling back to sacct`);
          checkWithSacct();
        }
      }
    });
    
    squeue.on("error", (err) => {
      logger.error(`Error spawning squeue: ${err.message}`);
      checkWithSacct(); // Fall back to sacct
    });
  };
  
  // Fall back to sacct for historical data
  const checkWithSacct = () => {
    if (!validateJobId(job_id)) {
      self.error = job_id + " : invalid";
      logger.error(`Invalid job ID format: ${job_id}`);
      callback(self.error, "");
      return;
    }
    
    const sacctParams = ["-j", self.job_id, "--format=Submit,Start,State,JobID", "--parsable2", "--noheader"];
    logger.info(`SLURM sacct command: sacct ${sacctParams.join(' ')}`);
    
    const sacct = spawn("sacct", sacctParams);
    
    let sacctOutput = "";
    
    sacct.stdout.on("data", function(data) {
      sacctOutput += data.toString();
    });
    
    sacct.on("close", function(code) {
      logger.info(`sacct process exited with code ${code}`);
      
      if (code !== 0 || !sacctOutput.trim()) {
        // If sacct failed or returned nothing, report job as queued
        logger.warn(`sacct command failed or returned no data, assuming job is queued`);
        callback(null, {
          status: "queued",
          ctime: new Date().toISOString(),
          stime: null,
          raw_status: "UNKNOWN",
          job_id: self.job_id,
          scheduler: "slurm"
        });
        return;
      }
      
      try {
        // Process the sacct output
        logger.info(`Raw sacct output: "${sacctOutput}"`);
        
        // Parse sacct output (pipe-delimited)
        const lines = sacctOutput.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
          // No output lines, assume job is queued
          logger.warn(`No output lines from sacct, assuming job is queued`);
          callback(null, {
            status: "queued",
            ctime: new Date().toISOString(),
            stime: null,
            raw_status: "PENDING",
            job_id: self.job_id,
            scheduler: "slurm"
          });
          return;
        }
        
        // Get the main job line (first line should be the main job)
        const items = lines[0].split('|');
        logger.info(`Parsed sacct items: ${JSON.stringify(items)}`);
        
        // Format: Submit|Start|State|JobID
        if (items.length < 3) {
          logger.warn(`Unexpected sacct output format: ${items}`);
          callback(null, {
            status: "queued",
            ctime: new Date().toISOString(),
            stime: null,
            raw_status: "UNKNOWN",
            job_id: self.job_id,
            scheduler: "slurm"
          });
          return;
        }
        
        // Extract job status, creation time, and start time
        const job_ctime = items[0] ? items[0].trim() : '';
        const job_stime = items[1] ? items[1].trim() : '';
        const job_status = items[2] ? items[2].trim() : '';
        
        // Format timestamps
        let formatted_ctime = job_ctime;
        let formatted_stime = job_stime;
        
        if (job_ctime && job_ctime !== 'Unknown') {
          try {
            formatted_ctime = moment(job_ctime).format();
          } catch (e) {
            logger.warn(`Error parsing creation time: ${job_ctime}`);
            formatted_ctime = new Date().toISOString();
          }
        } else {
          formatted_ctime = new Date().toISOString();
        }
        
        if (job_stime && job_stime !== 'Unknown') {
          try {
            formatted_stime = moment(job_stime).format();
          } catch (e) {
            logger.warn(`Error parsing start time: ${job_stime}`);
            formatted_stime = null;
          }
        } else {
          formatted_stime = null;
        }
        
        // Create a mapping of SLURM states to our status values if needed
        const valid_statuses = {
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
        
        // Map SLURM status to our status
        if (job_status && job_status in valid_statuses) {
          self.status = valid_statuses[job_status];
          callback(null, {
            status: self.status,
            ctime: formatted_ctime,
            stime: formatted_stime,
            raw_status: job_status,
            job_id: self.job_id,
            scheduler: "slurm"
          });
        } else {
          // Unknown status
          logger.warn(`Unknown SLURM job status: ${job_status}`);
          callback(null, {
            status: "queued", // Default to queued for unknown status
            ctime: formatted_ctime,
            stime: formatted_stime,
            raw_status: job_status || "UNKNOWN",
            job_id: self.job_id,
            scheduler: "slurm"
          });
        }
      } catch (e) {
        logger.error(`Error parsing sacct output: ${e.message}`);
        logger.error(`Stack trace: ${e.stack}`);
        logger.error(`Raw data: "${sacctOutput}"`);
        
        // Default to queued with basic info if we can't parse
        callback(null, {
          status: "queued",
          ctime: new Date().toISOString(),
          stime: null,
          raw_status: "UNKNOWN",
          job_id: self.job_id,
          scheduler: "slurm"
        });
      }
    });
    
    sacct.stderr.on("data", function(data) {
      const errorMsg = data.toString();
      logger.warn(`sacct stderr for job ${self.job_id}: ${errorMsg}`);
      
      // If job not found in accounting database yet, it might be very new
      if (errorMsg.includes("error: Job(s) not found")) {
        callback(null, {
          status: "queued",
          ctime: new Date().toISOString(),
          stime: null,
          raw_status: "PENDING",
          job_id: self.job_id,
          scheduler: "slurm"
        });
      }
    });
    
    sacct.on("error", function(err) {
      logger.error(`Error running sacct: ${err.message}`);
      callback(null, {
        status: "queued",
        ctime: new Date().toISOString(),
        stime: null,
        raw_status: "UNKNOWN",
        job_id: self.job_id,
        scheduler: "slurm"
      });
    });
  };
  
  // Start with squeue for current jobs
  checkWithSqueue();
};

SlurmJobStatus.prototype.fullJobInfo = function(callback) {
  var self = this;
  self.callback = callback;

  // First try scontrol for running and pending jobs
  const scontrol = spawn("scontrol", ["show", "job", self.job_id]);
  
  let scontrolOutput = "";
  
  scontrol.stdout.on("data", function(data) {
    scontrolOutput += data.toString();
  });
  
  scontrol.on("close", function(code) {
    if (code !== 0 || !scontrolOutput.trim() || scontrolOutput.includes("Invalid job id specified")) {
      // If scontrol fails, fall back to sacct for historical jobs
      fallbackToSacct();
    } else {
      // Process scontrol output
      try {
        logger.info(`Raw scontrol output: "${scontrolOutput}"`);
        
        // Parse scontrol output into an object
        const job_info = {};
        const lines = scontrolOutput.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const pairs = line.trim().split(' ');
          
          for (const pair of pairs) {
            if (pair.includes('=')) {
              const [key, value] = pair.split('=');
              if (key && value !== undefined) {
                job_info[key.toLowerCase()] = value;
              }
            }
          }
        }
        
        // Add scheduler type
        job_info.scheduler = "slurm";
        
        // Map SLURM state to our status
        const valid_statuses = {
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
        
        if (job_info.jobstate && job_info.jobstate in valid_statuses) {
          job_info.status = valid_statuses[job_info.jobstate];
        } else {
          job_info.status = "queued"; // Default
        }
        
        self.callback(null, job_info);
      } catch (e) {
        logger.error(`Error parsing scontrol output: ${e.message}`);
        fallbackToSacct();
      }
    }
  });
  
  scontrol.on("error", function(err) {
    logger.error(`Error spawning scontrol: ${err.message}`);
    fallbackToSacct();
  });
  
  // Fallback to sacct for historical jobs
  const fallbackToSacct = function() {
    logger.info(`Falling back to sacct for job ${self.job_id}`);
    const sacct = spawn("sacct", ["--parsable2", "-j", self.job_id, "--format=ALL"]);
    
    let sacctOutput = "";
    
    sacct.stdout.on("data", function(data) {
      sacctOutput += data.toString();
    });
    
    sacct.on("close", function(code) {
      if (code !== 0 || !sacctOutput.trim()) {
        logger.warn(`sacct command failed or returned no data for job ${self.job_id}`);
        self.callback(null, {
          status: "unknown",
          job_id: self.job_id,
          scheduler: "slurm"
        });
        return;
      }
      
      try {
        // Process the sacct output
        logger.info(`Raw sacct output (first 200 chars): "${sacctOutput.substring(0, 200)}..."`);
        
        const lines = sacctOutput.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          self.callback(null, {
            status: "unknown",
            job_id: self.job_id,
            scheduler: "slurm"
          });
          return;
        }
        
        // Convert headers to lowercase for consistency
        const camelToSnake = (str) => str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        
        const keys = lines[0].split('|').map(camelToSnake);
        const values = lines[1].split('|');
        
        // Combine into object
        const job_info = {};
        for (let i = 0; i < Math.min(keys.length, values.length); i++) {
          job_info[keys[i]] = values[i];
        }
        
        // Add scheduler type
        job_info.scheduler = "slurm";
        
        // Map SLURM state to our status if state is available
        const valid_statuses = {
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
        
        if (job_info.state && job_info.state in valid_statuses) {
          job_info.status = valid_statuses[job_info.state];
        } else {
          job_info.status = "unknown"; // Default for historical jobs
        }
        
        // Parse exit code if available
        if (job_info.exitcode && job_info.exitcode.includes(':')) {
          job_info.exit_status = parseInt(job_info.exitcode.split(':')[0]);
        }
        
        self.callback(null, job_info);
      } catch (e) {
        logger.error(`Error parsing sacct output: ${e.message}`);
        self.callback(null, {
          status: "unknown",
          job_id: self.job_id,
          scheduler: "slurm",
          error: e.message
        });
      }
    });
    
    sacct.stderr.on("data", function(data) {
      const errorMsg = data.toString();
      logger.warn(`sacct stderr for job ${self.job_id}: ${errorMsg}`);
      
      // If job not found, return basic info
      if (errorMsg.includes("error: Job(s) not found")) {
        self.callback(null, {
          status: "unknown",
          job_id: self.job_id,
          scheduler: "slurm",
          error: "Job not found in SLURM accounting"
        });
      }
    });
    
    sacct.on("error", function(err) {
      logger.error(`Error spawning sacct: ${err.message}`);
      self.callback(null, {
        status: "unknown",
        job_id: self.job_id,
        scheduler: "slurm",
        error: err.message
      });
    });
  };
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

/**
 * LocalJobStatus class for local job execution
 */
var LocalJobStatus = function(job_id) {
  var self = this;
  
  self.metronome = 0;
  self.job_id = job_id;
  self.status = "";
  
  // For local jobs, we don't need complex status tracking
  // since the job events are handled directly in the job runner
};

LocalJobStatus.prototype.returnJobStatus = function(job_id, callback) {
  var self = this;
  
  // For local jobs, we just return a running status
  // The actual completion is handled by the job runner itself
  logger.info(`Local job status check for: ${job_id}`);
  
  // Check if process is still running by trying to get its status
  if (job_id.startsWith("local_")) {
    const parts = job_id.split("_");
    if (parts.length >= 3) {
      const pidStr = parts[2];
      
      if (pidStr === "nopid") {
        // If no pid is available, assume job is running
        // The job runner will emit completion events
        callback("", { status: "running", msg: "Local job is running (no pid)" });
        return;
      }
      
      const pid = parseInt(pidStr);
      
      if (pid && !isNaN(pid)) {
        try {
          // Check if process exists (will throw if not)
          process.kill(pid, 0);
          // Process exists, return running status
          callback("", { status: "running", msg: "Local job is running" });
        } catch (error) {
          // Process doesn't exist, it has completed or failed
          callback("", { status: "completed", msg: "Local job completed" });
        }
      } else {
        callback("Invalid local job ID format", "");
      }
    } else {
      callback("Invalid local job ID format", "");
    }
  } else {
    callback("Invalid local job ID", "");
  }
};

LocalJobStatus.prototype.watch = function(callback) {
  var self = this;
  
  // For local jobs, we can check less frequently since
  // completion is handled by direct events
  var metronome = new setInterval(
    self.returnJobStatus,
    10000, // Check every 10 seconds instead of 5
    self.job_id,
    callback
  );
  
  return metronome;
};

// Choose the appropriate JobStatus class based on config.submit_type
logger.info(`Current submit_type is: ${config.submit_type}`);

var JobStatus;
if (config.submit_type === "qsub") {
  JobStatus = QsubJobStatus;
  logger.info("Using QsubJobStatus class");
} else if (config.submit_type === "local") {
  JobStatus = LocalJobStatus;
  logger.info("Using LocalJobStatus class");
} else {
  JobStatus = SlurmJobStatus; // default to slurm
  logger.info("Using SlurmJobStatus class");
}

exports.JobStatus = JobStatus;
