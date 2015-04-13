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

var config = require('../config.json'),
    fs = require('fs'),
    redis = require('redis'),
    cs = require('../lib/clientsocket.js'),
    winston = require('winston'),
    jobdel = require('../lib/jobdel.js'),
    ss = require('socket.io-stream'),
    JobStatus = require(__dirname + '/../../lib/jobstatus.js').JobStatus;

winston.level = config.loglevel;

// Use redis as our key-value store
var client = redis.createClient()

var resubscribe = function (socket, id) {

  var self = this;
  self.id = id;

  var callback = function(err, obj) {

    if(err || !obj) {
      winston.warn('info', self.id + ' : resubscribe : ' + err);
      socket.emit('script error', {error : err});
    } else {
      // check job status
      var current_status = obj.status;
      winston.info(self.id + ' : busted : current status : ' + obj.status);
      if (current_status != 'completed' && current_status != 'exiting') {
        // if job is still pending, resubscribe
        winston.warn('info', self.id + ' : busted : resubscribe : job pending, resuming');
        var clientSocket = new cs.ClientSocket(socket, self.id);  
      } else if ( current_status == 'completed') {
        // if job completed, emit results
        winston.info(self.id + ' : busted : resubscribe : job completed');
        json_results = JSON.parse(obj.results);
        socket.emit('completed', json_results);
        socket.disconnect();
      } else {
        // if job aborted, emit error
        socket.emit('script error', obj.error);
      }
    }

  };

  client.hgetall(self.id, callback);

};

var check = function (socket, params) {

};

var clearActiveJobs = function(cb) {

  var killcount = 0;
  var last_job = false;

  winston.warn('clearing all pending jobs');

  var killTopJobInQueue = function(cb) {
    client.lpop('active_jobs', function(err, job_id) {
      if(job_id == null) {
        last_job = true;
        cb(last_job);
      } else {
      winston.info('clearing job id : ' + job_id);
      // Get torque_id for job_id
      client.hgetall(job_id, function(err, job) {
          if (err || job == null) {
            winston.warn('attempted to clear job id ' + job_id + ' but could not find hash!');
          } else {
            // set status of job as incomplete
            torque_id = JSON.parse(job.torque_id).torque_id;
            client.hset(job_id, 'status', 'aborted', redis.print);
            winston.warn('qdeleleting ' + torque_id);
            jobdel.jobDelete(torque_id, function(err, data) { 
              if(err) {
                winston.warn('attempted to clear job id ' + torque_id + ' but could not!');
                cb(last_job);
              } else {
                cb(last_job);
              }
            });
          }
        });
      }
    });
  };

  var killCounter = function(last_job) {
    if(last_job) {
      winston.warn('cleared ' + killcount + ' jobs!');
      cb(killcount);
    } else {
      killTopJobInQueue(killCounter);
      killcount++;
    }
  };

  killTopJobInQueue(killCounter);

}

var jobRunner = function(script, params) {
  var self = this;

  self.states = {
          completed : 'completed',
          exiting   : 'exiting',
          held      : 'held',
          queued    : 'queued',
          running   : 'running',
          transit   : 'transit',
          waiting   : 'waiting',
          suspended : 'suspended'
      };
}

util.inherits(jobRunner, EventEmitter);

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * Emit events
 */

jobRunner.prototype.submit = function (params, cwd) {

  var qsub =  spawn('qsub', params, { cwd : cwd });

  qsub.stderr.on('data', function (data) {
    winston.info(data);
  });

  qsub.stdout.on('data', function (data) {
    torque_id = String(data).replace(/\n$/, '');
    self.emit('job created', { 'torque_id': torque_id });
  });

  qsub.on('close', function (code) {
    self.status_watcher();
  });

}

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
jobRunner.prototype.status_watcher = function () {

  var self = this;
  var job_status = new JobStatus(self.torque_id);
  self.current_status = "";

  self.metronome_id = job_status.watch(function(error, status) {

    self.emit('status', status);

    if(status == self.states.completed || status == self.states.exiting) {
      clearInterval(self.metronome_id);
      //TODO: Move to parent
      fs.readFile(self.results_fn, 'utf8', function (err, data) {
        if(err) {
          // Check stderr
          fs.readFile(self.std_err, 'utf8', function (err, stack_trace) {
            if(err) {
            self.emit('script error', {'error' : 'unable to read results file'});
            } else {
              self.emit('script error', {'error' : stack_trace});
            }
          });
        } else{
          if(data) {
            self.emit(self.states.completed, {'results' : data});
          } else {
            self.emit('script error', {'error': 'job seems to have completed, but no results found'});
          }
        }
	    });
    } else if (status == self.states.queued) {
      self.emit('job created', { 'torque_id': self.torque_id });
    } else {
      // TODO: Move to parent
      fs.readFile(self.progress_fn, 'utf8', function (err, data) {
       if(err) {
         winston.warn('error reading progress file ' + self.progress_fn + '. error: ' + err);
         return;
       }
       if(data) {
         if(data != self.current_status) {
           self.emit('status update', {'phase' : status, 'index': 1, 'msg': data, 'torque_id' : self.torque_id});
           self.current_status = data;
         }
       } else {
	        winston.info('read progress file, but no data');
       }
     });
   }
 });
}

exports.resubscribe = resubscribe;
exports.check = check;
exports.jobRunner = jobRunner;
exports.clearActiveJobs = clearActiveJobs;
