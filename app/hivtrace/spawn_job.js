/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2013
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
    config = require('../../config.json'),
    util = require('util'),
    path = require('path'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    redis = require('redis');



var DoHivTraceAnalysis = function () {};
util.inherits(DoHivTraceAnalysis, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
DoHivTraceAnalysis.prototype.status_watcher = function () {

  self = this;
  self.subscriber.on('message', function(channel, message) { 
    var redis_packet = JSON.parse(message);

    if(redis_packet.type != 'completed') {
      self.emit(redis_packet.type, redis_packet); 
    } else {
      self.emit('dispatch file', {id : self.id, fn: path.basename(self.output_cluster_output), fp : self.output_cluster_output, type : 'trace_results', cb : function (err) {
        if(!self.lanl_compare) {
          if (err) throw err;
          self.emit('completed');
        } else {
          self.emit('dispatch file', { id : self.id, fn : path.basename(self.lanl_output_cluster_output), fp : self.lanl_output_cluster_output, type : 'lanl_trace_results', cb : function (err) {
            if (err) throw err;
            self.emit('completed');
          }});
        }
      }});
    }
  });
}

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./hivcluster/README
 * Emit events that are being listened for by ./server.js
 */
DoHivTraceAnalysis.prototype.start = function (hiv_cluster_params) {

  var self = this;

  var cluster_output_suffix='_user.trace.json',
      lanl_cluster_output_suffix='_lanl_user.trace.json',
      tn93_json_suffix='_user.tn93output.json',
      tn93_csv_suffix='_user.tn93output.csv';
      tn93_lanl_csv_suffix='_user.tn93output.csv';

  self.python = config.python;
  self.output_dir  = __dirname + '/output/';
  self.qsub_script = __dirname + '/hivtrace_submit.sh';
  self.filepath = self.output_dir + hiv_cluster_params._id;
  self.hivtrace = __dirname + '/hivtrace.py';
  self.id = hiv_cluster_params._id;
  self.distance_threshold = hiv_cluster_params.distance_threshold;
  self.ambiguity_handling = hiv_cluster_params.ambiguity_handling;
  self.fraction = hiv_cluster_params.fraction;
  self.reference = hiv_cluster_params.reference;
  self.min_overlap = hiv_cluster_params.min_overlap;
  self.status_stack = hiv_cluster_params.status_stack;
  self.lanl_compare = hiv_cluster_params.lanl_compare;
  self.status_fn = self.filepath+'_status';
  self.output_cluster_output = self.filepath + cluster_output_suffix;
  self.lanl_output_cluster_output = self.filepath + lanl_cluster_output_suffix;
  self.tn93_stdout = self.filepath + tn93_json_suffix;
  self.tn93_results = self.filepath + tn93_csv_suffix;
  self.tn93_lanl_results = self.filepath + tn93_csv_suffix;
  self.subscriber = redis.createClient();
  self.subscriber.subscribe(self.id);

  // qsub_submit.sh
  var qsub_submit = function () {

    var qsub =  spawn('qsub',
                         ['-v',
                          'fn='+self.filepath+
                          ',python='+self.python+
                          ',hivtrace='+self.hivtrace+
                          ',dt='+self.distance_threshold+
                          ',ambiguity_handling='+self.ambiguity_handling+
                          ',fraction='+self.fraction+
                          ',reference='+self.reference+
                          ',mo='+self.min_overlap+ 
                          ',comparelanl='+self.lanl_compare,
                          '-o', self.output_dir,
                          '-e', self.output_dir, 
                          self.qsub_script], 
                          { cwd: self.output_dir });

    qsub.stderr.on('data', function (data) {
      // Could not start job
      console.log('stderr: ' + data);
    });

    qsub.stdout.on('data', function (data) {
      //self.emit('job created', {'torque_id': String(data).replace(/\n$/, '')} );
    });

    qsub.on('close', function (code) {
      // Should have received a job id
      // Write queuing to status
      fs.writeFile(self.status_fn, 
                   self.status_stack[0], function (err) {
        self.status_watcher();
      });
    });
  }

  // Write the contents of the file in the parameters to a file on the 
  // local filesystem, then spawn the job.
  var do_hivcluster = function(hiv_cluster_params) {
    self.emit('status update', {'phase' : self.status_stack[0], 'msg' : self.status_stack[0]});
    qsub_submit();
  }

  do_hivcluster(hiv_cluster_params);

}

exports.DoHivTraceAnalysis = DoHivTraceAnalysis;
