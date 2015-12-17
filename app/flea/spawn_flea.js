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
    Q = require('q'),
    fs = require('fs'),
    tar = require('tar'),
    path = require('path'),
    config = require('../../config.json'),
    util = require('util'),
    moment = require('moment'),
    winston = require('winston'),
    Tail = require('tail').Tail,
    EventEmitter = require('events').EventEmitter,
    JobStatus = require(__dirname + '/../../lib/jobstatus.js').JobStatus;

var FleaRunner = function () {};
util.inherits(FleaRunner, EventEmitter);


/**
 * Submits a job to TORQUE by spawning qsub_submit.sh
 * The job is executed as specified in ./flea/README
 * Emit events that are being listened for by ./server.js
 */

FleaRunner.prototype.start = function (fn, flea_params) {

  var self = this;
  self.filepath = fn;
  self.output_dir  = path.dirname(self.filepath);
  self.id = flea_params.analysis._id;
  self.filedir =  path.join(self.output_dir, self.id);
  self.file_list = path.join(self.filedir,'/files');
  self.status_fn = self.filepath + '.status';
  self.results_fn= self.filepath + '.flea';
  self.python = config.flea_python;
  self.pipeline = config.flea_pipeline;
  self.flea_config = config.flea_config;
  self.status_stack = flea_params.status_stack;
  self.analysis_type = flea_params.analysis.analysis_type;
  self.msas = flea_params.analysis.msas;
  self.genetic_code = "1";
  self.torque_id = "unk";
  self.stdout = "";
  self.stderr = "";
  self.job_completed = false;

  // Results files
  self.analysis_dir = path.join(self.filedir, '/analysis/');
  self.frequencies_fn = path.join(self.analysis_dir, 'frequencies.json');
  self.rates_fn = path.join(self.analysis_dir, 'rates.json');
  self.rates_pheno_fn = path.join(self.analysis_dir, 'rates_pheno.json');
  self.sequences_fn = path.join(self.analysis_dir, 'sequences.json');
  self.trees_fn = path.join(self.analysis_dir, 'trees.json');
  self.divergence_fn = path.join(self.analysis_dir, 'js_divergence.json');
  self.copynumbers_fn = path.join(self.analysis_dir, 'copynumbers.json');
  self.coordinates_fn = path.join(self.analysis_dir, 'coordinates.json');
  self.dates_fn = path.join(self.analysis_dir, 'dates.json');
  self.run_info_fn = path.join(self.filedir, 'run_info.json');

  // flea_pipeline.py
  var flea_pipeline_submit = function () {

    self.emit('status update', {'phase': self.status_stack[2], 'msg': ''});

    var flea_pipeline_parameters = [ '-u', self.pipeline, '--config', self.flea_config, self.file_list ];
    winston.info('flea : submitting job : ' + self.python + ' ' + flea_pipeline_parameters.join(' '));

    var flea_pipeline =  spawn(self.python, flea_pipeline_parameters,  { cwd : self.filedir } );

    flea_pipeline.stdout.on('data', function (data) {

      self.stdout += String(data);
      winston.info(self.id + ' : flea : ' + self.stdout);
      var status_update_packet = {'phase': 'running', 'msg': self.stdout };
      self.emit('status update', status_update_packet);

    });

    flea_pipeline.stderr.on('data', function (data) {

      self.stderr += String(data);
      winston.info(self.id + ' : flea : ' + self.stderr);
      var status_update_packet = { 'phase' : 'running', 'msg' : self.stderr };
      self.emit('status update', status_update_packet);

    });

    flea_pipeline.on('close', function (code) {

      // Read results files and send
      winston.info('exit code: ' + code);

      // Save results files
      if(code === 0) {

        var frequency_promise = Q.nfcall(fs.readFile, self.frequencies_fn, "utf-8");
        var rates_promise = Q.nfcall(fs.readFile, self.rates_fn, "utf-8");
        var rates_pheno_promise = Q.nfcall(fs.readFile, self.rates_pheno_fn, "utf-8");
        var sequences_promise = Q.nfcall(fs.readFile, self.sequences_fn, "utf-8");
        var trees_promise = Q.nfcall(fs.readFile, self.trees_fn, "utf-8");
        var divergence_promise = Q.nfcall(fs.readFile, self.divergence_fn, "utf-8");
        var copynumbers_promise = Q.nfcall(fs.readFile, self.copynumbers_fn, "utf-8");
        var coordinates_promise = Q.nfcall(fs.readFile, self.coordinates_fn, "utf-8");
        var dates_promise = Q.nfcall(fs.readFile, self.dates_fn, "utf-8");
        var run_info_promise = Q.nfcall(fs.readFile, self.run_info_fn, "utf-8");


        var promises = [ frequency_promise,
                         rates_promise,
                         rates_pheno_promise,
                         sequences_promise,
                         trees_promise,
                         divergence_promise,
                         copynumbers_promise,
                         coordinates_promise,
                         dates_promise,
                         run_info_promise
                         ];

        Q.allSettled(promises)
        .then(function (results) {
            var hyphy_data = {};
            hyphy_data.frequencies = results[0].value;
            hyphy_data.rates       = results[1].value;
            hyphy_data.rates_pheno = results[2].value;
            hyphy_data.sequences   = results[3].value;
            hyphy_data.trees       = results[4].value;
            hyphy_data.divergence  = results[5].value;
            hyphy_data.copynumbers = results[6].value;
            hyphy_data.coordinates = results[7].value;
            hyphy_data.dates = results[8].value;
            hyphy_data.run_info = results[9].value;
            self.emit('completed', {'results' : hyphy_data});
          });

      } else {

        self.emit('script error', {'code' : code, 'error' : self.stderr });

      }

    });

  };

  // Write the contents of the file in the parameters to a file on the
  // local filesystem, then spawn the job.
  var do_flea = function(stream, flea_params) {

    self.emit('status update', {'phase': self.status_stack[1], 'msg': ''});

    //Unpack the tar file
    function onError(err) {
      err = err +   ' : ' + self.filepath;
      winston.warn('flea : script error: ' + self.python + ' ' + err);
      self.emit('script error', err);
    }

    function onEnd() {

      fs.writeFileSync(self.file_list, '');
      winston.log('flea : status update : creating list');

      // Create list inside filedir
      fs.readdir(self.filedir, function(err, files) {
        // Compare files in directory to file list
        self.msas.forEach(function(msa, index) {
          // Append to file
          // Format : PC64_V00_small.fastq V00 20080301
          if(files.indexOf(msa._id + '.fastq') != -1) {
            var formatted_visit_date = moment(msa.visit_date).format("YYYYMMDD");
            var string_to_write = util.format('%s %s %s\n', self.filedir + '/' + msa._id + '.fastq', msa.visit_code, formatted_visit_date);
            winston.log('flea : appending list : ' + string_to_write);
            fs.appendFileSync(self.file_list, string_to_write);
          }

          if(index == (self.msas.length - 1)) {
            flea_pipeline_submit();
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

    };

  do_flea(flea_params);

};

exports.FleaRunner = FleaRunner;
