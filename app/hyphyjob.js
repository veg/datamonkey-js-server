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

var config  = require('../config.json'),
    cs      = require('../lib/clientsocket.js'),
    job     = require('./job.js'),
    jobdel  = require('../lib/jobdel.js'),
    redis   = require('redis'),
    Q       = require('q'),
    winston = require('winston'),
    _       = require('underscore'),
    fs      = require('fs'),
    path    = require('path'),
    ss      = require('socket.io-stream');

winston.level = config.loglevel;

// Use redis as our key-value store
var client = redis.createClient();

var hyphyJob = function () {};

hyphyJob.prototype.log = function (notification, complementary_info) {

  var self = this;

  if(complementary_info) {
    winston.info([self.type, self.id, notification, complementary_info].join(' : '));
  } else {
    winston.info([self.type, self.id, notification].join(' : '));
  }

};

hyphyJob.prototype.warn = function (notification, complementary_info) {
  var self = this;
  if(complementary_info) {
    winston.warn([self.type, self.id, notification, complementary_info].join(' : '));
  } else {
    winston.warn([self.type, self.id, notification].join(' : '));
  }
};


// Attach socket to redis channel
hyphyJob.prototype.attachSocket = function () {
  var self = this;
  new cs.ClientSocket(self.socket, self.id);
}

hyphyJob.prototype.init = function () {
  var self = this;
  // store parameters in redis
  client.hset(self.id, 'params', JSON.stringify(self.params));
  self.attachSocket();
  self.spawn();
}

hyphyJob.prototype.spawn = function () {

  var self = this;

  self.log('spawning');

  // A class that spawns the process and emits status events
  var hyphy_job_runner = new job.jobRunner (self.qsub_params);

  // On status updates, report to datamonkey-js
  hyphy_job_runner.on('status', function(status) {
    self.log('status', JSON.stringify(status));
    client.hset(self.id, 'status', status);
  });

  // On status updates, report to datamonkey-js
  hyphy_job_runner.on('status update', function(status_update) {

    // HyPhy publishes updates to a specified progress file
    fs.readFile(self.progress_fn, 'utf8', function (err, data) {
      if(err) {
        self.warn('status update', 
                  'error reading progress file ' + self.progress_fn + '. error: ' + err);
      } else if (data) {
       self.onStatusUpdate(data);
      } else {
       // No status update could be read, 
       // but this could be due to the job just starting
       self.warn('read progress file, but no data');
      }
   });

  });

  // On errors, report to datamonkey-js
  hyphy_job_runner.on('script error', function(error) {

    // Check that job was not manually cancelled
    client.hget(self.id, 'status', function(err, status) {
      if(status != 'cancelled') {
        self.onError();
      }
    });

  });

  // When the analysis completes, return the results to datamonkey.
  hyphy_job_runner.on('completed', function(results) {
    self.onComplete();
  });

  // Report the torque job id back to datamonkey
  hyphy_job_runner.on('job created', function(torque_id) {
    self.onJobCreated(torque_id);
  });

  // Report the torque job id back to datamonkey
  hyphy_job_runner.on('job metadata', function(status) {
    self.onJobMetadata(status);
  });


  self.stream.pipe(fs.createWriteStream(self.fn));

  self.stream.on('end', function(err) {
    if (err) throw err;
    // Pass filename in as opposed to generating it in spawn_hyphyJob
    hyphy_job_runner.submit(self.qsub_params, self.output_dir);
  });

  // Global event that triggers all jobs to cancel
  process.on('cancelJob', function(msg) {
    self.warn('cancel called!');
    self.cancel_once = _.once(self.cancel);
    self.cancel_once();
  });

  // Should be called when the job completes
  self.socket.on('disconnect', function () {
    self.log('user disconnected');
  });

};

hyphyJob.prototype.onJobCreated = function (torque_id) {

  var self = this;

  self.push_active_job = function (id) {
    client.rpush('active_jobs', self.id);
  };

  self.push_job_once = _.once(self.push_active_job);
  self.setTorqueParameters(torque_id);
  var redis_packet = torque_id;
  redis_packet.type = 'job created';
  str_redis_packet = JSON.stringify(torque_id);
  self.log('job created',str_redis_packet);
  client.hset(self.id, 'torque_id', str_redis_packet);
  client.publish(self.id, str_redis_packet);
  client.hset(self.torque_id, 'datamonkey_id', self.id);
  client.hset(self.torque_id, 'type', self.type);
  client.hset(self.torque_id, 'sites', self.params.msa[0].sites);
  client.hset(self.torque_id, 'sequences', self.params.msa[0].sequences);
  self.push_job_once(self.id);

};

hyphyJob.prototype.onComplete = function () {

 var self = this;

  fs.readFile(self.results_fn, 'utf8', function (err, data) {
    if(err) {
      // Error reading results file
      self.onError('unable to read results file. ' + err);
    } else{

      if(data) {

        // Prepare redis packet for delivery
        var redis_packet = { 'results' : data };
        redis_packet.type = 'completed';
        var str_redis_packet = JSON.stringify(redis_packet);

        // Log that the job has been completed
        self.log('complete', 'success');

        // Store packet in redis and publish to channel
        client.hset(self.id, 'results', str_redis_packet);
        client.hset(self.id, 'status', 'completed');
        client.publish(self.id, str_redis_packet);

        // Remove id from active_job queue
        client.lrem('active_jobs', 1, self.id);

      } else {
        // Empty results file
        self.onError('job seems to have completed, but no results found');
      }
    }
  });

};

hyphyJob.prototype.onStatusUpdate = function(data) {

  var self = this;
  self.current_status = data;

  var status_update = { 'msg'       : self.current_status, 
                        'torque_id' : self.torque_id,
                        'stime'     : self.stime,   
                        'ctime'     : self.ctime,
                        'phase'     : 'running'
                      };


  // Prepare redis packet for delivery
  var redis_packet = status_update;
  redis_packet.type = 'status update';
  str_redis_packet =  JSON.stringify(status_update);

  // Store packet in redis and publish to channel
  client.hset(self.id, 'status update', str_redis_packet);
  client.publish(self.id, str_redis_packet);

  // Log status update on server
  self.log('status update', str_redis_packet);


};

hyphyJob.prototype.onJobMetadata = function(data) {

  var self = this;
  self.stime = data.stime;
  self.ctime = data.ctime;

};

// If a job is cancelled early or the result contents cannot be read
hyphyJob.prototype.onError = function(error) {

  var self = this;

  // The packet that will delivered to datamonkey via the publish command
  var redis_packet = {'error' : error };
  redis_packet.type = 'script error';

  // Read error path contents
  var std_err_promise = Q.nfcall(fs.readFile, self.std_err, "utf-8"); 
  var progress_fn_promise = Q.nfcall(fs.readFile, self.progress_fn, "utf-8"); 
  var std_out_promise = Q.nfcall(fs.readFile, self.std_out, "utf-8"); 

  var promises = [ std_err_promise, progress_fn_promise, std_out_promise]; 

  Q.allSettled(promises) 
  .then(function (results) { 
    // Prepare redis packet for delivery
    redis_packet.stderr = results[0].value;
    redis_packet.progress = results[1].value;
    redis_packet.stdout = results[2].value;
    str_redis_packet = JSON.stringify(redis_packet);

    // log error with a warning
    self.warn('script error', str_redis_packet);

    // Publish error messages to redis
    client.hset(self.id, 'error', str_redis_packet);
    client.publish(self.id, str_redis_packet);
    client.lrem('active_jobs', 1, self.id);
    client.llen('active_jobs', function(err, n) {
      process.emit('jobCancelled', n);
    });
  });

};

// Called when a job is first created
// Set id and output file names
hyphyJob.prototype.setTorqueParameters = function(torque_id) {

  var self = this;
  self.torque_id = torque_id.torque_id;

  // The standard out and error logs of the job
  self.std_err = path.join(self.output_dir, self.qsub_script_name) + '.e' + self.torque_id.split('.')[0];
  self.std_out = path.join(self.output_dir, self.qsub_script_name) + '.o' + self.torque_id.split('.')[0];

};


// Cancel the job and report an error
hyphyJob.prototype.cancel = function() {

  var self = this;

  var cb = function(err, code) {
    self.onError('job cancelled');
  };

  self.warn('cancel called!');

  self.cancel_once = _.once(jobdel.jobDelete);
  self.cancel_once(self.torque_id, cb);

};

exports.hyphyJob = hyphyJob;
