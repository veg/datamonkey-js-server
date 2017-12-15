var fs      = require('fs'),
    spawn   = require('child_process').spawn,
    winston = require('winston'),
    should  = require('should');

var JobStatus = require(__dirname + '/../lib/jobstatus.js').JobStatus;

describe('job status', function() {

  it('should run until completed', function(done) {

    this.timeout(10000);

    var qsub = spawn('qsub');
    qsub.stdin.write('sleep 1');
    qsub.stdin.end();
    qsub.stdout.on('data', function (data) {

      var id = data.toString().split('.')[0];
      var job_status = new JobStatus(id);

      job_status.watch(function(error, data) {

        var status = data.status;
        winston.info(status);

        if(status == "completed" || status == "exiting") {

          // ensure full status returns appropriate metadata
          job_status.fullJobInfo(function(err, val) {

            val['total_runtime'].should.be.above(0); 
            val['exit_status'].should.be.equal('0'); 
            done();

          });

        } else {
          (status == "running" || status == "queued").should.be.equal(true, error);
        }

      });
    });
  });

});

