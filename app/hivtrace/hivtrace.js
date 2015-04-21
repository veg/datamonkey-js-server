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
    ss           = require('socket.io-stream');
    fs           = require('fs'),
    config       = require('../../config.json'),
    util         = require('util'),
    path         = require('path'),
    hyphyJob     = require('../hyphyjob.js').hyphyJob,
    Tail         = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    Q            = require('q'),
    JobStatus    = require('../../lib/jobstatus.js').JobStatus,
    redis        = require('redis');

// Use redis as our key-value store
var client = redis.createClient();

var hivtrace = function (socket, stream, params) {

  var self = this;

  var cluster_output_suffix='_user.trace.json',
      lanl_cluster_output_suffix='_lanl_user.trace.json',
      tn93_json_suffix='_user.tn93output.json',
      tn93_csv_suffix='_user.tn93output.csv',
      tn93_lanl_csv_suffix='_user.tn93output.csv',
      custom_reference_suffix='_custom_reference.fas';

  self.socket = socket;
  self.stream = stream;
  self.params = params;

  // object specific attributes
  self.python              = config.python;
  self.output_dir          = __dirname + '/output/';
  self.qsub_script_name    = 'hivtrace_submit.sh';
  self.qsub_script         = __dirname + '/' + self.qsub_script_name;
  self.hivtrace            = __dirname + '/hivtrace.py';
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
  self.strip_drams        = params.strip_drams == 'no' ? false : params.strip_drams;

  if(params.reference == 'Custom') {
    self.custom_reference_fn = self.filepath + custom_reference_suffix;
    self.custom_reference = params.custom_reference;
    self.reference = self.custom_reference_fn;
    // Check if reference is custom, and write to a file if so.
    fs.writeFile(self.custom_reference_fn, self.custom_reference, function (err) {});
  } 


  // parameter-derived attributes
  self.filepath                   = self.output_dir + self.id;
  self.status_fn                  = self.filepath + '_status';
  self.output_cluster_output      = self.filepath + cluster_output_suffix;
  self.lanl_output_cluster_output = self.filepath + lanl_cluster_output_suffix;
  self.tn93_stdout                = self.filepath + tn93_json_suffix;
  self.tn93_results               = self.filepath + tn93_csv_suffix;
  self.tn93_lanl_results          = self.filepath + tn93_csv_suffix;



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

  client.hset(self.id, 'params', self.params);

  // Setup Analysis
  var trace_runner = new HivTraceRunner(self.id);
  new cs.ClientSocket (self.socket, self.id);

  // On status updates, report to datamonkey-js
  trace_runner.on('status update', function(status_update) {
    self.onStatusUpdate(status_update.phase, self.status_stack.indexOf(status_update.phase));
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

  // Setup has been completed, run the job with the parameters from datamonkey
  self.stream.pipe(fs.createWriteStream(__dirname + '/output/' + self.id));
  trace_runner.submit(self.qsub_params, self.output_dir);

};

hivtrace.prototype.onComplete = function () {

  var self = this;

  client.hset(self.id, 'status', 'completed');

  var results_promise = Q.nfcall(fs.readFile, self.output_cluster_output, "utf-8"); 
  var lanl_results_promise = Q.nfcall(fs.readFile, self.lanl_output_cluster_output, "utf-8"); 
  var promises = [ results_promise, lanl_results_promise]; 

  Q.allSettled(promises) 
  .then(function (results) { 

      if (results[0].state == 'fulfilled' && results[0].value) {

        var results_data = {};

        results_data.trace_results = results[0].value;
        results_data.lanl_trace_results = results[1].value;

        var redis_packet = { 'results' : results_data };
        redis_packet.type = 'completed';

        var str_redis_packet = JSON.stringify(redis_packet);

        // Log that the job has been completed
        self.log('complete', 'success');
        self.log('complete', str_redis_packet);

        // Store packet in redis and publish to channel
        client.hset(self.id, 'results', str_redis_packet);
        client.publish(self.id, str_redis_packet);

        // Remove id from active_job queue
        client.lrem('active_jobs', 1, self.id);

      } else {
        self.onError('job seems to have completed, but no results found');
      }

    }); 

}


// An object that manages the qsub process
var HivTraceRunner = function (id) {

  var self = this; 
  self.subscriber = redis.createClient();
  self.subscriber.subscribe('python_' + id);
  self.last_status_update = '';

};

util.inherits(HivTraceRunner, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
HivTraceRunner.prototype.status_watcher = function () {

  var self = this;
  

  var job_status = new JobStatus(self.torque_id);

  self.metronome_id = job_status.watch(function(error, status) {
    if(status == 'completed' || status == 'exiting') {
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

    var qsub =  spawn('qsub', qsub_params, { cwd: cwd });

    qsub.stderr.on('data', function (data) {

      winston.warn(data);
      // error when starting job
      self.emit('script error', {'error' : ''+data});

    });

    qsub.stdout.on('data', function (data) {

      torque_id = String(data).replace(/\n$/, '');
      winston.info(torque_id);
      self.torque_id = torque_id;
      self.emit('job created', { 'torque_id': torque_id });

    });

    qsub.on('close', function (code) {

      self.status_watcher();

    });

  }

  qsub_submit();


}

exports.hivtrace = hivtrace;
