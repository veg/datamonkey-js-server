// #453 hyphyjob onError / init() tests: the error path is the terminal path
// that does NOT route through onComplete, so it must apply the (shorter)
// terminal TTL itself, drain every duplicate active_jobs entry, release the
// registry slot and emit the bookkeeping event. init() must persist a
// reused-id hash only on the spawn branch (the checkOnly path relies on
// onJobCreated's persist).
//
// Runs against a live, ISOLATED redis instance (config.json) — never against
// a production instance. No real scheduler jobs are submitted by this file.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  jobRegistry = require("../lib/jobregistry.js"),
  hyphyJob = require("../app/hyphyjob.js").hyphyJob;

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

var suffix = Date.now();

// Build a minimal hyphyJob stub without running its constructor chain.
// std_err/std_out/progress_fn point at nonexistent files — onError reads them
// via Q.allSettled, so missing files must be tolerated (values come back
// undefined and are dropped by JSON.stringify).
function makeJobStub(id) {
  var obj = Object.create(hyphyJob.prototype);
  obj.id = id;
  obj.type = "test";
  obj.params = { msa: [{ sites: 10, sequences: 5 }] };
  obj.output_dir = os.tmpdir();
  obj.qsub_script_name = "test.sh";
  obj.std_err = path.join(os.tmpdir(), "no-such-" + id + ".err");
  obj.std_out = path.join(os.tmpdir(), "no-such-" + id + ".out");
  obj.progress_fn = path.join(os.tmpdir(), "no-such-" + id + ".progress");
  return obj;
}

// Fake browser socket good enough for attachSocket()'s ClientSocket.
function makeFakeSocket() {
  return { on: function() {}, emit: function() {} };
}

// Poll the job hash until status reaches `want` (onError finishes async
// behind Q.allSettled), then hand back control. Redis commands issued by
// onError share one ordered connection, so once status lands every write
// issued before/after it (expire, lrem) has landed too.
function waitForStatus(id, want, done, next) {
  var deadline = Date.now() + 5000;
  (function poll() {
    client.hget(id, "status", function(err, status) {
      if (status === want) {
        next();
      } else if (Date.now() > deadline) {
        done(new Error("job " + id + " never reached status " + want +
          " (last: " + status + ")"));
      } else {
        setTimeout(poll, 100);
      }
    });
  })();
}

describe("hyphyjob onError terminal path + init persist gating (#453)", function() {
  this.timeout(20000);

  var seeded = [];         // redis keys to delete (and lrem from active_jobs)
  var sockets = [];        // ClientSocket instances to close

  function seedHash(id, done) {
    seeded.push(id);
    client.hset(id, "status", "queued", done);
  }

  after(function(done) {
    // No real scheduler jobs are submitted by this file, so there is nothing
    // to scancel — cleanup is redis keys + subscriber sockets only.
    sockets.forEach(function(s) {
      try { s.close(); } catch (e) { /* already closed */ }
    });
    process.removeAllListeners("jobCancelled");
    if (seeded.length === 0) {
      client.quit();
      done();
      return;
    }
    var pending = seeded.length;
    seeded.forEach(function(id) {
      client.lrem("active_jobs", 0, id, function() {
        client.del(id, function() {
          if (--pending === 0) {
            client.quit();
            done();
          }
        });
      });
    });
  });

  it("onError writes status 'error' + the error packet and expires BOTH the id and torque_id hashes", function(done) {
    var id = "test-453-ei-" + suffix + "-err-pair";
    var torque_id = "525201";
    seedHash(id, function() {
      seeded.push(torque_id);
      client.hset(torque_id, "datamonkey_id", id, function() {
        var job = makeJobStub(id);
        job.torque_id = torque_id;
        job.onError("boom: unit-test failure");
        waitForStatus(id, "error", done, function() {
          client.hget(id, "error", function(err, raw) {
            should.not.exist(err);
            should.exist(raw);
            var packet = JSON.parse(raw);
            packet.type.should.equal("script error");
            packet.error.should.equal("boom: unit-test failure");
            client.ttl(id, function(err, ttl_id) {
              should.not.exist(err);
              ttl_id.should.be.above(0);
              ttl_id.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
              client.ttl(torque_id, function(err, ttl_tid) {
                should.not.exist(err);
                // the id/torque_id pair must die together
                ttl_tid.should.be.above(0);
                ttl_tid.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
                done();
              });
            });
          });
        });
      });
    });
  });

  it("onError drains ALL pre-seeded duplicate active_jobs entries (lrem count 0)", function(done) {
    var id = "test-453-ei-" + suffix + "-err-dup";
    seedHash(id, function() {
      // three historical duplicates — count 0 must remove every one
      client.rpush("active_jobs", id, id, id, function(err) {
        should.not.exist(err);
        var job = makeJobStub(id);
        job.torque_id = "525202";
        seeded.push(job.torque_id);
        job.onError("duplicate drain test");
        waitForStatus(id, "error", done, function() {
          client.lrange("active_jobs", 0, -1, function(err, entries) {
            should.not.exist(err);
            entries.filter(function(e) { return e === id; }).length.should.equal(0);
            done();
          });
        });
      });
    });
  });

  it("onError with no torque_id (early cancel/read failure) does not throw and still expires the id hash", function(done) {
    var id = "test-453-ei-" + suffix + "-err-notid";
    seedHash(id, function() {
      var job = makeJobStub(id);
      // torque_id deliberately left undefined — the falsy key must be
      // skipped by expireTerminal, not passed to client.expire
      should.not.exist(job.torque_id);
      (function() { job.onError("failed before job creation"); }).should.not.throw();
      waitForStatus(id, "error", done, function() {
        client.ttl(id, function(err, ttl) {
          should.not.exist(err);
          ttl.should.be.above(0);
          ttl.should.be.belowOrEqual(redisTtl.TERMINAL_TTL_SECONDS);
          done();
        });
      });
    });
  });

  it("onError emits 'jobCancelled' carrying the remaining active_jobs length", function(done) {
    var id = "test-453-ei-" + suffix + "-err-event";
    var sentinel = "test-453-ei-" + suffix + "-sentinel";
    seedHash(id, function() {
      // Baseline the list, then add one surviving sentinel plus our id —
      // after onError drains the id, the event payload must equal
      // baseline + 1 (only the sentinel added).
      client.llen("active_jobs", function(err, baseline) {
        should.not.exist(err);
        seeded.push(sentinel);
        client.rpush("active_jobs", sentinel, id, function(err) {
          should.not.exist(err);
          process.once("jobCancelled", function(n) {
            n.should.equal(baseline + 1);
            done();
          });
          var job = makeJobStub(id);
          job.onError("event payload test");
        });
      });
    });
  });

  it("onError unregisters the job so a later cancelAll cannot act on it", function(done) {
    var id = "test-453-ei-" + suffix + "-err-unreg";
    var liveId = "test-453-ei-" + suffix + "-live-ctrl";
    seedHash(id, function() {
      var deadCancelled = false;
      var liveCancelled = false;

      var dead = makeJobStub(id);
      dead.cancel = function() { deadCancelled = true; };
      jobRegistry.register(dead);

      // positive control: a still-live registered job proves cancelAll works,
      // so the "dead not cancelled" assertion is meaningful
      var live = makeJobStub(liveId);
      live.cancel = function() { liveCancelled = true; };
      jobRegistry.register(live);

      dead.onError("registry release test");
      waitForStatus(id, "error", done, function() {
        jobRegistry.cancelAll();
        liveCancelled.should.equal(true);
        deadCancelled.should.equal(false);
        jobRegistry.unregister(liveId);
        done();
      });
    });
  });

  it("init() on the spawn branch clears a stale terminal ttl from a reused-id hash before spawning", function(done) {
    var id = "test-453-ei-" + suffix + "-init-spawn";
    seedHash(id, function() {
      // simulate the prior run's terminal transition leaving a ttl behind
      client.expire(id, 600, function() {
        var job = makeJobStub(id);
        job.socket = makeFakeSocket();
        job.spawn = function() {};  // nothing must actually be submitted
        job.init();
        if (job.client_socket) sockets.push(job.client_socket);
        setTimeout(function() {
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            // HSET does not clear a ttl — only the persistInFlight belt can
            ttl.should.equal(-1);
            done();
          });
        }, 200);
      });
    });
  });

  it("init() on the checkOnly branch does NOT persist the id hash (a seeded ttl survives)", function(done) {
    var id = "test-453-ei-" + suffix + "-init-check";
    seedHash(id, function() {
      client.expire(id, 600, function() {
        var job = makeJobStub(id);
        job.socket = makeFakeSocket();
        job.params.checkOnly = true;
        job.params.torque_id = "525203";
        job.checkJob = function() {};  // no scheduler lookup
        job.init();
        if (job.client_socket) sockets.push(job.client_socket);
        setTimeout(function() {
          // checkOnly must adopt the stored scheduler id...
          job.torque_id.should.equal("525203");
          client.ttl(id, function(err, ttl) {
            should.not.exist(err);
            // ...and must NOT have persisted the hash: the checkJob path
            // relies on onJobCreated's persist, so the stale ttl remains
            ttl.should.be.above(0);
            ttl.should.be.belowOrEqual(600);
            done();
          });
        }, 200);
      });
    });
  });
});
