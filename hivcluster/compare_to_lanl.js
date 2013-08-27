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
