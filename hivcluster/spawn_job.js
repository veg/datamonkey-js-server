var spawn = require('child_process').spawn,
    fs = require('fs'),
    config = require('../config.js'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter;

var REFERENCE = 'HXB2_prrt',
    SCORE_MATRIX = 'HIV_BETWEEN_F',
    OUTPUT_FORMAT = 'CSV',
    BAM_OUTPUT_SUFFIX = '_output.bam',
    FASTA_OUTPUT_SUFFIX = '_output.fasta',
    TN93_OUTPUT_SUFFIX = '_user.tn93output.csv',
    CLUSTER_OUTPUT_SUFFIX = '_user.cluster.csv',
    GRAPH_OUTPUT_SUFFIX = '_user.graph.dot';


var DoHivClusterAnalysis = function () {};
util.inherits(DoHivClusterAnalysis, EventEmitter);

DoHivClusterAnalysis.prototype.run = function (hiv_cluster_params) {
  var self = this;

  var fn = hiv_cluster_params.filename,
      reference = REFERENCE,
      score_matrix = SCORE_MATRIX,
      distance_threshold = hiv_cluster_params.distance_threshold,
      min_overlap = hiv_cluster_params.min_overlap,
      bootstrap = 0,
      output_format = OUTPUT_FORMAT,
      ambiguity_handling = hiv_cluster_params.ambiguity_handling;

  var bam_fn = hiv_cluster_params.filename + BAM_OUTPUT_SUFFIX,
      output_fasta_fn = hiv_cluster_params.filename + FASTA_OUTPUT_SUFFIX,
      output_tn93_fn = hiv_cluster_params.filename + TN93_OUTPUT_SUFFIX,
      output_cluster_csv = hiv_cluster_params.filename + CLUSTER_OUTPUT_SUFFIX,
      output_graph_dot = hiv_cluster_params.filename + GRAPH_OUTPUT_SUFFIX;


  var hivnetworkcsv = function () {
    var hivnetworkcsv =  spawn(config.hivnetworkcsv, 
                               ['-i',output_tn93_fn, '-c', output_cluster_csv,
                                '-d', output_graph_dot, '-t', distance_threshold,
                                '-f', 'plain'], { cwd: config.output_dir });

    hivnetworkcsv.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    hivnetworkcsv.on('close', function (code) {
      console.log('finished ' + code);
      self.emit('status update', {msg: 'HIV Network Analysis Completed'});
      self.emit('completed',{msg: 'finished'});
    });
  }

  var TN93dist = function () {
    var TN93dist_command = spawn(config.tn93dist, [output_fasta_fn, 
                                                    output_tn93_fn, 
                                                    distance_threshold, 
                                                    ambiguity_handling, 
                                                    output_format, min_overlap,
                                                    bootstrap], { cwd: config.output_dir } );

    TN93dist_command.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    TN93dist_command.on('close', function (code) {
      console.log('child process exited with code ' + code);
      self.emit('status update', {msg: 'TN93 Distribution Analysis Completed'});
      //hivnetworkcsv();
    });
  }


  var bam2msa = function() {
    var bam2msa = spawn(config.bam2msa, [bam_fn, output_fasta_fn], { cwd: config.output_dir });

    bam2msa.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    bam2msa.on('close', function (code) {
      self.emit('status update', {msg: 'Converting to FASTA format Completed'});
      TN93dist();
    });
  }

  var bealign = function () {
    var bealign = spawn(config.bealign, 
                        [fn, bam_fn, '-r', reference, '-m', score_matrix, '-R']
                        , { cwd: config.output_dir });

    bealign.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    bealign.on('close', function (code) {
      self.emit('status update', {msg: 'Aligning Completed'});
      bam2msa();
    });

  }

  var go = function(hiv_cluster_params) {
    fs.writeFile(config.output_dir + hiv_cluster_params.filename, hiv_cluster_params.file_contents, function (err) {
      if (err) throw err;
      console.log('It\'s saved!');
      bealign(); 
    });
  }
  go(hiv_cluster_params);
}

exports.DoHivClusterAnalysis = DoHivClusterAnalysis;
