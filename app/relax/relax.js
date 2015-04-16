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

var config   = require('../../config.json'),
    cs       = require('../../lib/clientsocket.js'),
    job      = require('../job.js'),
    hyphyJob = require('../hyphyjob.js').hyphyJob,
    jobdel   = require('../../lib/jobdel.js'),
    util     = require('util'),
    _        = require('underscore'),
    fs       = require('fs'),
    path     = require('path'),
    ss       = require('socket.io-stream');

var relax = function (socket, stream, relax_params) {

  var self = this;

  self.socket = socket;
  self.stream = stream;
  self.params = relax_params;

  // object specific attributes
  self.type             = 'relax';
  self.qsub_script_name = 'relax.sh';
  self.qsub_script      = __dirname + '/' + self.qsub_script_name;

  // parameter attributes
  self.msaid         = self.params.msa._id;
  self.id            = self.params.analysis._id;
  self.genetic_code  = self.params.msa[0].gencodeid + 1;
  self.analysis_type = self.params.analysis.analysis_type;
  self.nwk_tree      = self.params.analysis.tagged_nwk_tree;

  // parameter-derived attributes
  self.fn          = __dirname + '/output/' + self.id;
  self.output_dir  = path.dirname(self.fn);
  self.status_fn   = self.fn + '.status';
  self.progress_fn = self.fn + '.RELAX.progress';
  self.results_fn  = self.fn + '.RELAX.json';
  self.tree_fn     = self.fn + '.tre';

  self.qsub_params = ['-q',
                        config.qsub_queue,
                        '-v',
                        'fn='+self.fn+
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
  fs.writeFile(self.tree_fn, self.nwk_tree, function (err) {
    if (err) throw err;
  });

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');
  fs.openSync(self.status_fn, 'w');

  self.init();

};

util.inherits(relax, hyphyJob);

exports.relax = relax;
