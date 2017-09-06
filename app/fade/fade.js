var config   = require('../../config.json'),
    cs       = require('../../lib/clientsocket.js'),
    job      = require('../job.js'),
    hyphyJob = require('../hyphyjob.js').hyphyJob,
    jobdel   = require('../../lib/jobdel.js'),
    util     = require('util'),
    Q        = require('q'),  
    _        = require('underscore'),
    fs       = require('fs'),
    path     = require('path'),
    ss       = require('socket.io-stream');

var fade = function (socket, stream, fade_params) {

  var self = this;

  // params 
  // trees - nwk tree
  // seq - fasta file
  // info - additional parameter information

  self.socket = socket;
  self.stream = stream;
  self.params = fade_params;

  // object specific attributes
  self.type             = 'fade';
  self.qsub_script_name = 'FADE.sh';
  self.qsub_script      = path.join(__dirname, self.qsub_script_name);

  // parameter attributes
  self.msaid         = self.params.msa._id;
  self.id            = self.params.analysis._id;
  self.genetic_code  = self.params.msa[0].gencodeid + 1;
  self.analysis_type = self.params.analysis.analysis_type;
  self.treemode      = 0;
  self.msa           = self.params.msa[0];
  self.nwk_tree      = self.msa.nj;
  self.fg_model      = self.params.analysis.fg_branches;
  self.model         = "Dayhoff";

  // parameter-derived attributes
  self.fn          = path.join(__dirname, '/output/', self.id);
  self.output_dir  = path.dirname(self.fn);
  self.status_fn   = [self.fn, 'status'].join('.');
  self.progress_fn = [self.fn, 'progress'].join('.');
  self.out_fn      = [self.fn, 'out'].join('.');
  self.results_fn  = [self.fn, 'json'].join('.');
  self.tree_fn     = [self.fn, 'trees'].join('.');
  self.seq_fn      = [self.fn, 'seq'].join('.');
  self.aux_fn      = [self.fn, 'info'].join('.');

  self.qsub_params = ['-q',
                        config.qsub_queue,
                        '-v',
                        'fn='+self.fn+
                        ',seq_fn='+self.seq_fn+
                        ',json_fn='+self.results_fn+
                        ',out_fn='+self.out_fn+
                        ',sfn='+self.status_fn+
                        ',fg_model='+self.fg_model+
                        ',model='+self.model+
                        ',cwd='+__dirname,
                        '-o', self.output_dir,
                        '-e', self.output_dir, 
                        self.qsub_script];

  // Ensure the progress file exists
  fs.openSync(self.progress_fn, 'w');
  fs.openSync(self.status_fn, 'w');

  self.preparePreliminaryFiles(function() {
    console.log('initializing'); 
    self.init();
  });

};

util.inherits(fade, hyphyJob);

fade.prototype.formatTreeFiles = function() {

  var self = this;
  var sites = self.msa.rawsites-1;
  var string_to_write = "1\n0-" + sites + "\n" + self.nwk_tree;
  return string_to_write;

}

fade.prototype.preparePreliminaryFiles = function (callback) {

  var self = this;

  var aux_promise = Q.nfcall(fs.writeFile, self.aux_fn, '{"TREE_MODE" : 0}');
  var tree_promise = Q.nfcall(fs.writeFile, self.tree_fn, self.formatTreeFiles());

  var promises = [aux_promise, tree_promise]

  Q.allSettled(promises)  
  .then(function (results) { 
    callback('', 'success');
  });

};


exports.fade = fade;

