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
    cs     = require('../../lib/clientsocket.js'),
    job    = require('../job.js'),
    fs     = require('fs'),
    _      = require('underscore'),
    path   = require('path'),
    fs     = require('fs'),
    ss     = require('socket.io-stream');

var absrel = function (socket, stream, relax_params) {

  var self = this;
  self.socket = socket;
  self.stream = stream;
  self.params = params;
  self.filepath = fn;
  self.output_dir  = path.dirname(self.filepath);
  self.qsub_script_name = 'absrel.sh';
  self.qsub_script = __dirname + '/' + self.qsub_script_name;
  self.id = absrel_params.analysis._id;
  self.msaid = absrel_params.msa._id;
  self.status_fn = self.filepath + '.status';
  self.results_fn= self.filepath + '.absrel';
  self.results_json_fn = self.filepath + '.absrel.json';
  self.progress_fn = self.filepath + '.absrel.progress';
  self.tree_fn = self.filepath + '.tre';
  self.absrel = config.absrel;
  self.status_stack = absrel_params.status_stack;
  self.analysis_type = absrel_params.analysis.analysis_type;
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
                          ',rfn='+self.results_fn+
                          ',treemode='+self.treemode+
                          ',genetic_code='+self.genetic_code+
                          ',analysis_type='+self.analysis_type+
                          ',cwd='+__dirname+
                          ',msaid='+self.msaid,
                          '-o', self.output_dir,
                          '-e', self.output_dir, 
                          self.qsub_script];


  // Write tree to a file
  fs.writeFile(self.tree_fn, absrel_params.msa[0].nj, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');


}

// Pass socket to absrel job
absrel.prototype.spawn = function (socket, stream, params) {

  // Setup Analysis
  var self = this;
  self.jobrunner = new job.jobRunner();

  // On status updates, report to datamonkey-js
  jobrunner.on('status update', function(status_update) {
    socket.emit('status update', status_update);
  });

  // On errors, report to datamonkey-js
  jobrunner.on('script error', function(error) {
    socket.emit('script error', error);
    socket.disconnect();
  });

  // When the analysis completes, return the results to datamonkey.
  jobrunner.on('completed', function(results) {
    // Send trace and graph information
    socket.emit('completed', results);
    socket.disconnect();
  });

  // Report the torque job id back to datamonkey
  jobrunner.on('job created', function(torque_id) {
    // Send trace and graph information
    socket.emit('job created', torque_id);
  });

  // Send file
  jobrunner.on('progress file', function(params) {
    var stream = ss.createStream();
    ss(socket).emit('progress file', stream, {id : params.id });
    fs.createReadStream(params.fn).pipe(stream);
    socket.once('file saved', function () {
      params.cb();
    });
  });

  var fn = __dirname + '/output/' + params.analysis._id;
  stream.pipe(fs.createWriteStream(fn));

  stream.on('end', function(err) {
    if (err) throw err;
    // Pass filename in as opposed to generating it in spawn_absrel
    jobrunner.start(fn, params);
  });

}

absrel.prototype.onStatusUpdate = function() {

  fs.readFile(self.progress_fn, 'utf8', function (err, data) {
   if(err) {
     console.log('error reading progress file ' + self.progress_fn + '. error: ' + err);
     return;
   }
   if(data) {
     if(data != self.current_status) {
       self.emit('status update', {'phase' : status, 'index': 1, 'msg': data, 'torque_id' : self.torque_id});
       self.current_status = data;
     }
   } else {
    console.log('read progress file, but no data');
   }
 });


}

absrel.prototype.onCompleted = function () {

  fs.readFile(self.results_json_fn, 'utf8', function (err, data) {
    if(err) {
      // Check stderr
      fs.readFile(self.std_err, 'utf8', function (err, stack_trace) {
        if(err) {
        self.emit('script error', {'error' : 'unable to read results file'});
        } else {
          self.emit('script error', {'error' : stack_trace});
        }
      });
    } else {
      if(data) {
        self.emit('completed', {'results' : data});
      } else {
        self.emit('script error', {'error': 'job seems to have completed, but no results found'});
      }
    }
  });

}

absrel.prototype.onError = function() {

}

exports.absrel = absrel;
