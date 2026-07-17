/**
 * mock/lifecycle.js — FAST, CI-friendly lifecycle tier (NO real sbatch).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------
 * The live analysis suites submit real SLURM jobs and cover the true
 * scheduler path. This file instead exercises the FULL in-process lifecycle
 *
 *     socket connect
 *       -> analysis constructor (busted)
 *         -> hyphyJob.init() -> attachSocket() (ClientSocket subscribes to redis)
 *           -> spawn() -> new job.jobRunner(...) + jobRegistry.register(self)
 *             -> jobRunner.submit()  [STUBBED — no sbatch]
 *               -> 'job created'  -> onJobCreated() -> redis publish + rpush active_jobs
 *               -> 'completed'     -> onComplete()   -> redis publish + lrem + unregister
 *           -> socket 'disconnect' -> client_socket.close() + jobRegistry.unregister
 *
 * with ZERO cluster involvement. The only stub is jobRunner.prototype.submit
 * (and jobdel.jobDelete for the cancel case): instead of spawning `sbatch`,
 * it drives the SAME EventEmitter the real submit body would, so every wired
 * listener in hyphyjob.spawn() fires for real. get_slurm_id_from_data /
 * status_watcher / JobStatus qstat polling are all bypassed because we never
 * enter the real submit body.
 *
 * All assertions are against LIVE Redis (PUBSUB NUMSUB, active_jobs list) and
 * real EventEmitter listener counts — exactly like test/regression/leaks.js.
 *
 * Every stubbed prototype/module method is restored in afterEach so the live
 * integration suite is unaffected.
 * ---------------------------------------------------------------------------
 */

var should  = require('should'),
    fs      = require('fs'),
    path    = require('path'),
    redisClient = require(__dirname + '/../../lib/redis-client.js'),
    harness = require(__dirname + '/../helpers/socketharness.js'),
    busted  = require(__dirname + '/../../app/busted/busted.js'),
    job     = require(__dirname + '/../../app/job.js'),
    jobdel  = require(__dirname + '/../../lib/jobdel.js');

// Unique port for this file (>=5340 per instructions; 5100-5199 and the
// integration suite are reserved elsewhere).
var PORT = 5341;

var MOCK_TORQUE_ID = 'mock123';

// ---- live-redis helpers (mirror test/regression/leaks.js) -----------------
//
// redis@5 migration: use the shared connected client from lib/redis-client.js
// instead of a throwaway `redis.createClient({host,port})` per call. Commands
// are camelCased and promise-returning: `send_command('pubsub',...)` ->
// `sendCommand(['PUBSUB','NUMSUB', channel])`; `lrange` -> `lRange`. The
// callback signatures of these helpers are preserved so the specs are unchanged.

// Count Redis clients currently subscribed to a pub/sub channel.
function subscriberCount(channel, cb) {
  redisClient.ready
    .then(function () {
      return redisClient.client.sendCommand(['PUBSUB', 'NUMSUB', channel]);
    })
    .then(function (res) {
      // res = [channel, "<count>"]
      cb(parseInt(res[1], 10));
    })
    .catch(function () {
      cb(0);
    });
}

// Is `id` currently present in the active_jobs list?
function activeJobsHas(id, cb) {
  redisClient.ready
    .then(function () {
      return redisClient.client.lRange('active_jobs', 0, -1);
    })
    .then(function (list) {
      cb(!!list && list.indexOf(id) !== -1);
    })
    .catch(function () {
      cb(false);
    });
}

// Build a minimal-but-complete busted params object with a UNIQUE analysis id
// so redis channels / active_jobs entries never collide across tests.
function buildParams(id) {
  return {
    id: id,
    analysis: {
      _id: id,
      tagged_nwk_tree: '(A:0.1,B:0.1,C:0.1);'
    },
    msa: [
      { _id: id + '-msa', gencodeid: 0, sites: 100, sequences: 3 }
    ]
  };
}

describe('mock lifecycle: full socket -> registry -> redis teardown (no sbatch)', function () {
  this.timeout(8000);

  var server, realSubmit, realJobDelete;
  var jobRegistry = require(__dirname + '/../../lib/jobregistry.js');

  // Ids used across the run so afterEach can defensively unregister any that a
  // test left in the registry — keeping the process-listener / cancel counts
  // deterministic regardless of the async timing of disconnect-driven cleanup.
  var usedIds = [];
  // The torque id the stub assigned to each job id (unique per job) so a
  // leftover job from an earlier test can never satisfy another test's cancel
  // assertions.
  var torqueForId = {};

  before(function () {
    server = harness.startServer(PORT);
    // Register the connection handler EXACTLY ONCE. Each test connects a fresh
    // client (a new server-side socket), so wiring busted:spawn here gives each
    // socket exactly one handler — registering per-test would accumulate
    // handlers and run the constructor multiple times per spawn.
    server.on('connection', function (socket) {
      harness.submitAndExpectStream(server, socket, 'busted:spawn', function (s, str, p) {
        new busted.busted(s, str, p);
      });
    });
  });

  after(function () {
    try { server.close(); } catch (e) { /* ignore */ }
  });

  beforeEach(function () {
    // Preserve originals so afterEach can restore them.
    realSubmit = job.jobRunner.prototype.submit;
    realJobDelete = jobdel.jobDelete;
  });

  afterEach(function () {
    // CRITICAL: restore everything so the live integration suite is unaffected.
    job.jobRunner.prototype.submit = realSubmit;
    jobdel.jobDelete = realJobDelete;
    // Defensively unregister any job this suite created so a broadcast
    // 'cancelJob' in a later test only ever touches that test's own job.
    usedIds.forEach(function (id) { jobRegistry.unregister(id); });
  });

  // A unique mock torque id per job id.
  function torqueId(id) { return MOCK_TORQUE_ID + '-' + id; }

  // Install the "no sbatch" submit stub. `opts.complete` => also emit 'completed'
  // after writing a fixture results file (drives onComplete()).
  function stubSubmit(id, opts) {
    opts = opts || {};
    var tid = torqueId(id);
    torqueForId[id] = tid;
    job.jobRunner.prototype.submit = function (params, cwd) {
      var self = this;
      // Wait for the ClientSocket's redis SUBSCRIBE to be confirmed before
      // publishing. In production `sbatch` takes seconds, so the subscribe has
      // long since completed; the mock is fast enough that firing on nextTick
      // races the SUBSCRIBE round-trip and the 'job created' publish can be
      // missed. A short delay removes the race while keeping the test fast.
      setTimeout(function () {
        self.torque_id = tid;
        self.emit('job created', {
          torque_id: tid,
          status: 'queued',
          scheduler: 'slurm'
        });
        if (opts.complete) {
          // onComplete() reads self.results_fn; write a fixture so it publishes
          // a real {type:'completed'} packet rather than erroring.
          try {
            fs.writeFileSync(self.results_fn, JSON.stringify({ mock: true }));
          } catch (e) { /* ignore */ }
          // Give onJobCreated's redis writes a beat, then complete.
          setTimeout(function () { self.emit('completed', ''); }, 100);
        }
      }, 250);
    };
  }

  // -------------------------------------------------------------------------
  // 1. job created is relayed to the client, subscriber is live, active_jobs
  //    gets the id, and jobRegistry holds exactly ONE process listener.
  // -------------------------------------------------------------------------
  it('relays "job created" to the client and holds exactly one process listener', function (done) {
    var listenersBefore = process.listenerCount('cancelJob');
    // jobregistry installs exactly one permanent listener at module load.
    listenersBefore.should.equal(1);

    var id = 'mocklife-created-' + process.pid + '-' + Date.now();
    usedIds.push(id);
    stubSubmit(id);
    var params = buildParams(id);

    var client = harness.connectClient(PORT);

    client.on('connect', function () {
      harness.emitSpawn(client, 'busted:spawn', '>A\nACG\n>B\nACG\n>C\nACG\n', params);
    });

    client.on('job created', function (data) {
      // The relayed packet came through redis pub/sub -> ClientSocket -> socket.
      data.type.should.equal('job created');
      data.torque_id.should.equal(torqueForId[id]);
      data.id.should.equal(id);

      // Still exactly one process listener despite a registered job (#400).
      process.listenerCount('cancelJob').should.equal(1);

      // The subscriber is live while the socket is open.
      subscriberCount(id, function (during) {
        during.should.equal(1);
        // active_jobs got the id on 'job created' (push_job_once -> rpush).
        activeJobsHas(id, function (present) {
          present.should.be.true();
          client.disconnect();
          done();
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. On completion, onComplete() publishes {type:'completed'}, removes the id
  //    from active_jobs (lrem) and unregisters from jobRegistry.
  // -------------------------------------------------------------------------
  it('publishes "completed" and clears active_jobs / registry on completion', function (done) {
    var id = 'mocklife-complete-' + process.pid + '-' + Date.now();
    usedIds.push(id);
    stubSubmit(id, { complete: true });
    var params = buildParams(id);

    var client = harness.connectClient(PORT);
    var sawJobCreated = false;

    client.on('connect', function () {
      harness.emitSpawn(client, 'busted:spawn', '>A\nACG\n>B\nACG\n>C\nACG\n', params);
    });

    client.on('job created', function () { sawJobCreated = true; });

    client.on('completed', function (data) {
      sawJobCreated.should.be.true();
      data.type.should.equal('completed');

      // onComplete() -> lrem active_jobs + jobRegistry.unregister. Give the
      // async redis writes a beat, then assert active_jobs no longer has it.
      setTimeout(function () {
        activeJobsHas(id, function (present) {
          present.should.be.false();
          client.disconnect();
          done();
        });
      }, 150);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Subscriber leak (#397): after the client disconnects, the dedicated
  //    redis subscriber for the job channel is released (NUMSUB back to 0).
  // -------------------------------------------------------------------------
  it('releases the redis subscriber on socket disconnect (#397)', function (done) {
    var id = 'mocklife-leak-' + process.pid + '-' + Date.now();
    usedIds.push(id);
    stubSubmit(id);
    var params = buildParams(id);

    subscriberCount(id, function (before) {
      before.should.equal(0);

      var client = harness.connectClient(PORT);

      client.on('connect', function () {
        harness.emitSpawn(client, 'busted:spawn', '>A\nACG\n>B\nACG\n>C\nACG\n', params);
      });

      client.on('job created', function () {
        subscriberCount(id, function (during) {
          during.should.equal(1); // subscriber live while socket open
          client.disconnect();     // browser closes tab
          setTimeout(function () {
            subscriberCount(id, function (after) {
              after.should.equal(0); // <-- #397: released, not leaked
              done();
            });
          }, 500);
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. process 'cancelJob' broadcast cancels the live job AT MOST ONCE
  //    (jobRegistry _.once), driving cancel() -> onError() which publishes a
  //    {type:'script error'} packet and unregisters. jobdel.jobDelete is
  //    stubbed so no real scancel/qdel runs.
  // -------------------------------------------------------------------------
  it('broadcast-cancels the live job at most once and publishes a script error (#400)', function (done) {
    var id = 'mocklife-cancel-' + process.pid + '-' + Date.now();
    usedIds.push(id);
    stubSubmit(id);
    var params = buildParams(id);

    var deleteCalls = 0;
    // Stub jobDelete so cancel() -> cb() -> onError() runs with no scheduler.
    // A cancelJob broadcast hits EVERY job in the shared registry singleton,
    // which may include unrelated jobs left by other suites. Only count and
    // acknowledge THIS test's job (matched by its unique torque id); ignore
    // any foreign job so a stray undefined torque_id can't fail this spec.
    jobdel.jobDelete = function (torque_id, cb) {
      if (torque_id !== torqueForId[id]) {
        // Foreign job from another suite — acknowledge without asserting.
        process.nextTick(function () { cb('', 0); });
        return;
      }
      deleteCalls += 1;
      // Invoke the callback (like a successful scancel) so onError fires.
      process.nextTick(function () { cb('', 0); });
    };

    var client = harness.connectClient(PORT);

    client.on('connect', function () {
      harness.emitSpawn(client, 'busted:spawn', '>A\nACG\n>B\nACG\n>C\nACG\n', params);
    });

    client.on('job created', function () {
      // Broadcast cancel to all registered jobs.
      process.emit('cancelJob', '');
      // Re-emit: _.once must make this a no-op for the already-cancelled job.
      process.emit('cancelJob', '');
    });

    client.on('script error', function (data) {
      data.type.should.equal('script error');
      // cancel() is bound with _.once at the registry, and jobDelete itself is
      // wrapped in _.once inside cancel(); either way jobDelete runs once.
      deleteCalls.should.equal(1);
      client.disconnect();
      done();
    });
  });
});
