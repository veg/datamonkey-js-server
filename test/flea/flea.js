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


