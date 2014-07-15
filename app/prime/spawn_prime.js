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
    config = require('../config.json'),
    util = require('util'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter;

var DoPrimeAnalysis = function () {};
util.inherits(DoPrimeAnalysis, EventEmitter);

/**
 * Once the job has been scheduled, we need to watch the files that it
 * sends updates to.
 */
DoPrimeAnalysis.prototype.status_watcher = function () {
  self = this;
  fs.openSync(self.progress_fn, 'w')
  fs.watch(self.progress_fn, function(e, filename) { 
    fs.readFile(self.progress_fn, 'utf8', function (err,data) {
      if(data) {
        try {
          new_status = JSON.parse(data)
          if(new_status) {
            self.emit('status update', {'phase': self.status_stack[1], 'msg': new_status});
          }
        } catch(e) {
        }
      }
    });
  });
}

/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./prime/README
 * Emit events that are being listened for by ./server.js
 */
DoPrimeAnalysis.prototype.start = function (prime_params) {

  var self = this;
  self.id = prime_params.analysis._id;
  self.msaid = prime_params.msa._id;
  self.treemode = prime_params.analysis.treemode;
  self.genetic_code = 0;
  self.posterior_p = prime_params.analysis.posterior_p;
  self.filepath = config.prime_output_dir + self.id;
  self.status_fn = self.filepath + '.status';
  self.progress_fn = self.filepath + '.progress';
  self.prime = config.prime;
  self.status_stack = prime_params.status_stack;

  // qsub_submit.sh
  var qsub_submit = function () {

    var qsub =  spawn('qsub', 
                         [
                          '-d', 
                          config.script_basepath + 'prime',
                          '-v',
                          'fn='+self.filepath+
                          ',sfn='+self.status_fn+
                          ',treemode='+self.treemode+
                          ',genetic_code='+self.genetic_code+
                          ',msaid='+self.msaid+
                          ',posterior_p='+self.posterior_p,
                          './prime_submit.sh'], 
                          { cwd : config.script_basepath + 'prime'});

    qsub.stderr.on('data', function (data) {
      // Could not start job
      //console.log('stderr: ' + data);
    });

    qsub.stdout.on('data', function (data) {
      self.emit('job created', {'torque_id': String(data).replace(/\n$/, '')} );
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
  var do_prime = function(stream, prime_params) {
    self.emit('status update', {'phase': self.status_stack[0], 'msg': ''});
    qsub_submit();
  }

  do_prime(prime_params);

}

exports.DoPrimeAnalysis = DoPrimeAnalysis;
