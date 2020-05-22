var config = require("../config.json"),
  logger = require("./logger").logger;

// retrieves active jobs from redis, and attempts to cancel
function get_active_jobs(cb) {
  client.llen("active_jobs", function(err, n) {
    logger.info(n + " active jobs left!");
    cb("", n);
  });
}

exports.get_active_jobs = get_active_jobs;
