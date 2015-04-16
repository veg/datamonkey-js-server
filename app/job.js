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
var client = redis.createClient()

var job = function (socket, stream, params, script_name) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  self.fn = __dirname + '/output/' + self.params.analysis._id;
  self.filepath = self.fn;
  self.output_dir  = path.dirname(self.filepath);
  self.qsub_script_name = script_name;
  self.qsub_script = __dirname + '/' + self.qsub_script_name;
  self.id = params.analysis._id;
  self.msaid = params.msa._id;
  self.status_fn = self.filepath + '.status';
  self.progress_fn = self.filepath + '.progress';
  self.results_fn = self.filepath + '.json';
  self.tree_fn = self.filepath + '.tre';
  self.job = config.job;
  self.status_stack = params.status_stack;
  self.genetic_code = "1";
  self.torque_id = "unk";
  self.std_err = "unk";
  self.job_completed = false;

  self.qsub_params =  ['-q',
                          config.qsub_queue,
                          '-v',
                          'fn='+self.filepath+
                          ',tree_fn='+self.tree_fn+
                          ',sfn='+self.status_fn+
                          ',pfn='+self.progress_fn+
                          ',treemode='+self.treemode+
                          ',genetic_code='+self.genetic_code+
                          ',cwd='+__dirname+
                          ',msaid='+self.msaid,
                          '-o', self.output_dir,
                          '-e', self.output_dir, 
                          self.qsub_script];

  // Write tree to a file
  fs.writeFile(self.tree_fn, params.analysis.tagged_nwk_tree, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');

  self.spawn();

};

// Pass socket to job job
job.prototype.spawn = function () {

  var self = this;

  var push_active_job = function (id) {
        client.rpush('active_jobs', self.id)
      }, 
     push_job_once = _.once(push_active_job);


  winston.info(self.id + ' : job : spawning');

  // Setup Analysis
  var clientSocket    = new cs.ClientSocket (self.socket, self.id);
  var job_analysis = new job.jobRunner (self.qsub_params);

  // On status updates, report to datamonkey-js
  job_analysis.on('status', function(status) {
    winston.info(self.id + ' ' + status);
    client.hset(self.id, 'status', status, redis.print);
  });

  // On status updates, report to datamonkey-js
  job_analysis.on('status update', function(status_update) {
    self.onStatusUpdate();
  });

  // On errors, report to datamonkey-js
  job_analysis.on('script error', function(error) {
    self.onError();
  });

  // When the analysis completes, return the results to datamonkey.
  job_analysis.on('completed', function(results) {
    self.onComplete();
  });

  // Report the torque job id back to datamonkey
  job_analysis.on('job created', function(torque_id) {
    // set standard error path
    //TODO: Make this a library method
    self.torque_id = torque_id.torque_id;
    self.std_err = self.output_dir + '/' + self.qsub_script_name + '.e' + self.torque_id.split('.')[0];
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
    // Pass filename in as opposed to generating it in spawn_job
    job_analysis.submit(self.qsub_params, self.output_dir);
  });

  process.on('cancelJob', function(msg) {
    winston.warn('cancel called!');
    self.cancel();
  });

  self.socket.on('disconnect', function () {
    winston.info('user disconnected');
  });

};

job.prototype.onComplete = function () {

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

job.prototype.onStatusUpdate = function() {

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

job.prototype.onError = function(error) {
  var self = this;

  var redis_packet = {'error' : error };
  redis_packet.type = 'script error';

  // Read error path contents
  fs.readFile(self.std_err, 'utf8', function (err, data) {
    //TODO: Add progress file
    redis_packet.stderr = data;
    str_redis_packet = JSON.stringify(redis_packet);
    winston.warn(self.id + ' : ' + str_redis_packet);
    client.hset(self.id, 'error', str_redis_packet, redis.print);
    client.publish(self.id, str_redis_packet);
    client.lrem('active_jobs', 1, self.id)
    client.llen('active_jobs', function(err, n) {
      process.emit('jobCancelled', n);
    });
  });

}

// See if this can be made a static function

job.prototype.cancel = function() {

  var self = this;
  jobdel.jobDelete(self.torque_id, function(err, code) {
    self.onError('job cancelled');
  });

}



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

var check = function (socket, params) {};

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

}

util.inherits(jobRunner, EventEmitter);

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * Emit events
 */

jobRunner.prototype.submit = function (params, cwd) {

  var self = this;

  var qsub = spawn('qsub', params, { cwd : cwd });

  qsub.stderr.on('data', function (data) {
    winston.info(data);
  });

  qsub.stdout.on('data', function (data) {
    torque_id = String(data).replace(/\n$/, '');
    self.torque_id = torque_id;
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
      self.emit(self.states.completed, '');
    } else if (status == self.states.queued) {
      self.emit('job created', { 'torque_id': self.torque_id });
    } else {
      self.emit('status update', '');
   }
 });
}

exports.resubscribe = resubscribe;
exports.check = check;
exports.job = job;
exports.jobRunner = jobRunner;
