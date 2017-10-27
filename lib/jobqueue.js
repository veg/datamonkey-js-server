/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2015
  Sergei L Kosakovsky Pond (spond@ucsd.edu)
  Steven Weaver (sweaver@ucsd.edu)
  Anthony Aylward (aaylward@ucsd.edu)

  Permission is hereby granted, free of charge, to any person obtaining a
  copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be included
  in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

var spawn = require("child_process").spawn,
  exec = require("child_process").exec,
  moment = require("moment-timezone"),
  redis = require("redis");

var winston = require("winston");

var client = redis.createClient();

function returnJobInfo(job_id, callback) {
  // Declare some variables, including the child process.
  var spawn = require("child_process").spawn,
    qstat = spawn("qstat", ["-f", job_id]),
    status = {
      C: "Completed",
      E: "Exiting",
      H: "Held",
      Q: "Queued",
      R: "Running",
      T: "Transit",
      W: "Waiting",
      S: "Suspended"
    },
    month = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12"
    };

  // Extract job status, creation time, and running time from qstat's output.
  qstat.stdout.on("data", function(data) {
    var job_data = data.toString(),
      job_state = null,
      job_ctime = null,
      job_stime = null,
      job_sdate = null,
      type = null,
      datamonkey_id = null;
    sites = null;
    sequences = null;

    try {
      job_state = job_data.split("job_state = ")[1].split("\n")[0];

      job_ctime = job_data.split("ctime = ")[1].split("\n")[0];
      job_ctime = moment(job_ctime, "ddd MMM DD HH:mm:ss YYYY")
        .tz("America/Los_Angeles")
        .tz("GMT")
        .format();
    } catch (e) {}

    try {
      job_stime = job_data.split("start_time = ")[1].split("\n")[0];
      job_stime = moment(job_stime, "ddd MMM DD HH:mm:ss YYYY")
        .tz("America/Los_Angeles")
        .tz("GMT")
        .format();
    } catch (e) {}

    client.hgetall(job_id, function(err, obj) {
      if (obj) {
        type = obj.type;
        datamonkey_id = obj.datamonkey_id;
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

  // warn if error occurs
  qstat.stderr.on("data", function(data) {
    winston.warn("stderr: " + data);
  });
}

function JobQueue(callback) {
  // Declare some variables, including the child process.
  qstat = exec("qstat", function(error, stdout, stderr) {
    if (!stdout || stderr) {
      callback([]);
      return;
    }

    var data = stdout;
    var job_data = data.toString().split("\n");

    jobs = [];
    for (i = 2; i < job_data.length - 1; i++) {
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
