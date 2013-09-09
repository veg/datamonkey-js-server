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
    config = require('../config.js'),
    util = require('util'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter;


var DoHivClusterAnalysis = function () {};

util.inherits(DoHivClusterAnalysis, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
DoHivClusterAnalysis.prototype.status_watcher = function () {
  self = this;
  tail = new Tail(self.status_fn);
  tail.on("line", function(data) {
    // If data reports error, report back to user
    if(data == 'Completed') {
      var results = {};
      self.emit('dispatch file', {id : self.id, fn : self.output_dot_graph, type : 'graph_dot', cb : function (err) {
        if (err) throw err;
        self.emit('dispatch file', {id : self.id, fn : self.output_cluster_output, type : 'cluster_csv', cb : function (err) {
          if(!self.lanl_compare) {
            if (err) throw err;
            self.emit('completed');
          } else {
            self.emit('dispatch file', {id : self.id, fn : self.lanl_output_dot_graph, type : 'lanl_graph_dot', cb : function (err) {
              if (err) throw err;
              self.emit('dispatch file', {id : self.id, fn : self.lanl_output_cluster_output, type : 'lanl_cluster_csv', cb : function (err) {
                if (err) throw err;
                self.emit('completed');
              }});
            }});
          }
        }});
     }}); 
    } else if (data == 'error') {
      self.emit('error', {error: "There was an unexpected error while processing, please try again or report the issue to bitcore@ucsd.edu"});
    } else {
      self.emit('status update', {status_update: data});
    }
  });
}

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./hivcluster/README
 * Emit events that are being listened for by ./server.js
 */
DoHivClusterAnalysis.prototype.start = function (hiv_cluster_params) {

  var self = this;

  var cluster_output_suffix='_user.cluster.csv',
      graph_output_suffix='_user.graph.dot';
      lanl_cluster_output_suffix='_lanl_user.cluster.csv',
      lanl_graph_output_suffix='_lanl_user.graph.dot';

  self.id = hiv_cluster_params.filename;
  self.filepath = config.output_dir + hiv_cluster_params.filename;
  self.distance_threshold = hiv_cluster_params.distance_threshold;
  self.min_overlap = hiv_cluster_params.min_overlap;
  self.status_stack = hiv_cluster_params.status_stack;
  self.lanl_compare = hiv_cluster_params.lanl_compare;
  self.status_fn = self.filepath+'_status';
  self.output_dot_graph = self.filepath + graph_output_suffix;
  self.output_cluster_output = self.filepath + cluster_output_suffix;
  self.lanl_output_dot_graph = self.filepath + lanl_graph_output_suffix;
  self.lanl_output_cluster_output = self.filepath + lanl_cluster_output_suffix;

  // qsub_submit.sh
  var qsub_submit = function () {
    var qsub =  spawn('qsub', 
                         ['-v','fn='+self.filepath+
                          ',dt='+self.distance_threshold+
                          ',mo='+self.min_overlap+ 
                          ',comparelanl='+self.lanl_compare+
                          ',od='+config.output_dir+ 
                          ',bealign='+config.bealign+ 
                          ',bam2msa='+config.bam2msa+ 
                          ',tn93dist='+config.tn93dist+ 
                          ',hivnetworkcsv='+config.hivnetworkcsv,
                          '-o', config.output_dir,
                          '-e', config.output_dir, 
                          config.qsub_script], 
                          { cwd: config.output_dir });

    qsub.stderr.on('data', function (data) {
      // Could not start job
      //console.log('stderr: ' + data);
    });

    qsub.stdout.on('data', function (data) {
      // Could not start job
      self.emit('job created',{'torque_id': String(data).replace(/\n$/, '')});
    });

    qsub.on('close', function (code) {
      // Should have received a job id
      // Write queuing to status
      fs.writeFile(self.status_fn, 
                   self.status_stack[0], function (err) {
        self.status_watcher();
        //console.log('Done: ' + code);
      });
    });
  }

  // Write the contents of the file in the parameters to a file on the 
  // local filesystem, then spawn the job.
  var do_hivcluster = function(hiv_cluster_params) {
    fs.writeFile(self.filepath, 
                 hiv_cluster_params.file_contents, function (err) {
      if (err) throw err;
      self.emit('status update', {status_update: self.status_stack[0]});
      qsub_submit();
    });
  }

  do_hivcluster(hiv_cluster_params);

}

exports.DoHivClusterAnalysis = DoHivClusterAnalysis;

