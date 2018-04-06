var spawn = require("child_process").spawn,
  redis = require("redis"),
  winston = require("winston");

// Use redis as our key-value store
var client = redis.createClient();

var jobDelete = function(torque_id, cb) {

  winston.info("job delete: " + torque_id);

  var qdel = spawn("qdel", [torque_id]);

  qdel.on("close", function(code) {

    winston.warn(torque_id + " : " + code);

    if (code === 0) {
      winston.warn(torque_id + " : removed from queue");
      client.hset(torque_id, "status", "cancelled");
      // allow time for torque to write to stdout
      setTimeout(cb, 1000, "", code);
    } else {
      winston.warn(torque_id + " : error : could not remove from queue");
      cb(torque_id + " : error : could not remove from queue", code);
    }
  });
};

exports.jobDelete = jobDelete;
