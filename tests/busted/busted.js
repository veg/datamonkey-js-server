/*

  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.

  Copyright (C) 2014
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

var fs = require('fs');

var spawn_job = require(__dirname + '/../../app/busted/spawn_busted.js');
var should  = require('should');

describe('busted jobrunner', function() {

  var fn = __dirname + '/res/5446bc0d355080301f18a8c6';
  var params_file = __dirname + '/res/params.json';


  it('should complete', function(done) {

    this.timeout(120000);

    var params = JSON.parse(fs.readFileSync(params_file));

    // Setup Analysis
    var busted_analysis = new spawn_job.DoBustedAnalysis();

    // On status updates, report to datamonkey-js
    busted_analysis.on('status update', function(status_update) {
    });

    // On errors, report to datamonkey-js
    busted_analysis.on('script error', function(error) {
      throw new Error(error.error);
      done(error);
    });

    // When the analysis completes, return the results to datamonkey.
    busted_analysis.on('completed', function(results) {
      done();
    });

    // Report the torque job id back to datamonkey
    busted_analysis.on('job created', function(torque_id) {
    });

    // Send file
    busted_analysis.on('progress file', function(params) {
    });

    // Setup has been completed, run the job with the parameters from datamonkey
    busted_analysis.start(fn, params);

  });

});


