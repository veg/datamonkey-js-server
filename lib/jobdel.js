const spawn = require("child_process").spawn,
  redisClient = require("./redis-client"),
  client = redisClient.client,
  expireTerminal = redisClient.expireTerminal,
  logger = require("./logger").logger,
  config = require("./config");

// Validate that the torque_id contains only alphanumeric characters, dots, and underscores
function validateTorqueId(torque_id) {
  return /^[\w.]+$/.test(torque_id);
}

// Mark the scheduler-id hash cancelled and expire it (#453). This hash is the
// torque_id/slurm-id reverse-lookup key created at job submission; a scheduler
// cancel here does NOT route through hyphyjob.onError, so without a TTL these
// cancelled hashes would linger forever. We expire the scheduler-id key only —
// active_jobs holds datamonkey ids (not scheduler ids), and the datamonkey-id
// side is removed by the caller (job.js / mcp tools.js), so there is nothing to
// LREM with the id in scope here.
function markCancelled(torque_id) {
  return client
    .hSet(torque_id, "status", "cancelled")
    .then(function () {
      return expireTerminal(torque_id);
    })
    .catch(function (err) {
      logger.error(torque_id + " : redis hSet failed: " + err.message);
    });
}

// Delete job handler for TORQUE (qsub)
function qsubJobDelete(torque_id, cb) {
  logger.info("job delete (qsub): " + torque_id);
  let qdel = {};

  // verify torque_id
  if (validateTorqueId(torque_id)) {
    qdel = spawn("qdel", [torque_id]);
  } else {
    logger.warn(torque_id + ":  invalid");
    cb(torque_id + " : error : could not remove from queue", 1);
    return;
  }

  qdel.on("close", function(code) {
    logger.warn(torque_id + " : " + code);

    if (code === 0) {
      logger.warn(torque_id + " : removed from queue");
      markCancelled(torque_id);
      // allow time for torque to write to stdout
      setTimeout(cb, 1000, "", code);
    } else {
      logger.warn(torque_id + " : error : could not remove from queue");
      cb(torque_id + " : error : could not remove from queue", code);
    }
  });
}

// Delete job handler for SLURM (sbatch)
function slurmJobDelete(torque_id, cb) {
  logger.info("job delete (slurm): " + torque_id);
  let scancel = {};

  // verify torque_id
  if (validateTorqueId(torque_id)) {
    scancel = spawn("scancel", [torque_id]);
  } else {
    logger.warn(torque_id + ":  invalid");
    cb(torque_id + " : error : could not remove from queue", 1);
    return;
  }

  scancel.on("close", function(code) {
    logger.warn(torque_id + " : " + code);

    if (code === 0) {
      logger.warn(torque_id + " : removed from queue");
      markCancelled(torque_id);
      // allow time for slurm to write to stdout
      setTimeout(cb, 1000, "", code);
    } else {
      logger.warn(torque_id + " : error : could not remove from queue");
      cb(torque_id + " : error : could not remove from queue", code);
    }
  });
}

// Delete job handler for local execution
function localJobDelete(torque_id, cb) {
  logger.info("job delete (local): " + torque_id);
  
  // For local jobs, we need to find and kill the process
  // The torque_id format is "local_timestamp_pid"
  if (torque_id.startsWith("local_")) {
    try {
      // Extract PID from the torque_id
      const parts = torque_id.split("_");
      if (parts.length >= 3) {
        const pid = parseInt(parts[2]);
        
        if (pid && !isNaN(pid)) {
          // Try to kill the process
          try {
            process.kill(pid, "SIGTERM");
            logger.info("Local job " + torque_id + " (PID: " + pid + ") terminated");
            markCancelled(torque_id);
            setTimeout(cb, 100, "", 0);
          } catch (killError) {
            if (killError.code === "ESRCH") {
              // Process doesn't exist, consider it already terminated
              logger.info("Local job " + torque_id + " process already terminated");
              markCancelled(torque_id);
              setTimeout(cb, 100, "", 0);
            } else {
              logger.error("Error killing local job " + torque_id + ": " + killError.message);
              cb("Error terminating local job: " + killError.message, 1);
            }
          }
        } else {
          logger.warn("Invalid PID in local job ID: " + torque_id);
          cb("Invalid local job ID format", 1);
        }
      } else {
        logger.warn("Invalid local job ID format: " + torque_id);
        cb("Invalid local job ID format", 1);
      }
    } catch (error) {
      logger.error("Error processing local job deletion: " + error.message);
      cb("Error processing local job deletion: " + error.message, 1);
    }
  } else {
    logger.warn("Invalid local job ID: " + torque_id);
    cb("Invalid local job ID", 1);
  }
}

// Choose the appropriate job delete function based on config.submit_type
let jobDelete;
if (config.submit_type === "qsub") {
  jobDelete = qsubJobDelete;
} else if (config.submit_type === "local") {
  jobDelete = localJobDelete;
} else {
  jobDelete = slurmJobDelete; // default to slurm for sbatch
}

exports.jobDelete = jobDelete;
