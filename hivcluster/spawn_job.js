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

// Once the job has been scheduled, we need to watch the files that it
// sends updates to.
DoHivClusterAnalysis.prototype.status_watcher = function() {
  self = this;
  tail = new Tail(self.status_fn);
  tail.on("line", function(data) {
    // If data reports error, report back to user
    if(data == 'Completed') {
      var results = {};
      fs.readFile(self.output_dot_graph, function (err, data) {
        if (err) throw err;
        results.graph_dot = String(data);
        fs.readFile(self.output_cluster_output, function (err, data) {
          if (err) throw err;
          results.cluster_csv = String(data);
          self.emit('completed',{results: results});
        });
     }); 
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

  self.fn = config.output_dir + hiv_cluster_params.filename,
  self.distance_threshold = hiv_cluster_params.distance_threshold,
  self.min_overlap = hiv_cluster_params.min_overlap,
  self.status_fn = self.fn+'_status',
  self.output_dot_graph = self.fn + graph_output_suffix,
  self.output_cluster_output = self.fn + cluster_output_suffix;

  
  // qsub_submit.sh
  var qsub_submit = function () {
    var qsub =  spawn('qsub', 
                         ['-v','fn='+self.fn+',dt='+self.distance_threshold+',mo='+self.min_overlap, 
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
                   config.statuses[0], function (err) {
        self.status_watcher();
        //console.log('Done: ' + code);
      });
    });
  }

  // lanl_qsub_submit.sh
  var lanl_qsub_submit = function () {
    var qsub =  spawn('qsub', 
                         ['-v','fn='+self.fn+',dt='+self.distance_threshold+',mo='+self.min_overlap, 
                          '-o', config.output_dir,
                          '-e', config.output_dir, 
                          config.lanl_qsub_script], 
                          { cwd: config.output_dir });

    qsub.stderr.on('data', function (data) {
      // Could not start job
      //console.log('stderr: ' + data);
    });

    qsub.stdout.on('data', function (data) {
      // Could not start job
      self.emit('job created',{'lanl_torque_id': String(data).replace(/\n$/, '')});
    });

    qsub.on('close', function (code) {
      // Should have received a job id
      // Write queuing to status
      fs.writeFile(self.status_fn, 
                   config.statuses[0], function (err) {
        self.status_watcher();
        //console.log('Done: ' + code);
      });
    });
  }
  
  // Write the contents of the file in the parameters to a file on the 
  // local filesystem, then spawn the job.
  var do_hivcluster = function(hiv_cluster_params) {
    fs.writeFile(config.output_dir + hiv_cluster_params.filename, 
                 hiv_cluster_params.file_contents, function (err) {
      if (err) throw err;
      self.emit('status update', {status_update: config.statuses[0]});
      qsub_submit();
    });
  }

  do_hivcluster(hiv_cluster_params);

}

DoHivClusterAnalysis.prototype.start_lanl = function (hiv_cluster_params) {

  var self = this;

  var cluster_output_suffix='_lanl_user.cluster.csv',
      graph_output_suffix='_lanl_user.graph.dot';

  var fn = config.output_dir + hiv_cluster_params.filename,
      distance_threshold = hiv_cluster_params.distance_threshold,
      min_overlap = hiv_cluster_params.min_overlap,
      status_fn = fn+'_lanl_status';

  var  output_dot_graph = fn + graph_output_suffix,
       output_cluster_output = fn + cluster_output_suffix;


  // lanl_qsub_submit.sh
  var lanl_qsub_submit = function () {
    var qsub =  spawn('qsub', 
                         ['-v','fn='+fn+',dt='+distance_threshold+',mo='+min_overlap, 
                          '-o', config.output_dir,
                          '-e', config.output_dir, 
                          config.lanl_qsub_script], 
                          { cwd: config.output_dir });

    qsub.stderr.on('data', function (data) {
      // Could not start job
      //console.log('stderr: ' + data);
    });

    qsub.stdout.on('data', function (data) {
      // Could not start job
      self.emit('job created',{'lanl_torque_id': String(data).replace(/\n$/, '')});
    });

    qsub.on('close', function (code) {
      // Should have received a job id
      // Write queuing to status
      fs.writeFile(self.status_fn, 
                   config.statuses[0], function (err) {
        self.status_watcher();
        //console.log('Done: ' + code);
      });
    });
  }

  //Spawn process
  lanl_qsub_submit();

}

exports.DoHivClusterAnalysis = DoHivClusterAnalysis;

