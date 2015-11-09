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


var spawn        = require('child_process').spawn,
    cs           = require('../../lib/clientsocket.js'),
    fs           = require('fs'),
    fs           = require('fs'),
    config       = require('../../config.json'),
    util         = require('util'),
    path         = require('path'),
    hyphyJob     = require('../hyphyjob.js').hyphyJob,
    Tail         = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    Q            = require('q'),
    _            = require('underscore'),
    JobStatus    = require('../../lib/jobstatus.js').JobStatus,
    winston      = require('winston'),
    Tail         = require('tail').Tail,
    redis        = require('redis');


// Use redis as our key-value store
var client = redis.createClient();

var hivtrace = function (socket, stream, params) {

  var self = this;

  self.status_states = {
    PENDING   : 1,
    RUNNING   : 2,
    COMPLETED : 3
  }

  var cluster_output_suffix='_user.trace.json',
      lanl_cluster_output_suffix='_lanl_user.trace.json',
      tn93_json_suffix='_user.tn93output.json',
      tn93_csv_suffix='_user.tn93output.csv',
      tn93_lanl_csv_suffix='_user.tn93output.csv',
      custom_reference_suffix='_custom_reference.fas',
      hivtrace_log_suffix='.hivtrace.log',
      output_fasta_suffix='_output.fasta'

  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.python              = path.join(__dirname, '../../.python/env/bin/python');
  self.output_dir          = path.join(__dirname, '/output/');
  self.qsub_script_name    = 'hivtrace_submit.sh';
  self.qsub_script         = path.join(__dirname, self.qsub_script_name);
  self.hivtrace            = path.join(__dirname, '../../.python/env/bin/hivtrace');
  self.custom_reference_fn = '';
  self.type                = 'hivtrace';

  // parameter attributes
  self.id                 = params._id;
  self.distance_threshold = params.distance_threshold;
  self.ambiguity_handling = params.ambiguity_handling;
  self.fraction           = params.fraction;
  self.reference          = params.reference;
  self.filter_edges       = params.filter_edges;
  self.reference_strip    = params.reference_strip;
  self.min_overlap        = params.min_overlap;
  self.status_stack       = params.status_stack;
  self.lanl_compare       = params.lanl_compare;
  self.prealigned         = params.prealigned;
  self.strip_drams        = params.strip_drams == 'no' ? false : params.strip_drams;

  if(params.reference == 'Custom') {
    self.custom_reference_fn = self.filepath + custom_reference_suffix;
    self.custom_reference = params.custom_reference;
    self.reference = self.custom_reference_fn;
    // Check if reference is custom, and write to a file if so.
    fs.writeFile(self.custom_reference_fn, self.custom_reference, function (err) {});
  } 

  // parameter-derived attributes
  self.filepath                   = path.join(self.output_dir, self.id);
  self.status_fn                  = self.filepath + '_status';
  self.output_cluster_output      = self.filepath + cluster_output_suffix;
  self.tn93_stdout                = self.filepath + tn93_json_suffix;
  self.tn93_results               = self.filepath + tn93_csv_suffix;
  self.tn93_lanl_results          = self.filepath + tn93_csv_suffix;
  self.aligned_fasta              = self.filepath + output_fasta_suffix;
  self.hivtrace_log               = self.filepath + hivtrace_log_suffix;

  initial_statuses = [];
  _.each(self.status_stack, function(d, i) {  
                              initial_statuses.push({title : d, status : self.status_states.PENDING}); 
                            });

  client.hset(self.id, 'complete phase status',  JSON.stringify(initial_statuses));

  self.qsub_params = [ '-q',
                  config.qsub_queue,
                  '-v',
                  'fn='+self.filepath+
                  ',python='+self.python+
                  ',hivtrace='+self.hivtrace+
                  ',dt='+self.distance_threshold+
                  ',ambiguity_handling='+self.ambiguity_handling+
                  ',fraction='+self.fraction+
                  ',reference='+self.reference+
                  ',mo='+self.min_overlap+ 
                  ',filter='+self.filter_edges+
                  ',comparelanl='+self.lanl_compare+
                  ',reference_strip='+self.reference_strip+
                  ',strip_drams='+self.strip_drams+
                  ',prealigned='+self.prealigned+
                  ',output='+self.output_cluster_output+
                  ',hivtrace_log='+self.hivtrace_log+
                  ',custom_reference_fn='+self.custom_reference_fn,
                  '-o', self.output_dir,
                  '-e', self.output_dir,
                  self.qsub_script
                 ];

  self.spawn();

};

util.inherits(hivtrace, hyphyJob);

hivtrace.prototype.spawn = function () {

  var self = this;
  self.send_aligned_fasta_once = _.once(self.sendAlignedFasta);

  client.hset(self.id, 'params', self.params);

  // Setup Analysis
  var trace_runner = new HivTraceRunner(self.id, self.hivtrace_log);
  new cs.ClientSocket (self.socket, self.id);

  // On status updates, report to datamonkey-js
  trace_runner.on('status update', function(status_update) {

    var index = status_update.index;
    var status = status_update.status;

    self.onStatusUpdate(status_update, status_update.index);
    self.log(status_update);

    self.warn(JSON.stringify(status_update));

    if(index >= 3 && status == 3) {
      self.send_aligned_fasta_once();
    }

  });

  // On errors, report to datamonkey-js
  trace_runner.on('script error', function(error) {
    self.onError(error);
  });

  // When the analysis completes, return the results to datamonkey.
  trace_runner.on('completed', function() {
    self.onComplete();
  });

  // Report the torque job id back to datamonkey
  trace_runner.on('job created', function(torque_id) {
    self.onJobCreated(torque_id);
  });

  // Report tn93 summary back to datamonkey
  trace_runner.on('tn93 summary', function(tn93) {
    socket.emit('tn93 summary', tn93);
  });

  // Global event that triggers all jobs to cancel
  process.on('cancelJob', function(msg) {
    self.warn('cancel called!');
    self.cancel_once = _.once(self.cancel);
    self.cancel_once();
  });

  // Setup has been completed, run the job with the parameters from datamonkey
  self.stream.pipe(fs.createWriteStream(path.join(__dirname, '/output/', self.id)));
  trace_runner.submit(self.qsub_params, self.output_dir);

};

hivtrace.prototype.onStatusUpdate = function(data, index) {

  var self = this;
  self.current_status = data;

  // get current status stored in redis
  client.hget(self.id, 'complete phase status', function(err, entire_status) {

    //msg = {
    //  'type'   : 'status update',
    //  'index'  : phase[0]
    //  'phase'  : phase[1],
    //  'status' : status,
    //  'msg'    : msg
    //}

    var new_status = JSON.parse(entire_status);
    new_status[data.index].status = data.status;
    new_status[data.index].index = data.index;
    
    // update all older statuses as completed
    _.each(new_status.slice(0, data.index), function(d, i) { 
                                             new_status[i].status = self.status_states.COMPLETED;
                                           });

    new_status[data.index].msg = data.msg ? data.msg : '';

    var status_update = { 
                          'msg'       : new_status,
                          'torque_id' : self.torque_id
                        };


    // Prepare redis packet for delivery
    client.hset(self.id, 'status update', JSON.stringify(data));

    var redis_packet = status_update;
    redis_packet.type = 'status update';
    str_redis_packet =  JSON.stringify(status_update);

    // Store packet in redis and publish to channel
    client.hset(self.id, 'complete phase status', JSON.stringify(new_status));

    // Publish updates for all statuses
    client.publish(self.id, str_redis_packet);

    // Log status update on server
    self.log('status update', str_redis_packet);

  });

};

hivtrace.prototype.onComplete = function () {

  var self = this;
  client.hset(self.id, 'status', 'completed');

  var results_promise = Q.nfcall(fs.readFile, self.output_cluster_output, "utf-8"); 
  var promises = [ results_promise ]; 

  Q.allSettled(promises) 
  .then(function (results) { 

      if (results[0].state == 'fulfilled' && results[0].value) {

        var results_data = JSON.parse(results[0].value);
        var redis_packet = {'type' : 'completed'};
        var str_redis_packet = JSON.stringify(redis_packet);

        // Log that the job has been completed
        self.log('complete', 'success');


        // Store packet in redis and publish to channel
        client.hset(self.id, 'results', str_redis_packet);
        self.socket.emit('completed', { results : results_data });

        // Remove id from active_job queue
        client.lrem('active_jobs', 1, self.id);

      } else {
        self.onError('job seems to have completed, but no results found: ' + self.output_cluster_output);
      }

    }); 
}

hivtrace.prototype.onJobCreated = function (torque_id) {

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
  self.push_job_once(self.id);

};

hivtrace.prototype.sendAlignedFasta = function () {

  var self = this;

  var aligned_promise = Q.nfcall(fs.readFile, self.aligned_fasta); 
  var promises = [aligned_promise]; 

  Q.allSettled(promises) 
  .then(function (results) { 

      if (results[0].state == 'fulfilled' && results[0].value) {

        self.socket.emit('aligned fasta', { buffer : results[0].value });

        // Log that the job has been completed
        self.warn('sending aligned fasta', self.aligned_fasta, 'success');

      } else {
        self.onError(self.aligned_fasta + ': no aligned fasta to send');
      }

    }); 

}

// An object that manages the qsub process
var HivTraceRunner = function (id, hivtrace_log) {

  var self = this; 
  self.python_redis_channel = 'python_' + id;
  self.hivtrace_log = hivtrace_log;
  self.subscriber = redis.createClient();
  self.subscriber.subscribe(self.python_redis_channel);
  self.last_status_update = '';

};

util.inherits(HivTraceRunner, EventEmitter);

HivTraceRunner.prototype.log_publisher = function() {

  var self = this;

  // read log file
  tail = new Tail(self.hivtrace_log);

  tail.on("line", function(data) {

    winston.debug(data);

    if(data.indexOf('INFO:') != -1) {

      var msg = '';

      // try parsing the message
      try {
        var info = data.split('INFO:')[1].split('root:')[1];
        msg = JSON.parse(info);
      } catch (e) {
        winston.warn('error' + e + ' for ' + info)
      }

      // publish to redis
      client.publish(self.python_redis_channel, JSON.stringify(msg));

    }

  });

}

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
HivTraceRunner.prototype.status_watcher = function () {

  var self = this;

  var job_status = new JobStatus(self.torque_id);

  self.metronome_id = job_status.watch(function(error, status) {

    var status = status.status;

    if(status == 'completed' || status == 'exiting') {
      // check exit code
      clearInterval(self.metronome_id);
      self.emit('completed', '');
    }

  });

  self.subscriber.on('message', function(channel, message) { 

    var redis_packet = JSON.parse(message);
    winston.info(redis_packet);

    if(message != self.last_status_update) {
      self.emit(redis_packet.type, redis_packet); 
      self.last_status_update = message;
    }

  });

};

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./hivcluster/README
 * Emit events that are being listened for by ./server.js
 */
HivTraceRunner.prototype.submit = function (qsub_params, cwd) {

  var self = this;

  var qsub_submit = function () {

    var qsub = spawn('qsub', qsub_params, { cwd: cwd });

    qsub.stderr.on('data', function (data) {
      // error when starting job
      self.emit('script error', {'error' : ''+data});
      //winston.warn(data);
    });

    qsub.stdout.on('data', function (data) {

      self.torque_id = String(data).replace(/\n$/, '');
      self.emit('job created', { 'torque_id': self.torque_id });
      winston.info(self.torque_id);

    });

    qsub.on('close', function (code) {
      self.status_watcher();
    });

  }

  fs.closeSync(fs.openSync(self.hivtrace_log, 'w'));
  qsub_submit();
  self.log_publisher();

}

exports.hivtrace = hivtrace;
