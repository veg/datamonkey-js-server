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

var spawn = require('child_process').spawn,
    fs = require('fs'),
    path = require('path'),
    config = require('../../config.json'),
    util = require('util'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    JobStatus = require(__dirname + '/../../lib/jobstatus.js').JobStatus;

var DoRelaxAnalysis = function () {};
util.inherits(DoRelaxAnalysis, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */

DoRelaxAnalysis.prototype.status_watcher = function () {

  var self = this;
  job_status = new JobStatus(self.torque_id);

  self.metronome_id = job_status.watch(function(error, status) {
    if(status == 'completed' || status == 'exiting') {
      clearInterval(self.metronome_id);
      fs.readFile(self.results_fn, 'utf8', function (err, data) {
        if(err) {
          // Check stderr
          fs.readFile(self.std_err, 'utf8', function (err, stack_trace) {
            if(err) {
            self.emit('script error', {'error' : 'unable to read results file'});
            } else {
              self.emit('script error', {'error' : stack_trace});
            }
          });
        } else{
          if(data) {
            self.emit('completed', {'results' : data});
          } else {
            self.emit('script error', {'error': 'job seems to have completed, but no results found'});
          }
        }
	    });
    } else if (status == 'queued') {
      self.emit('job created', { 'torque_id': self.torque_id });
    } else {
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
 });

}

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./relax/README
 * Emit events that are being listened for by ./server.js
 */

DoRelaxAnalysis.prototype.start = function (fn, relax_params) {

  var self = this;
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
  self.job_completed = false;
  self.current_status = "";

  // Write tree to a file
  fs.writeFile(self.tree_fn, relax_params.analysis.tagged_nwk_tree, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');

  // qsub_submit.sh
  var qsub_submit = function () {
    var qsub =  spawn('qsub', 
                         ['-v',
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
                          self.qsub_script], 
                          { cwd : self.output_dir});

    qsub.stderr.on('data', function (data) {
      console.log(data);
    });

    qsub.stdout.on('data', function (data) {
      self.torque_id = String(data).replace(/\n$/, '');
      self.std_err = self.output_dir + '/' + self.qsub_script_name + '.e' + String(self.torque_id).replace('.master','');
      self.emit('job created', { 'torque_id': self.torque_id });
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
  var do_relax = function(stream, relax_params) {
    self.emit('status update', {'phase': self.status_stack[0], 'msg': ''});
    qsub_submit();
  }

  do_relax(relax_params);

}

exports.DoRelaxAnalysis = DoRelaxAnalysis;
