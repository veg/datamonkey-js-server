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

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

function returnJobInfo(job_id, callback) {

  // Declare some variables, including the child process.
  var spawn = require('child_process').spawn,
      qstat = spawn('qstat', ['-f', job_id]),
      status = {
          C:'Completed',
          E:'Exiting',
          H:'Held',
          Q:'Queued',
          R:'Running',
          T:'Transit',
          W:'Waiting',
          S:'Suspended'
      },
      month = {
          Jan:'01',
          Feb:'02',
          Mar:'03',
          Apr:'04',
          May:'05',
          Jun:'06',
          Jul:'07',
          Aug:'08',
          Sep:'09',
          Oct:'10',
          Nov:'11',
          Dec:'12'
      };

  // Extract job status, creation time, and running time from qstat's output.
  qstat.stdout.on('data', function (data) {

      var job_data = data.toString();

      var job_state = job_data.split("job_state = ")[1]
                              .split("\n")[0];

      var job_ctime = job_data.split("ctime = ")[1]
                              .split("\n")[0];

      var job_rtime = null;
      var job_stime = null;
      var job_sdate = null;

      // If the job is completed, report the runtime given by qstat. If 
      // it is still running, calculate the total elapsed running time 
      // and report it.
      if (job_state == "C") {
          try {
          job_rtime = job_data.split("total_runtime = ")[1].split("\n")[0];
          } catch (e) {
            job_rtime = null;
          }

      } else if (job_state == "R") {

          job_stime = job_data.split("start_time = ")[1].split("\n")[0]
                      .split(" ");

          job_sdate = job_stime[4] + "-"
                    + month[job_stime[1]] + "-"
                    + job_stime[2] + "T"
                    + job_stime[3];

          runtime = (1/1000)*(new Date() - new Date(job_sdate))-28800,
          job_rtime = runtime.toString();
      }      

      // Report the collected information.
      callback({     
                "id" : job_id,
                 "status" : status[job_state],
                 "creation_time" : job_ctime,
                 "running_time" : job_rtime
              });

  });

  // If an error occurs, say so.
  qstat.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });


}

function JobQueue(callback) {

  // Declare some variables, including the child process.
  qstat = exec('qstat', function(error, stdout, stderr) {

    if(!stdout || stderr) {
      callback([]);
      return;
    }
    
    var data = stdout;
    var job_data = data
                  .toString()
                  .split("\n");
        
    jobs = [];
    for ( i=2; i < job_data.length-1; i++ ) {
      var job_id = job_data[i].split(" ")[0];
      returnJobInfo(job_id, function(data) {
        jobs.push(data);
        if(jobs.length >= job_data.length - 3) {
          callback(jobs);
        }
      });
    }
  });

};

exports.JobQueue = JobQueue;
