/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2015
  Sergei L Kosakovsky Pond (spond@ucsd.edu)
  Steven Weaver (sweaver@ucsd.edu)

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

var spawn = require('child_process').spawn,
    fs = require('fs'),
    path = require('path'),
    winston = require('winston'),
    config = require('../../config.json'),
    util = require('util'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    JobStatus = require(__dirname + '/../../lib/jobstatus.js').JobStatus;

var DoBustedAnalysis = function () {};
util.inherits(DoBustedAnalysis, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
DoBustedAnalysis.prototype.status_watcher = function () {

  var self = this;
  var job_status = new JobStatus(self.torque_id);

  self.metronome_id = job_status.watch(function(error, status) {

    self.emit('status', status);

    if(status == 'completed' || status == 'exiting') {
      clearInterval(self.metronome_id);
      fs.readFile(self.results_fn, 'utf8', function (err, data) {
        if(err) {
          self.emit('script error', {'error' : 'unable to read results file'});
        } else{
          if(data) {
            self.emit('completed', {'results' : data});
          } else {
            self.emit('script error', {'error': 'job seems to have completed, but no results found'});
          }
        }
	    });
    } else if (status == 'queued') {
      self.emit('job created', { 'torque_id': self.torque_id });
    } else {
      fs.readFile(self.progress_fn, 'utf8', function (err, data) {
       if(err) {
         winston.warn('error reading progress file ' + self.progress_fn + '. error: ' + err);
         return;
       }
       if(data) {
         self.emit('status update', {'phase' : status, 'index': 1, 'msg': data, 'torque_id' : self.torque_id});
         self.current_status = data;
       } else {
	      winston.warn('read progress file, but no data');
       }
     });
   }
 });
};


exports.DoBustedAnalysis = DoBustedAnalysis;

