// #453 base-class onComplete pair-TTL tests: the highest-traffic terminal
// path (hyphyJob.prototype.onComplete, used by every standard analysis) must
// apply the COMPLETED retention window to BOTH hashes of the live/dead pair —
// the datamonkey id hash AND the scheduler torque_id reverse-lookup hash.
// test/lifecycle.js asserts the id-hash TTL only; test/hyphyjob-error-init.js
// and test/subclass-lifecycle.js assert the pair contract for onError and the
// gard/hivtrace overrides — this file closes the gap for the base class.
//
// Runs against a live, ISOLATED redis instance (config.json) — never against
// a production instance.
var fs = require("fs"),
  os = require("os"),
  path = require("path"),
  should = require("should"),
  redis = require("redis"),
  config = require("../config.json"),
  redisTtl = require("../lib/redis-ttl.js"),
  hyphyJob = require("../app/hyphyjob.js").hyphyJob;

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Build a minimal hyphyJob stub without running its constructor chain.
function makeJobStub(id) {
  var obj = Object.create(hyphyJob.prototype);
  obj.id = id;
  obj.type = "test";
  obj.params = { msa: [{ sites: 10, sequences: 5 }] };
  obj.output_dir = os.tmpdir();
  obj.qsub_script_name = "test.sh";
  return obj;
}

describe("hyphyJob.onComplete pair TTL (#453)", function() {
  this.timeout(15000);

  var suffix = Date.now();
  var seeded = [];
  var tmpfiles = [];

  // Run-unique numeric scheduler ids: suffixed like the datamonkey ids so
  // they can never collide with other suites' numeric keys on the shared
  // test instance (or with a prior SIGKILL'd run's leftovers).
  function torqueId(n) {
    return String(suffix) + n;
  }

  function writeResults(name) {
    var fn = path.join(os.tmpdir(), "test-453-pair-" + name + "-" + suffix + ".json");
    fs.writeFileSync(fn, JSON.stringify({ fits: {}, ok: true }));
    tmpfiles.push(fn);
    return fn;
  }

  // Poll until the job hash reports terminal "completed", then hand off.
  function waitForCompleted(id, next, done) {
    var deadline = Date.now() + 8000;
    (function poll() {
      client.hget(id, "status", function(err, status) {
        if (status === "completed") {
          next();
        } else if (Date.now() > deadline) {
          done(new Error("job " + id + " never reached completed status"));
        } else {
          setTimeout(poll, 100);
        }
      });
    })();
  }

  after(function(done) {
    tmpfiles.forEach(function(fn) {
      try { fs.unlinkSync(fn); } catch (e) { /* already gone */ }
    });
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

  it("onComplete applies the completed ttl to the torque_id hash as well as the id hash", function(done) {
    var id = "test-453-pair-" + suffix + "-both";
    var torque_id = torqueId("301");
    seeded.push(id);
    seeded.push(torque_id);

    var job = makeJobStub(id);
    job.torque_id = torque_id;
    job.results_fn = writeResults("both");

    // Seed the reverse-lookup hash exactly as onJobCreated would.
    client.hset(torque_id, "datamonkey_id", id, "type", "test", function() {
      client.hset(id, "status", "running", function() {
        job.onComplete();
        waitForCompleted(id, function() {
          // Small grace period: expireCompleted issues fire-and-forget
          // callbacks after the status hset.
          setTimeout(function() {
            client.ttl(id, function(err, ttl_id) {
              should.not.exist(err);
              ttl_id.should.be.above(0);
              ttl_id.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
              // THE pair contract: the scheduler-id reverse-lookup hash must
              // carry a ttl too, or completed jobs leak one hash per run.
              client.ttl(torque_id, function(err, ttl_tid) {
                should.not.exist(err);
                ttl_tid.should.be.above(0);
                ttl_tid.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
                done();
              });
            });
          }, 200);
        }, done);
      });
    });
  });

  it("onComplete uses the COMPLETED window (not the shorter TERMINAL window) on both hashes", function(done) {
    // Guards against a regression swapping expireCompleted for expireTerminal:
    // completed results must outlive the 1h terminal window so reconnecting
    // clients can still fetch them. Only meaningful when the two windows
    // differ (they do in the shipped defaults: 24h vs 1h).
    redisTtl.COMPLETED_TTL_SECONDS.should.be.above(redisTtl.TERMINAL_TTL_SECONDS);

    var id = "test-453-pair-" + suffix + "-window";
    var torque_id = torqueId("302");
    seeded.push(id);
    seeded.push(torque_id);

    var job = makeJobStub(id);
    job.torque_id = torque_id;
    job.results_fn = writeResults("window");

    client.hset(torque_id, "datamonkey_id", id, function() {
      job.onComplete();
      waitForCompleted(id, function() {
        setTimeout(function() {
          client.ttl(id, function(err, ttl_id) {
            should.not.exist(err);
            ttl_id.should.be.above(redisTtl.TERMINAL_TTL_SECONDS);
            client.ttl(torque_id, function(err, ttl_tid) {
              should.not.exist(err);
              ttl_tid.should.be.above(redisTtl.TERMINAL_TTL_SECONDS);
              done();
            });
          });
        }, 200);
      }, done);
    });
  });

  it("onComplete expires (not deletes) the torque_id hash — reverse lookup stays readable", function(done) {
    // The retention design keeps result/lookup data readable for the whole
    // window; a regression replacing expire with del would break WS-reconnect
    // torque_id -> datamonkey_id resolution immediately.
    var id = "test-453-pair-" + suffix + "-retain";
    var torque_id = torqueId("303");
    seeded.push(id);
    seeded.push(torque_id);

    var job = makeJobStub(id);
    job.torque_id = torque_id;
    job.results_fn = writeResults("retain");

    client.hset(torque_id, "datamonkey_id", id, function() {
      job.onComplete();
      waitForCompleted(id, function() {
        setTimeout(function() {
          client.hget(torque_id, "datamonkey_id", function(err, dm_id) {
            should.not.exist(err);
            should.exist(dm_id);
            dm_id.should.equal(id);
            client.hget(id, "results", function(err, results) {
              should.not.exist(err);
              should.exist(results);
              JSON.parse(results).type.should.equal("completed");
              done();
            });
          });
        }, 200);
      }, done);
    });
  });

  it("onComplete with no torque_id still expires the id hash and skips the falsy key", function(done) {
    // checkOnly/edge flows can complete before torque_id is known; the real
    // onComplete path must still land the id-hash ttl. (The falsy-key skip in
    // expireKeys itself is unit-covered in test/lifecycle.js.)
    var id = "test-453-pair-" + suffix + "-notorque";
    seeded.push(id);

    var job = makeJobStub(id);
    // job.torque_id intentionally left undefined
    job.results_fn = writeResults("notorque");

    job.onComplete();
    waitForCompleted(id, function() {
      setTimeout(function() {
        client.ttl(id, function(err, ttl_id) {
          should.not.exist(err);
          ttl_id.should.be.above(0);
          ttl_id.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
          done();
        });
      }, 200);
    }, done);
  });

  it("onComplete drains duplicate active_jobs entries while the pair ttl lands", function(done) {
    // lrem count 0 + pair expire happen on the same terminal transition; make
    // sure asserting the torque_id ttl also holds in the historical-duplicates
    // scenario (the exact state a pre-#453 leaky server accumulates).
    var id = "test-453-pair-" + suffix + "-drain";
    var torque_id = torqueId("304");
    seeded.push(id);
    seeded.push(torque_id);

    var job = makeJobStub(id);
    job.torque_id = torque_id;
    job.results_fn = writeResults("drain");

    client.hset(torque_id, "datamonkey_id", id, function() {
      client.rpush("active_jobs", id, id, id, function() {
        job.onComplete();
        waitForCompleted(id, function() {
          setTimeout(function() {
            client.lrange("active_jobs", 0, -1, function(err, entries) {
              should.not.exist(err);
              entries.indexOf(id).should.equal(-1);
              client.ttl(torque_id, function(err, ttl_tid) {
                should.not.exist(err);
                ttl_tid.should.be.above(0);
                ttl_tid.should.be.belowOrEqual(redisTtl.COMPLETED_TTL_SECONDS);
                done();
              });
            });
          }, 200);
        }, done);
      });
    });
  });
});
