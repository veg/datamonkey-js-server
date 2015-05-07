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

var spawn   = require('child_process').spawn,
        _   = require('underscore'),
    winston = require('winston');

var JobStatus = function (job_id) {

  self = this;
  self.metronome = 0;
  self.job_id = job_id;
  self.status = '';
  self.valid_statuses = {

          C:'completed',
          E:'exiting',
          H:'held',
          Q:'queued',
          R:'running',
          T:'transit',
          W:'waiting',
          S:'suspended'
      };

};

// Define the status-returning function.
JobStatus.prototype.returnJobStatus = function(job_id, callback) {

  self.callback = callback;
  self.job_id = job_id;
  self.status = '';
  self.error = '';

  var qstat = spawn('qstat', [self.job_id]);

  var status = {
          C:'completed',
          E:'exiting',
          H:'held',
          Q:'queued',
          R:'running',
          T:'transit',
          W:'waiting',
          S:'suspended'
      };

  // If the job exists, check and return its status. If it is complete, stop
  // the metronome.

  qstat.stdout.on('data', function (data) {

    var re = /(\s)+/g,
      job_status = data
                  .toString()
                  .split("\n")[2]
                  .replace(re, " ")
                  .split(" ")[4];

    if (job_status in status) {
      self.status = status[job_status];
      callback(self.error, self.status);
    } else {
      self.error = 'Unknown Status: ' + job_status;
      callback(self.error, self.status);
    }

  });

  // If the job doesn't exist, return that information and stop the metronome.
  // If some other error occurs, say so.
  qstat.stderr.on('data', function (data) {

    winston.info(self.job_id + ' ' + data);

    var doesnt_exist = data
                      .toString()
                      .slice(0,27)
                      ==
                      'qstat: Unknown Job Id Error';

    if (doesnt_exist) {
      self.error = self.job_id +  ' no longer exists in the queue';
    } else {
      self.error = self.job_id +  ': ' + data;
    };

    self.callback(self.error, self.status);

  });

};

JobStatus.prototype.fullJobInfo = function(callback) {

  self.callback = callback;

  var translateQstat = function(d) {

    var job = {};

    // iterate over each line
    job_arr = d.toString().split('\n');
    _.each(job_arr, function(item) { 
                       var item_split = item.split('=');
                       if(item_split.length == 2) {
                         job[item_split[0].trim()] = item_split[1].trim();
                       }
                     });

    return job;
  };

  var qstat = spawn('qstat', ['-f', self.job_id]);

  qstat.stdout.on('data', function (data) {
    var job_status = translateQstat(data.toString());
    self.callback(self.error, job_status);

  });

  // If the job doesn't exist, return that information.
  // If some other error occurs, say so.
  qstat.stderr.on('data', function (data) {
    winston.info(self.job_id + ' ' + data);
    self.error = self.job_id +  ' no longer exists in the queue';
    self.callback(self.error, '');
  });

};

JobStatus.prototype.watch = function (callback) {
  var metronome = new setInterval(self.returnJobStatus, 3000, self.job_id, callback);
  return metronome;
};

exports.JobStatus = JobStatus;
