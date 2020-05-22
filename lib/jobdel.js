var spawn = require("child_process").spawn,
  redis = require("redis"),
  logger = require("./logger").logger;

// Use redis as our key-value store
var client = redis.createClient();

var jobDelete = function(torque_id, cb) {

  logger.info("job delete: " + torque_id);

  var qdel = spawn("qdel", [torque_id]);

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
};

exports.jobDelete = jobDelete;
