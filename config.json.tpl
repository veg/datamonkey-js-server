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

////PROD
//var config = {}
//config.port             = <PORTNUMBER>;
//config.output_dir       = '';
//config.hivnetworkcsv    = '';
//config.tn93dist         = '';
//config.bam2msa          = '';
//config.bealign          = '';
//config.qsub_script      = '';

////QA
//var config = {}
//config.port             = 7010;
//config.output_dir       = '/home/sweaver/datamonkey/qa/hivcluster/output/';
//config.hivnetworkcsv    = '/usr/local/bin/hivnetworkcsv';
//config.tn93dist         = '/usr/local/bin/TN93dist';
//config.bam2msa          = '/opt/share/python3.3/bam2msa';
//config.bealign          = '/opt/share/python3.3/bealign';
//config.qsub_script      = '/home/sweaver/datamonkey/qa/hivcluster/qsub_submit.sh';

////DEV
//var config = {}
//config.port             = 7010;
//config.output_dir       = '/home/sweaver/datamonkey/dev/hivcluster/output/';
//config.hivnetworkcsv    = '/home/sweaver/bin/cluster/bin/python3.2 /home/sweaver/bin/cluster/HIVClustering/bin/hivnetworkcsv';
//config.tn93dist         = '/home/sweaver/bin/cluster/TN93/TN93dist';
//config.bam2msa          = '/opt/share/python3.3/bam2msa';
//config.bealign          = '/opt/share/python3.3/bealign';
//config.qsub_script      = '/home/sweaver/datamonkey/dev/hivcluster/qsub_submit.sh';

module.exports = config;

