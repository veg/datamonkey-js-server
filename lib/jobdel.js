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

// Choose the appropriate job delete function based on config.submit_type
var jobDelete = config.submit_type === "qsub" ? qsubJobDelete : slurmJobDelete;

exports.jobDelete = jobDelete;
