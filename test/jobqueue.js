var fs = require('fs'),
    spawn = require('child_process').spawn,
    should = require('should'),
    path = require('path'),
    redis = require('redis'),
    _ = require('underscore'),
    config = require('../config.json');

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});
var JobQueue = require(path.join(__dirname, '/../lib/jobqueue.js')).JobQueue;

describe('job queue', function() {

  this.timeout(6000);

  var submitted_ids = [];

  before(function(done) {

    var after_five = _.after(5, function() {
      _.delay(done, 1000);
    });

    for (var i=0; i< 5; i++) {
      var sbatch = spawn('sbatch', ['--partition=' + config.slurm_partition,
        '--wrap', 'sleep 60', '-o', '/dev/null', '-e', '/dev/null']);
      sbatch.stdout.on('data', function (data) {
        var match = String(data).match(/Submitted batch job (\d+)/);
        if (match) {
          var slurm_id = match[1];
          submitted_ids.push(slurm_id);
          client.hset(slurm_id, 'type', 'test');
        }
        after_five();
      });
    }

  });

  after(function() {
    if (submitted_ids.length) {
      spawn('scancel', submitted_ids);
    }
  });

  it('return the job queue', function(done) {
    JobQueue(function(jobs) {
      jobs[0].should.have.property('id');
      jobs[0].should.have.property('status');
      jobs[0].should.have.property('creation_time');
      jobs[0].should.have.property('start_time');
      jobs[0].should.have.property('type');
      jobs[0].should.have.property('sites');
      jobs[0].should.have.property('sequences');
      done();
    });
  });

});
