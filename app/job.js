const spawn = require("child_process").spawn,
  fs = require("fs"),
  cs = require("../lib/clientsocket.js"),
  logger = require("../lib/logger.js").logger,
  jobdel = require("../lib/jobdel.js"),
  JobStatus = require(__dirname + "/../lib/jobstatus.js").JobStatus,
  EventEmitter = require("events").EventEmitter,
  config = require("../lib/config");

// Use the shared redis@5 client factory (see lib/redis-client.js). redis@5 is
// promise-native and camelCases commands (hgetall -> hGetAll, hset -> hSet).
const client = require("../lib/redis-client").client;

// resubscribes a socket to an existing pending job,
// otherwise reports contents from redis
// NOTE: resubscribe/cancel are invoked with `new` (see lib/routes/analysis-routes.js),
// so the outer function must NOT be `async` (`new` on an async function throws
// "not a constructor"). The async/await body runs in an inner IIFE instead.
const resubscribe = function(socket, id) {
  const self = this;
  self.id = id;
  (async function() {

    // redis@5 commands return promises; hGetAll resolves to the hash (an empty
    // object when the key is missing), so treat an empty object like the old
    // falsy `obj`.
    try {
      const obj = await client.hGetAll(self.id);

      if (!obj || Object.keys(obj).length === 0) {
        logger.warn(self.id + " : resubscribe : no job");
        socket.emit("script error", { error: "no job" });
        return;
      }

      // check job status
      const current_status = obj.status;
      logger.info(self.id + " : job : current status : " + obj.status);
      if (current_status != "completed" && current_status != "exiting") {
      // if job is still pending, resubscribe
        logger.warn(
          "info",
          self.id + " : job : resubscribe : job pending, resuming"
        );

        new cs.ClientSocket(socket, self.id);
      } else if (current_status == "completed") {
      // if job completed, emit results
        logger.info(self.id + " : job : resubscribe : job completed");
        const json_results = JSON.parse(obj.results);
        socket.emit("completed", json_results);
        socket.disconnect();
      } else {
      // if job aborted, emit error
        socket.emit("script error", obj.error);
      }
    } catch (err) {
      logger.warn(self.id + " : resubscribe : " + err);
      socket.emit("script error", { error: err.message });
    }
  })();
};

const cancel = function(socket, id) {
  const self = this;
  self.id = id;
  (async function() {

    try {
      const obj = await client.hGetAll(self.id);

      if (!obj || Object.keys(obj).length === 0) {
        logger.warn(self.id + " : cancel : no job");
        socket.emit("cancelled", { success: "no", error: "no job" });
        return;
      }

      // check job status
      const current_status = obj.status;
      let torque_id = "";

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
        // Without a torque id we cannot cancel; return so we don't fall
        // through to jobDelete("") and emit a second, contradictory
        // "cancelled" event. (The MCP cancel handler already returns here.)
        return;
      }

      if (current_status != "completed" && current_status != "exiting") {
      // if job is still pending, cancel
        logger.warn("info", self.id + " : job : cancel : cancelling job");

        jobdel.jobDelete(torque_id, function() {
          logger.warn("info", self.id + " : job : cancel : job cancelled");
          client.hSet(self.id, "status", "aborted");
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
    } catch (err) {
      logger.warn(self.id + " : cancel : " + err);
      socket.emit("cancelled", { success: "no", error: err.message });
    }
  })();
};

// Extracts the TORQUE job ID from the command output.
function get_torque_id_from_data(data) {
  return String(data).replace(/\n$/, "");
}

// Extracts the SLURM job ID from the command output.
function get_slurm_id_from_data(data) {
  const output = String(data).replace(/\n$/, "");
  console.log(`Parsing SLURM job ID from output: "${output}"`);

  // Standard format is "Submitted batch job 123456"
  const match = output.match(/Submitted batch job (\d+)/i);

  if (match && match[1]) {
    console.log(`Found SLURM job ID: ${match[1]}`);
    return match[1];
  }

  // Fallback to the old method
  const splitOutput = output.split(" ");
  console.log(`Falling back to split method with ${splitOutput.length} parts: ${JSON.stringify(splitOutput)}`);
  return splitOutput[3];
}

class jobRunner extends EventEmitter {
  constructor(params, results_fn) {
    super();
    const self = this;
    self.torque_id = "";
    self.error_count = 0;
    self.QSTAT_ERROR_LIMIT = 500;
    self.results_fn = results_fn || "";
    self.qsub_params = params;
    self.submit_type = config.submit_type || "qsub";

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
  }

  // Submits a job to the scheduler (TORQUE, SLURM, or local) by spawning a submission script.
  // Emit events
  submit(params, cwd) {
    const self = this;
    self.qsub_params = params;

    // Handle local execution
    if (self.submit_type === "local") {
    // For local execution, params[0] should be the script to execute
      const script = params[0];
      logger.info(`LOCAL EXECUTION: ${script}`);
      logger.info(`Working directory: ${cwd}`);
    
      return self.submit_local(script, params.slice(1), cwd);
    }

    const scheduler = self.submit_type === "qsub" ? "qsub" : "sbatch";
  
    // Create formatted command for logging
    const fullCommand = `${scheduler} ${params.join(" ")}`;
    logger.info(`[${scheduler.toUpperCase()} JOB] FULL COMMAND: ${fullCommand}`);
    logger.info(`[${scheduler.toUpperCase()} JOB] Job submission using ${scheduler} with params: ${JSON.stringify(params)}`);
    logger.info(`[${scheduler.toUpperCase()} JOB] Working directory: ${cwd}`);
  
    let qsub;
    try {
      console.log(`EXECUTING: ${fullCommand}`);
      qsub = spawn(scheduler, params, { cwd: cwd });
      logger.info(`${scheduler} process spawned successfully with pid: ${qsub.pid}`);
    } catch (error) {
      logger.error(`Error spawning ${scheduler} process: ${error.message}`);
      logger.error(error.stack);
      self.emit("script error", `Failed to spawn ${scheduler} process: ${error.message}`);
      return;
    }

    qsub.stderr.on("data", function(data) {
      const output = data.toString("utf8");
      logger.info(`${scheduler} stderr: ${output}`);
      console.log(`${scheduler} STDERR: ${output}`);
      if (output.includes("error") || output.includes("not found")) {
        logger.error(`${scheduler} error: ${output}`);
      }
    });

    qsub.stdout.on("data", function(data) {
      const output = data.toString("utf8");
      logger.info(`${scheduler} stdout: ${output}`);
      console.log(`${scheduler} STDOUT: ${output}`);
    
      try {
        const torque_id = self.submit_type === "qsub" 
          ? get_torque_id_from_data(data) 
          : get_slurm_id_from_data(data);
      
        logger.info(`Job ID extracted: ${torque_id}`);
        console.log(`Job ID extracted: ${torque_id}`);
        self.torque_id = torque_id;
        self.emit("job created", { torque_id: torque_id });
      } catch (error) {
        logger.error(`Error extracting job ID: ${error.message}`);
        logger.error(`Raw output was: ${output}`);
        console.log(`ERROR extracting job ID: ${error.message}, Raw output: ${output}`);
      }
    });

    qsub.on("close", function(code) {
      logger.info(`${scheduler} process closed with code: ${code}`);
      console.log(`${scheduler} process closed with code: ${code}`);
    
      if (code !== 0) {
        logger.error(`${scheduler} process exited with non-zero status: ${code}`);
        console.log(`ERROR: ${scheduler} process exited with non-zero status: ${code}`);
        // Still try to extract any error information
        self.emit("script error", `${scheduler} process failed with exit code: ${code}`);
      } else {
        logger.info(`Starting status watcher for job: ${self.torque_id}`);
        console.log(`Starting status watcher for job: ${self.torque_id}`);
        self.status_watcher();
      }
    });
  }

  // Local job submission - used when submit_type is 'local'
  submit_local(script, params, cwd) {
    const self = this;
  
    logger.info("[LOCAL JOB] Starting local job submission");
    logger.info(`[LOCAL JOB] Script: ${script}`);
    logger.info(`[LOCAL JOB] Params: ${JSON.stringify(params)}`);
    logger.info(`[LOCAL JOB] Working directory: ${cwd}`);
  
    // Log the full command that will be executed
    const fullCommand = `${script} ${params.join(" ")}`;
    logger.info(`[LOCAL JOB] FULL COMMAND: ${fullCommand}`);
  
    // Log environment variables that will be passed
    if (params.length > 0) {
      logger.info("[LOCAL JOB] Environment variables/arguments:");
      params.forEach((param, index) => {
        logger.info(`[LOCAL JOB]   [${index}]: ${param}`);
      });
    }
  
    try {
    // For local execution, pass params as command line arguments
      const proc = spawn(script, params, { cwd: cwd });
    
      // Store process reference for cancellation
      self.local_process = proc;
    
      // Use a unique job identifier for local runs
      // Wait for the process to be fully spawned before using pid
      process.nextTick(() => {
        self.torque_id = "local_" + Date.now() + "_" + (proc.pid || "nopid");
        self.emit("job created", { torque_id: self.torque_id });
      });
    
      proc.stderr.on("data", function(data) {
        const output = data.toString("utf8");
        logger.error(`[LOCAL JOB STDERR] ${output.trim()}`);
        // Emit status updates for stderr (can indicate progress)
        if (output.trim()) {
          self.emit("status update", { msg: output.trim() });
        }
      });
    
      proc.stdout.on("data", function(data) {
        const output = data.toString("utf8");
        logger.info(`[LOCAL JOB STDOUT] ${output.trim()}`);
        // Emit status updates for stdout
        if (output.trim()) {
          self.emit("status update", { msg: output.trim() });
        }
      });
    
      proc.on("error", function(error) {
        logger.error(`[LOCAL JOB ERROR] Failed to spawn process: ${error.message}`);
        logger.error(`[LOCAL JOB ERROR] Error details: ${JSON.stringify(error)}`);
        self.emit("script error", "Local execution failed: " + error.message);
      });
    
      proc.on("close", function(code) {
        logger.info(`[LOCAL JOB] Process completed with exit code: ${code}`);
        if (code === 0) {
          logger.info("[DEBUG JOB] Local job completed successfully, emitting completed event");
          self.emit(self.states.completed, "");
        } else {
          logger.error(`[LOCAL JOB] Job failed with exit code: ${code}`);
          self.emit("script error", "Local job failed with exit code: " + code);
        }
      });
    
    } catch (error) {
      logger.error(`[LOCAL JOB] Exception starting local job: ${error.message}`);
      logger.error(`[LOCAL JOB] Exception details: ${JSON.stringify(error)}`);
      self.emit("script error", "Failed to start local job: " + error.message);
    }
  }

  // SLURM job submission with specific parameters
  submit_slurm(script, cwd, slurm_params) {
    const self = this;
  
    logger.info("SLURM job submission", script, slurm_params);
  
    const sbatch = spawn("sbatch", slurm_params, { cwd: cwd });
  
    sbatch.stderr.on("data", function(data) {
      logger.info("SLURM stderr: " + data.toString("utf8"));
    });
  
    sbatch.stdout.on("data", function(data) {
      const job_id = get_slurm_id_from_data(data);
      self.torque_id = job_id;
      self.emit("job created", { torque_id: job_id });
    });
  
    sbatch.on("close", function(code) {
      self.status_watcher();
    });
  }

  // Once the job has been scheduled, we need to watch the files that it
  // sends updates to.
  status_watcher() {
    const self = this;
  
    // Don't create a job status watcher for local jobs
    if (self.submit_type === "local") {
      return;
    }
  
    logger.info(`Starting job status watcher for job ID: ${self.torque_id}`);
    const job_status = new JobStatus(self.torque_id);

    self.metronome_id = job_status.watch(function(error, status_packet) {
    // Log status updates for debugging
      if (status_packet) {
        logger.info(`Status update for job ${self.torque_id}: ${JSON.stringify(status_packet)}`);
      }
    
      // Check if results file exists if there is an error
      if (error) {
        logger.warn(`Status error for job ${self.torque_id}: ${error}`);
      
        // If a results file was specified, check if it exists and has content
        if (self.results_fn) {
          fs.stat(self.results_fn, (err, res) => {
            if (err) {
              logger.warn(`[DEBUG JOB] Error checking results file ${self.results_fn}: ${err.message}`);
            } else {
              logger.info(`[DEBUG JOB] Results file ${self.results_fn} exists with size ${res.size}`);
            }
          
            self.error_count += 1;

            if (!err && res.size > 0) {
              logger.info(`[DEBUG JOB] Job ${self.torque_id} completed based on results file (size: ${res.size})`);
              logger.info(`[DEBUG JOB] Emitting completed event for ${self.torque_id}`);
              clearInterval(self.metronome_id);
              self.emit(self.states.completed, "");
              return;
            }

            if (self.error_count > self.QSTAT_ERROR_LIMIT) {
              logger.error(`Job ${self.torque_id} exceeded error limit`);
              clearInterval(self.metronome_id);
              self.emit("script error", "");
              return;
            }
          });
        } else {
          self.error_count += 1;
        
          if (self.error_count > self.QSTAT_ERROR_LIMIT) {
            logger.error(`Job ${self.torque_id} exceeded error limit with no results file`);
            clearInterval(self.metronome_id);
            self.emit("script error", "");
            return;
          }
        }
      } else {
        self.error_count = 0;

        if (
          status_packet.status == self.states.completed ||
        status_packet.status == self.states.exiting
        ) {
          logger.info(`[DEBUG JOB] Job ${self.torque_id} completed with status: ${status_packet.status}`);
          logger.info(`[DEBUG JOB] Emitting completed event for SLURM job ${self.torque_id}`);
          clearInterval(self.metronome_id);
          self.emit(self.states.completed, "");
        } else if (status_packet.status == self.states.queued) {
          logger.info(`Job ${self.torque_id} is queued`);
        
          // Include more information in the job created event
          const jobInfo = { 
            torque_id: self.torque_id,
            status: status_packet.status,
            scheduler: self.submit_type === "qsub" ? "torque" : "slurm"
          };
        
          // Add any extra information from the status packet
          if (status_packet.raw_status) {
            jobInfo.raw_status = status_packet.raw_status;
          }
        
          if (status_packet.ctime) {
            jobInfo.ctime = status_packet.ctime;
          }
        
          self.emit("job created", jobInfo);
        } else {
          logger.info(`Job ${self.torque_id} status update: ${status_packet.status}`);
        
          // Ensure torque_id is included
          status_packet.torque_id = self.torque_id;
        
          // Add scheduler type
          status_packet.scheduler = self.submit_type === "qsub" ? "torque" : "slurm";
        
          // Emit the job metadata and status update events
          self.emit("job metadata", status_packet);
          self.emit("status update", status_packet);
        }
      }
    });
  }
}

exports.resubscribe = resubscribe;
exports.cancel = cancel;
exports.jobRunner = jobRunner;

