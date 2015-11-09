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
    spawn = require('child_process').spawn,
    fs = require('fs'),
    redis = require('redis'),
    cs = require('../lib/clientsocket.js'),
    winston = require('winston'),
    jobdel = require('../lib/jobdel.js'),
    ss = require('socket.io-stream'),
    util = require('util'),
    JobStatus = require(__dirname + '/../lib/jobstatus.js').JobStatus,
    EventEmitter = require('events').EventEmitter;

winston.level = config.loglevel;

// Use redis as our key-value store
var client = redis.createClient();

// resubscribes a socket to an existing pending job, 
// otherwise reports contents from redis
var resubscribe = function (socket, id) {

  var self = this;
  self.id = id;

  var callback = function(err, obj) {

    if(err || !obj) {
      winston.warn(self.id + ' : resubscribe : ' + err);
      socket.emit('script error', {error : err});
    } else {
      // check job status
      var current_status = obj.status;
      winston.info(self.id + ' : job : current status : ' + obj.status);
      if (current_status != 'completed' && current_status != 'exiting') {
        // if job is still pending, resubscribe
        winston.warn('info', self.id + ' : job : resubscribe : job pending, resuming');
        var clientSocket = new cs.ClientSocket(socket, self.id);  
      } else if ( current_status == 'completed') {
        // if job completed, emit results
        winston.info(self.id + ' : job : resubscribe : job completed');
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

var cancel = function (socket, id) {

  var self = this;
  self.id = id;

  var callback = function(err, obj) {

    if(err || !obj) {

      winston.warn(self.id + ' : cancel : ' + err);
      socket.emit('cancelled', {'success' : 'no', 'error' : err});

    } else {

      // check job status
      var current_status = obj.status;
      var torque_id = JSON.parse(obj.torque_id).torque_id;

      if (current_status != 'completed' && current_status != 'exiting') {

        // if job is still pending, cancel
        winston.warn('info', self.id + ' : job : cancel : cancelling job');

        jobdel.jobDelete(torque_id, function() {
          winston.warn('info', self.id + ' : job : cancel : job cancelled');
          client.hset(self.id, 'status', 'aborted');
          socket.emit('cancelled', {'success' : 'ok'});
          socket.disconnect();
        });

      } else if ( current_status == 'completed') {

        // if job completed, emit results
        winston.info(self.id + ' : job : cancel : job completed');
        json_results = JSON.parse(obj.results);
        socket.emit('cancelled', {'success' : 'ok'});
        socket.disconnect();

      } else {

        // if job aborted, emit error
        winston.info(self.id + ' : job : cancel : job doesnt exist');
        socket.emit('cancelled', {'success' : 'no', 'error' : 'no job'});

      }
    }
  };

  client.hgetall(self.id, callback);

};


var jobRunner = function(script, params) {
  var self = this;
  self.torque_id = '';

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

};

util.inherits(jobRunner, EventEmitter);

// Submits a job to TORQUE by spawning qsub_submit.sh
// Emit events
jobRunner.prototype.submit = function (params, cwd) {

  var self = this;

  var qsub = spawn('qsub', params, { cwd : cwd });

  qsub.stderr.on('data', function (data) {
    winston.info(data.toString('utf8'));
  });

  qsub.stdout.on('data', function (data) {
    torque_id = String(data).replace(/\n$/, '');
    self.torque_id = torque_id;
    self.emit('job created', { 'torque_id': torque_id });
  });

  qsub.on('close', function (code) {
    self.status_watcher();
  });

};

// Once the job has been scheduled, we need to watch the files that it
// sends updates to.
jobRunner.prototype.status_watcher = function () {

  var self = this;
  var job_status = new JobStatus(self.torque_id);
  self.metronome_id = job_status.watch(function(error, status_packet) {

    if(status_packet.status == self.states.completed || status_packet.status == self.states.exiting) {
      clearInterval(self.metronome_id);
      self.emit(self.states.completed, '');
    } else if (status_packet.status == self.states.queued) {
      self.emit('job created', { 'torque_id' : self.torque_id });
    } else {
      self.emit('job metadata', status_packet);
      self.emit('status update', status_packet);
   }

 });

};

exports.resubscribe = resubscribe;
exports.cancel = cancel;
exports.jobRunner = jobRunner;

