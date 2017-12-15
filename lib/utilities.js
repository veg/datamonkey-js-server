var config = require("../config.json"),
  spawn = require("child_process").spawn,
  _ = require("underscore"),
  moment = require("moment-timezone"),
  winston = require("winston");

winston.level = config.loglevel;

// retrieves active jobs from redis, and attempts to cancel
function get_active_jobs(cb) {
  var total_job_count = 0;
  client.llen('active_jobs', function(err, n) {
    winston.info(n + ' active jobs left!');
    cb('', n);
  });
}

exports.get_active_jobs = get_active_jobs;
