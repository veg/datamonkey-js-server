var config = require("../config.json"),
  exec = require("child_process").exec,
  moment = require("moment-timezone"),
  redis = require("redis"),
  spawn = require("child_process").spawn;

var winston = require("winston");

winston.level = config.loglevel || "info";

var client = redis.createClient();

function returnJobInfo(job_id, callback) {
  // Declare some variables, including the child process.
  var qstat = spawn("qstat", ["-f", "-1", job_id]),

    status = {
      C: "Completed",
      E: "Exiting",
      H: "Held",
      Q: "Queued",
      R: "Running",
      T: "Transit",
      W: "Waiting",
      S: "Suspended"
    };

  // Extract job status, creation time, and running time from qstat's output.
  try{
    qstat.stdout.on("data", function(data) {
      var job_data = data.toString(),
        job_state = null,
        job_ctime = null,
        job_stime = null,
        type = null,
        sites = null,
        sequences = null;
  
      try {
        job_state = job_data.split("job_state = ")[1].split("\n")[0];
  
        job_ctime = job_data.split("ctime = ")[1].split("\n")[0];
        job_ctime = moment(job_ctime, "ddd MMM DD HH:mm:ss YYYY")
          .tz("America/Los_Angeles")
          .tz("GMT")
          .format();
      } catch (e) { winston.info("no job_state or job_ctime available"); }
  
      try {
        job_stime = job_data.split("start_time = ")[1].split("\n")[0];
        job_stime = moment(job_stime, "ddd MMM DD HH:mm:ss YYYY")
          .tz("America/Los_Angeles")
          .tz("GMT")
          .format();
      } catch (e) { }
      
      client.hgetall(job_id, function(err, obj) {
        if (obj) {
          type = obj.type;
          sites = obj.sites;
          sequences = obj.sequences;
        }
  
        // Report the collected information.
        callback({
          id: job_id,
          status: status[job_state],
          creation_time: job_ctime,
          start_time: job_stime,
          type: type,
          sites: sites,
          sequences: sequences
        });
      });
    });
  } catch (e) { winston.warn("(lib/jobqueue.js:42) TypeError: Cannot read property 'on' of undefined"); }

  // warn if error occurs
  qstat.stderr.on("data", function(data) {
    winston.warn("stderr: " + data);
  });
}

function JobQueue(callback) {
  // Declare some variables, including the child process.
  exec("qstat", function(error, stdout, stderr) {

    if (!stdout || stderr) {
      callback([]);
      return;
    }

    var data = stdout;
    var job_data = data.toString().split("\n");

    var jobs = [];

    for (var i = 2; i < job_data.length - 1; i++) {
      var job_id = job_data[i].split(" ")[0];
      returnJobInfo(job_id, function(data) {
        jobs.push(data);
        if (jobs.length == job_data.length - 3) {
          callback(jobs);
          return;
        }
      });
    }
  });
}

exports.JobQueue = JobQueue;
