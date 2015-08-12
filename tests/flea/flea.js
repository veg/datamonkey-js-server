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

var fs = require('fs');

var spawn_job = require(__dirname + '/../../app/flea/spawn_flea.js'),
    config = require('../../config.json'),
    should  = require('should'),
    path  = require('path'),
    winston  = require('winston');

describe('flea jobrunner', function() {

  var fn = path.join(__dirname, '/res/54f75ea60cb1503c69b83f5e.tar');
  var params_file = path.join(__dirname, '/res/params.json');

  it('should complete', function(done) {

    this.timeout(1200000);

    var params = JSON.parse(fs.readFileSync(params_file));
    var status_update_count = 0;

    // Setup Analysis
    var flea_analysis = new spawn_job.FleaRunner();

    // On status updates, report to datamonkey-js
    flea_analysis.on('status update', function(status_update) {
      // create a status update count
      status_update_count++;
    });

    // On errors, report to datamonkey-js
    flea_analysis.on('script error', function(error) {
      done(error);
    });

    // When the analysis completes, return the results to datamonkey.
    flea_analysis.on('completed', function(results) {

      // verify results
      results.results.rates.should.not.be.empty;
      results.results.rates_pheno.should.not.be.empty;
      results.results.sequences.should.not.be.empty;
      results.results.trees.should.not.be.empty;
      results.results.turnover.should.not.be.empty;
      results.results.copynumbers.should.not.be.empty;

      // verify that there was at least one status update
      status_update_count.should.be.above(0);

      done();

    });

    // Setup has been completed, run the job with the parameters from datamonkey
    flea_analysis.start(fn, params);

  });

});


