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

var config = require('../../config.json'),
    fs = require('fs'),
    ss = require('socket.io-stream'),
    spawn = require('child_process').spawn,
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,

//util.inherits(Relax, Job);

var relax = function (socket, stream, relax_params) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  self.filepath = fn;
  self.output_dir  = path.dirname(self.filepath);
  self.qsub_script_name = 'relax.sh';
  self.qsub_script = __dirname + '/' + self.qsub_script_name;
  self.id = relax_params.analysis._id;
  self.msaid = relax_params.msa._id;
  self.status_fn = self.filepath + '.status';
  self.progress_fn = self.filepath + '.RELAX.progress';
  self.results_fn = self.filepath + '.RELAX.json';
  self.tree_fn = self.filepath + '.tre';
  self.relax = config.relax;
  self.status_stack = relax_params.status_stack;
  self.analysis_type = relax_params.analysis.analysis_type;
  self.genetic_code = "1";
  self.torque_id = "unk";
  self.std_err = "unk";

  self.qsub_params = ['-q',
                        config.qsub_queue,
                        '-v',
                        'fn='+self.filepath+
                        ',tree_fn='+self.tree_fn+
                        ',sfn='+self.status_fn+
                        ',pfn='+self.progress_fn+
                        ',treemode='+self.treemode+
                        ',genetic_code='+self.genetic_code+
                        ',analysis_type='+self.analysis_type+
                        ',cwd='+__dirname+
                        ',msaid='+self.msaid,
                        '-o', self.output_dir,
                        '-e', self.output_dir, 
                        self.qsub_script];

  // Write tree to a file
  fs.writeFile(self.tree_fn, relax_params.analysis.tagged_nwk_tree, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');

};

// Pass socket to relax job
var relax.prototype.spawn = function () {

  // Setup Analysis
  var self = this;
  self.jobrunner = new job.jobRunner();

  // Report the torque job id back to datamonkey
  self.jobrunner.on('job created', function(torque_id) {
    self.std_err = self.output_dir + '/' + self.qsub_script_name + '.e' + String(self.torque_id).replace('.master','');
    self.socket.emit('job created', torque_id);
  });

  // On status updates, report to datamonkey-js
  self.jobrunner.on('status update', function(status_update) {
    self.socket.emit('status update', status_update);
  });

  // On errors, report to datamonkey-js
  self.jobrunner.on('script error', function(error) {
    self.socket.emit('script error', error);
    self.socket.disconnect();
  });

  // When the analysis completes, return the results to datamonkey.
  self.jobrunner.on('completed', function(results) {
    self.socket.emit('completed', results);
    self.socket.disconnect();
  });

  var fn = __dirname + '/output/' + params.analysis._id;
  self.stream.pipe(fs.createWriteStream(fn));

  self.stream.on('end', function(err) {
    if (err) throw err;
    // Pass filename in as opposed to generating it in spawn_relax
    self.jobrunner.start(fn, params);
  });

}

exports.relax = relax;
