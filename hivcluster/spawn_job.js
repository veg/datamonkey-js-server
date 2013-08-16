var spawn = require('child_process').spawn;
var fs = require('fs');

var spawnJob = function (hiv_cluster_params) {

  var fn = hiv_cluster_params.filename,
      reference = 'HXB2_prrt',
      score_matrix = 'HIV_BETWEEN_F',
      distance_threshold = hiv_cluster_params.distance_threshold,
      min_overlap = hiv_cluster_params.min_overlap,
      bootstrap = 0,
      output_format = "CSV",
      ambiguity_handling = hiv_cluster_params.ambiguity_handling;

  var bam_fn = hiv_cluster_params.filename + '_OUTPUT.BAM',
      output_fasta_fn = hiv_cluster_params.filename + '_OUTPUT.FASTA',
      output_tn93_fn = hiv_cluster_params.filename + '_USER.TN93OUTPUT.csv',
      output_cluster_csv = hiv_cluster_params.filename + '_USER.CLUSTER.csv',
      output_graph_dot = hiv_cluster_params.filename + '_USER.GRAPH.dot';


  var hivnetworkcsv = function () {
    var hivnetworkcsv =  spawn('/usr/local/bin/hivnetworkcsv', 
                               ['-i',output_tn93_fn, '-c', output_cluster_csv,
                                '-d', output_graph_dot, '-t', distance_threshold,
                                '-f', 'plain']);

    hivnetworkcsv.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    hivnetworkcsv.on('close', function (code) {
      console.log('finished ' + code);
    });
  }

  var TN93dist = function () {
    var TN93dist_command = spawn('/usr/local/bin/TN93dist', [output_fasta_fn, 
                                                    output_tn93_fn, 
                                                    distance_threshold, 
                                                    ambiguity_handling, 
                                                    output_format, min_overlap,
                                                    bootstrap]);

    TN93dist_command.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    TN93dist_command.on('close', function (code) {
      console.log('child process exited with code ' + code);
      hivnetworkcsv();
    });
  }


  var bam2msa = function() {
    var bam2msa = spawn('/opt/share/python3.3/bam2msa', [bam_fn, output_fasta_fn]);

    bam2msa.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    bam2msa.on('close', function (code) {
      console.log('child process exited with code ' + code);
      TN93dist();
    });
  }

  var bealign = function () {
    var bealign = spawn('/opt/share/python3.3/bealign', 
                        [fn, bam_fn, '-r', reference, '-m', score_matrix, '-R']);

    bealign.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    bealign.on('close', function (code) {
      console.log('child process exited with code ' + code);
      bam2msa();
    });

  }

  var run = function(hiv_cluster_params) {
    fs.writeFile(hiv_cluster_params.filename, hiv_cluster_params.file_contents, function (err) {
      if (err) throw err;
      console.log('It\'s saved!');
      bealign(); 
    });
  }

  run(hiv_cluster_params);
}

exports.spawnJob = spawnJob;

