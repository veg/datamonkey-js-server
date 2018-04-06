var config = require("../config.json"),
  winston = require("winston");

winston.level = config.loglevel;

// retrieves active jobs from redis, and attempts to cancel
function get_active_jobs(cb) {
  client.llen("active_jobs", function(err, n) {
    winston.info(n + " active jobs left!");
    cb("", n);
  });
}

exports.get_active_jobs = get_active_jobs;
