var fs = require('fs'),
    spawn = require('child_process').spawn,
    should = require('should'),
    path = require('path'),
    redisClient = require('../lib/redis-client.js'),
    config = require('../config.json');

// redis@5 migration: reuse the shared connected client from lib/redis-client.js
// (was `redis.createClient({host,port})`); commands are camelCased and
// promise-returning (hset->hSet). underscore migration: `_.after(n, fn)` and
// `_.delay(fn, ms)` replaced with native equivalents below.
var client = redisClient.client;
var JobQueue = require(path.join(__dirname, '/../lib/jobqueue.js')).JobQueue;

// Native replacement for underscore's `_.after(count, fn)`: returns a function
// that invokes `fn` only on the `count`-th (and subsequent) call.
function after(count, fn) {
  return function () {
    if (--count < 1) {
      return fn.apply(this, arguments);
    }
  };
}

describe('job queue', function() {

  this.timeout(6000);

  var submitted_ids = [];

  before(function(done) {

    var after_five = after(5, function() {
      // _.delay(done, 1000) -> native setTimeout
      setTimeout(done, 1000);
    });

    for (var i=0; i< 5; i++) {
      var sbatch = spawn('sbatch', ['--partition=' + config.slurm_partition,
        '--wrap', 'sleep 60', '-o', '/dev/null', '-e', '/dev/null']);
      sbatch.stdout.on('data', function (data) {
        var match = String(data).match(/Submitted batch job (\d+)/);
        if (match) {
          var slurm_id = match[1];
          submitted_ids.push(slurm_id);
          // redis@5: hset->hSet, promise-returning; swallow errors for this
          // best-effort seed (v5 buffers until the shared socket connects).
          client.hSet(slurm_id, 'type', 'test').catch(function () {});
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
