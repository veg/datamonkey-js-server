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
    winston = require('winston'),
    _       = require('underscore'),
    fs      = require('fs'),
    path    = require('path'),
    ss      = require('socket.io-stream');

winston.level = config.loglevel;

// Use redis as our key-value store
var client = redis.createClient();

var hyphyJob = function () {};

// Pass socket to hyphyJob job
hyphyJob.prototype.spawn = function () {

  var self = this;

  var push_active_job = function (id) {
        client.rpush('active_jobs', self.id)
      }, 
     push_job_once = _.once(push_active_job);


  winston.info(self.id + ' : hyphyJob : spawning');

  // Setup Analysis
  var clientSocket    = new cs.ClientSocket (self.socket, self.id);
  var hyphyJob_analysis = new job.jobRunner (self.qsub_params);

  // On status updates, report to datamonkey-js
  hyphyJob_analysis.on('status', function(status) {
    winston.info(self.id + ' ' + status);
    client.hset(self.id, 'status', status, redis.print);
  });

  // On status updates, report to datamonkey-js
  hyphyJob_analysis.on('status update', function(status_update) {
    self.onStatusUpdate();
  });

  // On errors, report to datamonkey-js
  hyphyJob_analysis.on('script error', function(error) {
    self.onError();
  });

  // When the analysis completes, return the results to datamonkey.
  hyphyJob_analysis.on('completed', function(results) {
    self.onComplete();
  });

  // Report the torque job id back to datamonkey
  hyphyJob_analysis.on('job created', function(torque_id) {
    // set standard error path
    //TODO: Make this a library method
    self.torque_id = torque_id.torque_id;
    self.std_err = self.output_dir + '/' + self.qsub_script_name + '.e' + self.torque_id.split('.')[0];
    self.std_out = self.output_dir + '/' + self.qsub_script_name + '.o' + self.torque_id.split('.')[0];
    winston.info(self.std_err);

    var redis_packet = torque_id;
    redis_packet.type = 'job created';
    str_redis_packet = JSON.stringify(torque_id);
    winston.log('info', self.id + ' : job created : ' + str_redis_packet);
    client.hset(self.id, 'torque_id', str_redis_packet, redis.print);
    client.publish(self.id, str_redis_packet);
    push_job_once(self.id);
  });

  self.stream.pipe(fs.createWriteStream(self.fn));

  self.stream.on('end', function(err) {
    if (err) throw err;
    // Pass filename in as opposed to generating it in spawn_hyphyJob
    hyphyJob_analysis.submit(self.qsub_params, self.output_dir);
  });

  process.on('cancelJob', function(msg) {
    winston.warn('cancel called!');
    self.cancel();
  });

  self.socket.on('disconnect', function () {
    winston.info('user disconnected');
  });

};

hyphyJob.prototype.onComplete = function () {

 var self = this;

  fs.readFile(self.results_fn, 'utf8', function (err, data) {
    if(err) {
      self.onError('unable to read results file');
    } else{
      if(data) {
        var redis_packet = { 'results' : data };
        redis_packet.type = 'completed';
        var str_redis_packet = JSON.stringify(redis_packet);
        winston.log('info', self.id + ' : job completed');
        client.hset(self.id, 'results', str_redis_packet, redis.print);
        client.hset(self.id, 'status', 'completed', redis.print);
        client.publish(self.id, str_redis_packet);
        client.lrem('active_jobs', 1, self.id)
      } else {
        self.onError('job seems to have completed, but no results found');
      }
    }
  });

}

hyphyJob.prototype.onStatusUpdate = function() {

 var self = this;

 fs.readFile(self.progress_fn, 'utf8', function (err, data) {
   if(err) {
     winston.warn('error reading progress file ' + self.progress_fn + '. error: ' + err);
   } else if (data) {
     self.current_status = data;
     var status_update = {'phase' : 'running', 'index': 1, 'msg': data, 'torque_id' : self.torque_id};
     var redis_packet = status_update;
     redis_packet.type = 'status update';
     str_redis_packet =  JSON.stringify(status_update);
     winston.info(self.id + ' : ' + str_redis_packet);
     client.hset(self.id, 'status update', str_redis_packet, redis.print);
     client.publish(self.id, str_redis_packet);
   } else {
    winston.warn('read progress file, but no data');
   }
 });

}

hyphyJob.prototype.onError = function(error) {
  var self = this;

  var redis_packet = {'error' : error };
  redis_packet.type = 'script error';

  // Read error path contents
  fs.readFile(self.std_err, 'utf8', function (err, data) {
    fs.readFile(self.progress_fn, 'utf8', function (err, progress_data) {
      fs.readFile(self.std_out, 'utf8', function (err, stdout_data) {
        redis_packet.stderr = data;
        redis_packet.stdout = stdout_data;
        redis_packet.progress = progress_data;
        str_redis_packet = JSON.stringify(redis_packet);
        winston.warn(self.id + ' : ' + str_redis_packet);
        client.hset(self.id, 'error', str_redis_packet, redis.print);
        client.publish(self.id, str_redis_packet);
        client.lrem('active_jobs', 1, self.id)
        client.llen('active_jobs', function(err, n) {
          process.emit('jobCancelled', n);
        });
      });
    });
  });

}

// See if this can be made a static function
hyphyJob.prototype.cancel = function() {

  var self = this;
  jobdel.jobDelete(self.torque_id, function(err, code) {
    self.onError('job cancelled');
  });

}

exports.hyphyJob = hyphyJob;
