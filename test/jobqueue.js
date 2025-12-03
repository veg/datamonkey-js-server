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

// Test suite for Torque/qsub
describe('job queue - qsub', function() {

  this.timeout(6000);

  before(function(done) {
    if (config.submit_type !== 'qsub') {
      this.skip();
      return;
    }

    var after_five = _.after(5, function() {
      _.delay(done, 1000);
    });

    for (var i=0; i< 5; i++) {
      var qsub = spawn('qsub', ['-o', '/dev/null', '-e', '/dev/null']);
      qsub.stdin.write('sleep 1');
      qsub.stdin.end();
      qsub.stdout.on('data', function (data) {
        var torque_id = String(data).replace(/\n$/, '');
        client.hset(torque_id, 'type', 'test');
        after_five();
      });
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

// Test suite for SLURM/sbatch
describe('job queue - slurm', function() {

  this.timeout(10000);

  var submitted_job_ids = [];

  before(function(done) {
    if (config.submit_type !== 'slurm') {
      this.skip();
      return;
    }

    var after_five = _.after(5, function() {
      _.delay(done, 1000);
    });

    for (var i=0; i< 5; i++) {
      var sbatch = spawn('sbatch', [
        '--partition=' + (config.slurm_partition || 'defq'),
        '--wrap=sleep 5',
        '--output=/dev/null',
        '--error=/dev/null'
      ]);

      sbatch.stdout.on('data', function (data) {
        var output = String(data).trim();
        // sbatch output format: "Submitted batch job 12345"
        var match = output.match(/Submitted batch job (\d+)/);
        if (match) {
          var job_id = match[1];
          submitted_job_ids.push(job_id);
          client.hset(job_id, 'type', 'test');
          after_five();
        }
      });

      sbatch.stderr.on('data', function (data) {
        console.error('sbatch error:', String(data));
      });
    }

  });

  after(function(done) {
    // Clean up test jobs
    if (submitted_job_ids.length > 0) {
      var cancel_cmd = spawn('scancel', submitted_job_ids);
      cancel_cmd.on('close', function() {
        done();
      });
    } else {
      done();
    }
  });

  it('return the job queue', function(done) {
    JobQueue(function(jobs) {
      console.log('\n=== Job Queue Results ===');
      console.log('Total jobs returned:', jobs.length);
      console.log('Submitted test job IDs:', submitted_job_ids);
      console.log('\nAll jobs:');
      jobs.forEach(function(job) {
        console.log('  Job ID:', job.id, '| Type:', job.type, '| Status:', job.status);
      });
      console.log('========================\n');

      jobs.should.be.an.Array();
      jobs.length.should.be.above(0);
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
