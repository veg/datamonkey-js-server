var fs = require('fs'),
    spawn = require('child_process').spawn,
    execSync = require('child_process').execSync,
    should = require('should'),
    path = require('path'),
    redisClient = require('../lib/redis-client.js'),
    config = require('../lib/config'),
    slurmCleanup = require('./helpers/slurm-cleanup');

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
          // Register with the root-hook backstop the instant the id is known,
          // so a crash before `after()` still gets this job cancelled.
          slurmCleanup.track(slurm_id);
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
      // BLOCKING cancel: the previous fire-and-forget `spawn('scancel', ids)`
      // was force-killed by `mocha --exit` before it ran, leaking jobs onto the
      // live partition. execSync completes before the process exits.
      try {
        execSync('scancel ' + submitted_ids.join(' '), { stdio: 'ignore' });
      } catch (e) {
        // Best-effort: jobs may already be gone; do not fail the suite.
      }
      submitted_ids.forEach(function (id) { slurmCleanup.untrack(id); });
    }
  });

  it('return the job queue', function(done) {
    JobQueue(function(jobs) {
      // The live SLURM queue is unfiltered and may contain jobs from other
      // users / other tests, so asserting on jobs[0] is racy. Instead find
      // THIS suite's own submitted job and assert on it. returnSlurmJobInfo
      // sets `id` to squeue's %i (the sbatch-printed slurm id), so match on it.
      var mine = jobs.find(function (j) {
        return submitted_ids.indexOf(j.id) !== -1 ||
               submitted_ids.indexOf(String(j.id)) !== -1;
      });
      should.exist(mine, 'none of this suite\'s submitted jobs appeared in the queue: ' +
        JSON.stringify(submitted_ids));
      mine.should.have.property('id');
      mine.should.have.property('status');
      mine.should.have.property('creation_time');
      mine.should.have.property('start_time');
      mine.should.have.property('type');
      mine.should.have.property('sites');
      mine.should.have.property('sequences');
      done();
    });
  });

});
