var spawn = require('child_process').spawn;

function saveFile() {
    myFile = fs.createWriteStream('NEW_NET_OUTPUT.FASTA');
    myFile.write(d);
    myFile.close();
}

function spawnJob() {
  var LANL_DATA_PATH  = '/data/veg/hivcluster/example_files/LANL.FASTA',
      USERTOLANL_PATH = 'USERtoLANL.TN93OUTPUT.csv',
      concatenated_user_lanl = 'USER.LANL.TN93OUTPUT.csv',
      output_cluster_csv = 'USER.CLUSTER.csv',
      output_graph_dot = 'USER.GRAPH.dot';

  var distance_threshold = 0.015,
      min_overlap = 500,
      bootstrap = 0,
      output_format = 'CSV',
      ambiguity_handling = 'AVERAGE'
      output_fasta = 'OUTPUT.FASTA';

  hivnetworkcsv = function () {
    var hivnetworkcsv =  spawn('/usr/local/bin/hivnetworkcsv', 
                               ['-i', concatenated_user_lanl, '-c', output_cluster_csv,
                                '-d', output_graph_dot, '-t', distance_threshold,
                                '-f', 'plain']);

    hivnetworkcsv.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

      hivnetworkcsv.on('close', function (code) {
      console.log('finished ' + code);
    });

  }

  TN93dist = function () {
    var TN93dist_command = spawn('/usr/local/bin/TN93dist', [LANL_DATA_PATH, 
                                                    USERTOLANL_PATH, 
                                                    distance_threshold, 
                                                    ambiguity_handling, 
                                                    output_format, min_overlap,
                                                    bootstrap, output_fasta]);

    TN93dist_command.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });

    TN93dist_command.on('close', function (code) {
      console.log('child process exited with code ' + code);
      hivnetworkcsv();
    });

  }

}

exports.run = spawnJob;
