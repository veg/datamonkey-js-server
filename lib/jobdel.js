var spawn = require("child_process").spawn,
  redis = require("redis"),
  logger = require("./logger").logger,
  config = require("../config.json");

// Use redis as our key-value store
var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Validate that the torque_id contains only alphanumeric characters, dots, and underscores
function validateTorqueId(torque_id) {
  return /^[\w\.]+$/.test(torque_id);
}

// Delete job handler for TORQUE (qsub)
function qsubJobDelete(torque_id, cb) {
  logger.info("job delete (qsub): " + torque_id);
  var qdel = {};

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
      client.hset(torque_id, "status", "cancelled");
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
  var scancel = {};

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
      client.hset(torque_id, "status", "cancelled");
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
            process.kill(pid, 'SIGTERM');
            logger.info("Local job " + torque_id + " (PID: " + pid + ") terminated");
            client.hset(torque_id, "status", "cancelled");
            setTimeout(cb, 100, "", 0);
          } catch (killError) {
            if (killError.code === 'ESRCH') {
              // Process doesn't exist, consider it already terminated
              logger.info("Local job " + torque_id + " process already terminated");
              client.hset(torque_id, "status", "cancelled");
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
var jobDelete;
if (config.submit_type === "qsub") {
  jobDelete = qsubJobDelete;
} else if (config.submit_type === "local") {
  jobDelete = localJobDelete;
} else {
  jobDelete = slurmJobDelete; // default to slurm for sbatch
}

exports.jobDelete = jobDelete;
