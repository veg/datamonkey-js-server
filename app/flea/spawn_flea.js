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
    tar = require('tar'),
    path = require('path'),
    config = require('../../config.json'),
    util = require('util'),
    moment = require('moment'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    JobStatus = require(__dirname + '/../../lib/jobstatus.js').JobStatus;

var FleaRunner = function () {};
util.inherits(FleaRunner, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */

FleaRunner.prototype.status_watcher = function () {

  var self = this;

  job_status = new JobStatus(self.torque_id);

  job_status.watch(function(error, status) {
    if(status == 'completed' || status == 'exiting') {
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
 * The job is executed as specified in ./flea/README
 * Emit events that are being listened for by ./server.js
 */

FleaRunner.prototype.start = function (fn, flea_params) {

  var self = this;
  self.filepath = fn;
  self.output_dir  = path.dirname(self.filepath);
  self.qsub_script_name = 'flea.sh';
  self.qsub_script = __dirname + '/' + self.qsub_script_name;
  self.id = flea_params.analysis._id;
  self.filedir =  self.output_dir + '/' + self.id;
  self.file_list = self.filedir + '/files';
  self.status_fn = self.filepath + '.status';
  self.results_fn= self.filepath + '.flea';
  self.results_json_fn = self.filepath + '.flea.json';
  self.progress_fn = self.filepath + '.flea.progress';
  self.tree_fn = self.filepath + '.tre';
  self.python = config.flea_python;
  self.pipeline = config.flea_pipeline;
  self.status_stack = flea_params.status_stack;
  self.analysis_type = flea_params.analysis.analysis_type;
  self.msas = flea_params.msas;
  self.genetic_code = "1";
  self.torque_id = "unk";
  self.std_err = "unk";
  self.job_completed = false;
  self.current_status = "";

        
  //Unpack the tar file
  function onError(err) {
    console.error('An error occurred:', err)
    // TODO: emit script error
  }

  function onEnd() {
    fs.writeFileSync(self.file_list, '');
    // Create list inside filedir
    fs.readdir(self.filedir, function(err, files) {
      // Compare files in directory to file list
      self.msas.forEach(function(msa) {    
        // Append to file
        // Format : PC64_V00_small.fastq V00 20080301
        if(files.indexOf(msa._id) != -1) {
          var formatted_visit_date = moment(msa.visit_date).format("YYYYMMDD");
          var string_to_write = util.format('%s %s %s', msa._id, msa.visit_code, formatted_visit_date);
          fs.appendFileSync(self.file_list, string_to_write)
        }
      });
    });

  }

  var extractor = tar.Extract({path: self.filedir})
    .on('error', onError)
    .on('end', onEnd);

  fs.createReadStream(self.filepath)
    .on('error', onError)
    .pipe(extractor);

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');

  // qsub_submit.sh
  var qsub_submit = function () {

    var qsub =  spawn('qsub', 
                         ['-v',
                          'fn='+self.filepath+
                          ',python='+self.python+
                          ',pipeline='+self.pipeline+
                          ',tree_fn='+self.tree_fn+
                          ',pfn='+self.progress_fn+
                          ',rfn='+self.results_fn+
                          ',cwd='+__dirname+
                          '-o', self.output_dir,
                          '-e', self.output_dir, 
                          self.qsub_script], 
                          { cwd : self.output_dir});

    qsub.stderr.on('data', function (data) {
      console.log(String(data));
    });

    qsub.stdout.on('data', function (data) {
      self.torque_id = String(data).replace(/\n$/, '');
      self.std_err = self.output_dir + '/' + self.qsub_script_name + '.e' + String(self.torque_id).replace('.master','');
      self.emit('job created', { 'torque_id': self.torque_id });
      console.log(self.torque_id);
    });

    qsub.on('close', function (code) {
      // Should have received a job id
      // Write queuing to status
      console.log(code);
      if(code == 0) {
        fs.writeFile(self.status_fn, 
                     self.status_stack[0], function (err) {
          self.status_watcher();
        });
      } else {
        self.emit('script error', {'error': 'job could not be spawned to cluster'});
      }
    });

  }

  // Write the contents of the file in the parameters to a file on the 
  // local filesystem, then spawn the job.
  var do_flea = function(stream, flea_params) {
    self.emit('status update', {'phase': self.status_stack[0], 'msg': ''});
    qsub_submit();
  }

  do_flea(flea_params);

}

exports.FleaRunner = FleaRunner;
